/** Bibliothek (Sammlungen + Inhalte) für Regie & Moderator, automatisch aktualisiert. */
import { useEffect } from 'react';
import { create } from 'zustand';
import type { Collection, ContentItem, Template } from '@insel/shared';
import { api } from './api.ts';
import { onServerChanged } from './live.ts';
import type { TokenSlot } from './storage.ts';

interface LibraryStore {
  collections: Collection[];
  items: ContentItem[];
  templates: Template[];
  loaded: boolean;
  error: string | null;
}

export const useLibrary = create<LibraryStore>(() => ({
  collections: [],
  items: [],
  templates: [],
  loaded: false,
  error: null,
}));

let slot: TokenSlot = 'admin';
let loading: Promise<void> | null = null;

export function reloadLibrary(): Promise<void> {
  loading ??= (async () => {
    try {
      const [c, i, t] = await Promise.all([
        api<{ collections: Collection[] }>('/api/library', { slot }),
        api<{ items: ContentItem[] }>('/api/library/items', { slot }),
        api<{ templates: Template[] }>('/api/templates', { slot }),
      ]);
      useLibrary.setState({ collections: c.collections, items: i.items, templates: t.templates, loaded: true, error: null });
    } catch (e) {
      useLibrary.setState({ error: e instanceof Error ? e.message : 'Fehler', loaded: true });
    } finally {
      loading = null;
    }
  })();
  return loading;
}

/** Bibliothek laden und bei Änderungen (von anderen Geräten) neu laden. */
export function useLibrarySync(tokenSlot: TokenSlot, enabled = true) {
  useEffect(() => {
    if (!enabled) return;
    slot = tokenSlot;
    void reloadLibrary();
    return onServerChanged((what) => {
      if (what === 'library' || what === 'games') void reloadLibrary();
    });
  }, [tokenSlot, enabled]);
}

export function itemById(id: string | null | undefined): ContentItem | undefined {
  return useLibrary.getState().items.find((i) => i.id === id);
}
