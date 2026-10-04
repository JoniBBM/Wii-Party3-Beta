import { clone } from './clone.ts';
import { generateBoard, DEFAULT_GOAL } from './board.ts';
import {
  FIGURE_ACCESSORIES,
  FIGURE_EYES,
  FIGURE_HAIR_COLORS,
  FIGURE_HAIR_STYLES,
  FIGURE_MOUTHS,
  FIGURE_PANTS,
  FIGURE_SKINS,
} from './constants.ts';
import { pick, randInt, type Rng } from './rng.ts';
import type { ContentItemInput } from './schemas.ts';
import type { ContentItem, FigureConfig, GameConfig, Rules } from './types.ts';

export const DEFAULT_RULES: Rules = {
  bonusDice: [6, 4, 2],
  bonusOnlyForCorrect: true,
  winRule: 'final_roll',
  finalRollMin: 6,
  catapultForward: { min: 3, max: 5 },
  catapultBackward: { min: 3, max: 6 },
  swapMinDistance: 3,
  barrier: { mode: 'oneOf', values: [4, 5, 6] },
  barrierMaxAttempts: 3,
  fieldGame: { modes: ['vs_all', 'duel'], rewardWin: 5, penaltyLoss: 0 },
  volcano: {
    enabled: true,
    threshold: 6,
    pressurePerRound: 1,
    pressurePerField: 2,
    zoneSize: 12,
    knockback: { min: 3, max: 6 },
  },
  autoCloseWhenAllAnswered: true,
};

export function defaultConfig(name = 'Neues Spiel', goal = DEFAULT_GOAL): GameConfig {
  return {
    name,
    collectionIds: [],
    board: generateBoard(goal, 7),
    rules: clone(DEFAULT_RULES),
    plan: [],
  };
}

export const DEFAULT_FIGURE: FigureConfig = {
  skin: 1,
  hairStyle: 'short',
  hairColor: 1,
  eyes: 'round',
  mouth: 'smile',
  accessory: 'none',
  body: 'normal',
  pants: 0,
};

export function randomFigure(rng: Rng): FigureConfig {
  return {
    skin: randInt(rng, 0, FIGURE_SKINS.length - 1),
    hairStyle: pick(rng, FIGURE_HAIR_STYLES) ?? 'short',
    hairColor: randInt(rng, 0, FIGURE_HAIR_COLORS.length - 1),
    eyes: pick(rng, FIGURE_EYES.filter((e) => e !== 'star')) ?? 'round',
    mouth: pick(rng, FIGURE_MOUTHS) ?? 'smile',
    accessory: pick(rng, FIGURE_ACCESSORIES) ?? 'none',
    body: 'normal',
    pants: randInt(rng, 0, FIGURE_PANTS.length - 1),
  };
}

/** Macht aus einer (validierten) Eingabe ein vollständiges Inhalts-Objekt. */
export function buildItem(
  input: ContentItemInput,
  meta: { id: string; collectionId: string; now: number; createdAt?: number },
): ContentItem {
  const base = {
    id: meta.id,
    collectionId: meta.collectionId,
    title: input.title.trim(),
    description: input.description ?? '',
    materials: input.materials ?? '',
    notes: input.notes ?? '',
    playerCount: input.playerCount ?? '1',
    timerSec: input.timerSec ?? null,
    roundUse: input.roundUse ?? true,
    fieldModes: input.fieldModes ?? [],
    createdAt: meta.createdAt ?? meta.now,
    updatedAt: meta.now,
  };
  switch (input.kind) {
    case 'game':
      return { ...base, kind: 'game' };
    case 'choice':
      return {
        ...base,
        kind: 'choice',
        question: input.question,
        options: input.options,
        correctIndex: Math.min(Math.max(0, input.correctIndex), input.options.length - 1),
      };
    case 'text':
      return { ...base, kind: 'text', question: input.question, answers: input.answers };
    case 'estimate':
      return { ...base, kind: 'estimate', question: input.question, target: input.target, unit: input.unit ?? '' };
    case 'buzzer':
      return { ...base, kind: 'buzzer', question: input.question, answer: input.answer ?? '' };
  }
}
