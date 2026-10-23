/**
 * Wetter, Jahreszeit und Festzeit auf dem Beamer (beide Welten), jeweils mit Automatik. Gehört zur
 * Beamer-Show des Kontos und wirkt sofort – steht in der Regie bei „Spiel einrichten › Welt & Stimmung“.
 */
import { CloudSun } from 'lucide-react';
import { atmosphereFor, FESTIVE_INFO, FESTIVE_MODES, SEASON_INFO, SEASONS, WEATHER_INFO, WEATHER_KINDS, type ShowPatch } from '@insel/shared';
import { sendShow, useLive } from '../lib/live.ts';
import { Badge, Card, CardHeader } from '../ui/basics.tsx';
import { toast } from '../ui/toast.tsx';

/** Auswahl als Chips: „Automatisch“ plus feste Werte */
export function ChoiceChips<T extends string>({ value, options, onChange, label, id }: { value: T; options: { value: T; label: string; icon?: string }[]; onChange: (v: T) => void; label: string; id?: string }) {
  return (
    <div data-setting={id} className="rounded-2xl">
      <p className="mb-1.5 text-sm font-bold">{label}</p>
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={label}>
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={value === o.value}
            onClick={() => onChange(o.value)}
            className={`inline-flex items-center gap-1.5 rounded-full border-2 px-3 py-1.5 text-sm font-bold transition ${value === o.value ? 'border-accent bg-accent-soft text-accent' : 'border-line text-ink-2 hover:border-accent/40'}`}
          >
            {o.icon && <span aria-hidden>{o.icon}</span>}
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

async function patch(p: ShowPatch) {
  const r = await sendShow({ type: 'set', patch: p });
  if (!r.ok) toast.error(r.error ?? 'Beamer konnte nicht gesteuert werden');
}

export function AtmosphereCard() {
  const s = useLive((x) => x.show.settings);
  const state = useLive((x) => x.state);
  const now = atmosphereFor(s, state);
  const set = (p: ShowPatch) => void patch(p);
  return (
    <Card>
      <CardHeader title="Wetter & Stimmung" icon={<CloudSun className="size-5 text-accent" />} sub="Für beide Welten. Gilt für deine Beamer, auch in anderen Spielen." actions={<Badge tone="good">wirkt sofort</Badge>} />
      <div className="flex flex-col gap-4 p-5">
        <ChoiceChips
          id="g.weather"
          label="Wetter"
          value={s.weather}
          onChange={(weather) => set({ weather })}
          options={[{ value: 'auto' as const, label: 'Automatisch', icon: '🔄' }, ...WEATHER_KINDS.map((w) => ({ value: w, label: WEATHER_INFO[w].label, icon: WEATHER_INFO[w].icon }))]}
        />
        <ChoiceChips
          id="g.season"
          label="Jahreszeit"
          value={s.season}
          onChange={(season) => set({ season })}
          options={[{ value: 'auto' as const, label: 'Nach Datum', icon: '📅' }, ...SEASONS.map((v) => ({ value: v, label: SEASON_INFO[v].label, icon: SEASON_INFO[v].icon }))]}
        />
        <ChoiceChips
          id="g.festive"
          label="Festzeit"
          value={s.festive}
          onChange={(festive) => set({ festive })}
          options={[{ value: 'auto' as const, label: 'Nach Datum', icon: '📅' }, ...FESTIVE_MODES.map((v) => ({ value: v, label: FESTIVE_INFO[v].label, icon: FESTIVE_INFO[v].icon }))]}
        />
        <p className="rounded-2xl bg-bg-2 px-4 py-3 text-sm">
          Gerade auf dem Beamer: <b>{WEATHER_INFO[now.weather].icon} {WEATHER_INFO[now.weather].label}</b> · {SEASON_INFO[now.season].icon} {SEASON_INFO[now.season].label}
          {now.festive !== 'off' && ` · ${FESTIVE_INFO[now.festive].icon} ${FESTIVE_INFO[now.festive].label}`}
        </p>
        <p className="-mt-2 text-xs text-muted">
          Automatisch: Die Jahreszeit bestimmt die Grundstimmung, alle paar Runden wechselt das Wetter. Hoher Vulkandruck zieht Wolken auf, im Finale wird es dramatisch, beim Sieg reißt der Himmel auf. Halloween ist vom
          17.10. bis 2.11., Weihnachten vom 1. bis 26.12.
        </p>
      </div>
    </Card>
  );
}
