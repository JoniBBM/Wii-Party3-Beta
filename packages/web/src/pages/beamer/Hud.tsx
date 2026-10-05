/** Dauerhafte Beamer-Anzeigen: Kopfzeile, Rangliste, Einblendungen, Einstellungen. */
import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Maximize, Music, Settings, Sparkles, Tag, Volume2, VolumeX, Waves, Zap } from 'lucide-react';
import { currentTurnTeamId, standings, type GameState } from '@insel/shared';
import type { Caption } from '../../board/director.ts';
import { FigureAvatar } from '../../figure/FigurePreview.tsx';
import { BonusDieBadge, VolcanoMeter } from '../../ui/game.tsx';
import { boardAudio } from './BoardCanvas.tsx';
import { useBeamerPrefs } from './prefs.ts';

export function TopBar({ state, appName }: { state: GameState | null; appName: string }) {
  return (
    <div className="glass pointer-events-auto flex items-center gap-3 rounded-full py-1.5 pr-5 pl-1.5">
      <span className="grid size-11 place-items-center rounded-full bg-white text-2xl shadow-soft">🏝️</span>
      <div className="leading-tight">
        <p className="font-display text-xl font-semibold text-ink">{appName}</p>
        {state && <p className="text-sm font-bold text-ink-2">{state.round > 0 ? `Runde ${state.round}` : state.config.name}</p>}
      </div>
    </div>
  );
}

export function Ranking({ state }: { state: GameState }) {
  const rows = standings(state);
  const goal = state.config.board.fields.length - 1;
  const turn = currentTurnTeamId(state);
  const v = state.config.rules.volcano;
  return (
    <div className="glass pointer-events-auto w-[19rem] overflow-hidden rounded-[1.6rem]">
      <ul className="flex flex-col">
        {rows.map(({ team, place }) => (
          <motion.li
            layout
            key={team.id}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            className={`flex items-center gap-2.5 px-3 py-1.5 ${turn === team.id ? 'bg-white/80' : ''}`}
          >
            <span className="w-6 text-center font-display text-lg font-semibold text-ink-2">{place}</span>
            <FigureAvatar figure={team.figure} color={team.color} size={38} className="ring-2 ring-white" />
            <div className="min-w-0 flex-1">
              <p className="truncate font-display text-base leading-tight font-semibold text-ink">{team.name}</p>
              <div className="mt-0.5 h-1.5 overflow-hidden rounded-full bg-black/10">
                <div className="h-full rounded-full transition-all duration-1000" style={{ width: `${(team.position / goal) * 100}%`, background: 'var(--accent)' }} />
              </div>
            </div>
            <div className="flex flex-col items-end">
              <span className="font-display text-lg leading-none font-semibold text-ink tabular-nums">{team.position}</span>
              <span className="flex gap-0.5">
                {team.blocked && <span title="gesperrt">🚧</span>}
                {team.crater && <span title="im Krater">🕳️</span>}
                <BonusDieBadge sides={team.bonusDie} />
              </span>
            </div>
          </motion.li>
        ))}
      </ul>
      {v.enabled && state.status !== 'lobby' && (
        <div className="border-t border-white/70 px-4 py-2">
          <VolcanoMeter pressure={state.volcano.pressure} threshold={v.threshold} compact />
        </div>
      )}
    </div>
  );
}

const TONES: Record<Caption['tone'], string> = {
  info: 'linear-gradient(180deg, #5cc4f5, #1f8fd1)',
  good: 'linear-gradient(180deg, #5bd38a, #229a55)',
  bad: 'linear-gradient(180deg, #ff7a7f, #d33a40)',
  gold: 'linear-gradient(180deg, #ffd85c, #e59a10)',
  team: '',
};

export function CaptionBanner({ caption }: { caption: Caption | null }) {
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-[7%] z-20 flex justify-center px-6">
      <AnimatePresence mode="wait">
        {caption && (
          <motion.div
            key={caption.id}
            initial={{ y: 40, opacity: 0, scale: 0.8 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: -10, opacity: 0, scale: 0.95 }}
            transition={{ type: 'spring', stiffness: 380, damping: 26 }}
            className="flex items-center gap-4 rounded-full border-4 border-white px-8 py-3 text-white shadow-[0_12px_40px_rgba(0,0,0,0.3)]"
            style={{
              background:
                caption.tone === 'team' && caption.color
                  ? `linear-gradient(180deg, color-mix(in srgb, ${caption.color} 75%, white), ${caption.color})`
                  : TONES[caption.tone],
            }}
          >
            <span className="text-5xl drop-shadow">{caption.icon}</span>
            <div>
              <p className="font-display text-4xl leading-tight font-semibold drop-shadow-sm">{caption.title}</p>
              {caption.sub && <p className="text-xl font-bold text-white/90">{caption.sub}</p>}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function SettingsMenu() {
  const prefs = useBeamerPrefs();
  const [open, setOpen] = useState(false);
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    let t = window.setTimeout(() => setVisible(false), 3000);
    const show = () => {
      setVisible(true);
      clearTimeout(t);
      t = window.setTimeout(() => setVisible(false), 3000);
    };
    window.addEventListener('mousemove', show);
    return () => {
      clearTimeout(t);
      window.removeEventListener('mousemove', show);
    };
  }, []);
  useEffect(() => {
    boardAudio.setEnabled({ sound: prefs.sound, music: prefs.music, ambience: prefs.ambience });
  }, [prefs.sound, prefs.music, prefs.ambience]);

  const item = (on: boolean, label: string, icon: React.ReactNode, onClick: () => void) => (
    <button type="button" onClick={onClick} className={`flex w-full items-center gap-3 rounded-2xl px-3 py-2 text-left font-bold ${on ? 'bg-accent-soft text-accent' : 'text-ink-2 hover:bg-black/5'}`}>
      {icon}
      <span className="flex-1">{label}</span>
      <span className="text-xs">{on ? 'an' : 'aus'}</span>
    </button>
  );

  return (
    <div className={`pointer-events-auto absolute bottom-4 left-4 z-30 transition-opacity duration-500 ${visible || open ? 'opacity-100' : 'opacity-0'}`}>
      <AnimatePresence>
        {open && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }} className="glass mb-3 flex w-72 flex-col gap-1 rounded-3xl p-3">
            <p className="px-3 pb-1 text-xs font-extrabold tracking-wide text-muted uppercase">Grafik</p>
            <div className="mb-2 grid grid-cols-2 gap-1 rounded-2xl bg-black/5 p-1">
              {(['beauty', 'fast'] as const).map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => prefs.set({ quality: q })}
                  className={`flex items-center justify-center gap-1.5 rounded-xl py-2 text-sm font-bold ${prefs.quality === q ? 'bg-white text-ink shadow-soft' : 'text-ink-2'}`}
                >
                  {q === 'beauty' ? <Sparkles className="size-4" /> : <Zap className="size-4" />}
                  {q === 'beauty' ? 'Schön' : 'Schnell'}
                </button>
              ))}
            </div>
            {item(prefs.sound, 'Ton', prefs.sound ? <Volume2 className="size-5" /> : <VolumeX className="size-5" />, () => prefs.set({ sound: !prefs.sound }))}
            {item(prefs.music, 'Musik', <Music className="size-5" />, () => prefs.set({ music: !prefs.music }))}
            {item(prefs.ambience, 'Meeresrauschen', <Waves className="size-5" />, () => prefs.set({ ambience: !prefs.ambience }))}
            {item(prefs.tags, 'Namensschilder', <Tag className="size-5" />, () => prefs.set({ tags: !prefs.tags }))}
            <button type="button" onClick={() => toggleFullscreen()} className="flex items-center gap-3 rounded-2xl px-3 py-2 font-bold text-ink-2 hover:bg-black/5">
              <Maximize className="size-5" /> Vollbild <span className="ml-auto text-xs">F</span>
            </button>
          </motion.div>
        )}
      </AnimatePresence>
      <button type="button" onClick={() => setOpen(!open)} className="glass grid size-14 place-items-center rounded-full" aria-label="Einstellungen">
        <Settings className="size-6 text-ink-2" />
      </button>
    </div>
  );
}

export function toggleFullscreen() {
  if (document.fullscreenElement) void document.exitFullscreen();
  else void document.documentElement.requestFullscreen?.().catch(() => {});
}
