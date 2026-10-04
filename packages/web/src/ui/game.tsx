/** Spielbezogene Bausteine: Teamfarben, Avatare, Würfel, Countdown, QR-Code, Vulkan. */
import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import {
  CONTENT_KIND_INFO,
  FIELD_INFO,
  teamColor,
  timerRemaining,
  type ContentKind,
  type FieldType,
  type Player,
  type Team,
  type Timer,
} from '@insel/shared';
import { useServerNow } from '../lib/hooks.ts';

export function TeamDot({ team, size = 12 }: { team: Pick<Team, 'color'> | undefined; size?: number }) {
  const c = teamColor(team?.color ?? 'red');
  return (
    <span
      className="inline-block shrink-0 rounded-full"
      style={{
        width: size,
        height: size,
        background: `radial-gradient(circle at 35% 30%, color-mix(in srgb, ${c.hex} 55%, white), ${c.hex} 60%, ${c.dark})`,
        boxShadow: `0 0 0 2px color-mix(in srgb, ${c.hex} 25%, transparent)`,
      }}
    />
  );
}

export function TeamChip({ team, className = '', size = 'md' }: { team: Team | undefined; className?: string; size?: 'sm' | 'md' | 'lg' }) {
  if (!team) return null;
  const c = teamColor(team.color);
  const cls = { sm: 'text-xs px-2 py-0.5 gap-1.5', md: 'text-sm px-2.5 py-1 gap-2', lg: 'text-lg px-4 py-1.5 gap-2.5' }[size];
  return (
    <span
      className={`inline-flex max-w-full items-center rounded-full font-bold ${cls} ${className}`}
      style={{ background: `color-mix(in srgb, ${c.hex} 16%, var(--surface))`, color: `color-mix(in srgb, ${c.dark} 85%, var(--ink))` }}
    >
      <TeamDot team={team} size={size === 'lg' ? 14 : size === 'sm' ? 8 : 10} />
      <span className="truncate">{team.name}</span>
    </span>
  );
}

export function Avatar({
  player,
  size = 40,
  ring,
  className = '',
}: {
  player: Pick<Player, 'name' | 'emoji' | 'photo'> | undefined;
  size?: number;
  ring?: string;
  className?: string;
}) {
  if (!player) return null;
  return (
    <span
      className={`relative inline-grid shrink-0 place-items-center overflow-hidden rounded-full bg-bg-2 ${className}`}
      style={{ width: size, height: size, boxShadow: ring ? `0 0 0 3px ${ring}` : undefined }}
      title={player.name}
    >
      {player.photo ? (
        <img src={player.photo} alt={player.name} className="size-full object-cover" draggable={false} />
      ) : (
        <span style={{ fontSize: size * 0.55 }} aria-hidden>
          {player.emoji}
        </span>
      )}
    </span>
  );
}

const PIPS: Record<number, [number, number][]> = {
  1: [[50, 50]],
  2: [[28, 28], [72, 72]],
  3: [[26, 26], [50, 50], [74, 74]],
  4: [[28, 28], [72, 28], [28, 72], [72, 72]],
  5: [[27, 27], [73, 27], [50, 50], [27, 73], [73, 73]],
  6: [[28, 25], [72, 25], [28, 50], [72, 50], [28, 75], [72, 75]],
};

export function DiceFace({ value, size = 56, color = '#ffffff', pip = '#1b2a36', label }: { value: number; size?: number; color?: string; pip?: string; label?: string }) {
  const pips = PIPS[value];
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" role="img" aria-label={label ?? `Würfel ${value}`}>
      <defs>
        <linearGradient id={`dg-${color}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={color} />
          <stop offset="1" stopColor={`color-mix(in srgb, ${color} 85%, black)`} />
        </linearGradient>
      </defs>
      <rect x="4" y="4" width="92" height="92" rx="22" fill={`url(#dg-${color})`} stroke="rgba(0,0,0,0.12)" strokeWidth="2" />
      {pips ? (
        pips.map(([x, y], i) => <circle key={i} cx={x} cy={y} r="9" fill={pip} />)
      ) : (
        <text x="50" y="64" textAnchor="middle" fontSize="44" fontWeight="800" fill={pip} fontFamily="Fredoka, sans-serif">
          {value}
        </text>
      )}
    </svg>
  );
}

export function BonusDieBadge({ sides }: { sides: number }) {
  if (!sides) return null;
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-gold/25 px-2 py-0.5 text-xs font-extrabold text-[#8a6a00]" title={`Bonuswürfel mit ${sides} Seiten`}>
      🎲 W{sides}
    </span>
  );
}

export function useCountdown(timer: Timer | null) {
  const now = useServerNow(200);
  if (!timer) return null;
  const remaining = timerRemaining(timer, now);
  return { remaining, running: timer.startedAt !== null && remaining > 0, total: timer.durationMs };
}

export function Countdown({ timer, size = 'md' }: { timer: Timer | null; size?: 'sm' | 'md' | 'lg' | 'xl' }) {
  const c = useCountdown(timer);
  if (!c) return null;
  const secs = Math.ceil(c.remaining / 1000);
  const frac = c.total ? c.remaining / c.total : 0;
  const px = { sm: 44, md: 64, lg: 96, xl: 150 }[size];
  const r = 44;
  const circ = 2 * Math.PI * r;
  const urgent = secs <= 5 && c.running;
  const color = urgent ? 'var(--bad)' : secs <= 10 ? 'var(--warn)' : 'var(--accent)';
  return (
    <div className={`relative inline-grid place-items-center ${urgent ? 'animate-pulse' : ''}`} style={{ width: px, height: px }}>
      <svg viewBox="0 0 100 100" className="absolute inset-0 -rotate-90">
        <circle cx="50" cy="50" r={r} fill="var(--surface)" stroke="var(--line)" strokeWidth="8" />
        <circle cx="50" cy="50" r={r} fill="none" stroke={color} strokeWidth="8" strokeLinecap="round" strokeDasharray={circ} strokeDashoffset={circ * (1 - frac)} style={{ transition: 'stroke-dashoffset 0.25s linear' }} />
      </svg>
      <span className="relative font-display font-semibold tabular-nums" style={{ fontSize: px * 0.36, color: c.running ? 'var(--ink)' : 'var(--muted)' }}>
        {secs}
      </span>
    </div>
  );
}

export function QrCode({ value, size = 180, className = '' }: { value: string; size?: number; className?: string }) {
  const [svg, setSvg] = useState('');
  useEffect(() => {
    let alive = true;
    QRCode.toString(value, { type: 'svg', margin: 1, errorCorrectionLevel: 'M', color: { dark: '#1b2a36', light: '#ffffff' } })
      .then((s) => alive && setSvg(s))
      .catch(() => setSvg(''));
    return () => {
      alive = false;
    };
  }, [value]);
  return (
    <div
      className={`overflow-hidden rounded-2xl bg-white p-2 ${className}`}
      style={{ width: size, height: size }}
      role="img"
      aria-label={`QR-Code für ${value}`}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}

export function KindBadge({ kind, className = '' }: { kind: ContentKind; className?: string }) {
  const info = CONTENT_KIND_INFO[kind];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full bg-accent-soft px-2.5 py-0.5 text-xs font-bold text-accent ${className}`}>
      <span aria-hidden>{info.icon}</span>
      {info.label}
    </span>
  );
}

export function FieldSwatch({ type, size = 14 }: { type: FieldType; size?: number }) {
  return (
    <span
      className="inline-block shrink-0 rounded-full border border-black/10"
      style={{ width: size, height: size, background: FIELD_INFO[type].color }}
      title={FIELD_INFO[type].label}
    />
  );
}

export function VolcanoMeter({ pressure, threshold, compact }: { pressure: number; threshold: number; compact?: boolean }) {
  const frac = Math.min(1, pressure / Math.max(1, threshold));
  return (
    <div className="flex items-center gap-2" title={`Vulkandruck ${pressure}/${threshold}`}>
      <span className={compact ? 'text-lg' : 'text-2xl'} aria-hidden>
        🌋
      </span>
      <div className={`relative ${compact ? 'h-2.5 w-20' : 'h-3.5 flex-1'} overflow-hidden rounded-full bg-bg-2`}>
        <div
          className="absolute inset-y-0 left-0 rounded-full transition-all duration-700"
          style={{ width: `${frac * 100}%`, background: 'linear-gradient(90deg, #f5b031, #f2555a 70%, #b3261e)' }}
        />
      </div>
      <span className="text-xs font-bold tabular-nums text-muted">
        {pressure}/{threshold}
      </span>
    </div>
  );
}

export function ConnectionDot({ status }: { status: string }) {
  const map: Record<string, [string, string]> = {
    online: ['bg-good', 'Verbunden'],
    connecting: ['bg-warn animate-pulse', 'Verbinde …'],
    offline: ['bg-bad animate-pulse', 'Keine Verbindung'],
    idle: ['bg-line', ''],
  };
  const [cls, label] = map[status] ?? map.idle!;
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-bold text-muted" title={label}>
      <span className={`size-2.5 rounded-full ${cls}`} />
      <span className="hidden sm:inline">{label}</span>
    </span>
  );
}
