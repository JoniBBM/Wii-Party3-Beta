/**
 * Foto-Blasen: Werden Personen für ein Minispiel oder eine Frage gezogen, fliegen ihre Fotos
 * (oder Emojis) als große Blasen mit Rahmen in Teamfarbe über den Beamer – wie früher.
 */
import { useEffect, useRef, useState } from 'react';
import { teamColor, type GameState, type Player } from '@insel/shared';
import { onEffects, useLive } from '../../lib/live.ts';
import { boardAudio } from './BoardCanvas.tsx';

interface Bubble {
  key: string;
  player: Player;
  color: string;
  dark: string;
  /** Start- und Zielpunkt (px) */
  sx: number;
  sy: number;
  tx: number;
  ty: number;
  born: number;
  seed: number;
}

const LIFE = 9.5; // Sekunden auf dem Schirm

function drawnOf(state: GameState | null): Record<string, string[]> {
  if (!state) return {};
  const p = state.phase;
  if (p.name === 'content') return p.content.drawn;
  if (p.name === 'dice' && p.dice.fieldGame?.stage === 'running') return p.dice.fieldGame.drawn;
  return {};
}

export function PhotoBubbles({ state }: { state: GameState }) {
  const [bubbles, setBubbles] = useState<Bubble[]>([]);
  const els = useRef(new Map<string, HTMLDivElement>());
  const list = useRef<Bubble[]>([]);
  const teamsRef = useRef(state.teams);
  teamsRef.current = state.teams;

  useEffect(
    () =>
      onEffects((effects) => {
        if (!effects.some((e) => e.type === 'drawn' || (e.type === 'field_game' && e.stage === 'running'))) return;
        // Zustand kommt direkt nach den Effekten – kurz warten
        window.setTimeout(() => {
          const st = useLive.getState().state;
          const drawn = drawnOf(st);
          const W = window.innerWidth;
          const H = window.innerHeight;
          const size = Math.min(W, H) * 0.22;
          const now = performance.now();
          const next: Bubble[] = [];
          let i = 0;
          for (const [teamId, ids] of Object.entries(drawn)) {
            const team = teamsRef.current.find((t) => t.id === teamId);
            const c = teamColor(team?.color ?? 'red');
            for (const id of ids) {
              const player = st?.players.find((p) => p.id === id);
              if (!player) continue;
              const side = Math.floor(Math.random() * 4);
              const sx = side === 0 ? -size : side === 1 ? W + size : Math.random() * W;
              const sy = side === 2 ? -size : side === 3 ? H + size : Math.random() * H;
              next.push({
                key: `${id}-${now}`,
                player,
                color: c.hex,
                dark: c.dark,
                sx,
                sy,
                tx: W * (0.18 + Math.random() * 0.64),
                ty: H * (0.2 + Math.random() * 0.55),
                born: now + i * 280,
                seed: Math.random() * 100,
              });
              i++;
            }
          }
          if (!next.length) return;
          next.slice(0, 16).forEach((b, k) => window.setTimeout(() => boardAudio.play('blase', { volume: 0.7, rate: 0.9 + Math.random() * 0.3 }), k * 280));
          list.current = next.slice(0, 16);
          setBubbles(list.current);
        }, 120);
      }),
    [],
  );

  // Bewegung per requestAnimationFrame (ohne React-Neuzeichnen)
  useEffect(() => {
    if (!bubbles.length) return;
    let raf = 0;
    const tick = () => {
      const now = performance.now();
      const W = window.innerWidth;
      const H = window.innerHeight;
      let alive = 0;
      for (const b of list.current) {
        const el = els.current.get(b.key);
        const age = (now - b.born) / 1000;
        if (!el) continue;
        if (age < 0) {
          el.style.opacity = '0';
          alive++;
          continue;
        }
        if (age > LIFE) {
          el.style.opacity = '0';
          continue;
        }
        alive++;
        // Hereinfliegen mit Überschwingen, dann schweben, am Ende zerplatzen
        const fly = Math.min(1, age / 1.4);
        const e = 1 - Math.pow(1 - fly, 3);
        const wx = Math.sin(age * 0.9 + b.seed) * W * 0.06 + Math.sin(age * 2.1 + b.seed * 2) * 14;
        const wy = Math.cos(age * 0.7 + b.seed) * H * 0.05 + Math.cos(age * 1.7 + b.seed) * 12;
        const x = b.sx + (b.tx - b.sx) * e + wx * fly;
        const y = b.sy + (b.ty - b.sy) * e + wy * fly;
        let scale = fly < 1 ? 0.4 + e * 0.75 : 1 + Math.sin(age * 2.4 + b.seed) * 0.035;
        if (fly >= 1 && age < 1.8) scale = 1.15 - (age - 1.4) * 0.375;
        const out = Math.max(0, (age - (LIFE - 0.6)) / 0.6);
        if (out > 0) scale *= 1 + out * 0.5;
        el.style.opacity = String(1 - out);
        el.style.transform = `translate3d(${x}px, ${y}px, 0) translate(-50%, -50%) scale(${scale}) rotate(${Math.sin(age * 1.6 + b.seed) * 6}deg)`;
      }
      if (alive) raf = requestAnimationFrame(tick);
      else setBubbles([]);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [bubbles]);

  return (
    <div className="pointer-events-none fixed inset-0 z-20 overflow-hidden">
      {bubbles.map((b) => (
        <div
          key={b.key}
          ref={(el) => {
            if (el) els.current.set(b.key, el);
            else els.current.delete(b.key);
          }}
          className="absolute top-0 left-0 flex flex-col items-center gap-2 opacity-0 will-change-transform"
        >
          <div
            className="grid size-[min(22vh,22vw)] place-items-center overflow-hidden rounded-full bg-white shadow-[0_14px_40px_rgba(0,0,0,0.35)]"
            style={{ border: `0.7rem solid ${b.color}` }}
          >
            {b.player.photo ? (
              <img src={b.player.photo} alt="" className="size-full object-cover" draggable={false} />
            ) : (
              <span className="text-[min(11vh,11vw)] leading-none">{b.player.emoji}</span>
            )}
          </div>
          <span className="rounded-full border-4 border-white px-5 py-1 font-display text-3xl font-semibold text-white shadow-lifted" style={{ background: b.color }}>
            {b.player.name}
          </span>
        </div>
      ))}
    </div>
  );
}
