/**
 * Oberfläche passend zur Welt: In der Blockwelt bekommen Handys und Beamer-Einblendungen den
 * Pixel-Look (Pixelschrift, graue Rahmen mit Kanten, Erd-Hintergrund) – über data-world am <html>.
 * Fragen, Antworten und Zahlen bleiben lesbar: Elemente mit class="readable" bekommen dort eine klare
 * Schrift (siehe styles.css, Abschnitt Blockwelt).
 */
import { useEffect } from 'react';
import type { Theme } from '@insel/shared';
import { blockAtlas } from '../board/blocks/atlas.ts';

export function useWorldStyle(theme: Theme | undefined) {
  useEffect(() => {
    const root = document.documentElement;
    if (theme !== 'blocks') {
      delete root.dataset.world;
      return;
    }
    root.dataset.world = 'blocks';
    const atlas = blockAtlas();
    root.style.setProperty('--world-dirt', `url(${atlas.dataUrl('dirt')})`);
    root.style.setProperty('--world-stone', `url(${atlas.dataUrl('stone')})`);
    root.style.setProperty('--world-planks', `url(${atlas.dataUrl('planks')})`);
    return () => {
      delete root.dataset.world;
    };
  }, [theme]);
}
