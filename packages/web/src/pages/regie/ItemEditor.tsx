/** Inhalt anlegen/bearbeiten – Formular je nach Art (Spiel, Auswahl, Freitext, Schätzen, Buzzer). */
import { useState } from 'react';
import { Mic, Plus, Trash2, Volume2 } from 'lucide-react';
import {
  CONTENT_KIND_INFO,
  CONTENT_KINDS,
  contentItemInputSchema,
  FIELD_GAME_MODE_LABEL,
  FIELD_GAME_MODES,
  PLAYER_COUNT_LABEL,
  PLAYER_COUNTS,
  type ContentItem,
  type ContentItemInput,
  type ContentKind,
  type FieldGameMode,
  type PlayerCount,
  spokenText,
} from '@insel/shared';
import { Button, Field, IconButton, Switch } from '../../ui/basics.tsx';
import { Modal } from '../../ui/overlay.tsx';

interface Draft {
  kind: ContentKind;
  title: string;
  description: string;
  materials: string;
  notes: string;
  playerCount: PlayerCount;
  timerSec: string;
  roundUse: boolean;
  fieldModes: FieldGameMode[];
  /** „Audio erstellen“ (bzw. Aufnahme behalten) */
  audio: boolean;
  question: string;
  options: string[];
  correctIndex: number;
  answers: string[];
  target: string;
  unit: string;
  answer: string;
}

function toDraft(item?: ContentItem | null, kind: ContentKind = 'choice'): Draft {
  const base: Draft = {
    kind: item?.kind ?? kind,
    title: item?.title ?? '',
    description: item?.description ?? '',
    materials: item?.materials ?? '',
    notes: item?.notes ?? '',
    playerCount: item?.playerCount ?? (kind === 'game' ? '1' : 'all'),
    timerSec: item?.timerSec ? String(item.timerSec) : '',
    roundUse: item?.roundUse ?? true,
    fieldModes: item?.fieldModes ?? [],
    audio: !!(item?.audioRequest || item?.audioUrl),
    question: '',
    options: ['', '', '', ''],
    correctIndex: 0,
    answers: [''],
    target: '',
    unit: '',
    answer: '',
  };
  if (!item) return base;
  switch (item.kind) {
    case 'choice':
      return { ...base, question: item.question, options: [...item.options], correctIndex: item.correctIndex };
    case 'text':
      return { ...base, question: item.question, answers: [...item.answers] };
    case 'estimate':
      return { ...base, question: item.question, target: String(item.target), unit: item.unit };
    case 'buzzer':
      return { ...base, question: item.question, answer: item.answer };
    default:
      return base;
  }
}

function fromDraft(d: Draft): ContentItemInput {
  const common = {
    title: d.title.trim(),
    description: d.description,
    materials: d.materials,
    notes: d.notes,
    playerCount: d.playerCount,
    timerSec: d.timerSec ? Number(d.timerSec) : null,
    roundUse: d.roundUse,
    fieldModes: d.fieldModes,
    audioRequest: d.kind !== 'game' && d.audio,
  };
  switch (d.kind) {
    case 'game':
      return { kind: 'game', ...common };
    case 'choice': {
      const filled = d.options.map((o, i) => ({ o: o.trim(), i })).filter((x) => x.o);
      // -1 → Schema meldet „richtige Antwort fehlt“ statt still Antwort A zu nehmen
      const idx = filled.findIndex((x) => x.i === d.correctIndex);
      return { kind: 'choice', ...common, question: d.question, options: filled.map((x) => x.o), correctIndex: idx };
    }
    case 'text':
      return { kind: 'text', ...common, question: d.question, answers: d.answers.map((a) => a.trim()).filter(Boolean) };
    case 'estimate':
      return { kind: 'estimate', ...common, question: d.question, target: Number(d.target.replace(',', '.')), unit: d.unit };
    case 'buzzer':
      return { kind: 'buzzer', ...common, question: d.question, answer: d.answer };
  }
}

export function ItemEditor({
  open,
  item,
  defaultKind,
  onClose,
  onSave,
  busy,
}: {
  open: boolean;
  item: ContentItem | null;
  defaultKind?: ContentKind;
  onClose: () => void;
  onSave: (input: ContentItemInput) => void;
  busy?: boolean;
}) {
  const [d, setD] = useState<Draft>(() => toDraft(item, defaultKind));
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((x) => ({ ...x, [k]: v }));
  const isQ = d.kind !== 'game';

  const submit = () => {
    const parsed = contentItemInputSchema.safeParse(fromDraft(d));
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Bitte Eingaben prüfen');
      return;
    }
    setError(null);
    onSave(parsed.data);
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={item ? 'Inhalt bearbeiten' : 'Neuer Inhalt'}
      size="lg"
      footer={
        <>
          {error && <p className="mr-auto self-center text-sm font-bold text-bad">{error}</p>}
          <Button variant="ghost" onClick={onClose}>
            Abbrechen
          </Button>
          <Button variant="primary" loading={busy} onClick={submit}>
            Speichern
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {!item && (
          <div className="flex flex-wrap gap-2">
            {CONTENT_KINDS.map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setD((x) => ({ ...x, kind: k, playerCount: k === 'game' ? '1' : 'all' }))}
                className={`rounded-full border-2 px-3 py-1.5 text-sm font-bold ${d.kind === k ? 'border-accent bg-accent-soft text-accent' : 'border-line text-ink-2'}`}
              >
                {CONTENT_KIND_INFO[k].icon} {CONTENT_KIND_INFO[k].label}
              </button>
            ))}
          </div>
        )}
        <Field label="Titel" hint="Kurz und knackig – wird groß angezeigt.">
          <input className="field" value={d.title} onChange={(e) => set('title', e.target.value)} maxLength={160} autoFocus />
        </Field>

        {isQ && (
          <Field label="Frage">
            <textarea className="field min-h-20" value={d.question} onChange={(e) => set('question', e.target.value)} />
          </Field>
        )}

        {d.kind === 'choice' && (
          <div>
            <span className="label">Antworten (richtige markieren)</span>
            <div className="flex flex-col gap-2">
              {d.options.map((o, i) => (
                <div key={i} className={`flex items-center gap-2 rounded-2xl border-2 px-2 py-1 ${d.correctIndex === i ? 'border-good bg-good-soft' : 'border-line'}`}>
                  <input type="radio" checked={d.correctIndex === i} onChange={() => set('correctIndex', i)} className="size-4 accent-[var(--good)]" aria-label="richtige Antwort" />
                  <span className="w-5 font-display font-semibold text-muted">{String.fromCharCode(65 + i)}</span>
                  <input className="min-w-0 flex-1 bg-transparent px-1 py-1.5 outline-none" value={o} onChange={(e) => set('options', d.options.map((x, j) => (j === i ? e.target.value : x)))} placeholder={`Antwort ${String.fromCharCode(65 + i)}`} />
                  {d.options.length > 2 && (
                    <IconButton
                      label="Antwort entfernen"
                      className="size-8"
                      onClick={() =>
                        setD((x) => ({
                          ...x,
                          options: x.options.filter((_, j) => j !== i),
                          correctIndex: x.correctIndex === i ? 0 : x.correctIndex > i ? x.correctIndex - 1 : x.correctIndex,
                        }))
                      }
                    >
                      <Trash2 className="size-4" />
                    </IconButton>
                  )}
                </div>
              ))}
              {d.options.length < 8 && (
                <Button size="sm" variant="ghost" icon={<Plus className="size-4" />} className="self-start" onClick={() => set('options', [...d.options, ''])}>
                  Antwort
                </Button>
              )}
            </div>
          </div>
        )}

        {d.kind === 'text' && (
          <div>
            <span className="label">Richtige Antworten (Varianten)</span>
            <div className="flex flex-col gap-2">
              {d.answers.map((a, i) => (
                <div key={i} className="flex gap-2">
                  <input className="field" value={a} onChange={(e) => set('answers', d.answers.map((x, j) => (j === i ? e.target.value : x)))} />
                  {d.answers.length > 1 && (
                    <IconButton label="Entfernen" onClick={() => set('answers', d.answers.filter((_, j) => j !== i))}>
                      <Trash2 className="size-4" />
                    </IconButton>
                  )}
                </div>
              ))}
              <Button size="sm" variant="ghost" icon={<Plus className="size-4" />} className="self-start" onClick={() => set('answers', [...d.answers, ''])}>
                Variante
              </Button>
              <p className="text-xs text-muted">Groß-/Kleinschreibung, Umlaute, Artikel und kleine Tippfehler werden toleriert.</p>
            </div>
          </div>
        )}

        {d.kind === 'estimate' && (
          <div className="grid grid-cols-[1fr_8rem] gap-2">
            <Field label="Richtiger Wert">
              <input className="field" inputMode="decimal" value={d.target} onChange={(e) => set('target', e.target.value)} />
            </Field>
            <Field label="Einheit">
              <input className="field" value={d.unit} onChange={(e) => set('unit', e.target.value)} placeholder="m, kg …" />
            </Field>
          </div>
        )}

        {d.kind === 'buzzer' && (
          <Field label="Lösung (sieht nur der Moderator)">
            <input className="field" value={d.answer} onChange={(e) => set('answer', e.target.value)} />
          </Field>
        )}

        <Field label={isQ ? 'Zusatztext (optional)' : 'Regeln / Vorlesetext'}>
          <textarea className="field min-h-24" value={d.description} onChange={(e) => set('description', e.target.value)} />
        </Field>

        {!isQ && (
          <Field label="Material">
            <input className="field" value={d.materials} onChange={(e) => set('materials', e.target.value)} placeholder="z. B. 30 Becher, Stoppuhr" />
          </Field>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Wer spielt?" hint={isQ ? 'Bei Fragen meist das ganze Team.' : 'Spieler werden fair ausgelost.'}>
            <select className="field" value={d.playerCount} onChange={(e) => set('playerCount', e.target.value as PlayerCount)}>
              {PLAYER_COUNTS.map((p) => (
                <option key={p} value={p}>
                  {PLAYER_COUNT_LABEL[p]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Countdown (Sekunden)" hint="Leer = ohne Countdown">
            <input className="field" inputMode="numeric" value={d.timerSec} onChange={(e) => set('timerSec', e.target.value.replace(/\D/g, ''))} />
          </Field>
        </div>

        {isQ && <AudioOption item={item} draft={d} onChange={(v) => set('audio', v)} />}

        <Field label="Notiz für Regie & Moderator">
          <input className="field" value={d.notes} onChange={(e) => set('notes', e.target.value)} />
        </Field>

        {!isQ && (
          <div className="flex flex-col gap-3 rounded-2xl bg-bg-2 p-3">
            <Switch checked={d.roundUse} onChange={(v) => set('roundUse', v)} label="In normalen Runden spielbar" />
            <div>
              <span className="label">Als Feld-Minispiel nutzbar</span>
              <div className="flex flex-wrap gap-3">
                {FIELD_GAME_MODES.map((m) => (
                  <label key={m} className="flex items-center gap-1.5 text-sm font-semibold">
                    <input
                      type="checkbox"
                      className="size-4 accent-[var(--accent)]"
                      checked={d.fieldModes.includes(m)}
                      onChange={(e) => set('fieldModes', e.target.checked ? [...d.fieldModes, m] : d.fieldModes.filter((x) => x !== m))}
                    />
                    {FIELD_GAME_MODE_LABEL[m]}
                  </label>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}

/**
 * „Audio erstellen“: Die Frage wird vertont (Sprecher des Kommentators) und auf dem Beamer
 * vorgelesen, solange sie groß in der Mitte steht. Angehakt = Wunsch an die Technik; die fertige
 * Aufnahme hängt danach an der Frage. Wird die Frage geändert, wird sie neu angefordert.
 */
function AudioOption({ item, draft, onChange }: { item: ContentItem | null; draft: Draft; onChange: (v: boolean) => void }) {
  const text = spokenText(fromDraft(draft) as Parameters<typeof spokenText>[0]);
  const has = !!item?.audioUrl;
  const stale = has && text !== item?.audioText;
  let status: string;
  if (!draft.audio) status = has ? 'Die Aufnahme wird beim Speichern entfernt.' : 'Kein Vorlesen.';
  else if (has && !stale) status = 'Aufnahme vorhanden – der Beamer liest die Frage vor.';
  else if (stale) status = 'Frage geändert – die Aufnahme wird beim Speichern neu angefordert.';
  else status = 'Angefordert – die Aufnahme wird erstellt und erscheint dann hier.';
  return (
    <div className="flex flex-col gap-2 rounded-2xl bg-bg-2 p-3">
      <label className="flex items-center gap-2 text-sm font-bold">
        <input type="checkbox" className="size-4 accent-[var(--accent)]" checked={draft.audio} onChange={(e) => onChange(e.target.checked)} />
        <Mic className="size-4 text-accent" /> Audio erstellen (Frage auf dem Beamer vorlesen)
      </label>
      <p className="text-xs font-semibold text-muted">{status}</p>
      {draft.audio && text && <p className="rounded-xl bg-surface px-3 py-2 text-xs text-ink-2">Vorlesetext: „{text}“</p>}
      {has && !stale && item?.audioUrl && (
        <Button size="sm" variant="ghost" icon={<Volume2 className="size-4" />} onClick={() => void new Audio(item.audioUrl!).play().catch(() => {})} className="self-start">
          Probehören
        </Button>
      )}
    </div>
  );
}
