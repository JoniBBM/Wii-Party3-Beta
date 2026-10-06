/**
 * Echtzeit über Socket.IO. Jedes Gerät bekommt nach jeder Änderung den kompletten Zustand –
 * gefiltert auf das, was seine Rolle sehen darf – plus die Effekte für Animationen.
 */
import type { Server as HttpServer } from 'node:http';
import { Server, type Socket } from 'socket.io';
import { z } from 'zod';
import {
  commandSchema,
  DEFAULT_SHOW,
  EngineError,
  isPrivileged,
  parseShow,
  projectState,
  QUALITY_LEVELS,
  showCommandSchema,
  type Actor,
  type BeamerStats,
  type GameState,
  type Session,
  type ShowState,
} from '@insel/shared';
import { issueToken, staffKey, teamKey, verifyToken } from './auth.ts';
import { config } from './config.ts';
import { getSettings, setSettings, type DB } from './db.ts';
import type { GameRuntime } from './runtime.ts';

export interface Ack {
  ok: boolean;
  error?: string;
  code?: string;
  meta?: Record<string, unknown>;
}

interface SocketData {
  session: Session;
  view: string;
  /** Kopplungscode eines (noch) nicht freigegebenen Beamers */
  pairCode?: string;
  /** Mengenbremse je Verbindung */
  tokens: number;
  last: number;
  ip: string;
}

type LiveSocket = Socket & { data: SocketData };

/**
 * Ist das Token (noch) gültig? Regie, Moderator und Beamer hängen an den Passwörtern
 * (staffKey), Teams und Spieler am aktiven Spiel. Sonst Gast – auch ein Beamer, der noch
 * nicht in der Regie freigegeben wurde (außer wenn die Passwörter abgeschaltet sind).
 */
export function resolveSession(raw: Session | null, state: GameState | null, view: string): Session {
  const fallback: Session = { role: view === 'beamer' && config.authDisabled ? 'beamer' : 'guest' };
  if (!raw) return fallback;
  if (raw.role === 'admin' || raw.role === 'moderator' || raw.role === 'beamer') {
    return config.authDisabled || raw.key === staffKey() ? raw : fallback;
  }
  if (!state || raw.gameId !== state.id) return fallback;
  if (raw.role === 'team') {
    const team = state.teams.find((t) => t.id === raw.teamId);
    return team && raw.key === teamKey(team.joinToken) ? raw : fallback;
  }
  if (raw.role === 'player') return state.players.some((p) => p.id === raw.playerId) ? raw : fallback;
  return fallback;
}

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

export function createLive(httpServer: HttpServer, runtime: GameRuntime, database: DB) {
  const io = new Server(httpServer, {
    path: '/socket.io',
    serveClient: false,
    pingInterval: 10_000,
    pingTimeout: 8_000,
    // Befehle sind klein; Fotos laufen über HTTP
    maxHttpBufferSize: 256_000,
  });

  // ---------------------------------------------------------------------------
  // Schutz vor Überflutung: Verbindungen je Adresse, Nachrichten je Verbindung
  // ---------------------------------------------------------------------------
  const MAX_CONN_PER_IP = 60;
  const RATE = 12; // Nachrichten je Sekunde (Dauer)
  const BURST = 40; // kurzfristig mehr erlaubt
  const perIp = new Map<string, number>();
  /** Echte Client-Adresse: hinter dem Tunnel (Docker-Netz, nicht das Gateway) zählt Cf-Connecting-Ip. */
  function socketIp(socket: Socket): string {
    const addr = socket.handshake.address.replace(/^::ffff:/, '');
    const cf = socket.handshake.headers['cf-connecting-ip'];
    const fromTunnel = /^172\.(1[6-9]|2\d|3[01])\.\d+\.\d+$/.test(addr) && !addr.endsWith('.1');
    return fromTunnel && typeof cf === 'string' ? cf : addr;
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
    const n = perIp.get(ip) ?? 0;
    if (n >= MAX_CONN_PER_IP) return next(new Error('Zu viele Verbindungen von dieser Adresse'));
    perIp.set(ip, n + 1);
    (socket as LiveSocket).data.ip = ip;
    socket.on('disconnect', () => {
      const c = (perIp.get(ip) ?? 1) - 1;
      if (c <= 0) perIp.delete(ip);
      else perIp.set(ip, c);
    });
    next();
  });

  /** Beamer koppeln: Code anzeigen, die Regie gibt ihn frei. */
  const pairCodes = new Map<string, LiveSocket>();
  function offerPairing(socket: LiveSocket) {
    if (socket.data.view !== 'beamer' || sessionOf(socket).role === 'beamer' || isPrivileged(sessionOf(socket).role)) {
      if (socket.data.pairCode) pairCodes.delete(socket.data.pairCode);
      socket.data.pairCode = undefined;
      return;
    }
    if (!socket.data.pairCode) {
      let code = '';
      do code = String(1000 + Math.floor(Math.random() * 9000));
      while (pairCodes.has(code));
      socket.data.pairCode = code;
      pairCodes.set(code, socket);
    }
    socket.emit('beamer:pair', { code: socket.data.pairCode });
  }

  const sessionOf = (socket: LiveSocket) => resolveSession(socket.data.session, runtime.state, socket.data.view);

  function viewKey(session: Session, state: GameState): string {
    if (isPrivileged(session.role)) return 'staff';
    if (session.role === 'beamer') return 'beamer';
    if (session.role === 'team') return `team:${session.teamId}`;
    if (session.role === 'player') {
      const teamId = state.players.find((p) => p.id === session.playerId)?.teamId;
      return teamId ? `team:${teamId}` : 'public';
    }
    return 'public';
  }

  function pushState(state: GameState | null, only?: LiveSocket) {
    const cache = new Map<string, GameState>();
    const targets = only ? [only] : [...io.sockets.sockets.values()];
    const serverNow = Date.now();
    for (const socket of targets as LiveSocket[]) {
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
      if (isPrivileged(session.role)) payload.undo = runtime.undoLabel;
      socket.emit('state', payload);
    }
  }

  /** Wie viele Geräte sind je Team verbunden? (Für die Regie) */
  function presence(): Record<string, number> {
    const out: Record<string, number> = {};
    const state = runtime.state;
    if (!state) return out;
    for (const socket of io.sockets.sockets.values() as Iterable<LiveSocket>) {
      const key = viewKey(sessionOf(socket), state);
      if (key.startsWith('team:')) out[key.slice(5)] = (out[key.slice(5)] ?? 0) + 1;
      else if (key === 'beamer') out.beamer = (out.beamer ?? 0) + 1;
    }
    return out;
  }

  let presenceTimer: NodeJS.Timeout | null = null;
  function pushPresence() {
    if (presenceTimer) return;
    presenceTimer = setTimeout(() => {
      presenceTimer = null;
      const p = presence();
      for (const socket of io.sockets.sockets.values() as Iterable<LiveSocket>) {
        if (isPrivileged(sessionOf(socket).role)) socket.emit('presence', p);
      }
    }, 150);
  }

  // ---------------------------------------------------------------------------
  // Beamer-Show: Einstellungen der Regie live an alle Beamer, Rückmeldung der Beamer an die Regie
  // ---------------------------------------------------------------------------
  const show: ShowState = {
    settings: parseShow(getSettings(database).show),
    explainer: { running: false, id: 0, startedAt: 0 },
  };
  runtime.reactions = show.settings.reactions;
  const beamers = new Map<string, BeamerStats>();
  let beamerTimer: NodeJS.Timeout | null = null;

  function pushBeamers() {
    if (beamerTimer) return;
    beamerTimer = setTimeout(() => {
      beamerTimer = null;
      const list = [...beamers.values()];
      for (const socket of io.sockets.sockets.values() as Iterable<LiveSocket>) {
        if (isPrivileged(sessionOf(socket).role)) socket.emit('beamers', list);
      }
    }, 300);
  }

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

  runtime.on('state', (state) => {
    pushState(state);
    pushPresence();
  });
  runtime.on('effects', (effects) => io.emit('effects', effects));

  io.on('connection', (rawSocket) => {
    const socket = rawSocket as LiveSocket;
    const auth = (socket.handshake.auth ?? {}) as { token?: string; view?: string };
    socket.data.view = typeof auth.view === 'string' ? auth.view.slice(0, 20) : 'guest';
    socket.data.session = verifyToken(auth.token) ?? { role: 'guest' };
    socket.data.tokens = BURST;
    socket.data.last = Date.now();

    socket.emit('hello', { appName: getSettings(database).appName, serverNow: Date.now() });
    socket.emit('show', show);
    pushState(runtime.state, socket);
    pushPresence();
    if (isPrivileged(sessionOf(socket).role)) socket.emit('beamers', [...beamers.values()]);
    offerPairing(socket);
    socket.on('disconnect', () => {
      pushPresence();
      if (socket.data.pairCode) pairCodes.delete(socket.data.pairCode);
      if (beamers.delete(socket.id)) pushBeamers();
    });

    // Regie gibt einen Beamer über seinen Kopplungscode frei
    socket.on('beamer:pair', (raw: unknown, ack?: (a: Ack) => void) => {
      const reply = ack ?? (() => {});
      if (!allow(socket, 2)) return reply(BUSY);
      if (!isPrivileged(sessionOf(socket).role)) return reply({ ok: false, error: 'Nur die Spielleitung kann Beamer freigeben', code: 'forbidden' });
      const code = typeof raw === 'string' ? raw.trim() : '';
      const target = pairCodes.get(code);
      if (!target) return reply({ ok: false, error: 'Diesen Code zeigt gerade kein Beamer', code: 'not_found' });
      const token = issueToken({ role: 'beamer', key: staffKey() });
      pairCodes.delete(code);
      target.data.pairCode = undefined;
      target.data.session = verifyToken(token) ?? { role: 'guest' };
      target.emit('beamer:token', token);
      pushState(runtime.state, target);
      pushPresence();
      reply({ ok: true });
    });

    socket.on('show', (raw: unknown, ack?: (a: Ack) => void) => {
      const reply = ack ?? (() => {});
      if (!allow(socket)) return reply(BUSY);
      try {
        if (!isPrivileged(sessionOf(socket).role)) throw new EngineError('Nur die Spielleitung kann den Beamer steuern', 'forbidden');
        const cmd = showCommandSchema.parse(raw);
        // Einmalige Befehle an die Beamer (nicht gespeichert)
        if (cmd.type === 'test') {
          io.emit('show:test', cmd.what);
          return reply({ ok: true });
        }
        if (cmd.type === 'reload' || cmd.type === 'camera') {
          io.emit('show:cmd', cmd);
          return reply({ ok: true });
        }
        if (cmd.type === 'set') show.settings = { ...show.settings, ...cmd.patch };
        if (cmd.type === 'reset') show.settings = { ...DEFAULT_SHOW };
        if (cmd.type === 'explain') {
          show.explainer =
            cmd.action === 'start'
              ? { running: true, id: show.explainer.id + 1, startedAt: Date.now() }
              : { ...show.explainer, running: false };
        } else {
          setSettings(database, { show: show.settings });
          runtime.reactions = show.settings.reactions;
        }
        io.emit('show', show);
        reply({ ok: true });
      } catch (err) {
        reply(errorMessage(err));
      }
    });

    // Beamer melden Bildrate, Grafikstufe und ob die Erklärung fertig ist
    const isBeamer = () => socket.data.view === 'beamer' && sessionOf(socket).role === 'beamer';
    socket.on('beamer:stats', (raw: unknown) => {
      if (!allow(socket) || !isBeamer()) return;
      const r = statsSchema.safeParse(raw);
      if (!r.success) return;
      beamers.set(socket.id, { id: socket.id, ...r.data });
      pushBeamers();
    });
    socket.on('beamer:explained', (id: unknown) => {
      if (!allow(socket) || !isBeamer() || id !== show.explainer.id || !show.explainer.running) return;
      show.explainer = { ...show.explainer, running: false };
      io.emit('show', show);
    });

    socket.on('auth', (token: unknown, ack?: (a: Ack) => void) => {
      if (!allow(socket, 3)) return ack?.(BUSY);
      const before = JSON.stringify(sessionOf(socket));
      socket.data.session = verifyToken(typeof token === 'string' ? token : null) ?? { role: 'guest' };
      // nur bei geänderter Sitzung neu senden (sonst ließe sich der Server mit kleinen Nachrichten fluten)
      if (JSON.stringify(sessionOf(socket)) !== before) {
        pushState(runtime.state, socket);
        pushPresence();
        if (isPrivileged(sessionOf(socket).role)) socket.emit('beamers', [...beamers.values()]);
      }
      offerPairing(socket);
      ack?.({ ok: true });
    });

    socket.on('cmd', (raw: unknown, ack?: (a: Ack) => void) => {
      const reply = ack ?? (() => {});
      if (!allow(socket)) return reply(BUSY);
      try {
        const cmd = commandSchema.parse(raw);
        const session = sessionOf(socket);
        if (cmd.type === 'player.register' && session.role === 'guest') {
          throw new EngineError('Bitte über die Anmeldeseite mitspielen', 'forbidden');
        }
        // Spieler anlegen kostet mehr (verhindert massenhaftes Anlegen)
        if (cmd.type === 'player.register' && !isPrivileged(session.role) && !allow(socket, 8)) return reply(BUSY);
        const result = runtime.dispatch(cmd, actorFor(session));
        reply({ ok: true, meta: result.meta });
      } catch (err) {
        reply(errorMessage(err));
      }
    });

    socket.on('undo', (ack?: (a: Ack) => void) => {
      const reply = ack ?? (() => {});
      if (!allow(socket)) return reply(BUSY);
      try {
        if (sessionOf(socket).role !== 'admin') throw new EngineError('Nur die Regie kann rückgängig machen', 'forbidden');
        const label = runtime.undo();
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
    /** Regie-Oberflächen informieren, dass sich Bibliothek/Spiele geändert haben. */
    notifyStaff(event: 'library' | 'games' | 'settings') {
      for (const socket of io.sockets.sockets.values() as Iterable<LiveSocket>) {
        if (isPrivileged(sessionOf(socket).role)) socket.emit('changed', event);
      }
      if (event === 'settings') io.emit('hello', { appName: getSettings(database).appName, serverNow: Date.now() });
    },
    close() {
      if (beamerTimer) clearTimeout(beamerTimer);
      return io.close();
    },
  };
}

export type Live = ReturnType<typeof createLive>;
