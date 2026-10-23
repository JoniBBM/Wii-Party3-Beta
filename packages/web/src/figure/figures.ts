/** Figur passend zur Welt des Spiels: Insel-, Block- oder Astronauten-Figur (gleiche Editor-Einstellungen). */
import type { FigureConfig, TeamColorKey, Theme } from '@insel/shared';
import { useLive } from '../lib/live.ts';
import { createFigure, type FigureRig } from './figure3d.ts';
import { createBlockFigure } from './figureBlocks.ts';
import { createSpaceFigure } from './figureSpace.ts';

export function makeFigure(theme: Theme, figure: FigureConfig, color: TeamColorKey, opts: { base?: boolean } = {}): FigureRig {
  return theme === 'blocks' ? createBlockFigure(figure, color, opts) : theme === 'space' ? createSpaceFigure(figure, color, opts) : createFigure(figure, color, opts);
}

/** Welt des aktuellen Spiels (Handy, Regie, Beamer) */
export function liveTheme(): Theme {
  return useLive.getState().state?.config.theme ?? 'island';
}

export function useTheme(): Theme {
  return useLive((s) => s.state?.config.theme ?? 'island');
}
