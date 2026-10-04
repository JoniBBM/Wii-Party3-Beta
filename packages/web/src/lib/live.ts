/**
 * Live-Verbindung zum Spielserver (Socket.IO) als Zustand-Store.
 * Jede Seite verbindet sich einmal mit ihrem Token; der Server schickt nach jeder Änderung
 * den kompletten (gefilterten) Zustand sowie Effekte für Animationen und Sounds.
 */
import { useEffect } from 'react';
import { io, type Socket } from 'socket.io-client';
import { create } from 'zustand';
import type { CommandInput, Effect, GameState, Session } from '@insel/shared';
import { getToken, type TokenSlot } from './storage.ts';

export interface Ack {
  ok: boolean;
  error?: string;
  code?: string;
  meta?: Record<string, unknown>;
}

interface LiveStore {
  status: 'idle' | 'connecting' | 'online' | 'offline';
  state: GameState | null;
  session: Session | null;
  undo: string | null;
  appName: string;
  /** serverZeit − lokale Zeit in ms */
  offset: number;
  received: boolean;
  /** Verbundene Geräte je Team-ID (nur Regie/Moderator). */
  presence: Record<string, number>;
}

export const useLive = create<LiveStore>(() => ({
  status: 'idle',
  state: null,
  session: null,
  undo: null,
  appName: 'Insel der Abenteuer',
  offset: 0,
  received: false,
  presence: {},
}));

type EffectListener = (effects: Effect[]) => void;
const effectListeners = new Set<EffectListener>();

export function onEffects(fn: EffectListener): () => void {
  effectListeners.add(fn);
  return () => effectListeners.delete(fn);
}

let socket: Socket | null = null;
let current: { slot: TokenSlot | null; view: string; token: string | null } | null = null;
const changeListeners = new Set<(what: string) => void>();

export function onServerChanged(fn: (what: string) => void): () => void {
  changeListeners.add(fn);
  return () => changeListeners.delete(fn);
}

export function connectLive(slot: TokenSlot | null, view: string) {
  const token = slot ? getToken(slot) : null;
  if (socket && current && current.slot === slot && current.view === view && current.token === token) return;
  socket?.close();
  current = { slot, view, token };
  useLive.setState({ status: 'connecting', received: false });
  const s = io({ path: '/socket.io', auth: { token, view }, transports: ['websocket', 'polling'], reconnectionDelayMax: 4000 });
  socket = s;
  s.on('connect', () => useLive.setState({ status: 'online' }));
  s.on('disconnect', () => useLive.setState({ status: 'offline' }));
  s.on('connect_error', () => useLive.setState({ status: 'offline' }));
  s.on('hello', (p: { appName: string; serverNow: number }) => {
    useLive.setState({ appName: p.appName, offset: p.serverNow - Date.now() });
    document.title = p.appName;
  });
  s.on('state', (p: { state: GameState | null; session: Session; serverNow: number; undo?: string | null }) => {
    useLive.setState({
      state: p.state,
      session: p.session,
      undo: p.undo ?? null,
      offset: p.serverNow - Date.now(),
      received: true,
    });
  });
  s.on('effects', (effects: Effect[]) => {
    for (const fn of effectListeners) fn(effects);
  });
  s.on('presence', (presence: Record<string, number>) => useLive.setState({ presence }));
  s.on('changed', (what: string) => {
    for (const fn of changeListeners) fn(what);
  });
}

/** Nach Login/Logout: neues Token an die bestehende Verbindung geben. */
export function reauth() {
  if (!current) return;
  const { slot, view } = current;
  current = null;
  connectLive(slot, view);
}

export function sendCommand(cmd: CommandInput): Promise<Ack> {
  return new Promise((resolve) => {
    if (!socket || !socket.connected) {
      resolve({ ok: false, error: 'Keine Verbindung zum Spielserver' });
      return;
    }
    const timer = setTimeout(() => resolve({ ok: false, error: 'Der Server antwortet nicht' }), 8000);
    socket.emit('cmd', cmd, (ack: Ack) => {
      clearTimeout(timer);
      resolve(ack);
    });
  });
}

export function sendUndo(): Promise<Ack> {
  return new Promise((resolve) => {
    // Offline nicht puffern – sonst würde das Rückgängig später etwas anderes zurücknehmen
    if (!socket || !socket.connected) return resolve({ ok: false, error: 'Keine Verbindung zum Spielserver' });
    const timer = setTimeout(() => resolve({ ok: false, error: 'Der Server antwortet nicht' }), 8000);
    socket.emit('undo', (ack: Ack) => {
      clearTimeout(timer);
      resolve(ack);
    });
  });
}

/** Hook: Seite verbindet sich beim Mounten. */
export function useLiveConnection(slot: TokenSlot | null, view: string) {
  useEffect(() => {
    connectLive(slot, view);
  }, [slot, view]);
}

export function serverNow(): number {
  return Date.now() + useLive.getState().offset;
}
