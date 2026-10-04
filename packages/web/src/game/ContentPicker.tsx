/** Nächsten Inhalt wählen: Ablaufplan, Zufall, aus der Liste oder spontan. */
import { useMemo, useState } from 'react';
import { CheckCircle2, ListOrdered, Play, Search, Shuffle, Sparkles } from 'lucide-react';
import {
  CONTENT_KIND_INFO,
  PLAYER_COUNTS,
  PLAYER_COUNT_LABEL,
  type ContentItem,
  type ContentItemInput,
  type ContentKind,
  type GameState,
} from '@insel/shared';
import { useCommand } from '../lib/hooks.ts';
import { useLibrary } from '../lib/library.ts';
import { Badge, Button, Segmented } from '../ui/basics.tsx';
import { KindBadge } from '../ui/game.tsx';
import { ContentView } from './ContentView.tsx';

type Tab = 'plan' | 'random' | 'list' | 'adhoc';

export function ContentPicker({ state, compact }: { state: GameState; compact?: boolean }) {
  const hasPlan = state.config.plan.length > 0;
  const planLeft = state.planIndex < state.config.plan.length;
  const [tab, setTab] = useState<Tab>(hasPlan && planLeft ? 'plan' : 'random');
  return (
    <div className="flex flex-col gap-4">
      <Segmented<Tab>
        value={tab}
        onChange={setTab}
        className="self-start"
        options={[
          ...(hasPlan ? [{ value: 'plan' as const, label: <span className="inline-flex items-center gap-1.5"><ListOrdered className="size-4" />Plan</span> }] : []),
          { value: 'random', label: <span className="inline-flex items-center gap-1.5"><Shuffle className="size-4" />Zufall</span> },
          { value: 'list', label: <span className="inline-flex items-center gap-1.5"><Search className="size-4" />Auswahl</span> },
          { value: 'adhoc', label: <span className="inline-flex items-center gap-1.5"><Sparkles className="size-4" />Spontan</span> },
        ]}
      />
      {tab === 'plan' && <PlanTab state={state} />}
      {tab === 'random' && <RandomTab state={state} />}
      {tab === 'list' && <ListTab state={state} compact={compact} />}
      {tab === 'adhoc' && <AdhocTab />}
    </div>
  );
}

function usePool(state: GameState) {
  const items = useLibrary((s) => s.items);
  return useMemo(() => {
    const ids = new Set(state.config.collectionIds);
    return items.filter((i) => ids.has(i.collectionId));
  }, [items, state.config.collectionIds]);
}

function PlanTab({ state }: { state: GameState }) {
  const { run, pending } = useCommand();
  const items = useLibrary((s) => s.items);
  const plan = state.config.plan;
  const next = items.find((i) => i.id === plan[state.planIndex]);
  const upcoming = plan.slice(state.planIndex + 1, state.planIndex + 4).map((id) => items.find((i) => i.id === id));
  if (state.planIndex >= plan.length) {
    return <p className="rounded-2xl bg-bg-2 p-4 text-sm font-semibold text-muted">Der Ablaufplan ist abgearbeitet. Wähle per Zufall oder aus der Liste weiter.</p>;
  }
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between text-sm font-bold text-muted">
        <span>
          Nächster Punkt im Plan ({state.planIndex + 1}/{plan.length})
        </span>
      </div>
      {next ? (
        <div className="rounded-2xl border-2 border-accent/40 bg-accent-soft/40 p-4">
          <ContentView item={next} />
        </div>
      ) : (
        <p className="text-sm text-bad">Dieser Inhalt wurde gelöscht – er wird übersprungen.</p>
      )}
      <Button variant="primary" size="lg" icon={<Play className="size-5" />} loading={pending === 'content.select'} onClick={() => run({ type: 'content.select', source: 'plan' })}>
        Plan-Inhalt starten
      </Button>
      {upcoming.length > 0 && (
        <div className="text-sm text-muted">
          Danach:{' '}
          {upcoming.map((i, n) => (
            <span key={n} className="font-semibold text-ink-2">
              {n > 0 && ' · '}
              {i ? `${CONTENT_KIND_INFO[i.kind].icon} ${i.title}` : '(gelöscht)'}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

const RANDOM_FILTERS: { key: string; label: string; kinds?: ContentKind[] }[] = [
  { key: 'all', label: 'Alles' },
  { key: 'game', label: '🎯 Spiel', kinds: ['game'] },
  { key: 'question', label: '❓ Frage', kinds: ['choice', 'text', 'estimate', 'buzzer'] },
  { key: 'estimate', label: '📏 Schätzen', kinds: ['estimate'] },
  { key: 'buzzer', label: '🔔 Buzzer', kinds: ['buzzer'] },
];

function RandomTab({ state }: { state: GameState }) {
  const { run, pending } = useCommand();
  const pool = usePool(state).filter((i) => i.roundUse);
  const [filter, setFilter] = useState('all');
  const f = RANDOM_FILTERS.find((x) => x.key === filter)!;
  const matching = pool.filter((i) => !f.kinds || f.kinds.includes(i.kind));
  const fresh = matching.filter((i) => !state.playedItemIds.includes(i.id));
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2">
        {RANDOM_FILTERS.map((x) => (
          <button
            key={x.key}
            type="button"
            onClick={() => setFilter(x.key)}
            className={`rounded-full border-2 px-3.5 py-1.5 text-sm font-bold transition ${filter === x.key ? 'border-accent bg-accent-soft text-accent' : 'border-line text-ink-2 hover:border-accent/40'}`}
          >
            {x.label}
          </button>
        ))}
      </div>
      <p className="text-sm text-muted">
        {fresh.length} von {matching.length} noch nicht gespielt
        {matching.length > 0 && fresh.length === 0 && ' – der Stapel wird neu gemischt'}
      </p>
      <Button
        variant="primary"
        size="lg"
        icon={<Shuffle className="size-5" />}
        disabled={matching.length === 0}
        loading={pending === 'content.select'}
        onClick={() => run({ type: 'content.select', source: 'random', ...(f.kinds ? { kinds: f.kinds } : {}) })}
      >
        Zufälligen Inhalt ziehen
      </Button>
      {pool.length === 0 && (
        <p className="rounded-2xl bg-warn-soft p-3 text-sm font-semibold">Für dieses Spiel sind keine Sammlungen ausgewählt. Unter „Spiel einrichten“ Sammlungen hinzufügen.</p>
      )}
    </div>
  );
}

function ListTab({ state, compact }: { state: GameState; compact?: boolean }) {
  const { run, pending } = useCommand();
  const collections = useLibrary((s) => s.collections);
  const allItems = useLibrary((s) => s.items);
  const pool = usePool(state);
  const [q, setQ] = useState('');
  const [all, setAll] = useState(false);
  const [preview, setPreview] = useState<ContentItem | null>(null);
  const list = (all ? allItems : pool).filter((i) => {
    if (!q) return true;
    const hay = `${i.title} ${'question' in i ? i.question : ''} ${i.description}`.toLowerCase();
    return hay.includes(q.toLowerCase());
  });
  const byCollection = collections
    .map((c) => ({ c, items: list.filter((i) => i.collectionId === c.id) }))
    .filter((g) => g.items.length);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-48 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
          <input className="field pl-9" placeholder="Suchen …" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <label className="flex items-center gap-2 text-sm font-semibold text-ink-2">
          <input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} className="size-4 accent-[var(--accent)]" />
          Alle Sammlungen
        </label>
      </div>
      <div className={`scroll-thin flex flex-col gap-4 overflow-y-auto pr-1 ${compact ? 'max-h-[50dvh]' : 'max-h-[56dvh]'}`}>
        {byCollection.length === 0 && <p className="py-6 text-center text-sm text-muted">Nichts gefunden.</p>}
        {byCollection.map(({ c, items }) => (
          <div key={c.id}>
            <p className="mb-1.5 text-xs font-extrabold uppercase tracking-wide text-muted">{c.name}</p>
            <ul className="flex flex-col gap-1.5">
              {items.map((i) => {
                const played = state.playedItemIds.includes(i.id);
                const open = preview?.id === i.id;
                return (
                  <li key={i.id} className={`rounded-2xl border transition ${open ? 'border-accent bg-accent-soft/30' : 'border-line bg-surface-2'}`}>
                    <button type="button" className="flex w-full items-center gap-3 px-3 py-2.5 text-left" onClick={() => setPreview(open ? null : i)}>
                      <span className="text-xl" aria-hidden>
                        {CONTENT_KIND_INFO[i.kind].icon}
                      </span>
                      <span className={`min-w-0 flex-1 truncate font-bold ${played ? 'text-muted' : ''}`}>{i.title}</span>
                      {!i.roundUse && <Badge>Feldspiel</Badge>}
                      {played && <CheckCircle2 className="size-4 shrink-0 text-good" aria-label="schon gespielt" />}
                    </button>
                    {open && (
                      <div className="flex flex-col gap-3 border-t border-line px-3 py-3">
                        <ContentView item={i} />
                        <Button variant="primary" icon={<Play className="size-4" />} loading={pending === 'content.select'} onClick={() => run({ type: 'content.select', source: 'manual', itemId: i.id })}>
                          Diesen Inhalt starten
                        </Button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}

function AdhocTab() {
  const { run, pending } = useCommand();
  const [kind, setKind] = useState<ContentKind>('choice');
  const [title, setTitle] = useState('');
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState(['', '', '', '']);
  const [correct, setCorrect] = useState(0);
  const [answer, setAnswer] = useState('');
  const [target, setTarget] = useState('');
  const [unit, setUnit] = useState('');
  const [description, setDescription] = useState('');
  const [playerCount, setPlayerCount] = useState<(typeof PLAYER_COUNTS)[number]>('1');
  const [timer, setTimer] = useState('');

  const build = (): ContentItemInput | null => {
    const t = title.trim() || (kind === 'game' ? 'Spontanes Spiel' : 'Spontane Frage');
    const timerSec = timer ? Math.max(5, Number(timer)) : null;
    switch (kind) {
      case 'game':
        return { kind, title: t, description, playerCount, timerSec };
      case 'choice': {
        const opts = options.map((o) => o.trim()).filter(Boolean);
        if (!question.trim() || opts.length < 2) return null;
        const idx = Math.min(correct, opts.length - 1);
        return { kind, title: t, question, options: opts, correctIndex: idx, playerCount: 'all', timerSec };
      }
      case 'text':
        if (!question.trim() || !answer.trim()) return null;
        return { kind, title: t, question, answers: answer.split('/').map((a) => a.trim()).filter(Boolean), playerCount: 'all', timerSec };
      case 'estimate':
        if (!question.trim() || target === '' || !Number.isFinite(Number(target.replace(',', '.')))) return null;
        return { kind, title: t, question, target: Number(target.replace(',', '.')), unit, playerCount: 'all', timerSec };
      case 'buzzer':
        if (!question.trim()) return null;
        return { kind, title: t, question, answer, playerCount: 'all', timerSec };
    }
  };
  const input = build();

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        {(['choice', 'text', 'estimate', 'buzzer', 'game'] as ContentKind[]).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setKind(k)}
            className={`rounded-full border-2 px-3 py-1.5 text-sm font-bold ${kind === k ? 'border-accent bg-accent-soft text-accent' : 'border-line text-ink-2'}`}
          >
            {CONTENT_KIND_INFO[k].icon} {CONTENT_KIND_INFO[k].label}
          </button>
        ))}
      </div>
      <input className="field" placeholder="Titel (optional)" value={title} onChange={(e) => setTitle(e.target.value)} />
      {kind !== 'game' && <textarea className="field min-h-20" placeholder="Frage" value={question} onChange={(e) => setQuestion(e.target.value)} />}
      {kind === 'choice' && (
        <div className="grid gap-2 sm:grid-cols-2">
          {options.map((o, i) => (
            <label key={i} className={`flex items-center gap-2 rounded-2xl border-2 px-2 py-1 ${correct === i ? 'border-good bg-good-soft' : 'border-line'}`}>
              <input type="radio" name="adhoc-correct" checked={correct === i} onChange={() => setCorrect(i)} className="size-4 accent-[var(--good)]" title="Richtige Antwort" />
              <input
                className="min-w-0 flex-1 bg-transparent px-1 py-1.5 outline-none"
                placeholder={`Antwort ${String.fromCharCode(65 + i)}`}
                value={o}
                onChange={(e) => setOptions(options.map((x, j) => (j === i ? e.target.value : x)))}
              />
            </label>
          ))}
        </div>
      )}
      {kind === 'text' && <input className="field" placeholder="Richtige Antwort (Varianten mit / trennen)" value={answer} onChange={(e) => setAnswer(e.target.value)} />}
      {kind === 'buzzer' && <input className="field" placeholder="Lösung (für den Moderator)" value={answer} onChange={(e) => setAnswer(e.target.value)} />}
      {kind === 'estimate' && (
        <div className="flex gap-2">
          <input className="field" inputMode="decimal" placeholder="Richtiger Wert" value={target} onChange={(e) => setTarget(e.target.value)} />
          <input className="field max-w-32" placeholder="Einheit" value={unit} onChange={(e) => setUnit(e.target.value)} />
        </div>
      )}
      {kind === 'game' && (
        <>
          <textarea className="field min-h-20" placeholder="Regeln / Beschreibung" value={description} onChange={(e) => setDescription(e.target.value)} />
          <select className="field" value={playerCount} onChange={(e) => setPlayerCount(e.target.value as typeof playerCount)}>
            {PLAYER_COUNTS.map((p) => (
              <option key={p} value={p}>
                {PLAYER_COUNT_LABEL[p]}
              </option>
            ))}
          </select>
        </>
      )}
      <input className="field" inputMode="numeric" placeholder="Countdown in Sekunden (optional)" value={timer} onChange={(e) => setTimer(e.target.value.replace(/\D/g, ''))} />
      <Button
        variant="primary"
        size="lg"
        icon={<Play className="size-5" />}
        disabled={!input}
        loading={pending === 'content.select'}
        onClick={() => input && run({ type: 'content.select', source: 'adhoc', adhoc: input })}
      >
        Spontan starten
      </Button>
      <p className="text-xs text-muted">
        <KindBadge kind={kind} className="mr-1" /> Spontane Inhalte werden nicht in der Bibliothek gespeichert.
      </p>
    </div>
  );
}
