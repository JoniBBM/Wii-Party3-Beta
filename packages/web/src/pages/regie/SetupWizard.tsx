/**
 * Geführte Spiel-Einrichtung in Folien: Art der Einrichtung → Spieldauer → Spielfeld → Sonderfelder →
 * Was kommt dran? → Sammlungen → Handys & Sieg → Übersicht. Alles bleibt ein Entwurf, bis
 * „Übernehmen“ gedrückt wird.
 *
 * „Nach Spieldauer“: Aus der gewünschten Dauer werden Länge und Sonderfelder vorgeschlagen, das
 * Spiel-Tempo hält die Zeit danach unauffällig ein. „Manuell“: alles selbst festlegen, reine
 * Zufallswürfe ohne Spiel-Tempo.
 */
import { useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, ChevronDown, Minus, Plus, Shuffle, Sparkles, Wand2 } from 'lucide-react';
import {
  buildBoard,
  CONTENT_KIND_INFO,
  CONTENT_KINDS,
  countFields,
  estimateRange,
  FIELD_INFO,
  gameConfigSchema,
  MAX_GOAL,
  MIN_GOAL,
  MIX_FIELD_TYPES,
  MIX_LEVELS,
  newSeed,
  roundMinutesGuess,
  suggestSetup,
  THEME_INFO,
  type ContentKind,
  type FieldMix,
  type GameConfig,
  type GameState,
  type MixFieldType,
  type Rules,
  type Theme,
} from '@insel/shared';
import { useCommand } from '../../lib/hooks.ts';
import { useLibrary } from '../../lib/library.ts';
import { Badge, Button, Card, Switch } from '../../ui/basics.tsx';
import { FieldSwatch } from '../../ui/game.tsx';
import { toast } from '../../ui/toast.tsx';
import { DeviceModePicker } from '../../game/DeviceModePicker.tsx';
import { ThemePicker } from '../../game/ThemePicker.tsx';
import { BoardMap, MAP_BACKGROUND } from './BoardEditor.tsx';

type Mode = 'auto' | 'manual';
type StepKey = 'world' | 'mode' | 'duration' | 'board' | 'fields' | 'kinds' | 'content' | 'devices' | 'summary';

const STEP_LABEL: Record<StepKey, string> = {
  world: 'Welt',
  mode: 'Einrichtung',
  duration: 'Dauer',
  board: 'Spielfeld',
  fields: 'Sonderfelder',
  kinds: 'Was kommt dran?',
  content: 'Sammlungen',
  devices: 'Handys & Sieg',
  summary: 'Fertig',
};

const DURATIONS = [30, 45, 60, 75, 90, 120, 150];
const TEAM_COUNTS = [2, 3, 4, 5, 6, 8];

const KIND_TEXT: Record<ContentKind, string> = {
  game: 'Die Teams treten in einer Aufgabe gegeneinander an.',
  choice: 'Antworten A, B, C … am Handy antippen.',
  text: 'Die Antwort wird eingetippt.',
  estimate: 'Wer am nächsten dran ist, gewinnt.',
  buzzer: 'Wer zuerst drückt, darf antworten.',
};

const LANDMARKS: { key: 'vine' | 'river' | 'cave' | 'crater' | 'volcano'; icon: string; title: string; text: string }[] = [
  { key: 'vine', icon: '🌿', title: 'Liane', text: 'Mutprobe über den Bach – würfeln, wie weit man schwingt.' },
  { key: 'river', icon: '🛢️', title: 'Fässer oder Kisten', text: 'Am Wasserfall eine Seite wählen – bricht sie ein, ist der Wurf vorbei.' },
  { key: 'cave', icon: '🦇', title: 'Lavahöhle', text: 'Hoch genug würfeln, sonst geht es ins Vulkan-Innere.' },
  { key: 'crater', icon: '🕳️', title: 'Kraterloch', text: 'Kurz vor dem Gipfel hineinfallen und Augen sammeln, um herauszuklettern.' },
  { key: 'volcano', icon: '🌋', title: 'Vulkanausbruch', text: 'Der Druck steigt jede Runde – beim Ausbruch rutschen Teams am Gipfel zurück.' },
];
/** Mutproben mit den Namen der gewählten Welt (Blockwelt: Ranke, Nether) */
const landmarksFor = (theme: Theme) =>
  theme === 'blocks'
    ? LANDMARKS.map((l) => (l.key === 'vine' ? { ...l, title: 'Ranke', text: 'Mutprobe über den Bach – würfeln, wie weit man an der Ranke schwingt.' } : l.key === 'cave' ? { ...l, text: 'Hoch genug würfeln, sonst geht es in den Nether.' } : l))
    : LANDMARKS;

const WIN_RULES: { value: Rules['winRule']; icon: string; title: string; text: string }[] = [
  { value: 'final_roll', icon: '🎲', title: 'Siegeswurf auf dem Gipfel', text: 'Oben angekommen braucht es noch einen hohen Wurf – spannend bis zum Schluss.' },
  { value: 'reach', icon: '🏁', title: 'Wer oben ist, gewinnt', text: 'Das erste Team auf dem Gipfel gewinnt sofort – am schnellsten.' },
  { value: 'exact', icon: '🎯', title: 'Gipfel genau treffen', text: 'Wer zu viel würfelt, prallt zurück – am längsten.' },
];

const min = (m: number) => `${Math.max(0, Math.round(m))} Min.`;

export function SetupWizard({ state, onDone }: { state: GameState; onDone: () => void }) {
  const { run, pending } = useCommand();
  const [draft, setDraft] = useState<GameConfig>(() => structuredClone(state.config));
  const [mode, setMode] = useState<Mode>(state.config.tempoEnabled === false ? 'manual' : 'auto');
  const [minutes, setMinutes] = useState(state.config.targetMinutes ?? 60);
  const [teams, setTeams] = useState(state.teams.length >= 2 ? state.teams.length : 4);
  const [index, setIndex] = useState(0);
  const [dir, setDir] = useState<'next' | 'prev'>('next');

  const steps: StepKey[] = mode === 'auto' ? ['world', 'mode', 'duration', 'board', 'fields', 'kinds', 'content', 'devices', 'summary'] : ['world', 'mode', 'board', 'fields', 'kinds', 'content', 'devices', 'summary'];
  const step = steps[Math.min(index, steps.length - 1)]!;
  const goal = draft.board.fields.length - 1;
  const range = useMemo(() => estimateRange(draft, teams), [draft, teams]);

  const go = (to: number) => {
    setDir(to >= index ? 'next' : 'prev');
    setIndex(Math.max(0, Math.min(steps.length - 1, to)));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const setBoard = (g: number, mix: FieldMix | undefined, seed = draft.board.seed) => setDraft((d) => ({ ...d, board: buildBoard(g, seed, mix) }));
  /** Vorschlag zur Spieldauer übernehmen: Länge und Sonderfelder */
  const applySuggestion = (m: number, t: number) => {
    const s = suggestSetup(m, t, draft);
    setBoard(s.goal, s.mix);
  };

  const apply = async () => {
    const parsed = gameConfigSchema.safeParse({ ...draft, tempoEnabled: mode === 'auto', targetMinutes: mode === 'auto' ? minutes : null });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? 'Ungültige Einstellungen');
      return;
    }
    const ack = await run({ type: 'config.update', config: parsed.data }, { success: 'Spiel eingerichtet' });
    if (ack.ok) onDone();
  };

  const canNext = step !== 'kinds' || draft.contentKinds.length > 0;
  /** Passt die Einrichtung nicht mehr zur Wunschdauer (z. B. andere Siegbedingung)? → Länge anpassen */
  const fitFor = () => {
    if (mode !== 'auto' || (minutes >= range.fast * 0.95 && minutes <= range.slow * 1.05)) return null;
    const g = suggestSetup(minutes, teams, draft, draft.board.mix ?? {}).goal;
    return g === goal ? null : { goal: g, onFit: () => setBoard(g, draft.board.mix) };
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Fortschritt: bereits besuchte Schritte lassen sich direkt anspringen */}
      <ol className="flex flex-wrap items-center gap-1.5" aria-label="Schritte">
        {steps.map((k, i) => (
          <li key={k}>
            <button
              type="button"
              disabled={i > index}
              onClick={() => go(i)}
              aria-current={i === index ? 'step' : undefined}
              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold transition ${
                i === index ? 'bg-accent text-white' : i < index ? 'bg-accent-soft text-accent hover:bg-accent/20' : 'bg-bg-2 text-muted'
              }`}
            >
              {i < index ? <Check className="size-3.5" /> : <span className="tabular-nums">{i + 1}</span>}
              <span className={i === index ? '' : 'hidden sm:inline'}>{STEP_LABEL[k]}</span>
            </button>
          </li>
        ))}
      </ol>

      <Card className="overflow-hidden">
        <div key={step} className={`p-5 sm:p-6 ${dir === 'next' ? 'animate-slide-next' : 'animate-slide-prev'}`}>
          {step === 'world' && (
            <div>
              <StepTitle title="In welcher Welt wird gespielt?" sub="Nur die Optik ändert sich – Regeln und Spielfeld sind in beiden Welten gleich." />
              <ThemePicker
                large
                value={draft.theme}
                onChange={(theme) => {
                  setDraft((d) => ({ ...d, theme }));
                  go(1);
                }}
              />
            </div>
          )}
          {step === 'mode' && (
            <ModeStep
              mode={mode}
              onPick={(m) => {
                setMode(m);
                if (m === 'auto' && !state.config.targetMinutes) applySuggestion(minutes, teams);
                go(2);
              }}
            />
          )}
          {step === 'duration' && (
            <DurationStep
              minutes={minutes}
              teams={teams}
              config={draft}
              onMinutes={(m) => {
                setMinutes(m);
                applySuggestion(m, teams);
              }}
              onTeams={(t) => {
                setTeams(t);
                applySuggestion(minutes, t);
              }}
            />
          )}
          {step === 'board' && (
            <BoardStep
              mode={mode}
              config={draft}
              minutes={minutes}
              teams={teams}
              range={range}
              onGoal={(g) => setBoard(g, draft.board.mix)}
              onSuggest={() => applySuggestion(minutes, teams)}
            />
          )}
          {step === 'fields' && (
            <FieldsStep
              mode={mode}
              config={draft}
              minutes={minutes}
              teams={teams}
              range={range}
              onMix={(mix) => setBoard(goal, mix)}
              onShuffle={() => setBoard(goal, draft.board.mix, newSeed())}
              onRules={(rules) => setDraft((d) => ({ ...d, rules }))}
              onFit={() => setBoard(suggestSetup(minutes, teams, draft, draft.board.mix ?? {}).goal, draft.board.mix)}
            />
          )}
          {step === 'kinds' && <KindsStep kinds={draft.contentKinds} onChange={(contentKinds) => setDraft((d) => ({ ...d, contentKinds }))} />}
          {step === 'content' && (
            <ContentStep
              config={draft}
              rounds={(mode === 'auto' ? minutes : range.normal) / roundMinutesGuess(draft, teams)}
              onChange={(collectionIds) => setDraft((d) => ({ ...d, collectionIds }))}
            />
          )}
          {step === 'devices' && (
            <DevicesStep
              config={draft}
              onDevices={(devices) => setDraft((d) => ({ ...d, devices }))}
              onWinRule={(winRule) => setDraft((d) => ({ ...d, rules: { ...d.rules, winRule } }))}
            />
          )}
          {step === 'summary' && (
            <SummaryStep
              mode={mode}
              config={draft}
              minutes={minutes}
              teams={teams}
              range={range}
              running={state.status !== 'lobby'}
              fit={fitFor()}
              onName={(name) => setDraft((d) => ({ ...d, name }))}
              onJump={(k) => go(steps.indexOf(k))}
            />
          )}
        </div>

        {step !== 'world' && step !== 'mode' && (
          <div className="flex items-center justify-between gap-2 border-t border-line bg-bg-2/60 px-5 py-3 sm:px-6">
            <Button variant="ghost" icon={<ArrowLeft className="size-4" />} onClick={() => go(index - 1)}>
              Zurück
            </Button>
            {step === 'summary' ? (
              <Button variant="primary" size="lg" icon={<Check className="size-5" />} loading={pending === 'config.update'} onClick={apply}>
                Übernehmen
              </Button>
            ) : (
              <Button variant="primary" disabled={!canNext} onClick={() => go(index + 1)}>
                Weiter <ArrowRight className="size-4" />
              </Button>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}

function StepTitle({ title, sub }: { title: string; sub?: string }) {
  return (
    <div className="mb-5">
      <h2 className="text-xl font-extrabold sm:text-2xl">{title}</h2>
      {sub && <p className="mt-1 text-sm text-muted">{sub}</p>}
    </div>
  );
}

function ChoiceCard({ active, onClick, icon, title, text, badge }: { active: boolean; onClick: () => void; icon: string; title: string; text: string; badge?: string }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      onClick={onClick}
      className={`flex w-full items-start gap-3 rounded-2xl border-2 p-4 text-left transition ${active ? 'border-accent bg-accent-soft/40' : 'border-line hover:border-accent/40'}`}
    >
      <span className="text-3xl leading-none">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-2">
          <span className="font-extrabold">{title}</span>
          {badge && <Badge tone="accent">{badge}</Badge>}
        </span>
        <span className="mt-0.5 block text-sm text-muted">{text}</span>
      </span>
    </button>
  );
}

function ModeStep({ mode, onPick }: { mode: Mode; onPick: (m: Mode) => void }) {
  return (
    <div>
      <StepTitle title="Wie möchtest du das Spiel einrichten?" sub="Du kannst alles später unter „Alle Einstellungen“ noch feiner anpassen." />
      <div className="grid gap-3 md:grid-cols-2" role="radiogroup">
        <ChoiceCard
          active={mode === 'auto'}
          onClick={() => onPick('auto')}
          icon="⏱️"
          title="Nach Spieldauer"
          badge="Empfohlen"
          text="Du sagst, wie lange gespielt wird. Ich schlage Spielfeld und Sonderfelder vor – und das Spiel hält die Zeit unauffällig ein, fair für alle Teams."
        />
        <ChoiceCard
          active={mode === 'manual'}
          onClick={() => onPick('manual')}
          icon="🛠️"
          title="Manuell"
          text="Du legst alles selbst fest. Reine Zufallswürfe – ohne Spiel-Tempo und ohne Algorithmen, die das Spiel beeinflussen."
        />
      </div>
    </div>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-full border-2 px-3.5 py-1.5 text-sm font-bold transition ${active ? 'border-accent bg-accent-soft text-accent' : 'border-line text-ink-2 hover:border-accent/40'}`}
    >
      {children}
    </button>
  );
}

/** Große Zahl mit −/+ und direkter Eingabe */
function BigNumber({ value, onChange, min: lo, max: hi, step, unit, label }: { value: number; onChange: (v: number) => void; min: number; max: number; step: number; unit: string; label: string }) {
  const [text, setText] = useState<string | null>(null);
  const commit = (raw: string) => {
    const v = Number(raw);
    if (Number.isFinite(v) && raw !== '') onChange(Math.max(lo, Math.min(hi, Math.round(v))));
    setText(null);
  };
  return (
    <div className="flex items-center justify-center gap-3">
      <button type="button" aria-label={`${label} verringern`} className="grid size-12 shrink-0 place-items-center rounded-full border-2 border-line text-ink-2 hover:border-accent/50" onClick={() => onChange(Math.max(lo, value - step))}>
        <Minus className="size-5" />
      </button>
      <label className="flex min-w-0 items-baseline gap-2">
        <input
          aria-label={label}
          inputMode="numeric"
          className="w-28 rounded-2xl border-2 border-line bg-surface py-2 text-center text-4xl font-extrabold tabular-nums outline-none focus:border-accent sm:w-32 sm:text-5xl"
          value={text ?? String(value)}
          onChange={(e) => setText(e.target.value.replace(/\D/g, '').slice(0, 3))}
          onBlur={(e) => commit(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && commit((e.target as HTMLInputElement).value)}
        />
        <span className="text-lg font-bold text-muted">{unit}</span>
      </label>
      <button type="button" aria-label={`${label} erhöhen`} className="grid size-12 shrink-0 place-items-center rounded-full border-2 border-line text-ink-2 hover:border-accent/50" onClick={() => onChange(Math.min(hi, value + step))}>
        <Plus className="size-5" />
      </button>
    </div>
  );
}

function specialsLine(config: GameConfig): string {
  const counts = countFields(config.board);
  const parts = MIX_FIELD_TYPES.filter((t) => (counts[t] ?? 0) > 0).map((t) => `${counts[t]}× ${FIELD_INFO[t].short}`);
  return parts.length ? parts.join(' · ') : 'keine Sonderfelder';
}

function DurationStep({ minutes, teams, config, onMinutes, onTeams }: { minutes: number; teams: number; config: GameConfig; onMinutes: (m: number) => void; onTeams: (t: number) => void }) {
  const s = suggestSetup(minutes, teams, config);
  return (
    <div className="flex flex-col gap-6">
      <StepTitle title="Wie lange soll das Spiel ungefähr dauern?" sub="Grob reicht – das Spiel passt sein Tempo unterwegs unauffällig an." />
      <BigNumber value={minutes} onChange={onMinutes} min={15} max={300} step={5} unit="Min." label="Spieldauer" />
      <div className="flex flex-wrap justify-center gap-2">
        {DURATIONS.map((d) => (
          <Chip key={d} active={minutes === d} onClick={() => onMinutes(d)}>
            {d < 60 ? `${d} Min.` : d % 60 === 0 ? `${d / 60} Std.` : `${Math.floor(d / 60)}:${String(d % 60).padStart(2, '0')} Std.`}
          </Chip>
        ))}
      </div>
      <div className="flex flex-col items-center gap-2">
        <p className="text-sm font-bold text-ink-2">Mit ungefähr wie vielen Teams?</p>
        <div className="flex flex-wrap justify-center gap-2">
          {TEAM_COUNTS.map((t) => (
            <Chip key={t} active={teams === t} onClick={() => onTeams(t)}>
              {t}
            </Chip>
          ))}
        </div>
      </div>
      <div className="rounded-2xl bg-accent-soft/50 p-4 text-sm">
        <p className="flex items-center gap-2 font-extrabold text-accent">
          <Sparkles className="size-4" /> Vorschlag: {s.goal} Felder
        </p>
        <p className="mt-1 text-ink-2">{specialsLine({ ...config, board: buildBoard(s.goal, config.board.seed, s.mix) })}</p>
        {s.limit === 'min' && <p className="mt-2 font-semibold text-ink-2">Kürzer als ca. {min(s.minutes)} geht es mit dem kleinsten Spielfeld nicht – das Spiel-Tempo holt aber noch etwas heraus.</p>}
        {s.limit === 'max' && <p className="mt-2 font-semibold text-ink-2">Länger als ca. {min(s.minutes)} wird es mit dem größten Spielfeld nicht – das Spiel-Tempo streckt es noch etwas.</p>}
        <p className="mt-2 text-xs text-muted">Auf den nächsten Folien kannst du Länge und Sonderfelder anpassen.</p>
      </div>
    </div>
  );
}

function MapPreview({ config }: { config: GameConfig }) {
  return (
    <div className="overflow-hidden rounded-3xl border border-line" style={{ background: MAP_BACKGROUND }}>
      <BoardMap board={config.board} />
    </div>
  );
}

/** Wie lange dauert das Spiel so – und passt es zur Wunschdauer? */
function EstimateNote({ mode, minutes, range, fit }: { mode: Mode; minutes: number; range: { fast: number; normal: number; slow: number }; fit?: { goal: number; onFit: () => void } | null }) {
  if (mode === 'manual') {
    return (
      <p className="rounded-2xl bg-bg-2 px-4 py-3 text-sm">
        So dauert das Spiel ungefähr <b>{min(range.normal)}</b>
      </p>
    );
  }
  const fits = minutes >= range.fast * 0.95 && minutes <= range.slow * 1.05;
  return (
    <div className={`rounded-2xl px-4 py-3 text-sm ${fits ? 'bg-good-soft' : 'bg-warn-soft'}`}>
      <p>
        Bei normalem Tempo ca. <b>{min(range.normal)}</b> – mit Spiel-Tempo machbar: {min(range.fast)} bis {min(range.slow)}
      </p>
      <p className="mt-1 font-semibold">
        {fits ? `✓ Passt zu deinen ${minutes} Minuten.` : minutes < range.fast ? `${minutes} Minuten sind dafür zu knapp – weniger Felder wählen.` : `Für ${minutes} Minuten reicht das nicht – mehr Felder wählen.`}
      </p>
      {fit && !fits && (
        <button type="button" onClick={fit.onFit} className="mt-2 inline-flex items-center gap-2 rounded-full bg-surface px-3 py-1.5 text-sm font-bold text-accent shadow-soft">
          <Wand2 className="size-4" /> Länge auf {minutes} Min. anpassen: {fit.goal} Felder
        </button>
      )}
    </div>
  );
}

function BoardStep({
  mode,
  config,
  minutes,
  teams,
  range,
  onGoal,
  onSuggest,
}: {
  mode: Mode;
  config: GameConfig;
  minutes: number;
  teams: number;
  range: { fast: number; normal: number; slow: number };
  onGoal: (g: number) => void;
  onSuggest: () => void;
}) {
  const goal = config.board.fields.length - 1;
  const suggested = mode === 'auto' ? suggestSetup(minutes, teams, config).goal : null;
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="flex flex-col gap-5">
        <StepTitle title="Wie viele Felder bis zum Gipfel?" sub={`Zwischen ${MIN_GOAL} und ${MAX_GOAL} Feldern. Pro Runde kommt das führende Team etwa 5 Felder weit.`} />
        <BigNumber value={goal} onChange={onGoal} min={MIN_GOAL} max={MAX_GOAL} step={1} unit="Felder" label="Anzahl Felder" />
        <input type="range" aria-label="Anzahl Felder (Regler)" min={MIN_GOAL} max={MAX_GOAL} value={goal} onChange={(e) => onGoal(Number(e.target.value))} className="w-full accent-[var(--accent)]" />
        {suggested !== null && suggested !== goal && (
          <button type="button" onClick={onSuggest} className="inline-flex items-center gap-2 self-start rounded-full bg-accent-soft px-3 py-1.5 text-sm font-bold text-accent">
            <Wand2 className="size-4" /> Vorschlag für {minutes} Min.: {suggested} Felder
          </button>
        )}
        <EstimateNote mode={mode} minutes={minutes} range={range} />
      </div>
      <MapPreview config={config} />
    </div>
  );
}

function FieldsStep({
  mode,
  config,
  minutes,
  teams,
  range,
  onMix,
  onShuffle,
  onRules,
  onFit,
}: {
  mode: Mode;
  config: GameConfig;
  minutes: number;
  teams: number;
  range: { fast: number; normal: number; slow: number };
  onMix: (mix: FieldMix) => void;
  onShuffle: () => void;
  onRules: (r: Rules) => void;
  onFit: () => void;
}) {
  const goal = config.board.fields.length - 1;
  const mix = config.board.mix ?? {};
  const placed = countFields(config.board);
  const rules = config.rules;
  const fitGoal = mode === 'auto' ? suggestSetup(minutes, teams, config, mix).goal : goal;
  const setLevel = (t: MixFieldType, v: number) => {
    const next = { ...mix, [t]: v };
    if (v === 1) delete next[t];
    onMix(next);
  };
  const landmarkOn = (k: (typeof LANDMARKS)[number]['key']) => rules[k].enabled;
  const setLandmark = (k: (typeof LANDMARKS)[number]['key'], on: boolean) => onRules({ ...rules, [k]: { ...rules[k], enabled: on } });

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
      <div className="flex min-w-0 flex-col gap-5">
        <StepTitle title="Welche Sonderfelder – und wie oft?" sub="Die Anzahl wächst mit der Länge des Spielfelds mit." />
        <ul className="flex flex-col gap-2">
          {MIX_FIELD_TYPES.map((t) => {
            const level = mix[t] ?? 1;
            return (
              <li key={t} className={`rounded-2xl border p-3 transition ${level === 0 ? 'border-line opacity-70' : 'border-line bg-surface-2'}`}>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                  <span className="flex min-w-0 flex-1 basis-48 items-center gap-2">
                    <FieldSwatch type={t} size={18} />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline justify-between gap-2 font-bold">
                        <span>
                          {FIELD_INFO[t].icon} {FIELD_INFO[t].label}
                        </span>
                        <span className="shrink-0 text-sm font-extrabold tabular-nums text-ink-2" title="Anzahl auf diesem Spielfeld">
                          {placed[t] ?? 0}×
                        </span>
                      </span>
                      <span className="block text-xs text-muted">{FIELD_INFO[t].description}</span>
                    </span>
                  </span>
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex max-w-full flex-wrap rounded-full border border-line bg-bg-2 p-0.5" role="radiogroup" aria-label={`Häufigkeit ${FIELD_INFO[t].label}`}>
                      {MIX_LEVELS.map((l) => (
                        <button
                          key={l.value}
                          type="button"
                          role="radio"
                          aria-checked={level === l.value}
                          onClick={() => setLevel(t, l.value)}
                          className={`rounded-full px-2.5 py-1 text-xs font-bold transition ${level === l.value ? 'bg-surface text-ink shadow-soft' : 'text-muted hover:text-ink'}`}
                        >
                          {l.label}
                        </button>
                      ))}
                    </span>
                  </span>
                </div>
              </li>
            );
          })}
        </ul>

        <div>
          <p className="mb-2 text-sm font-extrabold uppercase tracking-wide text-muted">Mutproben {config.theme === 'blocks' ? 'in der Blockwelt' : 'auf der Insel'} (feste Orte)</p>
          <ul className="grid gap-2 sm:grid-cols-2">
            {landmarksFor(config.theme).map((l) => (
              <li key={l.key} className="flex items-start justify-between gap-3 rounded-2xl border border-line p-3">
                <span className="min-w-0">
                  <span className="block font-bold">
                    {l.icon} {l.title}
                  </span>
                  <span className="block text-xs text-muted">{l.text}</span>
                </span>
                <Switch checked={landmarkOn(l.key)} onChange={(v) => setLandmark(l.key, v)} />
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="flex min-w-0 flex-col gap-3 lg:sticky lg:top-20 lg:self-start">
        <MapPreview config={config} />
        <Button icon={<Shuffle className="size-4" />} onClick={onShuffle}>
          Sonderfelder neu verteilen
        </Button>
        <EstimateNote mode={mode} minutes={minutes} range={range} fit={mode === 'auto' && fitGoal !== goal ? { goal: fitGoal, onFit } : null} />
      </div>
    </div>
  );
}

function KindsStep({ kinds, onChange }: { kinds: ContentKind[]; onChange: (k: ContentKind[]) => void }) {
  const items = useLibrary((s) => s.items);
  const set = new Set(kinds);
  const toggle = (k: ContentKind) => onChange(set.has(k) ? kinds.filter((x) => x !== k) : CONTENT_KINDS.filter((x) => x === k || set.has(x)));
  return (
    <div>
      <StepTitle title="Was soll drankommen?" sub="Daraus zieht der Zufall die Runden. Im Ablaufplan und bei der Auswahl von Hand bist du trotzdem frei." />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {CONTENT_KINDS.map((k) => {
          const on = set.has(k);
          const n = items.filter((i) => i.kind === k && i.roundUse).length;
          return (
            <button
              key={k}
              type="button"
              role="checkbox"
              aria-checked={on}
              onClick={() => toggle(k)}
              className={`flex items-start gap-3 rounded-2xl border-2 p-4 text-left transition ${on ? 'border-accent bg-accent-soft/40' : 'border-line opacity-70 hover:border-accent/40 hover:opacity-100'}`}
            >
              <span className="text-3xl leading-none">{CONTENT_KIND_INFO[k].icon}</span>
              <span className="min-w-0 flex-1">
                <span className="block font-extrabold">{k === 'game' ? 'Spiele & Aktionen' : CONTENT_KIND_INFO[k].label}</span>
                <span className="block text-sm text-muted">{KIND_TEXT[k]}</span>
                <span className="mt-1 block text-xs font-bold text-ink-2">{n} in der Bibliothek</span>
              </span>
              <span className={`mt-1 grid size-5 shrink-0 place-items-center rounded-md border-2 ${on ? 'border-accent bg-accent text-white' : 'border-line'}`}>{on && <Check className="size-3.5" />}</span>
            </button>
          );
        })}
      </div>
      {kinds.length === 0 && <p className="mt-3 text-sm font-semibold text-bad">Mindestens eine Art auswählen.</p>}
      <p className="mt-4 text-xs text-muted">🎮 Feld-Minispiele kommen über die Minispiel-Felder auf dem Spielfeld – unabhängig von dieser Auswahl.</p>
    </div>
  );
}

function ContentStep({ config, rounds, onChange }: { config: GameConfig; rounds: number; onChange: (ids: string[]) => void }) {
  const collections = useLibrary((s) => s.collections);
  const items = useLibrary((s) => s.items);
  const [open, setOpen] = useState<string | null>(null);
  const selected = new Set(config.collectionIds);
  const kinds = new Set(config.contentKinds);
  const usable = (collectionId: string) => items.filter((i) => i.collectionId === collectionId && i.roundUse && kinds.has(i.kind));
  const pool = items.filter((i) => selected.has(i.collectionId));
  const roundItems = pool.filter((i) => i.roundUse && kinds.has(i.kind)).length;
  const fieldGames = pool.filter((i) => i.fieldModes.length).length;
  const needsFieldGames = config.board.fields.includes('minigame');
  const toggle = (id: string) => onChange(selected.has(id) ? config.collectionIds.filter((x) => x !== id) : [...config.collectionIds, id]);
  const need = Math.ceil(rounds);

  return (
    <div className="flex flex-col gap-4">
      <StepTitle title="Aus welchen Sammlungen?" sub="Fragen und Spiele kommen aus diesen Sammlungen – passend zu deiner Auswahl." />
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="soft" onClick={() => onChange(collections.filter((c) => usable(c.id).length || items.some((i) => i.collectionId === c.id && i.fieldModes.length)).map((c) => c.id))}>
          Alle passenden
        </Button>
        <Button size="sm" variant="ghost" onClick={() => onChange([])}>
          Keine
        </Button>
      </div>
      <ul className="grid items-start gap-2 md:grid-cols-2">
        {collections.map((c) => {
          const on = selected.has(c.id);
          const fit = usable(c.id);
          const fg = items.filter((i) => i.collectionId === c.id && i.fieldModes.length).length;
          const expanded = open === c.id;
          return (
            <li key={c.id} className={`rounded-2xl border-2 transition ${on ? 'border-accent bg-accent-soft/30' : 'border-line'}`}>
              <div className="flex items-start gap-3 p-3">
                <button type="button" role="checkbox" aria-checked={on} onClick={() => toggle(c.id)} className="flex min-w-0 flex-1 items-start gap-3 text-left">
                  <span className={`mt-0.5 grid size-5 shrink-0 place-items-center rounded-md border-2 ${on ? 'border-accent bg-accent text-white' : 'border-line'}`}>{on && <Check className="size-3.5" />}</span>
                  <span className="min-w-0">
                    <span className="block font-bold [overflow-wrap:anywhere]">{c.name}</span>
                    <span className="block text-xs text-muted">
                      {fit.length} passende Inhalte{fg ? ` · ${fg} Feld-Minispiele` : ''}
                    </span>
                  </span>
                </button>
                {fit.length > 0 && (
                  <button type="button" aria-expanded={expanded} aria-label={`Inhalte von ${c.name} ansehen`} onClick={() => setOpen(expanded ? null : c.id)} className="grid size-8 shrink-0 place-items-center rounded-full text-muted hover:bg-bg-2">
                    <ChevronDown className={`size-4 transition ${expanded ? 'rotate-180' : ''}`} />
                  </button>
                )}
              </div>
              {expanded && (
                <ul className="scroll-thin max-h-56 overflow-y-auto border-t border-line px-3 py-2 text-sm">
                  {fit.map((i) => (
                    <li key={i.id} className="flex items-center gap-2 py-0.5">
                      <span aria-hidden>{CONTENT_KIND_INFO[i.kind].icon}</span>
                      <span className="min-w-0 truncate">{i.title}</span>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
      <div className={`rounded-2xl px-4 py-3 text-sm ${roundItems >= need ? 'bg-good-soft' : 'bg-warn-soft'}`}>
        <p>
          <b>{roundItems}</b> passende Runden-Inhalte für ca. <b>{need}</b> Runden
          {roundItems >= need ? ' – reicht.' : roundItems === 0 ? ' – bitte Sammlungen auswählen.' : ' – manche kommen dann doppelt dran.'}
        </p>
        {needsFieldGames && fieldGames === 0 && <p className="mt-1 font-semibold">Keine Feld-Minispiele dabei – auf Minispiel-Feldern musst du dann selbst etwas ansagen.</p>}
      </div>
    </div>
  );
}

function DevicesStep({ config, onDevices, onWinRule }: { config: GameConfig; onDevices: (d: GameConfig['devices']) => void; onWinRule: (w: Rules['winRule']) => void }) {
  return (
    <div className="grid gap-8 lg:grid-cols-2">
      <div>
        <StepTitle title="Wie spielen die Teams mit?" />
        <DeviceModePicker value={config.devices} onChange={onDevices} />
      </div>
      <div>
        <StepTitle title="Wann ist das Spiel gewonnen?" />
        <div className="grid gap-2" role="radiogroup">
          {WIN_RULES.map((w) => (
            <ChoiceCard key={w.value} active={config.rules.winRule === w.value} onClick={() => onWinRule(w.value)} icon={w.icon} title={w.title} text={w.text} />
          ))}
        </div>
      </div>
    </div>
  );
}

function SummaryStep({
  mode,
  config,
  minutes,
  teams,
  range,
  running,
  fit,
  onName,
  onJump,
}: {
  mode: Mode;
  config: GameConfig;
  minutes: number;
  teams: number;
  range: { fast: number; normal: number; slow: number };
  running: boolean;
  fit: { goal: number; onFit: () => void } | null;
  onName: (n: string) => void;
  onJump: (k: StepKey) => void;
}) {
  const collections = useLibrary((s) => s.collections);
  const goal = config.board.fields.length - 1;
  const names = collections.filter((c) => config.collectionIds.includes(c.id)).map((c) => c.name);
  const rows: { key: StepKey; label: string; value: string }[] = [
    { key: 'world', label: 'Welt', value: THEME_INFO[config.theme].label },
    { key: 'mode', label: 'Einrichtung', value: mode === 'auto' ? 'Nach Spieldauer (mit Spiel-Tempo)' : 'Manuell (reine Zufallswürfe)' },
    ...(mode === 'auto' ? [{ key: 'duration' as const, label: 'Spieldauer', value: `ca. ${minutes} Minuten · ${teams} Teams` }] : []),
    { key: 'board', label: 'Spielfeld', value: `${goal} Felder · ca. ${min(range.normal)} bei normalem Tempo` },
    {
      key: 'fields',
      label: 'Sonderfelder',
      value: `${specialsLine(config)}${LANDMARKS.some((l) => !config.rules[l.key].enabled) ? ` · aus: ${LANDMARKS.filter((l) => !config.rules[l.key].enabled).map((l) => landmarksFor(config.theme).find((x) => x.key === l.key)!.title).join(', ')}` : ''}`,
    },
    { key: 'kinds', label: 'Was kommt dran?', value: config.contentKinds.length === CONTENT_KINDS.length ? 'Alles' : config.contentKinds.map((k) => CONTENT_KIND_INFO[k].label).join(', ') },
    { key: 'content', label: 'Sammlungen', value: names.length ? names.join(', ') : 'keine' },
    { key: 'devices', label: 'Handys & Sieg', value: `${config.devices === 'shared' ? 'Gruppen teilen ein Gerät' : 'Eigenes Handy'} · ${WIN_RULES.find((w) => w.value === config.rules.winRule)?.title ?? ''}` },
  ];
  return (
    <div className="flex flex-col gap-5">
      <StepTitle title="Alles bereit?" sub="Prüfe die Übersicht – mit „Übernehmen“ gilt die Einrichtung sofort." />
      <label className="block max-w-md">
        <span className="label">Name des Spiels</span>
        <input className="field" value={config.name} maxLength={80} onChange={(e) => onName(e.target.value)} />
      </label>
      <dl className="divide-y divide-line rounded-2xl border border-line">
        {rows.map((r) => (
          <div key={r.key} className="flex flex-wrap items-start gap-x-4 gap-y-1 px-4 py-3">
            <dt className="w-36 shrink-0 text-sm font-bold text-muted">{r.label}</dt>
            <dd className="min-w-0 flex-1 text-sm font-semibold [overflow-wrap:anywhere]">{r.value}</dd>
            <button type="button" className="text-sm font-bold text-accent" onClick={() => onJump(r.key)}>
              Ändern
            </button>
          </div>
        ))}
      </dl>
      <EstimateNote mode={mode} minutes={minutes} range={range} fit={fit} />
      {running && <p className="rounded-2xl bg-warn-soft px-4 py-3 text-sm font-semibold">Das Spiel läuft schon: Ein geändertes Spielfeld gilt sofort, Teams hinter dem neuen Ziel rücken auf den Gipfel.</p>}
      <p className="text-xs text-muted">Feinheiten wie Bonuswürfel, Katapult-Weiten oder der Ablaufplan stehen unter „Alle Einstellungen“.</p>
    </div>
  );
}
