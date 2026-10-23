/** Auswahl der Welt (Optik): Insel oder Blockwelt – Regeln und Spielfeld bleiben gleich. */
import { THEMES, THEME_INFO, type Theme } from '@insel/shared';

export function ThemePicker({ value, onChange, large }: { value: Theme; onChange: (v: Theme) => void; large?: boolean }) {
  return (
    <div className="grid gap-3 md:grid-cols-2" role="radiogroup" aria-label="Welt">
      {THEMES.map((t) => {
        const info = THEME_INFO[t];
        const on = value === t;
        return (
          <button
            key={t}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(t)}
            className={`flex items-start gap-3 rounded-2xl border-2 text-left transition ${large ? 'p-4' : 'p-3'} ${on ? 'border-accent bg-accent-soft/40' : 'border-line hover:border-accent/40'}`}
          >
            <span className={`${large ? 'text-4xl' : 'text-2xl'} leading-none`}>{info.icon}</span>
            <span className="min-w-0 flex-1">
              <span className="block font-extrabold">{info.label}</span>
              <span className="block text-sm text-muted">{info.description}</span>
            </span>
            <span className={`mt-1 grid size-5 shrink-0 place-items-center rounded-full border-2 ${on ? 'border-accent' : 'border-line'}`}>{on && <span className="size-2.5 rounded-full bg-accent" />}</span>
          </button>
        );
      })}
    </div>
  );
}
