/** Aktives Spiel einrichten: Sammlungen, Ablaufplan, Spielfeld, Regeln. */
import { useEffect, useMemo, useState } from 'react';
import { DndContext, closestCenter, PointerSensor, TouchSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { arrayMove, SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { BookmarkPlus, GripVertical, Plus, Save, Trash2, Undo2 } from 'lucide-react';
import { CONTENT_KIND_INFO, gameConfigSchema, type GameConfig } from '@insel/shared';
import { api } from '../../lib/api.ts';
import { useAsync, useCommand } from '../../lib/hooks.ts';
import { useLibrary } from '../../lib/library.ts';
import { useLive } from '../../lib/live.ts';
import { Badge, Button, Card, EmptyState, IconButton, Segmented } from '../../ui/basics.tsx';
import { Modal } from '../../ui/overlay.tsx';
import { toast } from '../../ui/toast.tsx';
import { BoardEditor } from './BoardEditor.tsx';
import { RulesEditor } from './RulesEditor.tsx';
import { DeviceModePicker } from '../../game/DeviceModePicker.tsx';

type Tab = 'content' | 'plan' | 'board' | 'rules';

export function SetupPage() {
  const state = useLive((s) => s.state);
  const [tab, setTab] = useState<Tab>('content');
  const [draft, setDraft] = useState<GameConfig | null>(state?.config ?? null);
  const [baseline, setBaseline] = useState<GameConfig | null>(state?.config ?? null);
  const { run, pending } = useCommand();
  const tpl = useAsync();
  const [saveAs, setSaveAs] = useState(false);

  // „Ungespeichert“ heißt: Entwurf weicht von der zuletzt übernommenen Serverfassung ab
  const serverConfig = state?.config ?? null;
  const serverKey = JSON.stringify(serverConfig);
  const dirty = useMemo(() => JSON.stringify(draft) !== JSON.stringify(baseline), [draft, baseline]);
  useEffect(() => {
    // Neue Serverfassung (Speichern, Rückgängig, anderes Gerät, Spielwechsel):
    // ohne eigene Änderungen direkt übernehmen, sonst den Entwurf behalten
    setDraft((d) => (d === null || JSON.stringify(d) === JSON.stringify(baseline) ? serverConfig : d));
    setBaseline(serverConfig);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverKey, state?.id]);

  if (!state || !draft) return <EmptyState icon="🏝️" title="Kein Spiel aktiv">Lege zuerst unter „Live“ ein Spiel an.</EmptyState>;

  const save = async () => {
    const parsed = gameConfigSchema.safeParse(draft);
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? 'Ungültige Einstellungen');
      return;
    }
    await run({ type: 'config.update', config: parsed.data }, { success: 'Gespeichert' });
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Spiel einrichten</h1>
          <p className="text-sm text-muted">Änderungen gelten sofort für das laufende Spiel „{state.config.name}“.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button icon={<BookmarkPlus className="size-4" />} onClick={() => setSaveAs(true)}>
            Als Vorlage
          </Button>
          {dirty && (
            <Button variant="ghost" icon={<Undo2 className="size-4" />} onClick={() => setDraft(baseline)}>
              Verwerfen
            </Button>
          )}
          <Button variant="primary" icon={<Save className="size-4" />} disabled={!dirty} loading={pending === 'config.update'} onClick={save}>
            Speichern
          </Button>
        </div>
      </div>

      <Segmented<Tab>
        value={tab}
        onChange={setTab}
        className="self-start"
        options={[
          { value: 'content', label: 'Inhalte' },
          { value: 'plan', label: 'Ablaufplan' },
          { value: 'board', label: 'Spielfeld' },
          { value: 'rules', label: 'Regeln' },
        ]}
      />

      <Card className="p-5">
        {tab === 'content' && <CollectionsPicker config={draft} onChange={setDraft} />}
        {tab === 'plan' && <PlanEditor config={draft} onChange={setDraft} planIndex={state.planIndex} />}
        {tab === 'board' && <BoardEditor board={draft.board} onChange={(board) => setDraft({ ...draft, board })} />}
        {tab === 'rules' && (
          <div className="flex flex-col gap-5">
            <div>
              <p className="mb-2 font-bold">Handys</p>
              <DeviceModePicker value={draft.devices ?? 'personal'} onChange={(devices) => setDraft({ ...draft, devices })} />
            </div>
            <RulesEditor rules={draft.rules} onChange={(rules) => setDraft({ ...draft, rules })} />
          </div>
        )}
      </Card>

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
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted">
        Aus diesen Sammlungen werden Spiele und Fragen gezogen. Aktuell: <b>{pool.filter((i) => i.roundUse).length}</b> Runden-Inhalte, <b>{fieldGames}</b> Feld-Minispiele.
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
    <div className="flex flex-col gap-4">
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
