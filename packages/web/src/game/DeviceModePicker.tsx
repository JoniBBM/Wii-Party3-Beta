/** Auswahl, wie die Handys genutzt werden: eigenes Gerät pro Person oder Anmeldestation + Team-Geräte. */
import type { DeviceMode } from '@insel/shared';

const OPTIONS: { value: DeviceMode; icon: string; title: string; text: string }[] = [
  {
    value: 'personal',
    icon: '📱',
    title: 'Jede Person hat ein eigenes Handy',
    text: 'Alle scannen den QR-Code und melden sich am eigenen Handy an. Antworten und Würfeln geht von jedem Handy des Teams.',
  },
  {
    value: 'shared',
    icon: '👥',
    title: 'Gruppen teilen sich ein Gerät',
    text: 'An einem Gerät (Anmeldestation) melden sich alle nacheinander an – mit Name und Selfie. Danach verbindet sich pro Team ein Handy oder Tablet mit der Team-PIN.',
  },
];

export function DeviceModePicker({ value, onChange }: { value: DeviceMode; onChange: (v: DeviceMode) => void }) {
  return (
    <div className="grid gap-2" role="radiogroup" aria-label="Geräte">
      {OPTIONS.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={`flex items-start gap-3 rounded-2xl border-2 p-3 text-left transition ${value === o.value ? 'border-accent bg-accent-soft/40' : 'border-line hover:border-accent/40'}`}
        >
          <span className="text-2xl leading-none">{o.icon}</span>
          <span className="min-w-0 flex-1">
            <span className="block font-bold">{o.title}</span>
            <span className="block text-sm text-muted">{o.text}</span>
          </span>
          <span className={`mt-1 grid size-5 shrink-0 place-items-center rounded-full border-2 ${value === o.value ? 'border-accent' : 'border-line'}`}>
            {value === o.value && <span className="size-2.5 rounded-full bg-accent" />}
          </span>
        </button>
      ))}
    </div>
  );
}
