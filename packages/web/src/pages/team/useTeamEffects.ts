/** Effekte fürs Handy: Vibration bei „Ihr seid dran“, Würfelergebnis, Hinweise zu Sonderfeldern. */
import { useEffect } from 'react';
import { create } from 'zustand';
import { FIELD_INFO, type Effect } from '@insel/shared';
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

export function useTeamEffects(teamId: string | null) {
  useEffect(() => {
    if (!teamId) return;
    return onEffects((effects) => {
      for (const e of effects) {
        switch (e.type) {
          case 'turn':
            if (e.teamId === teamId) {
              vibrate([80, 60, 80]);
              ping();
              useTeamFx.setState((s) => ({ turnPing: s.turnPing + 1 }));
            }
            break;
          case 'dice':
            if (e.teamId === teamId) useTeamFx.setState({ lastDice: e });
            break;
          case 'field':
            if (e.teamId === teamId && e.field !== 'minigame') {
              setTimeout(() => toast.info(`${FIELD_INFO[e.field].icon} ${FIELD_INFO[e.field].label}${e.text ? `: ${e.text}` : ''}`), 2400);
            }
            break;
          case 'swap':
            if (e.b === teamId) toast.info('🔄 Ein anderes Team hat mit euch den Platz getauscht!');
            break;
          case 'river':
            if (e.teamId === teamId && e.result === 'fall') {
              vibrate([150, 80, 150]);
              setTimeout(() => toast.error('💦 Platsch! Ihr seid von den Fässern gefallen und treibt zurück.'), 1800);
            } else if (e.teamId === teamId) setTimeout(() => toast.success('🛢️ Geschafft – ihr balanciert sicher über die Fässer!'), 1800);
            break;
          case 'crater':
            if (e.teamId !== teamId) break;
            if (e.result === 'fall') {
              vibrate([200, 100, 200]);
              setTimeout(() => toast.error(`🕳️ Ihr seid in den Krater gefallen! Zum Herausklettern braucht ihr ${e.need} Augen.`), 1500);
            } else if (e.result === 'climb') toast.info(`🧗 ${e.climbed} von ${e.need} Augen – noch ${e.need - e.climbed}!`);
            else toast.success('🧗 Ihr seid wieder aus dem Krater heraus!');
            break;
          case 'vine':
            if (e.teamId === teamId && e.stage === 'grab') {
              vibrate([80, 60, 80]);
              ping();
            }
            break;
          case 'cave':
            if (e.teamId === teamId) {
              vibrate([200, 100, 200]);
              setTimeout(() => toast.error('🦇 Ihr seid in die Lavahöhle gefallen und rutscht zum Vulkanfuß hinunter!'), 1500);
            }
            break;
          case 'eruption':
            if (e.affected.some((a) => a.teamId === teamId)) {
              vibrate([200, 100, 200, 100, 400]);
              toast.error('🌋 Der Vulkan ist ausgebrochen – ihr werdet zurückgeworfen!');
            }
            break;
          case 'buzz':
            if (e.teamId === teamId) vibrate(120);
            break;
          case 'victory':
            vibrate(e.teamId === teamId ? [100, 50, 100, 50, 300] : 60);
            break;
        }
      }
    });
  }, [teamId]);
}
