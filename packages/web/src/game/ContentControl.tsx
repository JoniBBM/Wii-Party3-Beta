/** Steuerung eines laufenden Inhalts: Start, Countdown, Antworten, Buzzer, Platzierung, Auflösung. */
import { useState } from 'react';
import { Check, Eye, Flag, Lock, Pause, Play, RotateCcw, Square, Timer as TimerIcon, Trophy, X } from 'lucide-react';
import { isQuestion, type ActiveContent, type GameState, type RankEntry } from '@insel/shared';
import { useCommand, useServerNow } from '../lib/hooks.ts';
import { Button } from '../ui/basics.tsx';
import { Countdown, TeamChip } from '../ui/game.tsx';
import { confirm } from '../ui/overlay.tsx';
import { DrawnPlayers, placeLabel } from './bits.tsx';
import { ContentView } from './ContentView.tsx';

export function ContentControl({ state, content, large }: { state: GameState; content: ActiveContent; large?: boolean }) {
  const { run, pending } = useCommand();
  const q = isQuestion(content.item);
  const stage = content.stage;
  const kind = content.item.kind;

  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-4">
          <ContentView item={content.item} large={large} />
          {Object.keys(content.drawn).length > 0 && (
            <div>
              <p className="label">Ausgeloste Spieler</p>
              <DrawnPlayers
                state={state}
                drawn={content.drawn}
                large={large}
                onRedraw={stage !== 'revealed' ? (teamId) => run({ type: 'content.redraw', teamId }) : undefined}
              />
            </div>
          )}
        </div>
        <div className="flex flex-col gap-4">
          <TimerControl content={content} />
          {kind === 'buzzer' ? (
            <BuzzerBoard state={state} content={content} />
          ) : q ? (
            <AnswersBoard state={state} content={content} />
          ) : (
            <RankingEditor state={state} ranking={content.ranking ?? []} onChange={(ranking) => run({ type: 'content.rank', ranking }, { quiet: true })} />
          )}
          {q && stage === 'revealed' && content.ranking && <RankingPreview state={state} ranking={content.ranking} />}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line pt-4">
        {stage !== 'revealed' && (
          <Button
            variant="ghost"
            icon={<X className="size-4" />}
            onClick={async () => {
              if (await confirm({ title: 'Inhalt abbrechen?', text: 'Antworten und Auslosung dieses Inhalts werden verworfen.', confirm: 'Abbrechen', danger: true })) {
                void run({ type: 'content.abort' });
              }
            }}
          >
            Abbrechen
          </Button>
        )}
        {stage === 'intro' && (
          <Button variant="primary" size="lg" icon={<Play className="size-5" />} loading={pending === 'content.open'} onClick={() => run({ type: 'content.open' })}>
            {q ? (kind === 'buzzer' ? 'Buzzer freigeben' : 'Antworten freigeben') : 'Spiel starten'}
          </Button>
        )}
        {q && stage === 'open' && kind !== 'buzzer' && (
          <Button variant="soft" icon={<Lock className="size-4" />} onClick={() => run({ type: 'content.close' })}>
            Antworten schließen
          </Button>
        )}
        {q && (stage === 'open' || stage === 'closed') && kind !== 'buzzer' && (
          <Button variant="primary" size="lg" icon={<Eye className="size-5" />} loading={pending === 'content.reveal'} onClick={() => run({ type: 'content.reveal' })}>
            Auflösen
          </Button>
        )}
        {kind === 'buzzer' && stage !== 'intro' && stage !== 'revealed' && (
          <Button variant="soft" icon={<Eye className="size-4" />} onClick={() => run({ type: 'content.reveal' })}>
            Lösung zeigen
          </Button>
        )}
        {!q && stage === 'open' && (
          <Button variant="soft" icon={<Square className="size-4" />} onClick={() => run({ type: 'content.close' })}>
            Spiel beendet
          </Button>
        )}
        {((q && stage === 'revealed') || (!q && stage !== 'intro')) && (
          <Button
            variant="good"
            size="lg"
            icon={<Trophy className="size-5" />}
            disabled={!q && !(content.ranking && content.ranking.length)}
            loading={pending === 'content.finish'}
            onClick={() => run({ type: 'content.finish' })}
          >
            Ergebnis zeigen
          </Button>
        )}
      </div>
    </div>
  );
}

function TimerControl({ content }: { content: ActiveContent }) {
  const { run } = useCommand();
  const [secs, setSecs] = useState(60);
  const t = content.timer;
  const running = !!t && t.startedAt !== null;
  if (content.stage === 'revealed') return null;
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-line bg-surface-2 p-3">
      {t ? (
        <>
          <Countdown timer={t} size="md" />
          <div className="flex flex-wrap gap-1.5">
            {running ? (
              <Button size="sm" icon={<Pause className="size-4" />} onClick={() => run({ type: 'timer.pause' })}>
                Pause
              </Button>
            ) : (
              <Button size="sm" variant="primary" icon={<Play className="size-4" />} onClick={() => run({ type: 'timer.start' })} disabled={content.stage === 'intro'}>
                {content.stage === 'intro' ? 'Startet mit Freigabe' : 'Weiter'}
              </Button>
            )}
            <Button size="sm" onClick={() => run({ type: 'timer.add', seconds: 15 })}>
              +15 s
            </Button>
            <Button size="sm" onClick={() => run({ type: 'timer.add', seconds: -15 })}>
              −15 s
            </Button>
          </div>
        </>
      ) : (
        <>
          <TimerIcon className="size-5 text-muted" />
          <select className="field h-9 w-auto py-1" value={secs} onChange={(e) => setSecs(Number(e.target.value))}>
            {[15, 30, 45, 60, 90, 120, 180, 300].map((s) => (
              <option key={s} value={s}>
                {s >= 60 ? `${s / 60} min` : `${s} s`}
              </option>
            ))}
          </select>
          <Button size="sm" variant="primary" onClick={() => run({ type: 'timer.start', seconds: secs })} disabled={content.stage === 'intro'}>
            Countdown starten
          </Button>
        </>
      )}
    </div>
  );
}

function AnswersBoard({ state, content }: { state: GameState; content: ActiveContent }) {
  const { run } = useCommand();
  const now = useServerNow(1000);
  const revealed = content.stage === 'revealed';
  const item = content.item;
  const answered = state.teams.filter((t) => content.answers[t.id]).length;
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <p className="label mb-0">Antworten</p>
        <span className="text-sm font-bold text-muted">
          {answered}/{state.teams.length}
        </span>
      </div>
      <ul className="flex flex-col gap-1.5">
        {state.teams.map((t) => {
          const a = content.answers[t.id];
          let value = '';
          if (a) {
            if (item.kind === 'choice') value = `${String.fromCharCode(65 + Number(a.value))}: ${item.options[Number(a.value)] ?? ''}`;
            else if (item.kind === 'estimate') value = `${Number(a.value).toLocaleString('de-DE')} ${item.unit}`;
            else value = String(a.value);
          }
          const secs = a ? Math.max(0, Math.round((a.at - content.startedAt) / 1000)) : null;
          return (
            <li
              key={t.id}
              className={`flex items-center gap-2 rounded-2xl border px-3 py-2 ${
                revealed && a?.correct === true ? 'border-good bg-good-soft' : revealed && a?.correct === false ? 'border-bad/40 bg-bad-soft' : 'border-line bg-surface'
              }`}
            >
              <TeamChip team={t} size="sm" />
              <span className={`min-w-0 flex-1 truncate text-sm font-bold ${a ? '' : 'text-muted'}`}>{a ? value || '—' : content.stage === 'open' ? 'denkt nach …' : 'keine Antwort'}</span>
              {secs !== null && <span className="text-xs tabular-nums text-muted">{secs}s</span>}
              {!a && content.stage === 'open' && <span className="size-2 animate-pulse rounded-full bg-warn" />}
              {(revealed || content.stage === 'closed') && item.kind !== 'estimate' && (
                <span className="flex gap-1">
                  <JudgeButton active={a?.correct === true} good onClick={() => run({ type: 'answer.judge', teamId: t.id, correct: true })} />
                  <JudgeButton active={a?.correct === false} onClick={() => run({ type: 'answer.judge', teamId: t.id, correct: false })} />
                </span>
              )}
            </li>
          );
        })}
      </ul>
      {content.stage === 'open' && <p className="mt-2 text-xs text-muted">Läuft seit {Math.round((now - content.startedAt) / 1000)} s · Antworten schließen automatisch, wenn alle geantwortet haben.</p>}
    </div>
  );
}

function JudgeButton({ active, good, onClick }: { active: boolean; good?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={good ? 'Als richtig werten' : 'Als falsch werten'}
      className={`grid size-8 place-items-center rounded-full border-2 transition ${
        active ? (good ? 'border-good bg-good text-white' : 'border-bad bg-bad text-white') : 'border-line text-muted hover:border-ink/30'
      }`}
    >
      {good ? <Check className="size-4" /> : <X className="size-4" />}
    </button>
  );
}

function BuzzerBoard({ state, content }: { state: GameState; content: ActiveContent }) {
  const { run } = useCommand();
  const queue = content.buzzQueue;
  const firstOpen = queue.find((b) => content.buzzJudged[b.teamId] === undefined);
  return (
    <div>
      <p className="label">Buzzer-Reihenfolge</p>
      {queue.length === 0 ? (
        <p className="rounded-2xl bg-bg-2 p-4 text-center text-sm font-semibold text-muted">{content.stage === 'open' ? 'Warte auf den ersten Buzzer …' : 'Noch nicht freigegeben'}</p>
      ) : (
        <ol className="flex flex-col gap-2">
          {queue.map((b, i) => {
            const team = state.teams.find((t) => t.id === b.teamId);
            const judged = content.buzzJudged[b.teamId];
            const isNext = firstOpen?.teamId === b.teamId && content.stage !== 'revealed';
            return (
              <li
                key={b.teamId}
                className={`flex items-center gap-3 rounded-2xl border-2 px-3 py-2 ${isNext ? 'border-accent bg-accent-soft/50' : judged === true ? 'border-good bg-good-soft' : judged === false ? 'border-bad/30 bg-bad-soft' : 'border-line'}`}
              >
                <span className="grid size-8 place-items-center rounded-full bg-surface font-display font-semibold shadow-soft">{i + 1}</span>
                <TeamChip team={team} />
                <span className="text-xs tabular-nums text-muted">+{((b.at - queue[0]!.at) / 1000).toFixed(2)} s</span>
                <span className="flex-1" />
                {judged === undefined && content.stage !== 'revealed' ? (
                  <span className="flex gap-1.5">
                    <Button size="sm" variant="good" icon={<Check className="size-4" />} onClick={() => run({ type: 'buzz.judge', teamId: b.teamId, correct: true })}>
                      Richtig
                    </Button>
                    <Button size="sm" variant="bad" icon={<X className="size-4" />} onClick={() => run({ type: 'buzz.judge', teamId: b.teamId, correct: false })}>
                      Falsch
                    </Button>
                  </span>
                ) : (
                  <span className={`text-sm font-extrabold ${judged ? 'text-good' : 'text-bad'}`}>{judged ? 'richtig' : judged === false ? 'falsch' : ''}</span>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

/** Platzierung eintippen: Teams in der Reihenfolge antippen, Gleichstand möglich. */
export function RankingEditor({
  state,
  ranking,
  onChange,
  title = 'Platzierung',
}: {
  state: GameState;
  ranking: RankEntry[];
  onChange: (r: RankEntry[]) => void;
  title?: string;
}) {
  const [tie, setTie] = useState(false);
  const ranked = [...ranking].sort((a, b) => a.rank - b.rank);
  const lastRank = ranked.at(-1)?.rank ?? 0;
  const nextRank = tie && lastRank > 0 ? lastRank : ranked.length + 1;
  const toggle = (teamId: string) => {
    const existing = ranking.find((r) => r.teamId === teamId);
    if (existing) {
      // Entfernen und dahinter liegende nachrücken lassen
      const rest = ranking.filter((r) => r.teamId !== teamId);
      onChange(normalize(rest));
    } else {
      onChange([...ranking, { teamId, rank: nextRank }]);
      setTie(false);
    }
  };
  const unranked = state.teams.filter((t) => !ranking.some((r) => r.teamId === t.id));
  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="label mb-0">{title}</p>
        <div className="flex gap-1.5">
          <Button size="sm" variant={tie ? 'primary' : 'soft'} disabled={ranked.length === 0} onClick={() => setTie(!tie)}>
            = Gleichstand
          </Button>
          <Button size="sm" variant="ghost" icon={<RotateCcw className="size-3.5" />} disabled={ranked.length === 0} onClick={() => onChange([])}>
            Neu
          </Button>
        </div>
      </div>
      <p className="mb-2 text-xs text-muted">Teams in der Reihenfolge ihrer Platzierung antippen. Nochmal tippen entfernt.</p>
      <ul className="flex flex-col gap-1.5">
        {ranked.map((r) => {
          const team = state.teams.find((t) => t.id === r.teamId);
          return (
            <li key={r.teamId}>
              <button type="button" onClick={() => toggle(r.teamId)} className="flex w-full items-center gap-3 rounded-2xl border-2 border-good/40 bg-good-soft px-3 py-2 text-left">
                <span className="w-8 text-center font-display text-xl">{placeLabel(r.rank)}</span>
                <TeamChip team={team} />
              </button>
            </li>
          );
        })}
        {unranked.map((t) => (
          <li key={t.id}>
            <button type="button" onClick={() => toggle(t.id)} className="flex w-full items-center gap-3 rounded-2xl border-2 border-dashed border-line px-3 py-2 text-left transition hover:border-accent">
              <span className="w-8 text-center font-display text-lg text-muted">{nextRank}.</span>
              <TeamChip team={t} />
            </button>
          </li>
        ))}
      </ul>
      {unranked.length > 0 && ranked.length > 0 && <p className="mt-2 text-xs text-muted">Nicht platzierte Teams landen gemeinsam auf dem letzten Platz.</p>}
    </div>
  );
}

function normalize(list: RankEntry[]): RankEntry[] {
  // Ränge lückenlos neu vergeben, Gleichstände erhalten
  const sorted = [...list].sort((a, b) => a.rank - b.rank);
  const out: RankEntry[] = [];
  let prevOld = -1;
  let rank = 0;
  sorted.forEach((r, i) => {
    if (r.rank !== prevOld) rank = i + 1;
    prevOld = r.rank;
    out.push({ teamId: r.teamId, rank });
  });
  return out;
}

function RankingPreview({ state, ranking }: { state: GameState; ranking: RankEntry[] }) {
  const sorted = [...ranking].sort((a, b) => a.rank - b.rank);
  return (
    <div>
      <p className="label flex items-center gap-1.5">
        <Flag className="size-3.5" /> Vorläufige Platzierung
      </p>
      <div className="flex flex-wrap gap-2">
        {sorted.map((r) => (
          <span key={r.teamId} className="inline-flex items-center gap-1.5 rounded-full bg-bg-2 py-0.5 pr-1 pl-2.5 text-sm font-bold">
            {placeLabel(r.rank)}
            <TeamChip team={state.teams.find((t) => t.id === r.teamId)} size="sm" />
          </span>
        ))}
      </div>
    </div>
  );
}
