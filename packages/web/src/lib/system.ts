import { useEffect } from 'react';
import { create } from 'zustand';
import { api, type SystemInfo } from './api.ts';
import { onServerChanged } from './live.ts';
import type { TokenSlot } from './storage.ts';

export const useSystem = create<{ info: SystemInfo | null }>(() => ({ info: null }));

/** Anmeldung, mit der die Seite die Systeminfos holt (Beitritts-Adressen gibt es nur für Spielleitung und Beamer). */
let infoSlot: TokenSlot | null = null;

export async function reloadSystem() {
  try {
    useSystem.setState({ info: await api<SystemInfo>('/api/system/info', infoSlot ? { slot: infoSlot } : {}) });
  } catch {
    /* offline */
  }
}

/** Systeminfos (Beitritts-Adressen, Name) laden und regelmäßig auffrischen (Tunnel kann später kommen). */
export function useSystemSync(slot: TokenSlot | null = null) {
  useEffect(() => {
    infoSlot = slot;
    void reloadSystem();
    const id = setInterval(reloadSystem, 20_000);
    const off = onServerChanged((w) => w === 'settings' && void reloadSystem());
    return () => {
      clearInterval(id);
      off();
    };
  }, [slot]);
}

export function useJoinUrl(): string {
  const info = useSystem((s) => s.info);
  const base = info?.joinUrl ?? window.location.origin;
  return base.replace(/\/$/, '');
}
