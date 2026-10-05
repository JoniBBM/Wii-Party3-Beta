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
import { teamKey, verifyToken } from './auth.ts';
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
}

type LiveSocket = Socket & { data: SocketData };

/** Ist das Token (noch) zum aktiven Spiel gültig? Sonst Gast bzw. Beamer. */
export function resolveSession(raw: Session | null, state: GameState | null, view: string): Session {
  const fallback: Session = { role: view === 'beamer' ? 'beamer' : 'guest' };
  if (!raw) return fallback;
  if (raw.role === 'admin' || raw.role === 'moderator') return raw;
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
    maxHttpBufferSize: 1e6,
  });

  const sessionOf = (socket: LiveSocket) => resolveSession(socket.data.session, runtime.state, socket.data.view);

  function viewKey(session: Session, state: GameState): string {
    if (isPrivileged(session.role)) return 'staff';
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
      else if (key === 'public' && socket.data.view === 'beamer') out.beamer = (out.beamer ?? 0) + 1;
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
    socket.data.view = typeof auth.view === 'string' ? auth.view : 'guest';
    socket.data.session = verifyToken(auth.token) ?? { role: 'guest' };

    socket.emit('hello', { appName: getSettings(database).appName, serverNow: Date.now() });
    socket.emit('show', show);
    pushState(runtime.state, socket);
    pushPresence();
    if (isPrivileged(sessionOf(socket).role)) socket.emit('beamers', [...beamers.values()]);
    socket.on('disconnect', () => {
      pushPresence();
      if (beamers.delete(socket.id)) pushBeamers();
    });

    socket.on('show', (raw: unknown, ack?: (a: Ack) => void) => {
      const reply = ack ?? (() => {});
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
    socket.on('beamer:stats', (raw: unknown) => {
      if (socket.data.view !== 'beamer') return;
      const r = statsSchema.safeParse(raw);
      if (!r.success) return;
      beamers.set(socket.id, { id: socket.id, ...r.data });
      pushBeamers();
    });
    socket.on('beamer:explained', (id: unknown) => {
      if (socket.data.view !== 'beamer' || id !== show.explainer.id || !show.explainer.running) return;
      show.explainer = { ...show.explainer, running: false };
      io.emit('show', show);
    });

    socket.on('auth', (token: string, ack?: (a: Ack) => void) => {
      socket.data.session = verifyToken(token) ?? { role: 'guest' };
      pushState(runtime.state, socket);
      pushPresence();
      ack?.({ ok: true });
    });

    socket.on('cmd', (raw: unknown, ack?: (a: Ack) => void) => {
      const reply = ack ?? (() => {});
      try {
        const cmd = commandSchema.parse(raw);
        const session = sessionOf(socket);
        if (cmd.type === 'player.register' && session.role === 'guest') {
          throw new EngineError('Bitte über die Anmeldeseite mitspielen', 'forbidden');
        }
        const result = runtime.dispatch(cmd, actorFor(session));
        reply({ ok: true, meta: result.meta });
      } catch (err) {
        reply(errorMessage(err));
      }
    });

    socket.on('undo', (ack?: (a: Ack) => void) => {
      const reply = ack ?? (() => {});
      try {
        if (sessionOf(socket).role !== 'admin') throw new EngineError('Nur die Regie kann rückgängig machen', 'forbidden');
        const label = runtime.undo();
        reply({ ok: true, meta: { label } });
      } catch (err) {
        reply(errorMessage(err));
      }
    });

    socket.on('time', (ack?: (now: number) => void) => ack?.(Date.now()));
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
