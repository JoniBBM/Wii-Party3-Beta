/**
 * Aktives Spiel einrichten: geführt in Folien (SetupWizard) oder alle Einstellungen, gegliedert in
 * Bereiche (Seitenleiste, siehe GAME_SECTIONS). Spiel-Einstellungen gelten erst nach „Speichern“
 * (Leiste unten); Wetter & Stimmung und Spieldauer wirken sofort.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { DndContext, closestCenter, PointerSensor, TouchSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { arrayMove, SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useNavigate } from 'react-router';
import { ArrowLeft, ArrowRight, BookmarkPlus, GripVertical, Plus, Save, SlidersHorizontal, Trash2, Undo2, Wand2 } from 'lucide-react';
import { CONTENT_KIND_INFO, CONTENT_KINDS, gameConfigSchema, THEME_INFO, type ContentKind, type GameConfig, type GameState } from '@insel/shared';
import { api } from '../../lib/api.ts';
import { useAsync, useCommand } from '../../lib/hooks.ts';
import { useLibrary } from '../../lib/library.ts';
import { useLive } from '../../lib/live.ts';
import { GAME_SECTIONS, sectionTitle, useSettingFocus, type GameSection } from '../../lib/settingsIndex.ts';
import { Badge, Button, Card, EmptyState, IconButton, Segmented } from '../../ui/basics.tsx';
import { Modal } from '../../ui/overlay.tsx';
import { toast } from '../../ui/toast.tsx';
import { BoardEditor } from './BoardEditor.tsx';
import { AnswerRules, DareRules, DiceRules, FieldRules, VolcanoRules } from './RulesEditor.tsx';
import { DeviceModePicker } from '../../game/DeviceModePicker.tsx';
import { SetupWizard } from './SetupWizard.tsx';
import { ThemePicker } from '../../game/ThemePicker.tsx';
import { AtmosphereCard } from '../../game/AtmosphereControl.tsx';
import { TempoPanel } from '../../game/TempoPanel.tsx';

type View = 'guided' | 'all';

/** Welche Teile der Einstellungen zu welchem Bereich gehören (für „ungespeichert in …“) */
const SECTION_PARTS: Record<GameSection, (c: GameConfig) => unknown> = {
  allgemein: (c) => [c.name, c.devices],
  welt: (c) => c.theme,
  dauer: () => null,
  inhalte: (c) => [c.contentKinds, c.collectionIds],
  ablauf: (c) => c.plan,
  spielfeld: (c) => c.board,
  sieg: ({ rules: r }) => [r.bonusDice, r.winRule, r.finalRollMin],
  felder: ({ rules: r }) => [r.catapultForward, r.catapultBackward, r.swapMinDistance, r.barrier, r.barrierMaxAttempts, r.fieldGame],
  mutproben: ({ rules: r }) => [r.vine, r.river, r.cave, r.crater],
  vulkan: ({ rules: r }) => [r.volcano, r.inside],
  fragen: ({ rules: r }) => [r.bonusOnlyForCorrect, r.autoCloseWhenAllAnswered],
};
const changedSections = (a: GameConfig | null, b: GameConfig | null): GameSection[] =>
  a && b ? GAME_SECTIONS.map((s) => s.id).filter((id) => JSON.stringify(SECTION_PARTS[id](a)) !== JSON.stringify(SECTION_PARTS[id](b))) : [];

export function SetupPage() {
  const state = useLive((s) => s.state);
  const navigate = useNavigate();
  // vor dem Spiel geführt, danach direkt alle Einstellungen
  const [view, setView] = useState<View>(state?.status === 'lobby' ? 'guided' : 'all');
  const [section, setSection] = useState<GameSection>('allgemein');
  // anderes Spiel gewählt (z. B. gerade neu angelegt) → passende Ansicht
  const shownId = useRef(state?.id);
  useEffect(() => {
    if (!state || state.id === shownId.current) return;
    shownId.current = state.id;
    setView(state.status === 'lobby' ? 'guided' : 'all');
    setSection('allgemein');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state?.id]);
  // Sprung aus der Suche: alle Einstellungen, passender Bereich
  useSettingFocus((e) => {
    if (e.area !== 'game') return;
    setView('all');
    setSection(e.section as GameSection);
  });
  const [draft, setDraft] = useState<GameConfig | null>(state?.config ?? null);
  const [baseline, setBaseline] = useState<GameConfig | null>(state?.config ?? null);
  const { run, pending } = useCommand();
  const tpl = useAsync();
  const [saveAs, setSaveAs] = useState(false);

  // „Ungespeichert“ heißt: Entwurf weicht von der zuletzt übernommenen Serverfassung ab
  const serverConfig = state?.config ?? null;
  const serverKey = JSON.stringify(serverConfig);
  const changed = useMemo(() => changedSections(draft, baseline), [draft, baseline]);
  const dirty = changed.length > 0;
  useEffect(() => {
    // Neue Serverfassung (Speichern, Rückgängig, anderes Gerät, Spielwechsel):
    // ohne eigene Änderungen direkt übernehmen, sonst den Entwurf behalten
    setDraft((d) => (d === null || changedSections(d, baseline).length === 0 ? serverConfig : d));
    setBaseline(serverConfig);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverKey, state?.id]);

  if (!state || !draft) return <EmptyState icon="🏝️" title="Kein Spiel aktiv">Lege zuerst unter „Spiele“ ein neues Spiel an.</EmptyState>;

  const save = async () => {
    // Spieldauer und Tempo stellt die Regie sofort ein – die aktuelle Serverfassung behalten
    const parsed = gameConfigSchema.safeParse({ ...draft, targetMinutes: state.config.targetMinutes, tempoEnabled: state.config.tempoEnabled });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? 'Ungültige Einstellungen');
      return;
    }
    await run({ type: 'config.update', config: parsed.data }, { success: 'Gespeichert' });
  };

  const switcher = (
    <Segmented<View>
      value={view}
      onChange={setView}
      options={[
        { value: 'guided', label: <span className="inline-flex items-center gap-1.5"><Wand2 className="size-4" />Geführt</span> },
        { value: 'all', label: <span className="inline-flex items-center gap-1.5"><SlidersHorizontal className="size-4" />Alle Einstellungen</span> },
      ]}
    />
  );

  if (view === 'guided') {
    return (
      <div className="flex flex-col gap-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">Spiel einrichten</h1>
            <p className="text-sm text-muted">Schritt für Schritt für „{state.config.name}“ – erst „Übernehmen“ ändert etwas.</p>
          </div>
          {switcher}
        </div>
        <SetupWizard key={state.id} state={state} onDone={() => navigate('/regie')} />
      </div>
    );
  }

  const theme = draft.theme ?? 'island';
  const index = GAME_SECTIONS.findIndex((s) => s.id === section);
  const sec = GAME_SECTIONS[index]!;
  const prev = GAME_SECTIONS[index - 1];
  const next = GAME_SECTIONS[index + 1];
  const go = (id: GameSection) => {
    setSection(id);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const rulesProps = { rules: draft.rules, onChange: (rules: GameConfig['rules']) => setDraft({ ...draft, rules }), theme };

  return (
    <div className={`flex flex-col gap-5 ${dirty ? 'pb-24' : ''}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Spiel einrichten</h1>
          <p className="text-sm text-muted">Alle Einstellungen von „{state.config.name}“ · Änderungen gelten nach dem Speichern.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span data-setting="g.template" className="rounded-2xl">
            <Button icon={<BookmarkPlus className="size-4" />} onClick={() => setSaveAs(true)}>
              Als Vorlage
            </Button>
          </span>
          {switcher}
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[230px_minmax(0,1fr)]">
        <SectionNav section={section} changed={changed} theme={theme} onPick={go} />

        <div className="flex min-w-0 flex-col gap-4">
          <div className="flex items-start gap-3">
            <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-accent-soft text-2xl">{sec.icon}</span>
            <div className="min-w-0">
              <h2 className="text-xl font-semibold">{sectionTitle(sec, theme)}</h2>
              <p className="text-sm text-muted">{sec.sub}</p>
            </div>
          </div>

          {section === 'allgemein' && (
            <Card className="flex flex-col gap-5 p-5">
              <label data-setting="g.name" className="block rounded-2xl">
                <span className="label">Name des Spiels</span>
                <input className="field" value={draft.name} maxLength={80} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
              </label>
              <div data-setting="g.devices" className="rounded-2xl">
                <p className="label">Handys</p>
                <DeviceModePicker value={draft.devices ?? 'personal'} onChange={(devices) => setDraft({ ...draft, devices })} />
              </div>
            </Card>
          )}
          {section === 'welt' && (
            <>
              <Card className="p-5">
                <div data-setting="g.world" className="rounded-2xl">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <p className="font-bold">Welt dieses Spiels</p>
                    <Badge tone="accent">gilt nach dem Speichern</Badge>
                  </div>
                  <ThemePicker large value={theme} onChange={(t) => setDraft({ ...draft, theme: t })} />
                  <p className="mt-3 text-sm text-muted">
                    {draft.theme !== state.config.theme
                      ? `Nach dem Speichern wechseln Beamer, Handys, Figuren, Musik und Kommentator in die Welt „${THEME_INFO[theme].label}“.`
                      : 'Nur die Optik ändert sich: Beamer, Handys, Figuren, Musik und Kommentator. Regeln und Spielfeld sind in beiden Welten gleich.'}
                  </p>
                </div>
              </Card>
              <AtmosphereCard />
            </>
          )}
          {section === 'dauer' && <DurationSection state={state} />}
          {section === 'inhalte' && (
            <Card className="p-5">
              <CollectionsPicker config={draft} onChange={setDraft} />
            </Card>
          )}
          {section === 'ablauf' && (
            <Card className="p-5">
              <PlanEditor config={draft} onChange={setDraft} planIndex={state.planIndex} />
            </Card>
          )}
          {section === 'spielfeld' && (
            <Card className="p-5">
              <BoardEditor board={draft.board} onChange={(board) => setDraft({ ...draft, board })} />
            </Card>
          )}
          {section === 'sieg' && (
            <Card className="px-5 py-1">
              <DiceRules {...rulesProps} />
            </Card>
          )}
          {section === 'felder' && (
            <Card className="px-5 py-1">
              <FieldRules {...rulesProps} />
            </Card>
          )}
          {section === 'mutproben' && (
            <Card className="px-5 py-1">
              <DareRules {...rulesProps} />
            </Card>
          )}
          {section === 'vulkan' && (
            <Card className="px-5 py-1">
              <VolcanoRules {...rulesProps} />
            </Card>
          )}
          {section === 'fragen' && (
            <Card className="px-5 py-1">
              <AnswerRules {...rulesProps} />
            </Card>
          )}

          {/* Weiterblättern wie in einem Buch */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            {prev ? (
              <Button variant="ghost" icon={<ArrowLeft className="size-4" />} onClick={() => go(prev.id)}>
                {sectionTitle(prev, theme)}
              </Button>
            ) : (
              <span />
            )}
            {next && (
              <Button variant="soft" onClick={() => go(next.id)}>
                {sectionTitle(next, theme)} <ArrowRight className="size-4" />
              </Button>
            )}
          </div>
        </div>
      </div>

      {dirty && (
        <div className="fixed inset-x-0 bottom-[calc(4.25rem+env(safe-area-inset-bottom))] z-20 px-3 lg:bottom-4 lg:left-60 lg:px-6">
          <div className="mx-auto flex max-w-3xl flex-wrap items-center gap-2 rounded-3xl border border-line bg-surface/95 px-4 py-3 shadow-lifted backdrop-blur">
            <p className="w-full min-w-0 truncate text-sm sm:w-auto sm:flex-1">
              <b>Ungespeichert</b>
              <span className="text-muted"> · {changed.map((id) => sectionTitle(GAME_SECTIONS.find((s) => s.id === id)!, theme)).join(', ')}</span>
            </p>
            <div className="ml-auto flex gap-2">
              <Button variant="ghost" icon={<Undo2 className="size-4" />} onClick={() => setDraft(baseline)}>
                Verwerfen
              </Button>
              <Button variant="primary" icon={<Save className="size-4" />} loading={pending === 'config.update'} onClick={save}>
                Speichern
              </Button>
            </div>
          </div>
        </div>
      )}

      <SaveTemplateModal
        open={saveAs}
        onClose={() => setSaveAs(false)}
        busy={tpl.busy}
        defaultName={draft.name}
        onSave={async (name, description) => {
          const r = await tpl.run(() => api('/api/templates', { slot: 'admin', body: { name, description, config: { ...draft, name } } }), 'Vorlage gespeichert');
          if (r) setSaveAs(false);
        }}
      />
    </div>
  );
}

/** Bereiche: am Rand als Liste nach Gruppen, auf schmalen Bildschirmen als waagerechte Chips */
function SectionNav({ section, changed, theme, onPick }: { section: GameSection; changed: GameSection[]; theme: GameConfig['theme']; onPick: (id: GameSection) => void }) {
  const groups = [...new Set(GAME_SECTIONS.map((s) => s.group))];
  // schmale Leiste: gewählten Bereich mittig ins Bild rollen (auch nach einem Sprung aus der Suche)
  const strip = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = strip.current?.querySelector<HTMLElement>('[aria-current="page"]');
    if (strip.current && el) strip.current.scrollTo({ left: el.offsetLeft - (strip.current.clientWidth - el.offsetWidth) / 2, behavior: 'smooth' });
  }, [section]);
  const item = (s: (typeof GAME_SECTIONS)[number], compact: boolean) => {
    const on = s.id === section;
    const dot = changed.includes(s.id) && <span className="size-2 shrink-0 rounded-full bg-warn" title="ungespeicherte Änderungen" />;
    return (
      <button
        key={s.id}
        type="button"
        aria-current={on ? 'page' : undefined}
        onClick={() => onPick(s.id)}
        className={
          compact
            ? `inline-flex shrink-0 items-center gap-1.5 rounded-full border-2 px-3 py-1.5 text-sm font-bold whitespace-nowrap transition ${on ? 'border-accent bg-accent-soft text-accent' : 'border-line text-ink-2'}`
            : `flex w-full items-center gap-2.5 rounded-2xl px-3 py-2 text-left text-sm font-bold transition ${on ? 'bg-accent-soft text-accent' : 'text-ink-2 hover:bg-bg-2'}`
        }
      >
        <span aria-hidden>{s.icon}</span>
        <span className={compact ? '' : 'min-w-0 flex-1 truncate'}>{sectionTitle(s, theme)}</span>
        {dot}
      </button>
    );
  };
  return (
    <>
      <nav ref={strip} aria-label="Bereiche" className="relative flex min-w-0 gap-2 overflow-x-auto pb-1 lg:hidden">
        {GAME_SECTIONS.map((s) => item(s, true))}
      </nav>
      <nav aria-label="Bereiche" className="hidden lg:block">
        <div className="sticky top-20 flex flex-col gap-4">
          {groups.map((g) => (
            <div key={g}>
              <p className="mb-1 px-3 text-xs font-extrabold tracking-wide text-muted uppercase">{g}</p>
              <div className="flex flex-col gap-0.5">{GAME_SECTIONS.filter((s) => s.group === g).map((s) => item(s, false))}</div>
            </div>
          ))}
        </div>
      </nav>
    </>
  );
}

/** Spieldauer und Tempo: wirken sofort (wie auf der Live-Seite) */
function DurationSection({ state }: { state: GameState }) {
  const shown = state.status !== 'finished' && !(state.config.tempoEnabled === false && state.status !== 'lobby');
  return (
    <div data-setting="g.duration" className="flex flex-col gap-3 rounded-3xl">
      {shown ? (
        <TempoPanel state={state} />
      ) : (
        <Card className="p-5 text-sm text-muted">
          {state.status === 'finished' ? 'Das Spiel ist beendet.' : 'Dieses Spiel wurde manuell eingerichtet (reine Zufallswürfe, ohne Spiel-Tempo). Eine Spieldauer lässt sich nur vor dem Spiel vorgeben.'}
        </Card>
      )}
      <p className="text-xs text-muted">Die Spieldauer gilt sofort. Das Spiel richtet sein Tempo unauffällig danach – die Teams merken davon nichts. Dieselbe Karte steht auch auf der Live-Seite.</p>
    </div>
  );
}

function CollectionsPicker({ config, onChange }: { config: GameConfig; onChange: (c: GameConfig) => void }) {
  const collections = useLibrary((s) => s.collections);
  const items = useLibrary((s) => s.items);
  const selected = new Set(config.collectionIds);
  const toggle = (id: string) => {
    const next = selected.has(id) ? config.collectionIds.filter((x) => x !== id) : [...config.collectionIds, id];
    onChange({ ...config, collectionIds: next });
  };
  const pool = items.filter((i) => selected.has(i.collectionId));
  const fieldGames = pool.filter((i) => i.fieldModes.length).length;
  const kinds = new Set(config.contentKinds);
  const toggleKind = (k: ContentKind) => {
    if (kinds.has(k) && kinds.size === 1) return;
    onChange({ ...config, contentKinds: CONTENT_KINDS.filter((x) => (x === k ? !kinds.has(k) : kinds.has(x))) });
  };
  return (
    <div className="flex flex-col gap-4">
      <div data-setting="g.kinds" className="rounded-2xl">
        <p className="mb-2 font-bold">Was kommt per Zufall dran?</p>
        <div className="flex flex-wrap gap-2">
          {CONTENT_KINDS.map((k) => (
            <button
              key={k}
              type="button"
              aria-pressed={kinds.has(k)}
              onClick={() => toggleKind(k)}
              className={`rounded-full border-2 px-3 py-1.5 text-sm font-bold transition ${kinds.has(k) ? 'border-accent bg-accent-soft text-accent' : 'border-line text-muted hover:border-accent/40'}`}
            >
              {CONTENT_KIND_INFO[k].icon} {CONTENT_KIND_INFO[k].label}
            </button>
          ))}
        </div>
      </div>
      <div data-setting="g.collections" className="flex flex-col gap-3 rounded-2xl">
        <p className="font-bold">Sammlungen</p>
        <p className="text-sm text-muted">
          Aus diesen Sammlungen werden Spiele und Fragen gezogen. Aktuell: <b>{pool.filter((i) => i.roundUse && kinds.has(i.kind)).length}</b> passende Runden-Inhalte, <b>{fieldGames}</b>{' '}
          Feld-Minispiele.
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          {collections.map((c) => {
            const on = selected.has(c.id);
            const its = items.filter((i) => i.collectionId === c.id);
            const kinds = [...new Set(its.map((i) => CONTENT_KIND_INFO[i.kind].icon))].join(' ');
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => toggle(c.id)}
                className={`flex items-start gap-3 rounded-2xl border-2 p-3 text-left transition ${on ? 'border-accent bg-accent-soft/40' : 'border-line hover:border-accent/40'}`}
              >
                <input type="checkbox" readOnly checked={on} className="mt-1 size-4 accent-[var(--accent)]" tabIndex={-1} />
                <span className="min-w-0 flex-1">
                  <span className="block font-bold">{c.name}</span>
                  <span className="block text-xs text-muted">
                    {its.length} Inhalte {kinds}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function PlanEditor({ config, onChange, planIndex }: { config: GameConfig; onChange: (c: GameConfig) => void; planIndex: number }) {
  const items = useLibrary((s) => s.items);
  const [adding, setAdding] = useState(false);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }), useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 6 } }));
  // Einträge brauchen eindeutige Schlüssel (ein Inhalt kann mehrfach vorkommen)
  const entries = config.plan.map((id, i) => ({ key: `${i}:${id}`, id }));
  const onDragEnd = (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return;
    const from = entries.findIndex((x) => x.key === e.active.id);
    const to = entries.findIndex((x) => x.key === e.over!.id);
    onChange({ ...config, plan: arrayMove(config.plan, from, to) });
  };
  const ids = new Set(config.collectionIds);
  const pool = items.filter((i) => ids.has(i.collectionId) && i.roundUse);
  return (
    <div data-setting="g.plan" className="flex flex-col gap-4 rounded-2xl">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted">Optionaler fester Ablauf. In der Live-Ansicht startet „Plan“ immer den nächsten Punkt. Bereits gespielt: {planIndex}.</p>
        <Button size="sm" variant="primary" icon={<Plus className="size-4" />} onClick={() => setAdding(true)}>
          Hinzufügen
        </Button>
      </div>
      {entries.length === 0 ? (
        <EmptyState icon="📋" title="Kein Ablaufplan">Ohne Plan wählst du live per Zufall oder aus der Liste.</EmptyState>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={entries.map((e) => e.key)} strategy={verticalListSortingStrategy}>
            <ol className="flex flex-col gap-1.5">
              {entries.map((e, i) => (
                <PlanRow
                  key={e.key}
                  id={e.key}
                  index={i}
                  done={i < planIndex}
                  title={items.find((x) => x.id === e.id)?.title ?? '(gelöscht)'}
                  icon={CONTENT_KIND_INFO[items.find((x) => x.id === e.id)?.kind ?? 'game'].icon}
                  onRemove={() => onChange({ ...config, plan: config.plan.filter((_, j) => j !== i) })}
                />
              ))}
            </ol>
          </SortableContext>
        </DndContext>
      )}
      <Modal open={adding} onClose={() => setAdding(false)} title="Zum Ablaufplan hinzufügen" size="lg">
        <ul className="flex flex-col gap-1">
          {pool.map((i) => {
            const count = config.plan.filter((x) => x === i.id).length;
            return (
              <li key={i.id}>
                <button type="button" onClick={() => onChange({ ...config, plan: [...config.plan, i.id] })} className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left hover:bg-bg-2">
                  <span className="text-lg">{CONTENT_KIND_INFO[i.kind].icon}</span>
                  <span className="flex-1 font-semibold">{i.title}</span>
                  {count > 0 && <Badge tone="accent">{count}× im Plan</Badge>}
                  <Plus className="size-4 text-accent" />
                </button>
              </li>
            );
          })}
        </ul>
      </Modal>
    </div>
  );
}

function PlanRow({ id, index, title, icon, done, onRemove }: { id: string; index: number; title: string; icon: string; done: boolean; onRemove: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`flex items-center gap-2 rounded-2xl border border-line bg-surface px-2 py-1.5 ${isDragging ? 'z-10 shadow-lifted' : ''} ${done ? 'opacity-50' : ''}`}
    >
      <button type="button" className="cursor-grab touch-none p-1.5 text-muted" aria-label="Verschieben" {...attributes} {...listeners}>
        <GripVertical className="size-4" />
      </button>
      <span className="w-7 text-right text-sm font-bold tabular-nums text-muted">{index + 1}.</span>
      <span>{icon}</span>
      <span className="min-w-0 flex-1 truncate font-semibold">{title}</span>
      {done && <Badge tone="good">gespielt</Badge>}
      <IconButton label="Entfernen" className="size-8" onClick={onRemove}>
        <Trash2 className="size-4" />
      </IconButton>
    </li>
  );
}

function SaveTemplateModal({ open, onClose, onSave, busy, defaultName }: { open: boolean; onClose: () => void; onSave: (n: string, d: string) => void; busy: boolean; defaultName: string }) {
  const [name, setName] = useState(defaultName);
  const [desc, setDesc] = useState('');
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Als Vorlage speichern"
      size="sm"
      footer={
        <Button variant="primary" loading={busy} disabled={!name.trim()} onClick={() => onSave(name.trim(), desc)}>
          Speichern
        </Button>
      }
    >
      <div className="flex flex-col gap-3">
        <p className="text-sm text-muted">Speichert Sammlungen, Ablaufplan, Spielfeld und Regeln (ohne Teams) zum Wiederverwenden.</p>
        <input className="field" value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" />
        <input className="field" value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Beschreibung (optional)" />
      </div>
    </Modal>
  );
}
