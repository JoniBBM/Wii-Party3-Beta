/**
 * Geschätzte Animationsdauern auf dem Beamer (ms). Der Server sperrt den nächsten Wurf,
 * bis die Animationen voraussichtlich durch sind; der Beamer choreografiert passend dazu.
 */
import type { EffectInput } from '../types.ts';

export const DURATION = {
  dice: 2600,
  stepBase: 500,
  step: 380,
  flight: 2400,
  field: 1600,
  swap: 4200,
  barrier: 1500,
  finalRoll: 1800,
  summit: 1600,
  volcano: 1300,
  eruption: 5200,
  fieldGame: 1200,
  riverSafe: 2400,
  riverFall: 2600,
  craterFall: 2600,
  craterClimb: 1700,
  craterOut: 1900,
  vineGrab: 1800,
  springFlight: 3200,
  planeRide: 4200,
  vineSwing: 2700,
  caveFall: 1900,
  caveSlide: 2900,
} as const;

export function effectDuration(e: EffectInput): number {
  switch (e.type) {
    case 'dice':
      return DURATION.dice;
    case 'move':
      // Katapult vorwärts: Sprungfeder; rückwärts: Flugzeug mit Fallschirm
      if (e.reason === 'catapult') return e.to > e.from ? DURATION.springFlight : DURATION.planeRide;
      if (e.reason === 'eruption' || e.reason === 'swap') return DURATION.flight;
      // Treiben im Fluss: gemächlich flussabwärts, dann ans Ufer
      if (e.reason === 'river') return DURATION.flight;
      if (e.reason === 'vine') return DURATION.vineSwing;
      if (e.reason === 'cave') return DURATION.caveSlide;
      return DURATION.stepBase + Math.abs(e.to - e.from) * DURATION.step;
    case 'field':
      return DURATION.field;
    case 'swap':
      return DURATION.swap;
    case 'barrier':
      return DURATION.barrier;
    case 'final_roll':
      return DURATION.finalRoll;
    case 'summit':
      return DURATION.summit;
    case 'volcano':
      return DURATION.volcano;
    case 'eruption':
      return DURATION.eruption;
    case 'field_game':
      return DURATION.fieldGame;
    case 'river':
      return e.result === 'fall' ? DURATION.riverFall : DURATION.riverSafe;
    case 'crater':
      return e.result === 'fall' ? DURATION.craterFall : e.result === 'out' ? DURATION.craterOut : DURATION.craterClimb;
    case 'vine':
      return e.stage === 'grab' ? DURATION.vineGrab : DURATION.dice;
    case 'cave':
      return DURATION.caveFall;
    default:
      return 0;
  }
}

export function effectsDuration(effects: readonly EffectInput[]): number {
  return effects.reduce((sum, e) => sum + effectDuration(e), 0);
}
