/** Grundbausteine der Oberfläche. */
import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Loader2 } from 'lucide-react';

type Variant = 'primary' | 'good' | 'bad' | 'soft' | 'ghost';
type Size = 'sm' | 'md' | 'lg' | 'xl';

const SIZE: Record<Size, string> = {
  sm: 'h-9 px-3.5 text-sm',
  md: 'h-11 px-5 text-[0.95rem]',
  lg: 'h-14 px-7 text-lg',
  xl: 'h-20 px-10 text-2xl',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: ReactNode;
  block?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'soft', size = 'md', loading, icon, block, className = '', children, disabled, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type="button"
      className={`btn btn-${variant} ${SIZE[size]} ${block ? 'w-full' : ''} ${className}`}
      disabled={disabled || loading}
      {...rest}
    >
      {loading ? <Loader2 className="size-[1.1em] animate-spin" /> : icon}
      {children}
    </button>
  );
});

export function IconButton({
  label,
  className = '',
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={`inline-grid size-10 place-items-center rounded-full text-ink-2 transition hover:bg-ink/5 active:scale-95 disabled:opacity-40 ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}

export function Card({ className = '', children, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={`card ${className}`} {...rest}>
      {children}
    </div>
  );
}

export function CardHeader({ title, icon, actions, sub }: { title: ReactNode; icon?: ReactNode; actions?: ReactNode; sub?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
      <div className="min-w-0">
        <h3 className="flex items-center gap-2 text-lg font-semibold">
          {icon}
          <span className="truncate">{title}</span>
        </h3>
        {sub && <p className="mt-0.5 text-sm text-muted">{sub}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Badge({
  children,
  tone = 'neutral',
  className = '',
}: {
  children: ReactNode;
  tone?: 'neutral' | 'accent' | 'good' | 'bad' | 'warn';
  className?: string;
}) {
  const tones = {
    neutral: 'bg-bg-2 text-ink-2',
    accent: 'bg-accent-soft text-accent',
    good: 'bg-good-soft text-good',
    bad: 'bg-bad-soft text-bad',
    warn: 'bg-warn-soft text-warn',
  };
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold ${tones[tone]} ${className}`}>
      {children}
    </span>
  );
}

export function Spinner({ className = '' }: { className?: string }) {
  return <Loader2 className={`size-6 animate-spin text-accent ${className}`} />;
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  className = '',
  size = 'md',
}: {
  value: T;
  options: { value: T; label: ReactNode }[];
  onChange: (v: T) => void;
  className?: string;
  size?: 'sm' | 'md';
}) {
  return (
    <div className={`inline-flex rounded-full border border-line bg-bg-2 p-1 ${className}`} role="tablist">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
          className={`rounded-full font-bold transition ${size === 'sm' ? 'px-3 py-1 text-xs' : 'px-4 py-1.5 text-sm'} ${
            value === o.value ? 'bg-surface text-ink shadow-soft' : 'text-muted hover:text-ink'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Switch({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label?: ReactNode; disabled?: boolean }) {
  return (
    <label className={`inline-flex cursor-pointer items-center gap-3 ${disabled ? 'opacity-50' : ''}`}>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative h-7 w-12 rounded-full transition ${checked ? 'bg-good' : 'bg-line'}`}
      >
        <span className={`absolute top-1 size-5 rounded-full bg-white shadow transition-all ${checked ? 'left-6' : 'left-1'}`} />
      </button>
      {label && <span className="text-sm font-semibold">{label}</span>}
    </label>
  );
}

export function EmptyState({ icon, title, children }: { icon?: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
      {icon && <div className="text-4xl">{icon}</div>}
      <p className="font-display text-lg font-semibold">{title}</p>
      {children && <div className="max-w-sm text-sm text-muted">{children}</div>}
    </div>
  );
}

export function Field({ label, hint, children, className = '' }: { label: string; hint?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <label className={`block ${className}`}>
      <span className="label">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-muted">{hint}</span>}
    </label>
  );
}

export function NumberStepper({
  value,
  onChange,
  min,
  max,
  step = 1,
}: {
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step?: number;
}) {
  return (
    <div className="inline-flex items-center rounded-full border border-line bg-surface">
      <button type="button" className="size-10 rounded-full text-lg font-bold hover:bg-bg-2 disabled:opacity-30" disabled={value <= min} onClick={() => onChange(Math.max(min, value - step))}>
        −
      </button>
      <span className="min-w-10 text-center font-display text-lg font-semibold tabular-nums">{value}</span>
      <button type="button" className="size-10 rounded-full text-lg font-bold hover:bg-bg-2 disabled:opacity-30" disabled={value >= max} onClick={() => onChange(Math.min(max, value + step))}>
        +
      </button>
    </div>
  );
}
