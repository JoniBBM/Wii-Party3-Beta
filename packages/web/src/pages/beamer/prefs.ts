/** Lokale Beamer-Einstellungen (pro Gerät). */
import { create } from 'zustand';
import type { Quality } from '../../board/scene.ts';
import { readJson, writeJson } from '../../lib/storage.ts';

export interface BeamerPrefs {
  quality: Quality;
  sound: boolean;
  music: boolean;
  ambience: boolean;
  tags: boolean;
}

const KEY = 'insel.beamer';
const DEFAULTS: BeamerPrefs = { quality: 'beauty', sound: true, music: false, ambience: true, tags: true };

export const useBeamerPrefs = create<BeamerPrefs & { set: (p: Partial<BeamerPrefs>) => void }>((set) => ({
  ...DEFAULTS,
  ...readJson<Partial<BeamerPrefs>>(KEY, {}),
  set: (p) =>
    set((s) => {
      const next = { ...s, ...p };
      writeJson(KEY, { quality: next.quality, sound: next.sound, music: next.music, ambience: next.ambience, tags: next.tags });
      return next;
    }),
}));
