/** Beamer: 3D-Insel mit allen Einblendungen. Läuft ohne Anmeldung. */
import { useCallback, useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { Volume2 } from 'lucide-react';
import type { Caption } from '../../board/director.ts';
import { useLive, useLiveConnection } from '../../lib/live.ts';
import { useSystemSync } from '../../lib/system.ts';
import { useTheme } from '../../lib/theme.ts';
import { BoardCanvas, boardAudio } from './BoardCanvas.tsx';
import { CaptionBanner, Ranking, SettingsMenu, toggleFullscreen, TopBar } from './Hud.tsx';
import { PhaseOverlay } from './Overlays.tsx';
import { useBeamerPrefs } from './prefs.ts';

export default function BeamerApp() {
  useTheme(false);
  useLiveConnection(null, 'beamer');
  useSystemSync();
  const { state, status, appName } = useLive();
  const [caption, setCaption] = useState<Caption | null>(null);
  const [audioOn, setAudioOn] = useState(false);
  const onCaption = useCallback((c: Caption | null) => setCaption(c), []);

  // Schriftgröße skaliert mit der Bildschirmbreite (720p bis 4K)
  useEffect(() => {
    const root = document.documentElement;
    const prev = root.style.fontSize;
    root.style.fontSize = 'clamp(11px, 0.83vw, 26px)';
    document.body.style.overflow = 'hidden';
    return () => {
      root.style.fontSize = prev;
      document.body.style.overflow = '';
    };
  }, []);

  // Ton braucht eine Nutzeraktion
  useEffect(() => {
    const unlock = () => {
      void boardAudio.unlock().then(() => {
        const p = useBeamerPrefs.getState();
        boardAudio.setEnabled({ sound: p.sound, music: p.music, ambience: p.ambience });
        setAudioOn(true);
      });
    };
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, []);

  // Tastenkürzel
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      const prefs = useBeamerPrefs.getState();
      if (e.key === 'f' || e.key === 'F') toggleFullscreen();
      if (e.key === 'q' || e.key === 'Q') prefs.set({ quality: prefs.quality === 'beauty' ? 'fast' : 'beauty' });
      if (e.key === 'm' || e.key === 'M') prefs.set({ sound: !prefs.sound });
      if (e.key === 't' || e.key === 'T') prefs.set({ tags: !prefs.tags });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="fixed inset-0 overflow-hidden bg-[#8fd8ff] select-none">
      <BoardCanvas state={state} onCaption={onCaption} />

      <div className="pointer-events-none absolute inset-0 z-10">
        <div className="absolute top-5 left-6">
          <TopBar state={state} appName={appName} />
        </div>
        {state && state.teams.length > 0 && state.status !== 'lobby' && (
          <div className="absolute top-5 right-6">
            <Ranking state={state} />
          </div>
        )}
        {state && <PhaseOverlay state={state} />}
        {!state && (
          <div className="absolute inset-0 grid place-items-center">
            <div className="glass rounded-[2rem] px-10 py-8 text-center">
              <p className="font-display text-5xl font-semibold text-ink">{appName}</p>
              <p className="mt-3 text-2xl font-bold text-ink-2">Die Spielleitung bereitet gerade alles vor …</p>
            </div>
          </div>
        )}
        <CaptionBanner caption={caption} />
        {status === 'offline' && (
          <div className="absolute top-5 left-1/2 -translate-x-1/2 rounded-full bg-bad px-5 py-2 font-bold text-white shadow-lifted">Verbindung zum Spielserver unterbrochen …</div>
        )}
      </div>

      {!audioOn && (
        <motion.button
          type="button"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1.5 }}
          className="glass absolute right-6 bottom-6 z-30 flex items-center gap-2 rounded-full px-5 py-3 font-bold text-ink"
        >
          <Volume2 className="size-5" /> Klicken für Ton
        </motion.button>
      )}
      <SettingsMenu />
    </div>
  );
}
