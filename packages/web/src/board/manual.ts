/**
 * Freie Kamera auf dem Beamer – nur nach Einschalten mit Umschalt+K (sonst bewegt die Maus nichts):
 * Maus (ziehen = drehen, rechte Taste/Umschalt = verschieben, Rad = zoomen), Touch (ein Finger
 * drehen, zwei Finger zoomen/verschieben) und Tastatur (Pfeile/WASD, +/−). Umschalt+K, Doppelklick
 * oder Leertaste/Esc = zurück zur Automatik. Während der Spielerklärung gesperrt (`rig.locked`).
 * Die Fernsteuerung aus der Regie wirkt unabhängig davon.
 */
import type { CameraRig } from './camera.ts';

export function attachManualCamera(el: HTMLElement, rig: CameraRig): () => void {
  const pointers = new Map<number, { x: number; y: number }>();
  let pan = false;
  let pinch = 0;
  /** mit Umschalt+K eingeschaltet; endet die freie Kamera (Zeitablauf, Regie), ist sie wieder aus */
  let active = false;
  const on = () => {
    if (!rig.manual) active = false;
    return active && !rig.locked;
  };
  const stop = () => {
    active = false;
    pointers.clear();
    rig.endManual();
  };

  const down = (e: PointerEvent) => {
    if (!on()) return;
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
    if (!on()) {
      pointers.clear();
      return;
    }
    const prev = pointers.get(e.pointerId);
    if (!prev) return;
    // Maustaste längst losgelassen (z. B. beim Wechsel ins Vollbild verloren gegangen) → nicht weiterdrehen
    if (e.pointerType === 'mouse' && e.buttons === 0) {
      pointers.delete(e.pointerId);
      return;
    }
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
    if (!on()) return;
    e.preventDefault();
    rig.nudge({ zoom: Math.max(-0.4, Math.min(0.4, e.deltaY * 0.0015)) });
  };
  const dbl = () => on() && stop();
  const menu = (e: Event) => e.preventDefault();
  const key = (e: KeyboardEvent) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    if (rig.locked) return;
    const k = e.key;
    if (e.shiftKey && (k === 'K' || k === 'k')) {
      e.preventDefault();
      if (on()) stop();
      else {
        active = true;
        rig.beginManual(60);
      }
      return;
    }
    if (!on()) return;
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
    else if (k === ' ' || k === 'Escape') stop();
    else return;
    e.preventDefault();
  };

  const blur = () => pointers.clear();
  el.style.touchAction = 'none';
  window.addEventListener('blur', blur);
  window.addEventListener('pointerup', up);
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
    window.removeEventListener('blur', blur);
    window.removeEventListener('pointerup', up);
  };
}
