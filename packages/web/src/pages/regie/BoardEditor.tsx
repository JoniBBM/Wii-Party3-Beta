/** Spielfeld-Editor: Draufsicht der Insel, Felder antippen und Typ wählen. */
import { useMemo, useState } from 'react';
import { Shuffle } from 'lucide-react';
import {
  countFields,
  FIELD_INFO,
  generateBoard,
  MAX_GOAL,
  MIN_GOAL,
  newSeed,
  PLACEABLE_FIELD_TYPES,
  type BoardConfig,
  type FieldType,
} from '@insel/shared';
import { buildLayout } from '../../board/layout.ts';
import { Button } from '../../ui/basics.tsx';
import { FieldSwatch } from '../../ui/game.tsx';

export function BoardEditor({ board, onChange }: { board: BoardConfig; onChange: (b: BoardConfig) => void }) {
  const goal = board.fields.length - 1;
  const layout = useMemo(() => buildLayout(board.fields.length), [board.fields.length]);
  const [selected, setSelected] = useState<number | null>(null);
  const counts = countFields(board);

  const pathD = layout.path.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(2)} ${p.z.toFixed(2)}`).join(' ');
  const setType = (pos: number, type: FieldType) => {
    const fields = [...board.fields];
    fields[pos] = type;
    onChange({ ...board, fields });
  };

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
      <div className="relative overflow-hidden rounded-3xl border border-line" style={{ background: 'radial-gradient(circle at 50% 50%, #9ee3f5 0%, #4fbfe0 70%, #2f9fd0 100%)' }}>
        <svg viewBox="-34 -30 68 66" className="block h-auto w-full" role="img" aria-label="Spielfeld-Draufsicht">
          <defs>
            <radialGradient id="island" cx="50%" cy="50%" r="50%">
              <stop offset="0" stopColor="#8fcf6a" />
              <stop offset="0.82" stopColor="#6fb851" />
              <stop offset="0.9" stopColor="#f2dc96" />
              <stop offset="1" stopColor="#f2dc96" stopOpacity="0" />
            </radialGradient>
          </defs>
          <ellipse cx="0" cy="1" rx="29" ry="28" fill="url(#island)" />
          <circle cx={layout.volcano.x} cy={layout.volcano.z} r={layout.volcano.baseRadius * 0.7} fill="#9b8f80" opacity="0.55" />
          <circle cx={layout.volcano.x} cy={layout.volcano.z} r={layout.volcano.craterRadius} fill="#5a3326" />
          <circle cx={layout.volcano.x} cy={layout.volcano.z} r={layout.volcano.craterRadius * 0.6} fill="#ff6a2b" opacity="0.8" />
          <polyline points={layout.river.map((p) => `${p.x},${p.z}`).join(' ')} fill="none" stroke="#4fb6e3" strokeWidth="1.6" strokeLinecap="round" />
          <path d={pathD} fill="none" stroke="#e9cf8c" strokeWidth={layout.fieldRadius * 1.4} strokeLinecap="round" strokeLinejoin="round" />
          {layout.fields.map((f, i) => {
            const type = board.fields[i] ?? 'normal';
            const r = layout.fieldRadius * (i === 0 || i === goal ? 1.3 : 1);
            return (
              <g key={i} onClick={() => setSelected(i === selected ? null : i)} className="cursor-pointer">
                <circle cx={f.x} cy={f.z} r={r} fill={FIELD_INFO[type].color} stroke={selected === i ? '#1b2a36' : 'rgba(0,0,0,0.25)'} strokeWidth={selected === i ? 0.35 : 0.12} />
                {(i % 10 === 0 || i === goal) && (
                  <text x={f.x} y={f.z + 0.42} textAnchor="middle" fontSize="1.15" fontWeight="800" fill="#1b2a36" pointerEvents="none">
                    {i}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
        {selected !== null && (
          <div className="absolute inset-x-3 bottom-3 rounded-2xl bg-surface/95 p-3 shadow-lifted backdrop-blur">
            <p className="mb-2 text-sm font-bold">
              Feld {selected} {selected === 0 ? '(Start)' : selected === goal ? '(Ziel)' : ''}
            </p>
            {selected === 0 || selected === goal ? (
              <p className="text-sm text-muted">Start und Ziel sind fest.</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {PLACEABLE_FIELD_TYPES.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setType(selected, t)}
                    className={`inline-flex items-center gap-1.5 rounded-full border-2 px-2.5 py-1 text-xs font-bold ${board.fields[selected] === t ? 'border-ink' : 'border-line'}`}
                  >
                    <FieldSwatch type={t} /> {FIELD_INFO[t].short}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="flex flex-col gap-4">
        <label className="block">
          <span className="label">Anzahl Felder bis zum Ziel: {goal}</span>
          <input
            type="range"
            min={MIN_GOAL}
            max={MAX_GOAL}
            value={goal}
            onChange={(e) => onChange(generateBoard(Number(e.target.value), board.seed))}
            className="w-full accent-[var(--accent)]"
          />
          <span className="text-xs text-muted">Etwa {Math.round(goal / 7)}–{Math.round(goal / 5)} Runden. Änderung verteilt die Sonderfelder neu.</span>
        </label>
        <Button icon={<Shuffle className="size-4" />} onClick={() => onChange(generateBoard(goal, newSeed()))}>
          Sonderfelder neu verteilen
        </Button>
        <ul className="flex flex-col gap-1.5 text-sm">
          {(['normal', ...PLACEABLE_FIELD_TYPES.filter((t) => t !== 'normal')] as FieldType[]).map((t) => (
            <li key={t} className="flex items-center gap-2">
              <FieldSwatch type={t} />
              <span className="flex-1 font-semibold">
                {FIELD_INFO[t].icon} {FIELD_INFO[t].label}
              </span>
              <span className="font-bold tabular-nums text-muted">{counts[t] ?? 0}</span>
            </li>
          ))}
        </ul>
        <p className="text-xs text-muted">Tipp: Ein Feld in der Karte antippen, um seinen Typ zu ändern. Die Verteilung bleibt fest, bis du sie bewusst änderst.</p>
      </div>
    </div>
  );
}
