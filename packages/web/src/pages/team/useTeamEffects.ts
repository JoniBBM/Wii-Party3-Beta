/** Effekte fürs Handy: Vibration bei „Ihr seid dran“, Würfelergebnis, Hinweise zu Sonderfeldern. */
import { useEffect } from 'react';
import { create } from 'zustand';
import { effectDuration, FIELD_INFO, type Effect } from '@insel/shared';
import { onEffects } from '../../lib/live.ts';
import { toast } from '../../ui/toast.tsx';

type DiceEffect = Extract<Effect, { type: 'dice' }>;

export const useTeamFx = create<{ lastDice: DiceEffect | null; turnPing: number }>(() => ({ lastDice: null, turnPing: 0 }));

function vibrate(pattern: number | number[]) {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    /* nicht unterstützt */
  }
}

let audio: AudioContext | null = null;
function ping() {
  try {
    audio ??= new AudioContext();
    const o = audio.createOscillator();
    const g = audio.createGain();
    o.type = 'triangle';
    o.frequency.setValueAtTime(660, audio.currentTime);
    o.frequency.exponentialRampToValueAtTime(990, audio.currentTime + 0.12);
    g.gain.setValueAtTime(0.0001, audio.currentTime);
    g.gain.exponentialRampToValueAtTime(0.2, audio.currentTime + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + 0.35);
    o.connect(g).connect(audio.destination);
    o.start();
    o.stop(audio.currentTime + 0.4);
  } catch {
    /* kein Audio */
  }
}

/**
 * Effekte kommen gebündelt an, der Beamer spielt sie aber nacheinander ab. Damit Hinweise am
 * Handy nicht vorauseilen, wird jeder Effekt erst nach der geschätzten Dauer der vorherigen
 * Effekte gezeigt (dieselben Dauern, mit denen der Server das nächste Würfeln freigibt).
 */
export function useTeamEffects(teamId: string | null) {
  useEffect(() => {
    if (!teamId) return;
    const timers = new Set<number>();
    const later = (ms: number, fn: () => void) => {
      const id = window.setTimeout(() => {
        timers.delete(id);
        fn();
      }, Math.max(0, ms));
      timers.add(id);
    };
    const off = onEffects((effects) => {
      let t = 0;
      for (const e of effects) {
        const at = t;
        t += effectDuration(e);
        switch (e.type) {
          case 'turn':
            if (e.teamId === teamId)
              later(at, () => {
                vibrate([80, 60, 80]);
                ping();
                useTeamFx.setState((s) => ({ turnPing: s.turnPing + 1 }));
              });
            break;
          case 'dice':
            if (e.teamId === teamId) useTeamFx.setState({ lastDice: e });
            break;
          case 'field':
            if (e.teamId === teamId && e.field !== 'minigame') later(at + 600, () => toast.info(`${FIELD_INFO[e.field].icon} ${FIELD_INFO[e.field].label}${e.text ? `: ${e.text}` : ''}`));
            break;
          case 'swap':
            if (e.b === teamId) later(at + 800, () => toast.info('🔄 Ein anderes Team hat mit euch den Platz getauscht!'));
            break;
          case 'eruption':
            if (e.affected.some((a) => a.teamId === teamId))
              later(at + 1600, () => {
                vibrate([200, 100, 200, 100, 400]);
                toast.error('🌋 Der Vulkan ist ausgebrochen – ihr werdet zurückgeworfen!');
              });
            break;
          case 'river':
            if (e.teamId !== teamId) break;
            if (e.result === 'fall')
              later(at + 1500, () => {
                vibrate([150, 80, 150]);
                toast.error('💦 Platsch! Ihr seid von den Fässern gefallen und treibt zurück.');
              });
            else later(at + 1500, () => toast.success('🛢️ Geschafft – ihr balanciert sicher über die Fässer!'));
            break;
          case 'crater':
            if (e.teamId !== teamId) break;
            if (e.result === 'fall')
              later(at + 1200, () => {
                vibrate([200, 100, 200]);
                toast.error(`🕳️ Ihr seid in den Krater gefallen! Zum Herausklettern braucht ihr ${e.need} Augen.`);
              });
            else if (e.result === 'climb') later(at + 600, () => toast.info(`🧗 ${e.climbed} von ${e.need} Augen – noch ${e.need - e.climbed}!`));
            else later(at + 800, () => toast.success('🧗 Ihr seid wieder aus dem Krater heraus!'));
            break;
          case 'vine':
            if (e.teamId === teamId && e.stage === 'grab')
              later(at + 400, () => {
                vibrate([80, 60, 80]);
                ping();
              });
            break;
          case 'cave':
            if (e.teamId === teamId)
              later(at + 1200, () => {
                vibrate([200, 100, 200]);
                toast.error('🦇 Ihr seid in die Lavahöhle gefallen und rutscht zum Vulkanfuß hinunter!');
              });
            break;
          case 'buzz':
            if (e.teamId === teamId) vibrate(120);
            break;
          case 'victory':
            later(at, () => vibrate(e.teamId === teamId ? [100, 50, 100, 50, 300] : 60));
            break;
        }
      }
    });
    return () => {
      void off();
      for (const id of timers) clearTimeout(id);
      timers.clear();
    };
  }, [teamId]);
}
