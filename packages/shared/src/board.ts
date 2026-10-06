/**
 * Spielfeld-Verteilung. Deterministisch: gleicher Seed + gleiche Länge = gleiches Brett.
 * Das Ergebnis wird in der Spielkonfiguration gespeichert und danach nur noch bewusst
 * (Editor oder „Neu verteilen“) geändert – nie zufällig während des Spiels.
 */
import type { FieldType } from './constants.ts';
import { islandLandmarks } from './island.ts';
import { seededRng, randInt } from './rng.ts';
import type { BoardConfig } from './types.ts';

export const DEFAULT_GOAL = 72;
export const MIN_GOAL = 20;
export const MAX_GOAL = 120;

interface Want {
  type: FieldType;
  ideal: number;
  min: number;
  max: number;
}

/** Wie viele Sonderfelder eines Typs bei gegebener Brettlänge. */
export function defaultFieldCounts(goal: number): Partial<Record<FieldType, number>> {
  return {
    catapult_forward: Math.max(1, Math.round(goal / 12)),
    catapult_backward: Math.max(1, Math.round(goal / 12)),
    swap: Math.max(1, Math.round(goal / 18)),
    barrier: Math.max(1, Math.round(goal / 18)),
    minigame: Math.max(1, Math.round(goal / 10)),
    volcano: goal >= 40 ? 3 : goal >= 25 ? 1 : 0,
    skull: goal >= 50 ? 2 : goal >= 30 ? 1 : 0,
  };
}

export function generateBoard(goal: number = DEFAULT_GOAL, seed = 1, counts = defaultFieldCounts(goal)): BoardConfig {
  goal = Math.max(MIN_GOAL, Math.min(MAX_GOAL, Math.round(goal)));
  const rng = seededRng(seed);
  const fields: FieldType[] = Array.from({ length: goal + 1 }, () => 'normal');
  fields[0] = 'start';
  fields[goal] = 'goal';
  // Fässer in der Furt und das Kraterloch liegen fest, wo die Insel sie vorgibt.
  const marks = islandLandmarks(goal);
  for (const i of marks.river) fields[i] = 'river';
  for (const i of marks.crater) fields[i] = 'crater';
  for (const i of marks.vine) fields[i] = 'vine';
  for (const i of marks.cave) fields[i] = 'cave';

  const wants: Want[] = [];
  const add = (type: FieldType, count: number, from: number, to: number) => {
    if (count <= 0 || to < from) return;
    const span = to - from;
    for (let i = 0; i < count; i++) {
      const base = from + ((i + 0.5) / count) * span;
      const jitter = (rng.next() - 0.5) * (span / count) * 0.6;
      wants.push({ type, ideal: Math.round(base + jitter), min: from, max: to });
    }
  };

  const c = counts;
  add('minigame', c.minigame ?? 0, 4, goal - 4);
  add('catapult_forward', c.catapult_forward ?? 0, 3, goal - 8);
  add('catapult_backward', c.catapult_backward ?? 0, 8, goal - 2);
  add('swap', c.swap ?? 0, 6, goal - 4);
  add('barrier', c.barrier ?? 0, 5, goal - 4);
  // Vulkanfelder liegen im oberen Teil des Bergs.
  const volcanoFrom = Math.max(4, goal - Math.max(18, Math.round(goal * 0.28)));
  add('volcano', c.volcano ?? 0, volcanoFrom, goal - 2);
  // Totenkopf-Felder in der Mitte der Strecke (dort tut der Strafweg im Vulkan am meisten weh)
  add('skull', c.skull ?? 0, Math.round(goal * 0.3), goal - 6);

  wants.sort((a, b) => a.ideal - b.ideal || a.type.localeCompare(b.type));

  const isSpecial = (pos: number) => {
    const f = fields[pos];
    return f !== undefined && f !== 'normal' && f !== 'start' && f !== 'goal';
  };
  // strict: keine zwei Sonderfelder direkt nebeneinander.
  const isFree = (pos: number, strict: boolean) =>
    pos > 0 && pos < goal && fields[pos] === 'normal' && (!strict || (!isSpecial(pos - 1) && !isSpecial(pos + 1)));

  for (const want of wants) {
    let placed = false;
    for (const strict of [true, false]) {
      for (let d = 0; d <= goal && !placed; d++) {
        for (const sign of d === 0 ? [1] : [1, -1]) {
          const pos = want.ideal + d * sign;
          if (pos < want.min || pos > want.max) continue;
          if (isFree(pos, strict)) {
            fields[pos] = want.type;
            placed = true;
            break;
          }
        }
      }
      if (placed) break;
    }
  }

  return { fields, seed };
}

export function boardGoal(board: BoardConfig): number {
  return board.fields.length - 1;
}

export function fieldAt(board: BoardConfig, position: number): FieldType {
  return board.fields[position] ?? 'normal';
}

/** Länge ändern: vorhandene Verteilung wird neu erzeugt (mit gleichem Seed). */
export function resizeBoard(board: BoardConfig, goal: number): BoardConfig {
  return generateBoard(goal, board.seed);
}

export function newSeed(): number {
  return randInt({ next: Math.random }, 1, 2_000_000_000);
}

export function countFields(board: BoardConfig): Record<FieldType, number> {
  const out = {} as Record<FieldType, number>;
  for (const f of board.fields) out[f] = (out[f] ?? 0) + 1;
  return out;
}
