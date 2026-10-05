/** Hält die 3D-Szene: erzeugt sie, füttert sie mit Zustand und Effekten, baut sie bei Bedarf neu. */
import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import type { GameState } from '@insel/shared';
import { BoardAudio } from '../../board/audio.ts';
import type { Caption } from '../../board/director.ts';
import { BoardScene } from '../../board/scene.ts';
import { onEffects, useLive } from '../../lib/live.ts';
import { qualityOverride } from './prefs.ts';

export const boardAudio = new BoardAudio();

export function BoardCanvas({ state, onCaption, onReady }: { state: GameState | null; onCaption: (c: Caption | null) => void; onReady?: (s: BoardScene | null) => void }) {
  const host = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<BoardScene | null>(null);
  const stateRef = useRef(state);
  stateRef.current = state;
  const fieldCount = state?.config.board.fields.length ?? 73;
  const [progress, setProgress] = useState<{ p: number; label: string } | null>({ p: 0, label: 'Lade Insel …' });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    let scene: BoardScene | null = null;
    let offCaption: (() => void) | undefined;
    setProgress({ p: 0, label: 'Lade Insel …' });
    setError(null);
    // Anfangsstufe; danach schaltet useShowControl live um (ohne Neuaufbau)
    const q = useLive.getState().show.settings.quality;
    const quality = qualityOverride() ?? (q === 'auto' ? 'high' : q);
    BoardScene.create(host.current!, { quality, fieldCount, onProgress: (p, label) => alive && setProgress({ p, label }) }, boardAudio)
      .then((s) => {
        if (!alive) {
          s.dispose();
          return;
        }
        scene = s;
        sceneRef.current = s;
        offCaption = s.onCaption(onCaption);
        if (stateRef.current) s.setState(stateRef.current);
        onReady?.(s);
        if (new URLSearchParams(window.location.search).has('debug')) (window as unknown as { __board: BoardScene }).__board = s;
        window.setTimeout(() => alive && setProgress(null), 300);
      })
      .catch((e: unknown) => {
        console.error(e);
        if (alive) setError('Die 3D-Insel konnte nicht geladen werden. Unterstützt der Browser WebGL 2?');
      });
    return () => {
      alive = false;
      offCaption?.();
      scene?.dispose();
      sceneRef.current = null;
      onReady?.(null);
    };
    // onCaption/onReady sind stabil genug; Neuaufbau nur bei anderer Brettlänge
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fieldCount]);

  useEffect(() => {
    if (state) sceneRef.current?.setState(state);
  }, [state]);

  useEffect(() => onEffects((effects) => sceneRef.current?.pushEffects(effects)), []);

  return (
    <div className="absolute inset-0">
      <div ref={host} className="absolute inset-0" />
      <AnimatePresence>
        {(progress || error) && (
          <motion.div
            className="absolute inset-0 z-40 grid place-items-center"
            style={{ background: 'linear-gradient(180deg, #8fd8ff 0%, #c9efff 60%, #3fb4d6 100%)' }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.8 }}
          >
            <div className="flex flex-col items-center gap-4 text-center">
              <span className="text-7xl animate-float">🏝️</span>
              {error ? (
                <p className="max-w-md font-display text-xl font-semibold text-bad">{error}</p>
              ) : (
                <>
                  <p className="font-display text-2xl font-semibold text-ink">{progress?.label}</p>
                  <div className="h-3 w-72 overflow-hidden rounded-full bg-white/60">
                    <div className="h-full rounded-full bg-accent transition-all duration-300" style={{ width: `${(progress?.p ?? 0) * 100}%` }} />
                  </div>
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
