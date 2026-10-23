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
import { buildBoard, defaultFieldCounts, MAX_GOAL, MIN_GOAL } from '../board.ts';
import { MIX_FIELD_TYPES, type MixFieldType } from '../constants.ts';
import type { FieldMix, GameConfig, GameState } from '../types.ts';
import { randInt, type Rng } from '../rng.ts';
import type { CommandOf } from '../schemas.ts';
import { fail, goalOf, type Tx } from './tx.ts';

/** Stärkste Neigung eines Würfels bei t = ±1 – bewusst gering, damit es niemandem auffällt. */
const BETA_MAX = 0.35;
/** Erste Schätzung für die Dauer einer Runde (Inhalt + Würfeln) bei 4 Teams, bis echte Runden gemessen sind. */
export const ROUND_MINUTES_GUESS = 5;
/** Runde = Inhalt (~2,3 Min.) + Würfeln (~0,35 Min. je Team) + Feld-Minispiele (~3 Min. je Spiel) */
const ROUND_BASE_MIN = 2.3;
const ROUND_PER_TEAM_MIN = 0.35;
const FIELD_GAME_MIN = 3;
/** Feld-Minispiele je Runde ≈ 0,65 × Teams × Anteil der Minispiel-Felder (Simulation) */
const FIELD_GAME_RATE = 0.65;
/**
 * Wie stark ein Sonderfeld die Zahl der Runden verändert, je Vielfaches der Standardmenge
 * (Simulation, 60 Felder, 4 Teams): Katapult vorwärts und gewonnene Minispiele beschleunigen,
 * Totenkopf, Vulkan, Katapult rückwärts und Sperren bremsen. Platztausch gleicht sich aus.
 */
const MIX_EFFECT: Record<MixFieldType, number> = {
  minigame: -0.055,
  catapult_forward: -0.074,
  catapult_backward: 0.037,
  swap: 0,
  barrier: 0.027,
  volcano: 0.059,
  skull: 0.079,
};
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
function finalWait(config: GameConfig, t: number): number {
  const rules = config.rules;
  if (rules.winRule !== 'final_roll') return 0;
  // niedrigerer Mindestwurf = kürzeres Warten (gemessen für Mindestwurf 6)
  const base = FINAL_WAIT_GUESS * Math.pow(1 / Math.max(0.5, 7 - rules.finalRollMin), 0.8);
  return base * Math.pow(sixChance(0) / sixChance(t), 0.6);
}

/** Sonderfelder des Bretts im Verhältnis zur Standardmenge (1 = normal). */
function boardMix(config: GameConfig): Record<MixFieldType, number> {
  const goal = config.board.fields.length - 1;
  const base = defaultFieldCounts(goal);
  const out = {} as Record<MixFieldType, number>;
  for (const t of MIX_FIELD_TYPES) {
    const count = config.board.fields.filter((f) => f === t).length;
    const def = base[t] ?? 0;
    out[t] = def > 0 ? count / def : 1;
  }
  return out;
}

/** Vorankommen je Runde (normales Tempo) für dieses Brett – Schätzwert vor dem Spiel. */
function pathSpeedGuess(config: GameConfig): number {
  const mix = boardMix(config);
  let rounds = 1;
  for (const t of MIX_FIELD_TYPES) rounds += MIX_EFFECT[t] * (Math.min(3, mix[t]) - 1);
  return PATH_SPEED_GUESS / Math.max(0.7, rounds);
}

/** Geschätzte Dauer einer Runde vor dem Spiel: Teams und Minispiel-Felder machen sie länger. */
export function roundMinutesGuess(config: GameConfig, teams: number): number {
  const n = teams > 0 ? teams : 4;
  const goal = config.board.fields.length - 1;
  const minigames = config.board.fields.filter((f) => f === 'minigame').length;
  const fieldGames = Math.min(1.5, (FIELD_GAME_RATE * n * minigames) / Math.max(1, goal));
  return ROUND_BASE_MIN + ROUND_PER_TEAM_MIN * n + fieldGames * FIELD_GAME_MIN;
}

/** Wie lange dauert ein Spiel mit dieser Einrichtung bei Tempo t (Minuten; t = 0 normal)? */
export function estimateMinutes(config: GameConfig, teams: number, t = 0): number {
  const goal = config.board.fields.length - 1;
  return (goal / (pathSpeedGuess(config) * tempoFactor(t)) + finalWait(config, t)) * roundMinutesGuess(config, teams);
}

/** Spanne, die das Spiel-Tempo unauffällig abdeckt (schnellstes … langsamstes Tempo). */
export function estimateRange(config: GameConfig, teams: number): { fast: number; normal: number; slow: number } {
  return { fast: estimateMinutes(config, teams, 1), normal: estimateMinutes(config, teams, 0), slow: estimateMinutes(config, teams, -1) };
}

/**
 * Mit welchem Tempo ein Vorschlag rechnet: leicht beschleunigt statt normal – das Spielfeld wird
 * dadurch etwas länger (vorher wirkte es zu kurz), das Spiel-Tempo hat trotzdem nach beiden Seiten
 * genug Luft (schnellstes Tempo ≈ 15 % unter der Wunschdauer).
 */
export const PLAN_TEMPO = 0.3;
/** Vorschlag für Spielfeld-Länge und Sonderfelder zu einer gewünschten Spieldauer. */
export interface SetupSuggestion {
  goal: number;
  mix: FieldMix;
  /** Dauer bei normalem Tempo mit diesem Vorschlag */
  minutes: number;
  /** Wunsch liegt unter/über dem, was ein Spielfeld hergibt (das Tempo gleicht einen Teil aus) */
  limit: 'min' | 'max' | null;
}

/**
 * Kurze Spiele: weniger Bremsen und Minispiele (die kosten Zeit), lange Abende: mehr Minispiele
 * und Platztausch. Die Länge wird so gewählt, dass das Spiel bei leicht beschleunigtem Tempo
 * (PLAN_TEMPO) ungefähr passt – das Spiel-Tempo hat dann nach beiden Seiten Luft.
 */
export function suggestSetup(minutes: number, teams: number, config: GameConfig, fixedMix?: FieldMix): SetupSuggestion {
  const mix: FieldMix =
    fixedMix ??
    (minutes <= 35
      ? { skull: 0, volcano: 0.5, barrier: 0.5, catapult_backward: 0.5, minigame: 0.5 }
      : minutes <= 75
        ? {}
        : { minigame: 1.5, swap: 1.5 });
  let best: SetupSuggestion | null = null;
  for (let goal = MIN_GOAL; goal <= MAX_GOAL; goal++) {
    const est = estimateMinutes({ ...config, board: buildBoard(goal, config.board.seed, mix) }, teams, PLAN_TEMPO);
    if (!best || Math.abs(est - minutes) < Math.abs(best.minutes - minutes)) best = { goal, mix, minutes: est, limit: null };
  }
  const out = best!;
  if (out.goal === MIN_GOAL && minutes < out.minutes - 3) out.limit = 'min';
  if (out.goal === MAX_GOAL && minutes > out.minutes + 3) out.limit = 'max';
  return out;
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
  const roundGuess = roundMinutesGuess(s.config, s.teams.length);
  const roundMin = measuredRound ? (roundGuess * 2 + measuredRound * rounds) / (2 + rounds) : roundGuess;

  // Vorankommen des führenden Teams je Runde bei normalem Tempo: gemessen (Tempo herausgerechnet,
  // nur Runden, bevor jemand am Ziel war), anfangs mit dem Schätzwert gemischt
  const speedGuess = pathSpeedGuess(s.config);
  let pathSpeed = speedGuess;
  let lead = 0;
  let normalRounds = 0;
  let pathRounds = 0;
  for (const h of s.history) {
    if (lead >= goal) break;
    lead = Math.max(lead, ...Object.values(h.positions));
    normalRounds += tempoFactor(h.tempo ?? 0);
    pathRounds += 1;
  }
  if (pathRounds > 0) pathSpeed = (speedGuess * 2 + (lead / Math.max(0.5, normalRounds)) * pathRounds) / (2 + pathRounds);
  pathSpeed = Math.max(1, pathSpeed);

  const remainingFields = Math.max(0, goal - Math.max(0, ...s.teams.map((t) => t.position)));
  /** noch zu spielende Runden bei Tempo t */
  const roundsLeft = (t: number) => remainingFields / (pathSpeed * tempoFactor(t)) + finalWait(s.config, t);
  // Manuell eingerichtet (Tempo aus): reine Zufallswürfe, keine Zielzeit
  const enabled = s.config.tempoEnabled !== false;
  const target = enabled ? (s.config.targetMinutes ?? null) : null;
  const manual = enabled ? (s.tempo?.manual ?? 0) : 0;

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
  if (cmd.enabled !== undefined) s.config.tempoEnabled = cmd.enabled;
  if (!s.config.tempoEnabled) {
    if (cmd.enabled === undefined) fail('Das Spiel-Tempo ist ausgeschaltet (manuell eingerichtet)');
    s.config.targetMinutes = null;
    s.tempo.manual = 0;
    tx.label = 'Spiel-Tempo aus';
    return;
  }
  if (cmd.targetMinutes !== undefined) s.config.targetMinutes = cmd.targetMinutes;
  if (cmd.manual !== undefined) s.tempo.manual = cmd.manual;
  tx.label = s.config.targetMinutes ? `Spieldauer: ca. ${s.config.targetMinutes} Minuten` : `Tempo: ${tempoLabel(clamp(s.tempo.manual / 2))}`;
}
