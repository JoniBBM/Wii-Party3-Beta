/** Spielfeld-Editor: Draufsicht der Insel, Felder antippen und Typ wählen. */
import { useMemo, useState } from 'react';
import { Anchor, Shuffle } from 'lucide-react';
import {
  buildIslandPlan,
  coastOutline,
  countFields,
  FIELD_INFO,
  fieldRadiusFor,
  generateBoard,
  GORGE,
  hasLandmarks,
  LAGOON,
  LANDMARK_FIELD_TYPES,
  MAX_GOAL,
  MIN_GOAL,
  newSeed,
  PLACEABLE_FIELD_TYPES,
  RIVER,
  RIVER_LIP,
  VOLCANO,
  withLandmarks,
  type BoardConfig,
  type FieldType,
} from '@insel/shared';
import { Button } from '../../ui/basics.tsx';
import { FieldSwatch } from '../../ui/game.tsx';

const COAST_POINTS = coastOutline(5)
  .map((p) => `${p.x.toFixed(2)},${p.z.toFixed(2)}`)
  .join(' ');

/** Wasserlauf als Folge runder Segmente mit wechselnder Breite. */
function Stream({ pts, color }: { pts: { x: number; z: number; w: number }[]; color: string }) {
  return (
    <g stroke={color} strokeLinecap="round" fill="none">
      {pts.slice(0, -1).map((a, i) => {
        const b = pts[i + 1]!;
        return <line key={i} x1={a.x} y1={a.z} x2={b.x} y2={b.z} strokeWidth={a.w + b.w} />;
      })}
    </g>
  );
}

const isLandmark = (t: FieldType) => (LANDMARK_FIELD_TYPES as readonly string[]).includes(t);

export function BoardEditor({ board, onChange }: { board: BoardConfig; onChange: (b: BoardConfig) => void }) {
  const goal = board.fields.length - 1;
  const plan = useMemo(() => buildIslandPlan(board.fields.length), [board.fields.length]);
  const radius = fieldRadiusFor(plan);
  const [selected, setSelected] = useState<number | null>(null);
  const counts = countFields(board);
  const landmarksOk = hasLandmarks(board);

  const pathD = plan.path
    .filter((_, i) => i % 3 === 0 || i === plan.path.length - 1)
    .map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(2)} ${p.z.toFixed(2)}`)
    .join(' ');
  const setType = (pos: number, type: FieldType) => {
    const fields = [...board.fields];
    fields[pos] = type;
    onChange({ ...board, fields });
  };
  const selType = selected !== null ? (board.fields[selected] ?? 'normal') : null;

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
      <div className="relative overflow-hidden rounded-3xl border border-line" style={{ background: 'radial-gradient(circle at 50% 45%, #7fd8ee 0%, #3fb0dc 55%, #2a8fc8 100%)' }}>
        <svg viewBox="-47 -41 95 82" className="block h-auto w-full" role="img" aria-label="Spielfeld-Draufsicht">
          <defs>
            <radialGradient id="be-volcano" cx="50%" cy="50%" r="50%">
              <stop offset="0" stopColor="#5a463c" />
              <stop offset="0.45" stopColor="#8a7563" />
              <stop offset="1" stopColor="#8a7563" stopOpacity="0" />
            </radialGradient>
          </defs>
          {/* Flachwasser rund um die Insel */}
          <polygon points={COAST_POINTS} fill="#8fe3e6" stroke="#8fe3e6" strokeWidth="5" strokeLinejoin="round" opacity="0.7" />
          <polygon points={COAST_POINTS} fill="#71b955" stroke="#f1d993" strokeWidth="2.6" strokeLinejoin="round" />
          <circle cx={LAGOON.x} cy={LAGOON.z} r={LAGOON.r} fill="#6fe2dc" />
          <circle cx={VOLCANO.x} cy={VOLCANO.z} r={VOLCANO.baseRadius * 0.8} fill="url(#be-volcano)" />
          <circle cx={VOLCANO.x} cy={VOLCANO.z} r={VOLCANO.craterRadius + 0.6} fill="#4a3530" />
          <circle cx={VOLCANO.x} cy={VOLCANO.z} r={VOLCANO.craterRadius * 0.55} fill="#ff6a2b" opacity="0.9" />
          <Stream pts={GORGE} color="#2a8fc8" />
          <Stream pts={RIVER.slice(0, RIVER_LIP + 1)} color="#4fb6e3" />
          <Stream pts={RIVER.slice(RIVER_LIP + 1)} color="#4fb6e3" />
          <path d={pathD} fill="none" stroke="#ead29a" strokeWidth={radius * 1.5} strokeLinecap="round" strokeLinejoin="round" />
          {plan.fields.map((f, i) => {
            const type = board.fields[i] ?? 'normal';
            const r = radius * (i === 0 || i === goal ? 1.35 : 0.92);
            return (
              <g key={i} onClick={() => setSelected(i === selected ? null : i)} className="cursor-pointer">
                <circle cx={f.x} cy={f.z} r={r} fill={FIELD_INFO[type].color} stroke={selected === i ? '#1b2a36' : 'rgba(0,0,0,0.25)'} strokeWidth={selected === i ? 0.35 : 0.12} />
                {(i % 10 === 0 || i === goal) && (
                  <text x={f.x} y={f.z + 0.42} textAnchor="middle" fontSize="1.15" fontWeight="800" fill="#1b2a36" pointerEvents="none">
                    {i}
                  </text>
                )}
                {isLandmark(type) && (
                  <text x={f.x} y={f.z + 0.4} textAnchor="middle" fontSize="1.1" pointerEvents="none">
                    {FIELD_INFO[type].icon}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
        {selected !== null && selType && (
          <div className="absolute inset-x-3 bottom-3 rounded-2xl bg-surface/95 p-3 shadow-lifted backdrop-blur">
            <p className="mb-2 text-sm font-bold">
              Feld {selected} {selected === 0 ? '(Start)' : selected === goal ? '(Ziel)' : ''}
            </p>
            {selected === 0 || selected === goal ? (
              <p className="text-sm text-muted">Start und Ziel sind fest.</p>
            ) : isLandmark(selType) ? (
              <p className="text-sm text-muted">
                {FIELD_INFO[selType].icon} {FIELD_INFO[selType].label} gehört fest zur Insel. Ob und wie stark es wirkt, stellst du bei den Regeln ein.
              </p>
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
        {!landmarksOk && (
          <div className="rounded-2xl bg-warn-soft p-3 text-sm">
            <p className="font-bold">Dieses Brett stammt aus einer älteren Version.</p>
            <p className="mb-2 text-ink-2">Fässer im Fluss und das Kraterloch fehlen noch.</p>
            <Button size="sm" icon={<Anchor className="size-4" />} onClick={() => onChange(withLandmarks(board))}>
              Fässer & Krater einbauen
            </Button>
          </div>
        )}
        <ul className="flex flex-col gap-1.5 text-sm">
          {(['normal', ...PLACEABLE_FIELD_TYPES.filter((t) => t !== 'normal'), ...LANDMARK_FIELD_TYPES] as FieldType[]).map((t) => (
            <li key={t} className="flex items-center gap-2">
              <FieldSwatch type={t} />
              <span className="flex-1 font-semibold">
                {FIELD_INFO[t].icon} {FIELD_INFO[t].label}
                {isLandmark(t) && <span className="ml-1 text-xs font-normal text-muted">(fest)</span>}
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
