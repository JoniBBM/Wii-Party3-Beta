import type {
  ContentKind,
  FieldGameMode,
  FieldType,
  FIGURE_ACCESSORIES,
  FIGURE_BODIES,
  FIGURE_EYES,
  FIGURE_HAIR_STYLES,
  FIGURE_MOUTHS,
  PlayerCount,
  TeamColorKey,
} from './constants.ts';

// ---------------------------------------------------------------------------
// Inhalte (Bibliothek)
// ---------------------------------------------------------------------------

export interface ContentItemBase {
  id: string;
  collectionId: string;
  kind: ContentKind;
  title: string;
  /** Regeln / Vorlesetext. Wird auf dem Beamer und beim Moderator gezeigt. */
  description: string;
  /** Benötigtes Material (nur Spiele). */
  materials: string;
  /** Interne Hinweise – nur Regie & Moderator. */
  notes: string;
  playerCount: PlayerCount;
  /** Countdown in Sekunden, null = kein Countdown. */
  timerSec: number | null;
  /** Darf in normalen Runden gezogen werden. */
  roundUse: boolean;
  /** Feld-Minispiel-Modi, leer = kein Feld-Minispiel. */
  fieldModes: FieldGameMode[];
  createdAt: number;
  updatedAt: number;
}

export interface GameItem extends ContentItemBase {
  kind: 'game';
}
export interface ChoiceItem extends ContentItemBase {
  kind: 'choice';
  question: string;
  options: string[];
  correctIndex: number;
}
export interface TextItem extends ContentItemBase {
  kind: 'text';
  question: string;
  /** Akzeptierte Antworten (Varianten). Vergleich ist tolerant. */
  answers: string[];
}
export interface EstimateItem extends ContentItemBase {
  kind: 'estimate';
  question: string;
  target: number;
  unit: string;
}
export interface BuzzerItem extends ContentItemBase {
  kind: 'buzzer';
  question: string;
  answer: string;
}

export type ContentItem = GameItem | ChoiceItem | TextItem | EstimateItem | BuzzerItem;
export type QuestionItem = ChoiceItem | TextItem | EstimateItem | BuzzerItem;

export interface Collection {
  id: string;
  name: string;
  description: string;
  itemCount?: number;
  createdAt: number;
  updatedAt: number;
}

// ---------------------------------------------------------------------------
// Konfiguration eines Spiels (auch als Vorlage speicherbar)
// ---------------------------------------------------------------------------

export interface Range {
  min: number;
  max: number;
}

export type BarrierCondition =
  | { mode: 'atLeast'; value: number }
  | { mode: 'atMost'; value: number }
  | { mode: 'oneOf'; values: number[] };

export type WinRule = 'final_roll' | 'reach' | 'exact';

export interface Rules {
  /** Bonuswürfel-Seiten nach Platz (Index 0 = Platz 1). 0 = kein Bonus. */
  bonusDice: number[];
  /** Bei Fragen bekommen nur richtige Antworten Bonuswürfel. */
  bonusOnlyForCorrect: boolean;
  winRule: WinRule;
  /** Mindestwurf auf dem Ziel (nur winRule = final_roll). */
  finalRollMin: number;
  catapultForward: Range;
  catapultBackward: Range;
  swapMinDistance: number;
  barrier: BarrierCondition;
  /** Nach so vielen Fehlversuchen öffnet sich die Sperre automatisch (0 = nie). */
  barrierMaxAttempts: number;
  fieldGame: {
    modes: FieldGameMode[];
    rewardWin: number;
    penaltyLoss: number;
  };
  volcano: {
    enabled: boolean;
    threshold: number;
    pressurePerRound: number;
    pressurePerField: number;
    /** Teams auf den letzten `zoneSize` Feldern (inkl. Gipfel) werden getroffen. */
    zoneSize: number;
    knockback: Range;
  };
  /** Fässer in der Flussfurt */
  river: {
    enabled: boolean;
    /** Wahrscheinlichkeit in Prozent, ins Wasser zu fallen */
    fallChance: number;
    /** So viele Felder spült die Strömung zurück */
    driftBack: Range;
  };
  /** Liane am Anfang: noch einmal würfeln und so weit nach vorne schwingen */
  vine: {
    enabled: boolean;
    /** Seitenzahl des Lianen-Würfels */
    sides: number;
  };
  /** Lavahöhle an den Serpentinen: hineinfallen, zum Vulkanfuß hinunterrutschen */
  cave: {
    enabled: boolean;
  };
  /** Loch am Kraterrand */
  crater: {
    enabled: boolean;
    /** So viele Augen (über mehrere Würfe) braucht es, um herauszuklettern */
    climb: number;
  };
  /** Antworten automatisch schließen, sobald alle Teams geantwortet haben. */
  autoCloseWhenAllAnswered: boolean;
}

export interface BoardConfig {
  /** Feldtypen, Index = Feldnummer. fields[0] = start, fields[last] = goal. */
  fields: FieldType[];
  /** Seed für die Verteilung (nur zur Nachvollziehbarkeit / „neu verteilen“). */
  seed: number;
}

/**
 * Wie die Handys genutzt werden:
 * - personal: Jede Person meldet sich am eigenen Handy an (das Handy gehört dann zu ihr).
 * - shared: Anmeldestation – an einem Gerät melden sich alle nacheinander an; danach
 *   verbindet sich pro Team ein gemeinsames Gerät mit der Team-PIN.
 */
export type DeviceMode = 'personal' | 'shared';

export interface GameConfig {
  name: string;
  devices: DeviceMode;
  collectionIds: string[];
  board: BoardConfig;
  rules: Rules;
  /** Ablaufplan: geordnete Inhalts-IDs. */
  plan: string[];
}

export interface Template {
  id: string;
  name: string;
  description: string;
  config: GameConfig;
  createdAt: number;
  updatedAt: number;
}

// ---------------------------------------------------------------------------
// Laufender Spielzustand
// ---------------------------------------------------------------------------

export interface FigureConfig {
  skin: number;
  hairStyle: (typeof FIGURE_HAIR_STYLES)[number];
  hairColor: number;
  eyes: (typeof FIGURE_EYES)[number];
  mouth: (typeof FIGURE_MOUTHS)[number];
  accessory: (typeof FIGURE_ACCESSORIES)[number];
  body: (typeof FIGURE_BODIES)[number];
  pants: number;
}

export interface Team {
  id: string;
  name: string;
  color: TeamColorKey;
  position: number;
  /** Bonuswürfel für die laufende Würfelrunde (Seitenzahl, 0 = keiner). */
  bonusDie: number;
  /** Gefangen in einer Sperre. */
  blocked: null | { attempts: number; since: number };
  /** In den Krater gefallen: gesammelte Augen beim Herausklettern. */
  crater: null | { climbed: number; need: number };
  figure: FigureConfig;
  /** 4-stellige PIN zum Beitreten. */
  pin: string;
  /** Geheimer Token für den Team-QR-Code. */
  joinToken: string;
  createdAt: number;
}

export interface Player {
  id: string;
  name: string;
  teamId: string | null;
  emoji: string;
  /** Pfad zum Foto (z. B. /media/<game>/<id>.webp) oder null. */
  photo: string | null;
  /** Darf für Minispiele ausgelost werden. */
  selectable: boolean;
  /** Wie oft schon ausgelost (faire Rotation). */
  playCount: number;
  createdAt: number;
}

export interface Timer {
  durationMs: number;
  /** Zeitpunkt des (Re-)Starts, null = pausiert / nicht gestartet. */
  startedAt: number | null;
  /** Restzeit zum Zeitpunkt `startedAt` bzw. beim Pausieren. */
  remainingMs: number;
}

export interface TeamAnswer {
  /** Index (choice), Text (text) oder Zahl (estimate). */
  value: number | string;
  at: number;
  byPlayerId: string | null;
  /** Automatisch bewertet; null = (noch) unbewertet. */
  correct: boolean | null;
  /** Von Regie/Moderator manuell gesetzt. */
  overridden: boolean;
}

export interface RankEntry {
  teamId: string;
  rank: number;
}

export type ContentStage = 'intro' | 'open' | 'closed' | 'revealed';

export interface ActiveContent {
  item: ContentItem;
  source: 'manual' | 'random' | 'plan' | 'adhoc';
  stage: ContentStage;
  drawn: Record<string, string[]>;
  timer: Timer | null;
  answers: Record<string, TeamAnswer>;
  buzzQueue: { teamId: string; at: number }[];
  /** Buzzer-Bewertung pro Team: true = richtig, false = falsch. */
  buzzJudged: Record<string, boolean>;
  /** Eingetragene/berechnete Platzierung. */
  ranking: RankEntry[] | null;
  startedAt: number;
  /** Stand des Ablaufplans vor der Auswahl (für Abbrechen/Ersetzen). */
  planIndexBefore: number;
}

export interface ResultEntry {
  teamId: string;
  rank: number;
  bonusDie: number;
  correct: boolean | null;
  /** Kurzinfo, z. B. Schätzwert oder Antwort. */
  detail: string;
}

export interface RoundResults {
  itemId: string;
  title: string;
  kind: ContentKind;
  entries: ResultEntry[];
  /** Würfelreihenfolge (fix, Gleichstände ausgelost). */
  order: string[];
}

export interface RollRecord {
  teamId: string;
  main: number;
  bonus: number;
  bonusDie: number;
  total: number;
  from: number;
  to: number;
  outcome: string;
  manual: boolean;
  at: number;
}

export interface FieldGame {
  teamId: string;
  position: number;
  stage: 'choose' | 'running';
  mode: FieldGameMode | null;
  opponentIds: string[];
  item: ContentItem | null;
  drawn: Record<string, string[]>;
}

export interface DiceRound {
  order: string[];
  index: number;
  rolls: RollRecord[];
  fieldGame: FieldGame | null;
  /** Team hängt an der Liane und muss noch den Lianen-Würfel werfen. */
  vine?: { teamId: string; position: number } | null;
  /** Bis zu diesem Zeitpunkt laufen auf dem Beamer noch Animationen. */
  busyUntil: number;
}

export type Phase =
  | { name: 'lobby' }
  | { name: 'idle' }
  | { name: 'content'; content: ActiveContent }
  | { name: 'results'; results: RoundResults }
  | { name: 'dice'; dice: DiceRound; results: RoundResults | null }
  | { name: 'round_end'; summary: RoundSummary }
  | { name: 'finished' };

export type PhaseName = Phase['name'];

export interface RoundSummary {
  round: number;
  title: string;
  moves: { teamId: string; from: number; to: number }[];
  eruption: boolean;
}

export interface HistoryEntry {
  round: number;
  itemId: string | null;
  title: string;
  kind: ContentKind | null;
  ranking: { teamId: string; rank: number; bonusDie: number }[];
  /** Positionen aller Teams nach der Würfelrunde. */
  positions: Record<string, number>;
  rolls: { teamId: string; total: number }[];
  at: number;
}

export interface FeedEntry {
  id: number;
  at: number;
  icon: string;
  text: string;
  teamId?: string;
}

export interface GameState {
  id: string;
  rev: number;
  status: 'lobby' | 'running' | 'finished';
  config: GameConfig;
  /** Öffentliche Spieler-Anmeldung offen. */
  registrationOpen: boolean;
  teams: Team[];
  players: Player[];
  round: number;
  phase: Phase;
  volcano: { pressure: number; eruptions: number };
  playedItemIds: string[];
  planIndex: number;
  history: HistoryEntry[];
  feed: FeedEntry[];
  feedSeq: number;
  winnerTeamId: string | null;
  createdAt: number;
  updatedAt: number;
}

// ---------------------------------------------------------------------------
// Effekte: Ereignisse für Animationen, Sounds und Hinweise (nicht Teil des Zustands)
// ---------------------------------------------------------------------------

export type MoveReason = 'dice' | 'catapult' | 'reward' | 'penalty' | 'eruption' | 'swap' | 'correction' | 'river' | 'vine' | 'cave';

export type EffectInput =
  | { type: 'dice'; teamId: string; main: number; bonus: number; bonusDie: number; total: number; manual: boolean }
  | { type: 'move'; teamId: string; from: number; to: number; reason: MoveReason }
  | { type: 'field'; teamId: string; field: FieldType; position: number; text: string }
  | { type: 'swap'; a: string; b: string; posA: number; posB: number }
  | { type: 'barrier'; teamId: string; roll: number; result: 'blocked' | 'stuck' | 'released' | 'opened' }
  /** Fässer im Fluss: gehalten oder ins Wasser gefallen (dann folgt ein move mit reason 'river'). */
  | { type: 'river'; teamId: string; position: number; result: 'safe' | 'fall' }
  /** Liane: gepackt (wartet auf den Lianen-Wurf) bzw. geschwungen (danach folgt ein move mit reason 'vine'). */
  | { type: 'vine'; teamId: string; position: number; stage: 'grab' | 'swing'; roll: number; sides: number }
  /** Lavahöhle: hineingefallen (danach folgt ein move mit reason 'cave' zum Ausgang). */
  | { type: 'cave'; teamId: string; position: number }
  /** Krater: hineingefallen, ein Stück geklettert oder wieder draußen. */
  | { type: 'crater'; teamId: string; position: number; result: 'fall' | 'climb' | 'out'; roll: number; climbed: number; need: number }
  | { type: 'final_roll'; teamId: string; roll: number; needed: number; success: boolean }
  | { type: 'summit'; teamId: string }
  | { type: 'volcano'; pressure: number; threshold: number }
  | { type: 'eruption'; affected: { teamId: string; from: number; to: number }[] }
  | { type: 'victory'; teamId: string }
  | { type: 'content'; stage: ContentStage; kind: ContentKind; title: string }
  | { type: 'answer'; teamId: string }
  | { type: 'buzz'; teamId: string; position: number }
  | { type: 'buzz_judged'; teamId: string; correct: boolean }
  | { type: 'results' }
  | { type: 'turn'; teamId: string }
  | { type: 'field_game'; teamId: string; stage: 'pending' | 'running' | 'won' | 'lost' | 'cancelled' }
  | { type: 'round_end'; round: number }
  | { type: 'drawn' }
  | { type: 'timer'; action: 'start' | 'pause' | 'end' }
  | { type: 'undo' };

export type Effect = EffectInput & { id: number; at: number };

// ---------------------------------------------------------------------------
// Rollen & Akteure
// ---------------------------------------------------------------------------

export type Role = 'admin' | 'moderator' | 'beamer' | 'team' | 'player' | 'guest';

export interface Actor {
  role: Role;
  teamId?: string | null;
  playerId?: string | null;
  /** Systemaktionen (z. B. Timer abgelaufen). */
  system?: boolean;
}

export interface Session {
  role: Role;
  gameId?: string | null;
  teamId?: string | null;
  playerId?: string | null;
  /** Team-Geräte: Fingerabdruck des Team-Schlüssels (neue PIN sperrt alte Geräte aus). */
  key?: string | null;
}
