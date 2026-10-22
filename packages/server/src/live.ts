/**
 * Echtzeit über Socket.IO. Jedes Gerät hängt an genau einem Spiel (Raum „g:<id>“) und bekommt
 * nach jeder Änderung den kompletten Zustand – gefiltert auf das, was seine Rolle sehen darf –
 * plus die Effekte für Animationen. Mehrere Spiele laufen getrennt nebeneinander.
 */
import type { Server as HttpServer } from 'node:http';
import { randomInt } from 'node:crypto';
import { Server, type Socket } from 'socket.io';
import { z } from 'zod';
import {
  commandSchema,
  DEFAULT_SHOW,
  EngineError,
  projectState,
  QUALITY_LEVELS,
  showCommandSchema,
  type Actor,
  type BeamerStats,
  type ExplainerState,
  type GameState,
  type Session,
  type ShowState,
} from '@insel/shared';
import { accountOf, effectiveSession, gameOf, isGameStaff } from './access.ts';
import { globalAttemptsExhausted, issueToken, spendAttempt, verifyToken } from './auth.ts';
import { clientAddress, ipKey } from './net.ts';
import { getSettings, type DB } from './db.ts';
import type { GameHub } from './hub.ts';
import { beamerKey } from './users.ts';

export interface Ack {
  ok: boolean;
  error?: string;
  code?: string;
  meta?: Record<string, unknown>;
}

interface SocketData {
  /** Angaben aus dem Token (ungeprüft – geprüft wird bei jeder Verwendung) */
  raw: Session | null;
  view: string;
  /** Spielcode, mit dem ein Gast beitreten will */
  code: string | null;
  /** Spiel, an dem das Gerät gerade hängt */
  gameId: string | null;
  /** Kopplungscode eines (noch) nicht freigegebenen Beamers */
  pairCode?: string;
  /** Mengenbremse je Verbindung */
  tokens: number;
  last: number;
  ip: string;
}

type LiveSocket = Socket & { data: SocketData };

export function actorFor(session: Session): Actor {
  return { role: session.role, teamId: session.teamId ?? null, playerId: session.playerId ?? null };
}

function errorMessage(err: unknown): Ack {
  if (err instanceof EngineError) return { ok: false, error: err.message, code: err.code };
  if (err instanceof z.ZodError) {
    const issue = err.issues[0];
    return { ok: false, error: issue ? `Ungültige Eingabe: ${issue.message}` : 'Ungültige Eingabe', code: 'invalid' };
  }
  console.error(err);
  return { ok: false, error: 'Unerwarteter Fehler auf dem Server', code: 'server' };
}

const CODE = /^[A-Za-z0-9]{4,8}$/;
const room = (gameId: string) => `g:${gameId}`;
/** Spielcodes durchprobieren bremsen (gemeinsam mit /api/join, siehe join-routes.ts) */
export const CODE_LIMITS = { perMinute: 30, perHour: 300 };

export function createLive(httpServer: HttpServer, hub: GameHub, database: DB) {
  const io = new Server(httpServer, {
    path: '/socket.io',
    serveClient: false,
    pingInterval: 10_000,
    pingTimeout: 8_000,
    // Befehle sind klein; Fotos laufen über HTTP
    maxHttpBufferSize: 256_000,
  });

  const sockets = () => io.sockets.sockets.values() as Iterable<LiveSocket>;
  const inGame = (gameId: string): LiveSocket[] =>
    [...(io.sockets.adapter.rooms.get(room(gameId)) ?? [])].map((id) => io.sockets.sockets.get(id) as LiveSocket | undefined).filter((s): s is LiveSocket => !!s);

  // ---------------------------------------------------------------------------
  // Schutz vor Überflutung: Verbindungen je Adresse, Nachrichten je Verbindung
  // ---------------------------------------------------------------------------
  // Verbindungsgrenzen: je Absenderadresse großzügig – im WLAN (Docker-Gateway) und hinter dem
  // Internetanschluss der Location kommen alle Gäste über eine Adresse (höchstens 200 Spieler).
  // Insgesamt begrenzt gegen Überflutung. Konten und freigegebene Beamer zählen nicht mit: Die
  // Spielleitung kommt immer rein, auch wenn jemand den Server zuschüttet.
  const MAX_CONN_PER_ADDRESS = 400;
  const MAX_CONN_TOTAL = 3000;
  const RATE = 12; // Nachrichten je Sekunde (Dauer)
  const BURST = 40; // kurzfristig mehr erlaubt
  const perIp = new Map<string, number>();
  let totalConn = 0;
  /** Absender (echte Adresse nur über den eigenen Tunnel/Proxy, siehe net.ts), IPv6 je /64. */
  function socketIp(socket: Socket): string {
    return ipKey(clientAddress(socket.handshake.address, socket.handshake.headers).ip);
  }
  /** Darf diese Verbindung gerade noch etwas senden? (Token-Eimer) */
  function allow(socket: LiveSocket, cost = 1): boolean {
    const now = Date.now();
    const d = socket.data;
    d.tokens = Math.min(BURST, d.tokens + ((now - d.last) / 1000) * RATE);
    d.last = now;
    if (d.tokens < cost) return false;
    d.tokens -= cost;
    return true;
  }
  const BUSY: Ack = { ok: false, error: 'Zu viele Anfragen – bitte kurz warten', code: 'busy' };
  io.use((socket, next) => {
    const ip = socketIp(socket);
    (socket as LiveSocket).data.ip = ip;
    const auth = (socket.handshake.auth ?? {}) as { token?: unknown };
    const raw = verifyToken(typeof auth.token === 'string' ? auth.token : null);
    if (accountOf(database, raw) || (raw?.role === 'beamer' && raw.key === beamerKey(database, raw.userId ?? null))) return next();
    const n = perIp.get(ip) ?? 0;
    if (n >= MAX_CONN_PER_ADDRESS || totalConn >= MAX_CONN_TOTAL) return next(new Error('Zu viele Verbindungen – bitte gleich noch einmal versuchen'));
    perIp.set(ip, n + 1);
    totalConn++;
    socket.on('disconnect', () => {
      totalConn--;
      const c = (perIp.get(ip) ?? 1) - 1;
      if (c <= 0) perIp.delete(ip);
      else perIp.set(ip, c);
    });
    next();
  });

  /** Spielcode prüfen: unbekannte Codes zählen als Fehlversuch; bei zu vielen wird keiner mehr angenommen. */
  function checkCode(raw: unknown): string | null {
    if (typeof raw !== 'string' || !CODE.test(raw)) return null;
    if (globalAttemptsExhausted('code', CODE_LIMITS)) return null;
    const code = raw.toUpperCase();
    if (hub.byCode(code)) return code;
    spendAttempt('code', CODE_LIMITS);
    return null;
  }

  /** Rolle des Geräts in seinem Spiel. */
  const sessionOf = (socket: LiveSocket) => effectiveSession(database, hub, socket.data.raw, socket.data.gameId, socket.data.view);
  const isStaffSocket = (socket: LiveSocket) => isGameStaff(sessionOf(socket));
  /** Angemeldetes Konto (Regie) – auch ohne gewähltes Spiel. */
  const hasAccount = (socket: LiveSocket) => !!accountOf(database, socket.data.raw);

  // ---------------------------------------------------------------------------
  // Beamer-Show je Spiel: Einstellungen live an die Beamer, Spielerklärung
  // ---------------------------------------------------------------------------
  const explainers = new Map<string, ExplainerState>();
  const showOf = (gameId: string | null): ShowState => ({
    settings: gameId ? hub.show(gameId) : DEFAULT_SHOW,
    explainer: (gameId && explainers.get(gameId)) || { running: false, id: 0, startedAt: 0 },
  });
  /** Rückmeldungen der Beamer (Bildrate …) je Spiel */
  const beamers = new Map<string, BeamerStats & { gameId: string }>();
  const beamerTimers = new Map<string, NodeJS.Timeout>();
  function pushBeamers(gameId: string | null) {
    if (!gameId || beamerTimers.has(gameId)) return;
    beamerTimers.set(
      gameId,
      setTimeout(() => {
        beamerTimers.delete(gameId);
        const list = [...beamers.values()].filter((b) => b.gameId === gameId).map(({ gameId: _g, ...b }) => b);
        for (const socket of inGame(gameId)) if (isStaffSocket(socket)) socket.emit('beamers', list);
      }, 300),
    );
  }

  // ---------------------------------------------------------------------------
  // Zustand verteilen
  // ---------------------------------------------------------------------------
  function viewKey(session: Session, state: GameState): string {
    // Je Rolle ein eigener Schlüssel: Regie und Moderator sehen Unterschiedliches, und ein Gast
    // darf nicht die (foto-/verlaufshaltige) Sicht eines teamlosen Spielers aus dem Cache bekommen.
    if (session.role === 'admin') return 'admin';
    if (session.role === 'moderator') return 'moderator';
    if (session.role === 'beamer') return 'beamer';
    const teamId = session.role === 'team' ? session.teamId : session.role === 'player' ? state.players.find((p) => p.id === session.playerId)?.teamId : null;
    if (teamId) return `team:${teamId}`;
    return session.role; // teamloser Spieler ('player') vs. Gast ('guest') – getrennt
  }

  function pushState(gameId: string | null, only?: LiveSocket) {
    const state = hub.get(gameId)?.state ?? null;
    const targets = only ? [only] : gameId ? inGame(gameId) : [];
    const cache = new Map<string, GameState>();
    const serverNow = Date.now();
    for (const socket of targets) {
      const session = sessionOf(socket);
      if (!state) {
        socket.emit('state', { state: null, session, serverNow });
        continue;
      }
      const key = viewKey(session, state);
      let view = cache.get(key);
      if (!view) {
        view = projectState(state, session);
        cache.set(key, view);
      }
      const payload: Record<string, unknown> = { state: view, session, serverNow };
      if (session.role === 'admin') payload.undo = hub.get(gameId)?.undoLabel ?? null;
      socket.emit('state', payload);
    }
  }

  /** Wie viele Geräte sind je Team verbunden? (Für die Regie) */
  const presenceTimers = new Map<string, NodeJS.Timeout>();
  function pushPresence(gameId: string | null) {
    if (!gameId || presenceTimers.has(gameId)) return;
    presenceTimers.set(
      gameId,
      setTimeout(() => {
        presenceTimers.delete(gameId);
        const state = hub.get(gameId)?.state;
        const out: Record<string, number> = {};
        const members = inGame(gameId);
        if (state) {
          for (const socket of members) {
            const key = viewKey(sessionOf(socket), state);
            if (key.startsWith('team:')) out[key.slice(5)] = (out[key.slice(5)] ?? 0) + 1;
            else if (key === 'beamer') out.beamer = (out.beamer ?? 0) + 1;
          }
        }
        for (const socket of members) if (isStaffSocket(socket)) socket.emit('presence', out);
      }, 150),
    );
  }

  /** Gerät seinem Spiel zuordnen (Raum wechseln) und – falls nötig – alles neu schicken. */
  function attach(socket: LiveSocket, force = false) {
    const before = socket.data.gameId;
    const next = gameOf(database, hub, socket.data.raw, { code: socket.data.code, view: socket.data.view });
    if (next === before && !force) return;
    if (before && before !== next) {
      void socket.leave(room(before));
      if (beamers.delete(socket.id)) pushBeamers(before);
      pushPresence(before);
    }
    socket.data.gameId = next;
    if (next) void socket.join(room(next));
    socket.emit('show', showOf(next));
    pushState(next, socket);
    pushPresence(next);
    if (next && isStaffSocket(socket)) {
      socket.emit('beamers', [...beamers.values()].filter((b) => b.gameId === next).map(({ gameId: _g, ...b }) => b));
    }
    offerPairing(socket);
  }

  hub.on('state', (gameId, state) => {
    if (state) {
      pushState(gameId);
      pushPresence(gameId);
      return;
    }
    // Spiel geschlossen/gelöscht: Geräte lösen sich davon
    explainers.delete(gameId);
    for (const socket of inGame(gameId)) attach(socket);
  });
  hub.on('effects', (gameId, effects) => io.to(room(gameId)).emit('effects', effects));
  // Ein Konto hat ein anderes Spiel gewählt: seine Regie-Fenster und Beamer folgen
  hub.on('current', (ownerId) => {
    for (const socket of sockets()) {
      const raw = socket.data.raw;
      if (!raw) continue;
      const owner = raw.role === 'beamer' || raw.role === 'leader' || (raw.role === 'admin' && !raw.userId) ? (raw.userId ?? null) : undefined;
      if (owner === ownerId) attach(socket);
    }
  });

  // ---------------------------------------------------------------------------
  // Beamer koppeln: Code anzeigen, die Spielleitung gibt ihn frei
  // ---------------------------------------------------------------------------
  const pairCodes = new Map<string, LiveSocket>();
  function offerPairing(socket: LiveSocket) {
    const role = sessionOf(socket).role;
    if (socket.data.view !== 'beamer' || role === 'beamer' || role === 'admin' || role === 'leader' || role === 'moderator') {
      if (socket.data.pairCode) pairCodes.delete(socket.data.pairCode);
      socket.data.pairCode = undefined;
      return;
    }
    if (!socket.data.pairCode) {
      // 6 Ziffern aus dem Zufallsgenerator für Schlüssel; höchstens 300 wartende Beamer. So trifft
      // ein Tippfehler in der Regie praktisch nie den Beamer eines Fremden (< 0,04 %).
      let code = '';
      for (let i = 0; i < 30 && (!code || pairCodes.has(code)); i++) code = String(randomInt(100_000, 1_000_000));
      if (pairCodes.has(code) || pairCodes.size >= 300) {
        // kein freier Code / zu viele wartende Beamer: keiner wird vergeben (die Freigabe per
        // „Beamer öffnen“/Link funktioniert weiterhin)
        socket.emit('beamer:pair', { code: null });
        return;
      }
      socket.data.pairCode = code;
      pairCodes.set(code, socket);
    }
    socket.emit('beamer:pair', { code: socket.data.pairCode });
  }

  io.on('connection', (rawSocket) => {
    const socket = rawSocket as LiveSocket;
    const auth = (socket.handshake.auth ?? {}) as { token?: string; view?: string; code?: unknown };
    socket.data.view = typeof auth.view === 'string' ? auth.view.slice(0, 20) : 'guest';
    socket.data.raw = verifyToken(auth.token);
    socket.data.code = checkCode(auth.code);
    socket.data.gameId = null;
    socket.data.tokens = BURST;
    socket.data.last = Date.now();

    socket.emit('hello', { appName: getSettings(database).appName, serverNow: Date.now() });
    attach(socket, true);
    socket.on('disconnect', () => {
      pushPresence(socket.data.gameId);
      if (socket.data.pairCode) pairCodes.delete(socket.data.pairCode);
      if (beamers.delete(socket.id)) pushBeamers(socket.data.gameId);
    });

    // Spielleitung gibt einen Beamer über seinen Kopplungscode frei: Er gehört dann dem Besitzer
    // des gerade gesteuerten Spiels und zeigt immer dessen gewähltes Spiel.
    socket.on('beamer:pair', (raw: unknown, ack?: (a: Ack) => void) => {
      const reply = ack ?? (() => {});
      if (!allow(socket, 2)) return reply(BUSY);
      const acc = accountOf(database, socket.data.raw);
      if (!acc) return reply({ ok: false, error: 'Nur die Spielleitung kann Beamer freigeben', code: 'forbidden' });
      const code = typeof raw === 'string' ? raw.trim() : '';
      const target = pairCodes.get(code);
      if (!target) return reply({ ok: false, error: 'Diesen Code zeigt gerade kein Beamer', code: 'not_found' });
      const gameId = socket.data.gameId;
      const ownerId = gameId ? (hub.meta(gameId)?.ownerId ?? null) : acc.userId;
      const key = beamerKey(database, ownerId);
      if (!key) return reply({ ok: false, error: 'Das Konto des Spiels ist nicht aktiv', code: 'forbidden' });
      const token = issueToken({ role: 'beamer', userId: ownerId, key });
      pairCodes.delete(code);
      target.data.pairCode = undefined;
      target.data.raw = verifyToken(token);
      target.emit('beamer:token', token);
      attach(target, true);
      reply({ ok: true });
    });

    socket.on('show', (raw: unknown, ack?: (a: Ack) => void) => {
      const reply = ack ?? (() => {});
      if (!allow(socket)) return reply(BUSY);
      try {
        const gameId = socket.data.gameId;
        if (!gameId || !isStaffSocket(socket)) throw new EngineError('Nur die Spielleitung kann den Beamer steuern', 'forbidden');
        const cmd = showCommandSchema.parse(raw);
        // Einmalige Befehle an die Beamer dieses Spiels (nicht gespeichert)
        if (cmd.type === 'test') {
          io.to(room(gameId)).emit('show:test', cmd.what);
          return reply({ ok: true });
        }
        if (cmd.type === 'reload' || cmd.type === 'camera' || cmd.type === 'speak') {
          io.to(room(gameId)).emit('show:cmd', cmd);
          return reply({ ok: true });
        }
        if (cmd.type === 'explain') {
          const prev = showOf(gameId).explainer;
          explainers.set(gameId, cmd.action === 'start' ? { running: true, id: prev.id + 1, startedAt: Date.now() } : { ...prev, running: false });
        } else {
          hub.setShow(gameId, cmd.type === 'set' ? { ...hub.show(gameId), ...cmd.patch } : { ...DEFAULT_SHOW });
        }
        io.to(room(gameId)).emit('show', showOf(gameId));
        reply({ ok: true });
      } catch (err) {
        reply(errorMessage(err));
      }
    });

    // Beamer melden Bildrate, Grafikstufe und ob die Erklärung fertig ist
    const isBeamer = () => socket.data.view === 'beamer' && sessionOf(socket).role === 'beamer';
    const statsSchema = z.object({
      fps: z.number().min(0).max(1000),
      quality: z.enum(QUALITY_LEVELS).exclude(['auto']),
      width: z.number().int().min(0).max(20000),
      height: z.number().int().min(0).max(20000),
      audio: z.boolean(),
      fullscreen: z.boolean(),
      manual: z.boolean(),
      explaining: z.boolean(),
    });
    socket.on('beamer:stats', (raw: unknown) => {
      const gameId = socket.data.gameId;
      if (!allow(socket) || !gameId || !isBeamer()) return;
      const r = statsSchema.safeParse(raw);
      if (!r.success) return;
      beamers.set(socket.id, { id: socket.id, gameId, ...r.data });
      pushBeamers(gameId);
    });
    socket.on('beamer:explained', (id: unknown) => {
      const gameId = socket.data.gameId;
      if (!allow(socket) || !gameId || !isBeamer()) return;
      const ex = showOf(gameId).explainer;
      if (id !== ex.id || !ex.running) return;
      explainers.set(gameId, { ...ex, running: false });
      io.to(room(gameId)).emit('show', showOf(gameId));
    });

    // Neue Anmeldung bzw. anderer Spielcode auf derselben Verbindung
    socket.on('auth', (token: unknown, ack?: (a: Ack) => void) => {
      if (!allow(socket, 3)) return ack?.(BUSY);
      const before = JSON.stringify(sessionOf(socket));
      socket.data.raw = verifyToken(typeof token === 'string' ? token : null);
      const gameBefore = socket.data.gameId;
      attach(socket);
      // nur bei geänderter Sitzung neu senden (sonst ließe sich der Server mit kleinen Nachrichten fluten)
      if (socket.data.gameId === gameBefore && JSON.stringify(sessionOf(socket)) !== before) attach(socket, true);
      ack?.({ ok: true });
    });

    socket.on('cmd', (raw: unknown, ack?: (a: Ack) => void) => {
      const reply = ack ?? (() => {});
      if (!allow(socket)) return reply(BUSY);
      try {
        const rt = hub.get(socket.data.gameId);
        if (!rt) throw new EngineError('Es ist kein Spiel geöffnet.', 'not_found');
        const cmd = commandSchema.parse(raw);
        const session = sessionOf(socket);
        if (cmd.type === 'player.register' && session.role === 'guest') {
          throw new EngineError('Bitte über die Anmeldeseite mitspielen', 'forbidden');
        }
        // Spieler anlegen kostet mehr (verhindert massenhaftes Anlegen)
        if (cmd.type === 'player.register' && !isGameStaff(session) && !allow(socket, 8)) return reply(BUSY);
        const result = rt.dispatch(cmd, actorFor(session));
        reply({ ok: true, meta: result.meta });
      } catch (err) {
        reply(errorMessage(err));
      }
    });

    socket.on('undo', (ack?: (a: Ack) => void) => {
      const reply = ack ?? (() => {});
      if (!allow(socket)) return reply(BUSY);
      try {
        const rt = hub.get(socket.data.gameId);
        if (!rt || sessionOf(socket).role !== 'admin') throw new EngineError('Nur die Regie kann rückgängig machen', 'forbidden');
        const label = rt.undo();
        reply({ ok: true, meta: { label } });
      } catch (err) {
        reply(errorMessage(err));
      }
    });

    socket.on('time', (ack?: (now: number) => void) => {
      if (allow(socket)) ack?.(Date.now());
    });
  });

  return {
    io,
    /** Regie-Oberflächen informieren, dass sich Bibliothek/Spiele/Einstellungen/Konten geändert haben. */
    notifyStaff(event: 'library' | 'games' | 'settings' | 'users') {
      for (const socket of sockets()) {
        if (hasAccount(socket) || isStaffSocket(socket)) socket.emit('changed', event);
      }
      if (event === 'settings') io.emit('hello', { appName: getSettings(database).appName, serverNow: Date.now() });
    },
    /** Anmeldungen eines Kontos haben sich geändert (gesperrt, Passwort neu): Geräte neu zuordnen. */
    refreshAccounts() {
      for (const socket of sockets()) attach(socket, true);
    },
    close() {
      for (const t of [...beamerTimers.values(), ...presenceTimers.values()]) clearTimeout(t);
      return io.close();
    },
  };
}

export type Live = ReturnType<typeof createLive>;
