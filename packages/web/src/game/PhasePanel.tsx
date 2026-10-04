/** Die zentrale „Jetzt“-Karte für Regie und Moderator – je nach Spielphase. */
import { ArrowRight, Dices, PartyPopper, RotateCcw } from 'lucide-react';
import { CONTENT_KIND_INFO, gameStats, phaseTitle, standings, teamById, type GameState } from '@insel/shared';
import { useCommand } from '../lib/hooks.ts';
import { Button, Card } from '../ui/basics.tsx';
import { BonusDieBadge, TeamChip } from '../ui/game.tsx';
import { confirm } from '../ui/overlay.tsx';
import { placeLabel } from './bits.tsx';
import { ContentControl } from './ContentControl.tsx';
import { ContentPicker } from './ContentPicker.tsx';
import { DiceControl } from './DiceControl.tsx';
import { LobbyPanel } from './LobbyPanel.tsx';

const STEPS = [
  { key: 'pick', label: 'Auswahl' },
  { key: 'play', label: 'Spielen' },
  { key: 'result', label: 'Ergebnis' },
  { key: 'dice', label: 'Würfeln' },
] as const;

function stepOf(state: GameState): (typeof STEPS)[number]['key'] | null {
  switch (state.phase.name) {
    case 'idle':
    case 'round_end':
      return 'pick';
    case 'content':
      return state.phase.content.stage === 'revealed' ? 'result' : 'play';
    case 'results':
      return 'result';
    case 'dice':
      return 'dice';
    default:
      return null;
  }
}

export function PhaseStepper({ state }: { state: GameState }) {
  const current = stepOf(state);
  if (!current) return null;
  const idx = STEPS.findIndex((s) => s.key === current);
  return (
    <ol className="flex items-center gap-1 text-xs font-bold">
      {STEPS.map((s, i) => (
        <li key={s.key} className="flex items-center gap-1">
          <span
            className={`rounded-full px-2.5 py-1 transition ${
              i === idx ? 'bg-accent text-accent-ink shadow-soft' : i < idx ? 'bg-accent-soft text-accent' : 'bg-bg-2 text-muted'
            }`}
          >
            {s.label}
          </span>
          {i < STEPS.length - 1 && <ArrowRight className="size-3 text-muted" />}
        </li>
      ))}
    </ol>
  );
}

export function PhasePanel({ state, mode }: { state: GameState; mode: 'regie' | 'moderator' }) {
  const large = mode === 'moderator';
  const p = state.phase;
  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-surface-2 px-5 py-3">
        <div className="min-w-0">
          <p className="text-xs font-extrabold uppercase tracking-wide text-muted">{state.round > 0 ? `Runde ${state.round}` : state.config.name}</p>
          <h2 className="truncate text-xl font-semibold">{phaseTitle(state)}</h2>
        </div>
        <PhaseStepper state={state} />
      </div>
      <div className="p-5">
        {p.name === 'lobby' && <LobbyPanel state={state} mode={mode} />}
        {p.name === 'idle' && <ContentPicker state={state} compact={large} />}
        {p.name === 'content' && <ContentControl state={state} content={p.content} large={large} />}
        {p.name === 'results' && <ResultsControl state={state} />}
        {p.name === 'dice' && <DiceControl state={state} dice={p.dice} />}
        {p.name === 'round_end' && <RoundEnd state={state} />}
        {p.name === 'finished' && <Finished state={state} mode={mode} />}
      </div>
    </Card>
  );
}

function ResultsControl({ state }: { state: GameState }) {
  const { run, pending } = useCommand();
  if (state.phase.name !== 'results') return null;
  const r = state.phase.results;
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm font-semibold text-muted">
        {CONTENT_KIND_INFO[r.kind].icon} {r.title}
      </p>
      <ResultsTable state={state} entries={r.entries} />
      <div className="flex justify-end border-t border-line pt-4">
        <Button variant="primary" size="lg" icon={<Dices className="size-5" />} loading={pending === 'results.confirm'} onClick={() => run({ type: 'results.confirm' })}>
          Würfelrunde starten
        </Button>
      </div>
    </div>
  );
}

export function ResultsTable({ state, entries }: { state: GameState; entries: { teamId: string; rank: number; bonusDie: number; correct: boolean | null; detail: string }[] }) {
  return (
    <ul className="flex flex-col gap-1.5">
      {entries.map((e) => (
        <li key={e.teamId} className={`flex items-center gap-3 rounded-2xl border px-3 py-2 ${e.rank === 1 ? 'border-gold bg-gold/10' : 'border-line'}`}>
          <span className="w-8 text-center font-display text-xl">{placeLabel(e.rank)}</span>
          <TeamChip team={teamById(state, e.teamId)} />
          <span className="min-w-0 flex-1 truncate text-sm text-muted">
            {e.correct === true && '✅ '}
            {e.correct === false && '❌ '}
            {e.detail}
          </span>
          {e.bonusDie > 0 ? <BonusDieBadge sides={e.bonusDie} /> : <span className="text-xs font-bold text-muted">kein Bonus</span>}
        </li>
      ))}
    </ul>
  );
}

function RoundEnd({ state }: { state: GameState }) {
  if (state.phase.name !== 'round_end') return null;
  const s = state.phase.summary;
  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-2 sm:grid-cols-2">
        {s.moves
          .slice()
          .sort((a, b) => b.to - a.to)
          .map((m) => {
            const d = m.to - m.from;
            return (
              <div key={m.teamId} className="flex items-center gap-2 rounded-2xl border border-line px-3 py-2">
                <TeamChip team={teamById(state, m.teamId)} size="sm" />
                <span className="flex-1" />
                <span className="text-sm font-semibold tabular-nums text-muted">
                  {m.from} → <b className="text-ink">{m.to}</b>
                </span>
                <span className={`w-10 text-right text-sm font-extrabold tabular-nums ${d > 0 ? 'text-good' : d < 0 ? 'text-bad' : 'text-muted'}`}>
                  {d > 0 ? `+${d}` : d}
                </span>
              </div>
            );
          })}
      </div>
      {s.eruption && <p className="rounded-2xl bg-bad-soft p-3 font-bold text-bad">🌋 Der Vulkan ist ausgebrochen!</p>}
      <div className="border-t border-line pt-4">
        <p className="mb-3 font-display text-lg font-semibold">Nächste Runde vorbereiten</p>
        <ContentPicker state={state} />
      </div>
    </div>
  );
}

function Finished({ state, mode }: { state: GameState; mode: 'regie' | 'moderator' }) {
  const { run } = useCommand();
  const winner = teamById(state, state.winnerTeamId);
  const table = standings(state);
  const stats = gameStats(state);
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col items-center gap-2 rounded-3xl bg-gold/15 p-6 text-center">
        <PartyPopper className="size-10 text-warn" />
        <p className="font-display text-3xl font-semibold">{winner?.name} gewinnt!</p>
        <p className="text-sm text-muted">nach {state.round} Runden</p>
      </div>
      <ul className="flex flex-col gap-1.5">
        {table.map((s) => {
          const st = stats.find((x) => x.teamId === s.team.id);
          return (
            <li key={s.team.id} className="flex items-center gap-3 rounded-2xl border border-line px-3 py-2">
              <span className="w-8 text-center font-display text-xl">{placeLabel(s.place)}</span>
              <TeamChip team={s.team} />
              <span className="flex-1" />
              <span className="text-xs text-muted">
                {st?.wins ?? 0}× Rundensieg · Ø Platz {st?.avgRank ? st.avgRank.toFixed(1) : '–'}
              </span>
              <span className="w-16 text-right font-bold tabular-nums">Feld {s.team.position}</span>
            </li>
          );
        })}
      </ul>
      {mode === 'regie' && (
        <div className="flex flex-wrap justify-end gap-2 border-t border-line pt-4">
          <Button
            icon={<RotateCcw className="size-4" />}
            onClick={async () => {
              if (await confirm({ title: 'Noch eine Partie?', text: 'Alle Teams starten wieder bei Feld 0. Teams, Spieler und Fotos bleiben erhalten.', confirm: 'Neu starten' })) {
                void run({ type: 'game.reopenLobby' });
              }
            }}
          >
            Gleiche Teams, neue Partie
          </Button>
        </div>
      )}
    </div>
  );
}
