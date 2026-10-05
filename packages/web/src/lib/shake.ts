/**
 * Schütteln zum Würfeln über den Bewegungssensor des Handys.
 * Browser liefern Sensordaten nur über eine sichere Verbindung (HTTPS, z. B. im Online-Modus)
 * und auf dem iPhone erst nach einer Erlaubnis – ohne Sensor bleibt der Knopf.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

export type ShakeState = 'unsupported' | 'ask' | 'waiting' | 'on' | 'denied';

type PermissionFn = () => Promise<'granted' | 'denied'>;

function permissionFn(): PermissionFn | null {
  const dme = (globalThis as { DeviceMotionEvent?: { requestPermission?: PermissionFn } }).DeviceMotionEvent;
  return typeof dme?.requestPermission === 'function' ? dme.requestPermission.bind(dme) : null;
}

function initialState(): ShakeState {
  if (typeof window === 'undefined' || !window.isSecureContext || typeof DeviceMotionEvent === 'undefined') return 'unsupported';
  if (permissionFn()) {
    try {
      if (window.sessionStorage.getItem('insel.shake') === 'granted') return 'waiting';
    } catch {
      /* privater Modus */
    }
    return 'ask';
  }
  return 'waiting';
}

/**
 * @param active nur dann wird gelauscht (z. B. wenn das Team dran ist)
 * @param onShake wird einmal pro Schüttel-Geste aufgerufen
 */
export function useShake(active: boolean, onShake: () => void) {
  const [state, setState] = useState<ShakeState>(initialState);
  const [level, setLevel] = useState(0);
  const cb = useRef(onShake);
  cb.current = onShake;

  const enable = useCallback(async () => {
    const ask = permissionFn();
    if (!ask) return;
    try {
      const res = await ask();
      if (res === 'granted') {
        try {
          window.sessionStorage.setItem('insel.shake', 'granted');
        } catch {
          /* egal */
        }
        setState('waiting');
      } else setState('denied');
    } catch {
      setState('denied');
    }
  }, []);

  useEffect(() => {
    if (!active || (state !== 'waiting' && state !== 'on')) return;
    let prev: { x: number; y: number; z: number } | null = null;
    let hits: number[] = [];
    let last = 0;
    let decay = 0;
    const onMotion = (e: DeviceMotionEvent) => {
      const a = e.accelerationIncludingGravity ?? e.acceleration;
      if (!a || a.x === null || a.y === null || a.z === null) return;
      if (state === 'waiting') setState('on');
      const cur = { x: a.x, y: a.y, z: a.z };
      if (prev) {
        const d = Math.hypot(cur.x - prev.x, cur.y - prev.y, cur.z - prev.z);
        const now = performance.now();
        if (d > 14) hits.push(now);
        hits = hits.filter((t) => now - t < 700);
        const l = Math.min(1, hits.length / 4);
        if (Math.abs(l - decay) > 0.1) {
          decay = l;
          setLevel(l);
        }
        if (hits.length >= 4 && now - last > 1500) {
          last = now;
          hits = [];
          setLevel(0);
          try {
            navigator.vibrate?.(80);
          } catch {
            /* nicht unterstützt */
          }
          cb.current();
        }
      }
      prev = cur;
    };
    window.addEventListener('devicemotion', onMotion);
    return () => {
      window.removeEventListener('devicemotion', onMotion);
      setLevel(0);
    };
  }, [active, state]);

  return { state, level, enable };
}
