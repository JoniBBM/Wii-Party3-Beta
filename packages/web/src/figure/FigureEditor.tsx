/** Figuren-Editor fürs Handy: Hautton, Frisur, Haarfarbe, Augen, Mund, Zubehör, Körper, Hose. */
import { useEffect, useState } from 'react';
import { Shuffle } from 'lucide-react';
import {
  FIGURE_ACCESSORIES,
  FIGURE_ACCESSORIES_LABEL,
  FIGURE_BODIES,
  FIGURE_BODIES_LABEL,
  FIGURE_EYES,
  FIGURE_EYES_LABEL,
  FIGURE_HAIR_COLORS,
  FIGURE_HAIR_STYLES,
  FIGURE_HAIR_STYLE_LABEL,
  FIGURE_MOUTHS,
  FIGURE_MOUTHS_LABEL,
  FIGURE_PANTS,
  FIGURE_SKINS,
  randomFigure,
  type FigureConfig,
  type TeamColorKey,
} from '@insel/shared';
import { Button, Segmented } from '../ui/basics.tsx';
import { FigurePreview } from './FigurePreview.tsx';

type Tab = 'face' | 'hair' | 'style';

function Chips<T extends string>({ value, options, labels, onChange }: { value: T; options: readonly T[]; labels: Record<T, string>; onChange: (v: T) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => (
        <button
          key={o}
          type="button"
          onClick={() => onChange(o)}
          className={`rounded-full border-2 px-3 py-1.5 text-sm font-bold transition ${value === o ? 'border-accent bg-accent-soft text-accent' : 'border-line bg-surface text-ink-2'}`}
        >
          {labels[o]}
        </button>
      ))}
    </div>
  );
}

function Swatches({ value, colors, onChange }: { value: number; colors: readonly string[]; onChange: (i: number) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {colors.map((c, i) => (
        <button
          key={c}
          type="button"
          onClick={() => onChange(i)}
          aria-label={`Farbe ${i + 1}`}
          className={`size-9 rounded-full border-2 border-white shadow-soft transition ${value === i ? 'scale-110 ring-3 ring-accent' : ''}`}
          style={{ background: c }}
        />
      ))}
    </div>
  );
}

export function FigureEditor({
  figure,
  color,
  onSave,
  saving,
}: {
  figure: FigureConfig;
  color: TeamColorKey;
  onSave: (f: FigureConfig) => void;
  saving?: boolean;
}) {
  const [f, setF] = useState(figure);
  const [tab, setTab] = useState<Tab>('face');
  useEffect(() => setF(figure), [figure]);
  const set = <K extends keyof FigureConfig>(k: K, v: FigureConfig[K]) => setF((x) => ({ ...x, [k]: v }));
  const dirty = JSON.stringify(f) !== JSON.stringify(figure);

  return (
    <div className="flex flex-col gap-4">
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-b from-sky-200 via-sky-100 to-white">
        <FigurePreview figure={f} color={color} height={260} />
        <button
          type="button"
          onClick={() => setF(randomFigure({ next: Math.random }))}
          className="absolute top-3 right-3 grid size-11 place-items-center rounded-full bg-white/90 shadow-soft"
          aria-label="Zufällige Figur"
        >
          <Shuffle className="size-5" />
        </button>
      </div>
      <Segmented<Tab>
        value={tab}
        onChange={setTab}
        className="self-center"
        options={[
          { value: 'face', label: 'Gesicht' },
          { value: 'hair', label: 'Haare' },
          { value: 'style', label: 'Stil' },
        ]}
      />
      {tab === 'face' && (
        <div className="flex flex-col gap-4">
          <div>
            <p className="label">Hautton</p>
            <Swatches value={f.skin} colors={FIGURE_SKINS} onChange={(v) => set('skin', v)} />
          </div>
          <div>
            <p className="label">Augen</p>
            <Chips value={f.eyes} options={FIGURE_EYES} labels={FIGURE_EYES_LABEL} onChange={(v) => set('eyes', v)} />
          </div>
          <div>
            <p className="label">Mund</p>
            <Chips value={f.mouth} options={FIGURE_MOUTHS} labels={FIGURE_MOUTHS_LABEL} onChange={(v) => set('mouth', v)} />
          </div>
        </div>
      )}
      {tab === 'hair' && (
        <div className="flex flex-col gap-4">
          <div>
            <p className="label">Frisur</p>
            <Chips value={f.hairStyle} options={FIGURE_HAIR_STYLES} labels={FIGURE_HAIR_STYLE_LABEL} onChange={(v) => set('hairStyle', v)} />
          </div>
          <div>
            <p className="label">Haarfarbe</p>
            <Swatches value={f.hairColor} colors={FIGURE_HAIR_COLORS} onChange={(v) => set('hairColor', v)} />
          </div>
        </div>
      )}
      {tab === 'style' && (
        <div className="flex flex-col gap-4">
          <div>
            <p className="label">Zubehör</p>
            <Chips value={f.accessory} options={FIGURE_ACCESSORIES} labels={FIGURE_ACCESSORIES_LABEL} onChange={(v) => set('accessory', v)} />
          </div>
          <div>
            <p className="label">Figur</p>
            <Chips value={f.body} options={FIGURE_BODIES} labels={FIGURE_BODIES_LABEL} onChange={(v) => set('body', v)} />
          </div>
          <div>
            <p className="label">Hose</p>
            <Swatches value={f.pants} colors={FIGURE_PANTS} onChange={(v) => set('pants', v)} />
          </div>
          <p className="text-xs text-muted">Das Shirt hat immer eure Teamfarbe.</p>
        </div>
      )}
      <Button variant="primary" size="lg" block disabled={!dirty} loading={saving} onClick={() => onSave(f)}>
        {dirty ? 'Figur speichern' : 'Gespeichert ✓'}
      </Button>
    </div>
  );
}
