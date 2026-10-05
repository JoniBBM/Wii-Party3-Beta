/** Dauerhafte Beamer-Anzeigen: Kopfzeile, Rangliste (in Teamfarben), Einblendungen, Status. */
import { AnimatePresence, motion } from 'motion/react';
import { Maximize, Video, Volume2 } from 'lucide-react';
import { currentTurnTeamId, standings, teamColor, type GameState } from '@insel/shared';
import type { Caption } from '../../board/director.ts';
import { FigureAvatar } from '../../figure/FigurePreview.tsx';
import { BonusDieBadge, VolcanoMeter } from '../../ui/game.tsx';

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
    <div className="glass pointer-events-auto w-[22rem] overflow-hidden rounded-[1.6rem] p-1.5">
      <ul className="flex flex-col gap-1">
        {rows.map(({ team, place }) => {
          const c = teamColor(team.color);
          const active = turn === team.id;
          return (
            <motion.li
              layout
              key={team.id}
              transition={{ type: 'spring', stiffness: 300, damping: 30 }}
              className={`flex items-center gap-2.5 rounded-[1.1rem] py-1 pr-3 pl-1 transition ${active ? 'scale-[1.03] shadow-lifted' : ''}`}
              style={{
                background: active
                  ? `linear-gradient(90deg, ${c.hex}, color-mix(in srgb, ${c.hex} 70%, white))`
                  : `linear-gradient(90deg, color-mix(in srgb, ${c.hex} 32%, white), rgba(255,255,255,0.85) 70%)`,
                boxShadow: active ? undefined : `inset 0 0 0 2.5px ${c.hex}`,
              }}
            >
              <span
                className="grid size-9 shrink-0 place-items-center rounded-full font-display text-lg font-semibold text-white"
                style={{ background: active ? 'rgba(255,255,255,0.25)' : c.hex }}
              >
                {place}
              </span>
              <FigureAvatar figure={team.figure} color={team.color} size={40} className="ring-[3px] ring-white" />
              <div className="min-w-0 flex-1">
                <p className={`truncate font-display text-lg leading-tight font-semibold ${active ? 'text-white drop-shadow' : ''}`} style={active ? undefined : { color: c.dark }}>
                  {team.name}
                </p>
                <div className={`mt-0.5 h-2 overflow-hidden rounded-full ${active ? 'bg-white/35' : 'bg-black/10'}`}>
                  <div className="h-full rounded-full transition-all duration-1000" style={{ width: `${(team.position / goal) * 100}%`, background: active ? '#fff' : c.hex }} />
                </div>
              </div>
              <div className="flex flex-col items-end">
                <span className={`font-display text-xl leading-none font-semibold tabular-nums ${active ? 'text-white' : 'text-ink'}`}>{team.position}</span>
                <span className="flex gap-0.5">
                  {team.blocked && <span title="gesperrt">🚧</span>}
                  {team.crater && <span title="im Krater">🕳️</span>}
                  <BonusDieBadge sides={team.bonusDie} />
                </span>
              </div>
            </motion.li>
          );
        })}
      </ul>
      {v.enabled && state.status !== 'lobby' && (
        <div className="px-3 pt-2 pb-1">
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

/**
 * Kleine Statusanzeigen am Beamer (kein Einstellungsmenü – alles steuert die Regie):
 * Hinweis „einmal klicken“ für Ton/Vollbild, freie Kamera, Bildrate.
 */
export function BeamerStatus({ audioReady, fullscreen, wantFullscreen, manual, fps, showFps }: { audioReady: boolean; fullscreen: boolean; wantFullscreen: boolean; manual: boolean; fps: number; showFps: boolean }) {
  const needClick = !audioReady || (wantFullscreen && !fullscreen);
  return (
    <>
      <AnimatePresence>
        {needClick && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            transition={{ delay: 1.2 }}
            className="glass pointer-events-none absolute bottom-6 left-1/2 z-30 flex -translate-x-1/2 items-center gap-2 rounded-full px-5 py-2.5 font-bold text-ink"
          >
            {!audioReady ? <Volume2 className="size-5" /> : <Maximize className="size-5" />}
            Einmal auf den Beamer klicken – für {!audioReady && wantFullscreen && !fullscreen ? 'Ton und Vollbild' : !audioReady ? 'Ton' : 'Vollbild'}
          </motion.div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {manual && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="glass pointer-events-none absolute bottom-6 left-6 z-30 flex items-center gap-2 rounded-full px-4 py-2 text-sm font-bold text-ink"
          >
            <Video className="size-4" /> Freie Kamera · Doppelklick oder Leertaste = Automatik
          </motion.div>
        )}
      </AnimatePresence>
      {showFps && (
        <div className="pointer-events-none absolute right-6 bottom-6 z-30 rounded-full bg-black/55 px-3 py-1 font-mono text-sm font-bold text-white tabular-nums">{Math.round(fps)} fps</div>
      )}
    </>
  );
}

export function toggleFullscreen() {
  if (document.fullscreenElement) void document.exitFullscreen();
  else void document.documentElement.requestFullscreen?.().catch(() => {});
}
