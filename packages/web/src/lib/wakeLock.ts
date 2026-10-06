/**
 * Bildschirm wach halten (Screen Wake Lock), z. B. auf dem Handy des Moderators.
 * Browser erlauben das nur über HTTPS bzw. localhost; sonst bleibt alles wie gehabt.
 * Liefert, ob der Bildschirm gerade wach gehalten wird.
 */
import { useEffect, useState } from 'react';

export function useWakeLock(active: boolean): boolean {
  const [on, setOn] = useState(false);
  useEffect(() => {
    if (!active || typeof navigator === 'undefined' || !('wakeLock' in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    let alive = true;
    const request = async () => {
      if (document.visibilityState !== 'visible' || (lock && !lock.released)) return;
      try {
        lock = await navigator.wakeLock.request('screen');
        if (!alive) {
          void lock.release().catch(() => {});
          return;
        }
        setOn(true);
        lock.addEventListener('release', () => alive && setOn(false));
      } catch {
        setOn(false);
      }
    };
    void request();
    // nach dem Wechsel in eine andere App gibt der Browser die Sperre frei – zurück: neu anfordern
    const onVisible = () => void request();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      alive = false;
      document.removeEventListener('visibilitychange', onVisible);
      void lock?.release().catch(() => {});
      setOn(false);
    };
  }, [active]);
  return on;
}
