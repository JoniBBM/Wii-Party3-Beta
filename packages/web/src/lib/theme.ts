import { useEffect, useState } from 'react';
import { readStore, writeStore } from './storage.ts';

export type ThemePref = 'light' | 'dark' | 'system';

/** Regie & Moderator dürfen dunkel; Beamer und Handys sind immer hell (Wii-Look). */
export function useTheme(allowDark: boolean) {
  const [pref, setPref] = useState<ThemePref>(() => (readStore('insel.theme') as ThemePref | null) ?? 'system');
  useEffect(() => {
    const root = document.documentElement;
    if (!allowDark) {
      root.dataset.theme = 'light';
      return;
    }
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      root.dataset.theme = pref === 'system' ? (media.matches ? 'dark' : 'light') : pref;
    };
    apply();
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, [pref, allowDark]);
  const update = (p: ThemePref) => {
    writeStore('insel.theme', p);
    setPref(p);
  };
  return [pref, update] as const;
}
