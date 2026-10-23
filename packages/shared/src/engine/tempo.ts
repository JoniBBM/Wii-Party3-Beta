/**
 * Spiel-Tempo: Die Spielleitung legt vorab fest, wie lange das Spiel ungefähr dauern soll (oder
 * stellt es während des Spiels schneller/langsamer). Daraus ergibt sich je Würfelrunde ein Tempo
 * t ∈ [−1, +1]:
 *
 *  - Würfel (Haupt- und Bonuswürfel, Liane, Lavahöhle) zeigen bei t > 0 etwas öfter hohe Augen,
 *    bei t < 0 etwas öfter niedrige – jede Zahl bleibt möglich (Ø 3,5 → höchstens ca. 4,45 bzw. 2,55).
 *  - Gefahren werden etwas gnädiger bzw. strenger: Einbruch am Wasserfall, Katapult-Weiten.
 *
 * Fair: Das Tempo wird beim Start der Würfelrunde einmal berechnet und gilt für alle Teams gleich
 * – es hängt nur von Zeit und Gesamtfortschritt ab, nie vom Platz eines Teams. Teams und Beamer
 * sehen weder Zielzeit noch Tempo (siehe projectState). Von der Regie eingetragene echte Würfe
 * bleiben unverändert.
 */
import type { GameState } from '../types.ts';
import { randInt, type Rng } from '../rng.ts';
import type { CommandOf } from '../schemas.ts';
import { fail, goalOf, type Tx } from './tx.ts';

/** Stärkste Neigung eines Würfels bei t = ±1 – bewusst gering, damit es niemandem auffällt. */
const BETA_MAX = 0.35;
/** Erste Schätzung für die Dauer einer Runde (Inhalt + Würfeln), bis echte Runden gemessen sind. */
export const ROUND_MINUTES_GUESS = 5;
/**
 * Felder je Runde für das führende Team bei normalem Tempo – gemessen in Simulationen ganzer
 * Spiele mit den Standardregeln (Gefahrenfelder, Vulkan, Bonuswürfel bei ~50 % richtigen
 * Antworten): 4,3–5,1 je nach Spielfeld und Teamzahl. Im Spiel wird nachgemessen.
 */
const PATH_SPEED_GUESS = 4.8;
/** Runden am Ziel bis zum gelungenen Siegeswurf (Standardregeln: mindestens 6, mit Bonuswürfeln) – gemessen ~2,5. */
const FINAL_WAIT_GUESS = 2.5;

const clamp = (v: number, lo = -1, hi = 1) => Math.min(hi, Math.max(lo, v));

function weights(sides: number, t: number): number[] {
  const beta = BETA_MAX * clamp(t) * (5 / Math.max(1, sides - 1));
  const mid = (sides + 1) / 2;
  return Array.from({ length: sides }, (_, i) => Math.exp(beta * (i + 1 - mid)));
}

/** Würfel mit Tempo-Neigung. t = 0 (normal) ist exakt ein gewöhnlicher Würfel. */
export function tempoDie(rng: Rng, sides: number, t = 0): number {
  if (!t || sides <= 1) return randInt(rng, 1, sides);
  const w = weights(sides, t);
  let r = rng.next() * w.reduce((a, b) => a + b, 0);
  for (let i = 0; i < sides; i++) {
    r -= w[i]!;
    if (r < 0) return i + 1;
  }
  return sides;
}

/** Ganzzahl in [min, max] mit Neigung: `dir` +1 = bei schnellem Tempo eher groß, −1 = eher klein. */
export function tempoInt(rng: Rng, min: number, max: number, t: number, dir: 1 | -1): number {
  if (max <= min) return min;
  return min - 1 + tempoDie(rng, max - min + 1, t * dir);
}

/** Einbruch-Wahrscheinlichkeit am Wasserfall (Prozent) mit Tempo: schnell = seltener, langsam = öfter. */
export function tempoChance(percent: number, t: number): number {
  return Math.round(Math.min(95, Math.max(0, percent * (1 - 0.5 * clamp(t)))));
}

/** Erwartete Augen eines Würfels mit Tempo im Verhältnis zum normalen Würfel (1 = normal). */
export function tempoFactor(t: number, sides = 6): number {
  const w = weights(sides, t);
  const sum = w.reduce((a, b) => a + b, 0);
  const mean = w.reduce((a, x, i) => a + x * (i + 1), 0) / sum;
  return mean / ((sides + 1) / 2);
}

/** Wahrscheinlichkeit einer 6 mit Tempo */
function sixChance(t: number): number {
  const w = weights(6, t);
  return w[5]! / w.reduce((a, b) => a + b, 0);
}

/** Runden am Ziel bis zum Siegeswurf (nur Regel „Siegeswurf“) – bei schnellem Tempo weniger. */
function finalWait(s: GameState, t: number): number {
  const rules = s.config.rules;
  if (rules.winRule !== 'final_roll') return 0;
  // niedrigerer Mindestwurf = kürzeres Warten (gemessen für Mindestwurf 6)
  const base = FINAL_WAIT_GUESS * Math.pow(1 / Math.max(0.5, 7 - rules.finalRollMin), 0.8);
  return base * Math.pow(sixChance(0) / sixChance(t), 0.6);
}

export interface TempoStatus {
  /** Zielzeit in Minuten (null = ohne Vorgabe) */
  target: number | null;
  /** Handregler ohne Zielzeit (−2 … +2) */
  manual: number;
  /** Tempo für die nächste Würfelrunde (−1 … +1) */
  tempo: number;
  /** Tempo der laufenden Würfelrunde (bereits festgelegt) */
  current: number | null;
  /** gespielt seit Spielstart (Minuten) */
  elapsedMin: number;
  /** geschätzte Restdauer bei diesem Tempo (Minuten) */
  remainingMin: number;
  /** geschätzte Gesamtdauer bei diesem Tempo (Minuten) */
  totalMin: number;
  /** gemessene bzw. geschätzte Dauer einer Runde (Minuten) */
  roundMin: number;
  /** Zielzeit selbst mit vollem Tempo nicht erreichbar (bzw. nicht mit langsamstem auszufüllen) */
  outOfReach: 'too_short' | 'too_long' | null;
}

/**
 * Wie steht das Spiel im Verhältnis zur Zielzeit, und welches Tempo braucht die nächste Runde?
 * Grundlage: Felder bis zum Ziel für das führende Team, gemessenes Vorankommen und Rundendauer
 * (mit Schätzwerten, solange erst wenige Runden gespielt sind).
 */
export function tempoStatus(s: GameState, now: number): TempoStatus {
  const goal = goalOf(s);
  const started = s.tempo?.startedAt ?? null;
  const running = s.status === 'running' && started !== null;
  const elapsedMin = running ? Math.max(0, (now - started) / 60_000) : 0;
  const rounds = s.history.length;

  // Dauer einer Runde: gemessen, anfangs mit der Schätzung gemischt
  const last = s.history.at(-1);
  const measuredRound = running && rounds > 0 && last ? Math.max(1, (last.at - started) / 60_000 / rounds) : null;
  const roundMin = measuredRound ? (ROUND_MINUTES_GUESS * 2 + measuredRound * rounds) / (2 + rounds) : ROUND_MINUTES_GUESS;

  // Vorankommen des führenden Teams je Runde bei normalem Tempo: gemessen (Tempo herausgerechnet,
  // nur Runden, bevor jemand am Ziel war), anfangs mit dem Schätzwert gemischt
  let pathSpeed = PATH_SPEED_GUESS;
  let lead = 0;
  let normalRounds = 0;
  let pathRounds = 0;
  for (const h of s.history) {
    if (lead >= goal) break;
    lead = Math.max(lead, ...Object.values(h.positions));
    normalRounds += tempoFactor(h.tempo ?? 0);
    pathRounds += 1;
  }
  if (pathRounds > 0) pathSpeed = (PATH_SPEED_GUESS * 2 + (lead / Math.max(0.5, normalRounds)) * pathRounds) / (2 + pathRounds);
  pathSpeed = Math.max(1, pathSpeed);

  const remainingFields = Math.max(0, goal - Math.max(0, ...s.teams.map((t) => t.position)));
  /** noch zu spielende Runden bei Tempo t */
  const roundsLeft = (t: number) => remainingFields / (pathSpeed * tempoFactor(t)) + finalWait(s, t);
  const target = s.config.targetMinutes ?? null;
  const manual = s.tempo?.manual ?? 0;

  let tempo = 0;
  let outOfReach: TempoStatus['outOfReach'] = null;
  if (target) {
    const available = (target - elapsedMin) / roundMin;
    if (roundsLeft(1) >= available) {
      tempo = 1;
      if ((elapsedMin + roundsLeft(1) * roundMin) > target * 1.1) outOfReach = 'too_short';
    } else if (roundsLeft(-1) <= available) {
      tempo = -1;
      if ((elapsedMin + roundsLeft(-1) * roundMin) < target * 0.9) outOfReach = 'too_long';
    } else {
      // Tempo, bei dem die restlichen Runden genau in die verbleibende Zeit passen
      let lo = -1;
      let hi = 1;
      for (let i = 0; i < 30; i++) {
        const mid = (lo + hi) / 2;
        if (roundsLeft(mid) > available) lo = mid;
        else hi = mid;
      }
      tempo = (lo + hi) / 2;
    }
  } else tempo = clamp(manual / 2);

  const phase = s.phase;
  const current = phase.name === 'dice' ? (phase.dice.tempo ?? 0) : null;
  const remainingMin = s.status === 'finished' ? 0 : roundsLeft(tempo) * roundMin;
  return { target, manual, tempo, current, elapsedMin, remainingMin, totalMin: elapsedMin + remainingMin, roundMin, outOfReach };
}

/** Kurzbeschreibung eines Tempos für die Spielleitung. */
export function tempoLabel(t: number): string {
  if (t >= 0.6) return 'deutlich schneller';
  if (t >= 0.2) return 'etwas schneller';
  if (t > -0.2) return 'normal';
  if (t > -0.6) return 'etwas langsamer';
  return 'deutlich langsamer';
}

/** Zielzeit bzw. Handregler setzen – ohne Eintrag im Verlauf, damit die Teams nichts merken. */
export function handleTempoCommand(tx: Tx, cmd: CommandOf<'tempo.set'>) {
  const s = tx.s;
  if (s.status === 'finished') fail('Das Spiel ist schon beendet');
  if (cmd.targetMinutes !== undefined) s.config.targetMinutes = cmd.targetMinutes;
  if (cmd.manual !== undefined) s.tempo.manual = cmd.manual;
  tx.label = s.config.targetMinutes ? `Spieldauer: ca. ${s.config.targetMinutes} Minuten` : `Tempo: ${tempoLabel(clamp(s.tempo.manual / 2))}`;
}
