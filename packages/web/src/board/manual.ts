/**
 * Freie Kamera auf dem Beamer: Maus (ziehen = drehen, rechte Taste/Umschalt = verschieben,
 * Rad = zoomen), Touch (ein Finger drehen, zwei Finger zoomen/verschieben) und Tastatur
 * (Pfeile/WASD, +/−). Doppelklick oder Leertaste/Esc = zurück zur Automatik.
 * Während der Spielerklärung gesperrt (`rig.locked`).
 */
import type { CameraRig } from './camera.ts';

export function attachManualCamera(el: HTMLElement, rig: CameraRig): () => void {
  const pointers = new Map<number, { x: number; y: number }>();
  let pan = false;
  let pinch = 0;

  const down = (e: PointerEvent) => {
    if (rig.locked) return;
    if (e.pointerType === 'mouse' && e.button !== 0 && e.button !== 2) return;
    el.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    pan = e.button === 2 || e.shiftKey;
    if (pointers.size === 2) pinch = distance();
  };
  const distance = () => {
    const [a, b] = [...pointers.values()];
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
  };
  const move = (e: PointerEvent) => {
    if (rig.locked) {
      pointers.clear();
      return;
    }
    const prev = pointers.get(e.pointerId);
    if (!prev) return;
    const dx = e.clientX - prev.x;
    const dy = e.clientY - prev.y;
    if (pointers.size === 2) {
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const d = distance();
      if (pinch > 0 && d > 0) rig.nudge({ zoom: Math.log(pinch / d) });
      pinch = d;
      // Verschieben mit zwei Fingern (halbe Bewegung, da beide Finger zählen)
      rig.nudge({ panX: (-dx / el.clientWidth) * 0.5, panZ: (dy / el.clientHeight) * 0.5 });
      return;
    }
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (Math.abs(dx) + Math.abs(dy) < 1) return;
    if (pan) rig.nudge({ panX: -dx / el.clientWidth, panZ: dy / el.clientHeight });
    else rig.nudge({ yaw: -dx * 0.006, pitch: dy * 0.004 });
  };
  const up = (e: PointerEvent) => {
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinch = 0;
  };
  const wheel = (e: WheelEvent) => {
    e.preventDefault();
    if (rig.locked) return;
    rig.nudge({ zoom: Math.max(-0.4, Math.min(0.4, e.deltaY * 0.0015)) });
  };
  const dbl = () => !rig.locked && rig.endManual();
  const menu = (e: Event) => e.preventDefault();
  const key = (e: KeyboardEvent) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    if (rig.locked) return;
    const k = e.key;
    const step = 0.12;
    if (k === 'ArrowLeft') rig.nudge({ yaw: step });
    else if (k === 'ArrowRight') rig.nudge({ yaw: -step });
    else if (k === 'ArrowUp') rig.nudge({ pitch: -step * 0.6 });
    else if (k === 'ArrowDown') rig.nudge({ pitch: step * 0.6 });
    else if (k === 'w' || k === 'W') rig.nudge({ panZ: 0.08 });
    else if (k === 's' || k === 'S') rig.nudge({ panZ: -0.08 });
    else if (k === 'a' || k === 'A') rig.nudge({ panX: -0.08 });
    else if (k === 'd' || k === 'D') rig.nudge({ panX: 0.08 });
    else if (k === '+' || k === '=') rig.nudge({ zoom: -0.15 });
    else if (k === '-' || k === '_') rig.nudge({ zoom: 0.15 });
    else if (k === ' ' || k === 'Escape') rig.endManual();
    else return;
    e.preventDefault();
  };

  el.style.touchAction = 'none';
  el.addEventListener('pointerdown', down);
  el.addEventListener('pointermove', move);
  el.addEventListener('pointerup', up);
  el.addEventListener('pointercancel', up);
  el.addEventListener('wheel', wheel, { passive: false });
  el.addEventListener('dblclick', dbl);
  el.addEventListener('contextmenu', menu);
  window.addEventListener('keydown', key);
  return () => {
    el.removeEventListener('pointerdown', down);
    el.removeEventListener('pointermove', move);
    el.removeEventListener('pointerup', up);
    el.removeEventListener('pointercancel', up);
    el.removeEventListener('wheel', wheel);
    el.removeEventListener('dblclick', dbl);
    el.removeEventListener('contextmenu', menu);
    window.removeEventListener('keydown', key);
  };
}
