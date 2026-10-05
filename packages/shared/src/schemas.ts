/**
 * Laufzeit-Validierung (zod) für alles, was von außen kommt:
 * Bibliotheks-Inhalte, Spielkonfiguration und Live-Befehle.
 */
import { z } from 'zod';
import {
  CONTENT_KINDS,
  FIELD_GAME_MODES,
  FIELD_TYPES,
  FIGURE_ACCESSORIES,
  FIGURE_BODIES,
  FIGURE_EYES,
  FIGURE_HAIR_STYLES,
  FIGURE_MOUTHS,
  PLAYER_COUNTS,
  TEAM_COLOR_KEYS,
} from './constants.ts';

const id = z.string().min(1).max(64);
const shortText = (max: number) => z.string().trim().max(max);

export const figureSchema = z.object({
  skin: z.number().int().min(0).max(20),
  hairStyle: z.enum(FIGURE_HAIR_STYLES),
  hairColor: z.number().int().min(0).max(20),
  eyes: z.enum(FIGURE_EYES),
  mouth: z.enum(FIGURE_MOUTHS),
  accessory: z.enum(FIGURE_ACCESSORIES),
  body: z.enum(FIGURE_BODIES),
  pants: z.number().int().min(0).max(20),
});

const itemBase = {
  title: shortText(160).min(1, 'Titel fehlt'),
  description: shortText(4000).default(''),
  materials: shortText(1000).default(''),
  notes: shortText(2000).default(''),
  playerCount: z.enum(PLAYER_COUNTS).default('1'),
  timerSec: z.number().int().min(5).max(3600).nullable().default(null),
  roundUse: z.boolean().default(true),
  fieldModes: z.array(z.enum(FIELD_GAME_MODES)).default([]),
};

export const contentItemInputSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('game'), ...itemBase }),
  z.object({
    kind: z.literal('choice'),
    ...itemBase,
    question: shortText(1000).min(1, 'Frage fehlt'),
    options: z.array(shortText(300).min(1)).min(2, 'Mindestens zwei Antworten').max(8),
    correctIndex: z.number().int().min(0, 'Bitte die richtige Antwort markieren (und ausfüllen)'),
  }),
  z.object({
    kind: z.literal('text'),
    ...itemBase,
    question: shortText(1000).min(1, 'Frage fehlt'),
    answers: z.array(shortText(300).min(1)).min(1, 'Mindestens eine richtige Antwort'),
  }),
  z.object({
    kind: z.literal('estimate'),
    ...itemBase,
    question: shortText(1000).min(1, 'Frage fehlt'),
    target: z.number().finite(),
    unit: shortText(40).default(''),
  }),
  z.object({
    kind: z.literal('buzzer'),
    ...itemBase,
    question: shortText(1000).min(1, 'Frage fehlt'),
    answer: shortText(500).default(''),
  }),
]);
export type ContentItemInput = z.input<typeof contentItemInputSchema>;

export const collectionInputSchema = z.object({
  name: shortText(80).min(1, 'Name fehlt'),
  description: shortText(500).default(''),
});

const range = z
  .object({ min: z.number().int().min(0).max(30), max: z.number().int().min(0).max(30) })
  .refine((r) => r.max >= r.min, 'Maximum muss ≥ Minimum sein');

export const barrierConditionSchema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('atLeast'), value: z.number().int().min(1).max(6) }),
  z.object({ mode: z.literal('atMost'), value: z.number().int().min(1).max(6) }),
  z.object({ mode: z.literal('oneOf'), values: z.array(z.number().int().min(1).max(6)).min(1).max(5) }),
]);

export const rulesSchema = z.object({
  bonusDice: z.array(z.number().int().min(0).max(20)).max(10),
  bonusOnlyForCorrect: z.boolean(),
  winRule: z.enum(['final_roll', 'reach', 'exact']),
  finalRollMin: z.number().int().min(1).max(30),
  catapultForward: range,
  catapultBackward: range,
  swapMinDistance: z.number().int().min(0).max(50),
  barrier: barrierConditionSchema,
  barrierMaxAttempts: z.number().int().min(0).max(20),
  fieldGame: z.object({
    modes: z.array(z.enum(FIELD_GAME_MODES)).min(1),
    rewardWin: z.number().int().min(0).max(30),
    penaltyLoss: z.number().int().min(0).max(30),
  }),
  volcano: z.object({
    enabled: z.boolean(),
    threshold: z.number().int().min(1).max(50),
    pressurePerRound: z.number().int().min(0).max(10),
    pressurePerField: z.number().int().min(0).max(10),
    zoneSize: z.number().int().min(1).max(60),
    knockback: range,
  }),
  // Ältere Vorlagen kennen Fluss und Krater noch nicht → Standardwerte
  river: z
    .object({
      enabled: z.boolean(),
      fallChance: z.number().int().min(0).max(100),
      driftBack: range,
    })
    .default({ enabled: true, fallChance: 50, driftBack: { min: 2, max: 4 } }),
  vine: z
    .object({
      enabled: z.boolean(),
      sides: z.number().int().min(2).max(20),
    })
    .default({ enabled: true, sides: 6 }),
  cave: z.object({ enabled: z.boolean() }).default({ enabled: true }),
  crater: z
    .object({
      enabled: z.boolean(),
      climb: z.number().int().min(1).max(40),
    })
    .default({ enabled: true, climb: 8 }),
  autoCloseWhenAllAnswered: z.boolean(),
});

export const boardSchema = z
  .object({
    fields: z.array(z.enum(FIELD_TYPES)).min(21).max(121),
    seed: z.number().int(),
  })
  .refine((b) => b.fields[0] === 'start' && b.fields[b.fields.length - 1] === 'goal', {
    message: 'Erstes Feld muss Start, letztes Feld muss Ziel sein',
  })
  .refine((b) => b.fields.slice(1, -1).every((f) => f !== 'start' && f !== 'goal'), {
    message: 'Start und Ziel dürfen nur am Anfang bzw. Ende stehen',
  });

export const gameConfigSchema = z.object({
  name: shortText(80).min(1, 'Name fehlt'),
  collectionIds: z.array(id).max(50),
  board: boardSchema,
  rules: rulesSchema,
  plan: z.array(id).max(500),
});

export const templateInputSchema = z.object({
  name: shortText(80).min(1, 'Name fehlt'),
  description: shortText(500).default(''),
  config: gameConfigSchema,
});

const rankEntry = z.object({ teamId: id, rank: z.number().int().min(1).max(10) });

/** Alle Live-Befehle. `type` bestimmt die Nutzlast. */
export const commandSchema = z.discriminatedUnion('type', [
  // Anmeldung, Teams, Spieler
  z.object({ type: z.literal('registration.set'), open: z.boolean() }),
  z.object({
    type: z.literal('player.register'),
    name: shortText(40).min(1, 'Name fehlt'),
    emoji: shortText(16).optional(),
    teamId: id.optional(),
  }),
  z.object({
    type: z.literal('player.update'),
    playerId: id,
    name: shortText(40).min(1).optional(),
    emoji: shortText(16).optional(),
    selectable: z.boolean().optional(),
    photo: z
      .string()
      .regex(/^\/media\/[a-z0-9]+\/[a-z0-9]+-[0-9a-f]+\.webp$/, 'Ungültiger Fotopfad')
      .nullable()
      .optional(),
  }),
  z.object({ type: z.literal('player.remove'), playerId: id }),
  z.object({ type: z.literal('player.assign'), playerId: id, teamId: id.nullable() }),
  z.object({
    type: z.literal('team.create'),
    name: shortText(40).optional(),
    color: z.enum(TEAM_COLOR_KEYS).optional(),
  }),
  z.object({
    type: z.literal('team.update'),
    teamId: id.optional(),
    name: shortText(40).min(1).optional(),
    color: z.enum(TEAM_COLOR_KEYS).optional(),
    figure: figureSchema.optional(),
  }),
  z.object({ type: z.literal('team.remove'), teamId: id }),
  z.object({ type: z.literal('team.regeneratePin'), teamId: id }),
  z.object({
    type: z.literal('teams.auto'),
    count: z.number().int().min(2).max(10),
    reshuffle: z.boolean().default(false),
  }),
  z.object({ type: z.literal('team.setPosition'), teamId: id, position: z.number().int().min(0).max(200) }),
  z.object({ type: z.literal('team.setBonus'), teamId: id, bonusDie: z.number().int().min(0).max(20) }),
  z.object({ type: z.literal('team.unblock'), teamId: id }),

  // Spielablauf
  z.object({ type: z.literal('game.start') }),
  z.object({ type: z.literal('game.finish'), teamId: id.optional() }),
  z.object({ type: z.literal('game.reopenLobby') }),
  z.object({
    type: z.literal('content.select'),
    source: z.enum(['manual', 'random', 'plan', 'adhoc']),
    itemId: id.optional(),
    /** Nur für source = random: auf diese Arten beschränken. */
    kinds: z.array(z.enum(CONTENT_KINDS)).max(5).optional(),
    adhoc: contentItemInputSchema.optional(),
  }),
  z.object({ type: z.literal('content.redraw'), teamId: id.optional() }),
  z.object({ type: z.literal('content.open') }),
  z.object({ type: z.literal('content.close') }),
  z.object({ type: z.literal('content.reveal') }),
  z.object({ type: z.literal('content.rank'), ranking: z.array(rankEntry).max(10) }),
  z.object({ type: z.literal('content.finish') }),
  z.object({ type: z.literal('content.abort') }),
  z.object({ type: z.literal('timer.start'), seconds: z.number().int().min(5).max(3600).optional() }),
  z.object({ type: z.literal('timer.pause') }),
  z.object({ type: z.literal('timer.add'), seconds: z.number().int().min(-600).max(600) }),
  z.object({
    type: z.literal('answer.submit'),
    teamId: id.optional(),
    value: z.union([z.number().finite(), shortText(300)]),
  }),
  z.object({ type: z.literal('answer.judge'), teamId: id, correct: z.boolean() }),
  z.object({ type: z.literal('buzz'), teamId: id.optional() }),
  z.object({ type: z.literal('buzz.judge'), teamId: id, correct: z.boolean() }),
  z.object({ type: z.literal('results.confirm') }),
  z.object({
    type: z.literal('dice.roll'),
    teamId: id.optional(),
    main: z.number().int().min(1).max(6).optional(),
    bonus: z.number().int().min(1).max(20).optional(),
    force: z.boolean().optional(),
  }),
  z.object({ type: z.literal('dice.skip') }),
  z.object({
    type: z.literal('vine.roll'),
    teamId: id.optional(),
    value: z.number().int().min(1).max(20).optional(),
    force: z.boolean().optional(),
  }),
  z.object({
    type: z.literal('fieldgame.setup'),
    itemId: id.nullable().optional(),
    mode: z.enum(FIELD_GAME_MODES).optional(),
    opponentId: id.optional(),
  }),
  z.object({ type: z.literal('fieldgame.result'), won: z.boolean() }),
  z.object({ type: z.literal('fieldgame.cancel') }),
  z.object({ type: z.literal('round.next') }),
  z.object({ type: z.literal('volcano.set'), pressure: z.number().int().min(0).max(50) }),
  z.object({ type: z.literal('volcano.erupt') }),
  z.object({ type: z.literal('plan.set'), itemIds: z.array(id).max(500) }),
  z.object({ type: z.literal('config.update'), config: gameConfigSchema }),
]);

export type Command = z.infer<typeof commandSchema>;
/** Was Clients senden (Standardwerte dürfen fehlen). */
export type CommandInput = z.input<typeof commandSchema>;
export type CommandType = Command['type'];
export type CommandOf<T extends CommandType> = Extract<Command, { type: T }>;
