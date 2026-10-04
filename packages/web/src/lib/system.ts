import { useEffect } from 'react';
import { create } from 'zustand';
import { api, type SystemInfo } from './api.ts';
import { onServerChanged } from './live.ts';

export const useSystem = create<{ info: SystemInfo | null }>(() => ({ info: null }));

export async function reloadSystem() {
  try {
    useSystem.setState({ info: await api<SystemInfo>('/api/system/info') });
  } catch {
    /* offline */
  }
}

/** Systeminfos (Beitritts-Adressen, Name) laden und regelmäßig auffrischen (Tunnel kann später kommen). */
export function useSystemSync() {
  useEffect(() => {
    void reloadSystem();
    const id = setInterval(reloadSystem, 20_000);
    const off = onServerChanged((w) => w === 'settings' && void reloadSystem());
    return () => {
      clearInterval(id);
      off();
    };
  }, []);
}

export function useJoinUrl(): string {
  const info = useSystem((s) => s.info);
  const base = info?.joinUrl ?? window.location.origin;
  return base.replace(/\/$/, '');
}
