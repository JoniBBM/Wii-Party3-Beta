/**
 * Feste Kataloge: Teamfarben, Feldtypen, Inhaltsarten – inklusive deutscher Bezeichnungen.
 * Alles, was Server, Beamer, Regie und Handys gleich anzeigen müssen, steht hier.
 */

export const TEAM_COLORS = [
  { key: 'red', name: 'Rot', hex: '#e8423f', dark: '#a8231f' },
  { key: 'blue', name: 'Blau', hex: '#2f7de1', dark: '#1b4f99' },
  { key: 'green', name: 'Grün', hex: '#3fae4f', dark: '#22722e' },
  { key: 'yellow', name: 'Gelb', hex: '#f5c518', dark: '#a8850a' },
  { key: 'orange', name: 'Orange', hex: '#f5841f', dark: '#b2560a' },
  { key: 'purple', name: 'Lila', hex: '#8e4fd6', dark: '#5c2a99' },
  { key: 'cyan', name: 'Türkis', hex: '#1fbcc9', dark: '#0f7d87' },
  { key: 'pink', name: 'Pink', hex: '#ec5fa8', dark: '#a8316f' },
  { key: 'lime', name: 'Limette', hex: '#9ccc2c', dark: '#64870f' },
  { key: 'brown', name: 'Braun', hex: '#9a6a46', dark: '#5f3f27' },
] as const;

export type TeamColorKey = (typeof TEAM_COLORS)[number]['key'];
export const TEAM_COLOR_KEYS = TEAM_COLORS.map((c) => c.key) as TeamColorKey[];

export function teamColor(key: string) {
  return TEAM_COLORS.find((c) => c.key === key) ?? TEAM_COLORS[0];
}

export const MIN_TEAMS = 2;
export const MAX_TEAMS = 10;

export const FIELD_TYPES = [
  'start',
  'goal',
  'normal',
  'catapult_forward',
  'catapult_backward',
  'swap',
  'barrier',
  'minigame',
  'volcano',
] as const;
export type FieldType = (typeof FIELD_TYPES)[number];

/** Feldtypen, die im Editor frei gesetzt werden dürfen (Start/Ziel sind fix). */
export const PLACEABLE_FIELD_TYPES = FIELD_TYPES.filter((t) => t !== 'start' && t !== 'goal');

export const FIELD_INFO: Record<
  FieldType,
  { label: string; short: string; description: string; color: string; icon: string }
> = {
  start: {
    label: 'Start',
    short: 'Start',
    description: 'Hier beginnen alle Teams.',
    color: '#ffffff',
    icon: '🚩',
  },
  goal: {
    label: 'Gipfel (Ziel)',
    short: 'Ziel',
    description: 'Der Gipfel des Vulkans. Wer hier steht, braucht noch einen Siegeswurf.',
    color: '#ffd23f',
    icon: '🏆',
  },
  normal: {
    label: 'Normales Feld',
    short: 'Normal',
    description: 'Keine besondere Wirkung.',
    color: '#5fb8ff',
    icon: '',
  },
  catapult_forward: {
    label: 'Katapult vorwärts',
    short: 'Katapult +',
    description: 'Schleudert das Team einige Felder nach vorne.',
    color: '#43c463',
    icon: '🚀',
  },
  catapult_backward: {
    label: 'Katapult rückwärts',
    short: 'Katapult −',
    description: 'Schleudert das Team einige Felder zurück.',
    color: '#ef5350',
    icon: '💥',
  },
  swap: {
    label: 'Platztausch',
    short: 'Tausch',
    description: 'Tauscht die Position mit einem zufälligen anderen Team.',
    color: '#ab6be0',
    icon: '🔄',
  },
  barrier: {
    label: 'Sperre',
    short: 'Sperre',
    description: 'Das Team ist gefangen, bis es die richtige Zahl würfelt.',
    color: '#ff9f2e',
    icon: '🚧',
  },
  minigame: {
    label: 'Minispiel-Feld',
    short: 'Minispiel',
    description: 'Löst ein Feld-Minispiel aus: allein gegen alle oder im Duell.',
    color: '#ff6fb5',
    icon: '🎮',
  },
  volcano: {
    label: 'Vulkanfeld',
    short: 'Vulkan',
    description: 'Erhöht den Druck im Vulkan. Bei vollem Druck bricht er aus.',
    color: '#8d3b2a',
    icon: '🌋',
  },
};

export const CONTENT_KINDS = ['game', 'choice', 'text', 'estimate', 'buzzer'] as const;
export type ContentKind = (typeof CONTENT_KINDS)[number];

export const CONTENT_KIND_INFO: Record<ContentKind, { label: string; icon: string; isQuestion: boolean }> = {
  game: { label: 'Spiel', icon: '🎯', isQuestion: false },
  choice: { label: 'Auswahlfrage', icon: '🔤', isQuestion: true },
  text: { label: 'Freitextfrage', icon: '✍️', isQuestion: true },
  estimate: { label: 'Schätzfrage', icon: '📏', isQuestion: true },
  buzzer: { label: 'Buzzer-Frage', icon: '🔔', isQuestion: true },
};

export const PLAYER_COUNTS = ['1', '2', '3', '4', 'all'] as const;
export type PlayerCount = (typeof PLAYER_COUNTS)[number];
export const PLAYER_COUNT_LABEL: Record<PlayerCount, string> = {
  '1': '1 Spieler pro Team',
  '2': '2 Spieler pro Team',
  '3': '3 Spieler pro Team',
  '4': '4 Spieler pro Team',
  all: 'Ganzes Team',
};

export const FIELD_GAME_MODES = ['vs_all', 'duel'] as const;
export type FieldGameMode = (typeof FIELD_GAME_MODES)[number];
export const FIELD_GAME_MODE_LABEL: Record<FieldGameMode, string> = {
  vs_all: 'Ein Team gegen alle',
  duel: 'Duell gegen ein Team',
};

export const PLAYER_EMOJIS = [
  '😀', '😎', '🤠', '🥳', '🤓', '😺', '🐶', '🦊', '🐼', '🐸',
  '🐵', '🦁', '🐯', '🐨', '🐧', '🦄', '🐙', '🦖', '🐢', '🦜',
  '🌴', '🍍', '🥥', '🌺', '⭐', '🔥', '⚡', '🎈', '🍉', '🍦',
] as const;

/** Figuren-Editor: Auswahllisten. Die Hemdfarbe ist immer die Teamfarbe. */
export const FIGURE_SKINS = ['#ffe0c7', '#f6cfa8', '#e8b48a', '#c98d60', '#9c6440', '#6e4228'] as const;
export const FIGURE_HAIR_COLORS = [
  '#2b1d14', '#5a3825', '#8b5a2b', '#d9a441', '#f2d27a', '#b33a22', '#9aa0a6', '#f4f4f4', '#3d6fd8', '#e35da6',
] as const;
export const FIGURE_HAIR_STYLES = ['short', 'spiky', 'long', 'curly', 'bun', 'mohawk', 'bald'] as const;
export const FIGURE_HAIR_STYLE_LABEL: Record<(typeof FIGURE_HAIR_STYLES)[number], string> = {
  short: 'Kurz',
  spiky: 'Stachelig',
  long: 'Lang',
  curly: 'Lockig',
  bun: 'Dutt',
  mohawk: 'Irokese',
  bald: 'Glatze',
};
export const FIGURE_EYES = ['round', 'happy', 'sleepy', 'wink', 'star'] as const;
export const FIGURE_EYES_LABEL: Record<(typeof FIGURE_EYES)[number], string> = {
  round: 'Rund',
  happy: 'Fröhlich',
  sleepy: 'Verschlafen',
  wink: 'Zwinkern',
  star: 'Sterne',
};
export const FIGURE_MOUTHS = ['smile', 'grin', 'open', 'o', 'tongue'] as const;
export const FIGURE_MOUTHS_LABEL: Record<(typeof FIGURE_MOUTHS)[number], string> = {
  smile: 'Lächeln',
  grin: 'Grinsen',
  open: 'Lachen',
  o: 'Staunen',
  tongue: 'Zunge',
};
export const FIGURE_ACCESSORIES = [
  'none', 'cap', 'crown', 'party', 'headphones', 'glasses', 'sunglasses', 'flower', 'bandana', 'tophat',
] as const;
export const FIGURE_ACCESSORIES_LABEL: Record<(typeof FIGURE_ACCESSORIES)[number], string> = {
  none: 'Nichts',
  cap: 'Kappe',
  crown: 'Krone',
  party: 'Partyhut',
  headphones: 'Kopfhörer',
  glasses: 'Brille',
  sunglasses: 'Sonnenbrille',
  flower: 'Blüte',
  bandana: 'Stirnband',
  tophat: 'Zylinder',
};
export const FIGURE_BODIES = ['normal', 'round', 'tall'] as const;
export const FIGURE_BODIES_LABEL: Record<(typeof FIGURE_BODIES)[number], string> = {
  normal: 'Normal',
  round: 'Rund',
  tall: 'Groß',
};
export const FIGURE_PANTS = ['#2d3a5c', '#3b3b3b', '#6b4d33', '#e8e2d0', '#4a6b3a', '#7a2f3a'] as const;
