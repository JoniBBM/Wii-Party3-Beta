/**
 * Beamer-Show: Einstellungen, die die Regie live für alle Beamer setzt
 * (Grafikstufe, Musik, Lautstärken, Kommentator, Kamera …) und die Spielerklärung.
 */
import { z } from 'zod';
import type { Theme } from './constants.ts';

export const QUALITY_LEVELS = ['auto', 'ultra', 'high', 'balanced', 'eco'] as const;
export type QualityLevel = (typeof QUALITY_LEVELS)[number];
/** Tatsächlich gerenderte Stufe (auto wählt eine davon). */
export type RenderQuality = Exclude<QualityLevel, 'auto'>;

export const QUALITY_INFO: Record<QualityLevel, { label: string; icon: string; text: string }> = {
  auto: { label: 'Automatisch', icon: '🪄', text: 'Startet schön und schaltet herunter, wenn der Beamer-Rechner nicht hinterherkommt.' },
  ultra: { label: 'Ultra', icon: '🌟', text: 'Komplett übertrieben: echte Materialien (Sand, Gras, Fels mit Struktur), feinere Wellen, doppelt so viel Gras, scharfe Schatten, Lichtstimmung wie auf einer Postkarte – nur für sehr starke Grafikkarten.' },
  high: { label: 'Schön', icon: '✨', text: 'Alle Effekte, weiche Schatten, Umgebungsverdeckung – für starke Rechner.' },
  balanced: { label: 'Ausgewogen', icon: '⚖️', text: 'Fast so schön, deutlich sparsamer. Gut für normale Laptops.' },
  eco: { label: 'Sparsam', icon: '🔋', text: 'Ohne Nachbearbeitung, weniger Gras, einfache Schatten – für schwache Rechner und Akku.' },
};

/** Renderauflösung des Beamers: automatisch (je Grafikstufe), Bildschirm-nativ oder feste Bildhöhe. */
export const RESOLUTIONS = ['auto', 'native', '720', '1080', '1440', '2160'] as const;
export type Resolution = (typeof RESOLUTIONS)[number];
export const RESOLUTION_INFO: Record<Resolution, string> = {
  auto: 'Automatisch',
  native: 'Bildschirm',
  '720': '720p',
  '1080': '1080p',
  '1440': '1440p',
  '2160': '4K',
};

/** Musikstücke (Dateien unter /assets/audio/music/<id>.<ext>) mit Stimmung und Welt. */
export const MUSIC_MOODS = ['lobby', 'insel', 'spannung', 'vulkan', 'finale'] as const;
export type MusicMood = (typeof MUSIC_MOODS)[number];
export const MUSIC_MOOD_LABEL: Record<MusicMood, string> = {
  lobby: 'Lobby & Pausen',
  insel: 'Würfeln auf der Insel',
  spannung: 'Fragen & Minispiele',
  vulkan: 'Im Vulkan / Nether / Alien-Höhle',
  finale: 'Siegerehrung',
};
/** Ein Musikstück: Datei /assets/audio/music/<id>.<ext>. */
export interface MusicTrackInfo {
  id: string;
  title: string;
  mood: MusicMood;
  /** Welt, in der die Automatik das Stück spielt (Standard: Insel) */
  world?: Theme;
  /** Dateiendung (Standard: mp3) */
  ext?: 'mp3' | 'm4a';
}
export const MUSIC_TRACKS = [
  { id: 'lobby', title: 'Lagunen-Lounge', mood: 'lobby' },
  { id: 'lobby-bossa', title: 'Strand-Bossa', mood: 'lobby' },
  { id: 'lobby-hawaii', title: 'Hawaii-Ukulele', mood: 'lobby' },
  { id: 'insel', title: 'Inselabenteuer', mood: 'insel' },
  { id: 'insel-calypso', title: 'Calypso-Party', mood: 'insel' },
  { id: 'insel-dschungel', title: 'Dschungelmarsch', mood: 'insel' },
  { id: 'insel-tropenpop', title: 'Tropen-Pop', mood: 'insel' },
  { id: 'spannung', title: 'Grübel-Musik', mood: 'spannung' },
  { id: 'spannung-quiz', title: 'Quiz-Countdown', mood: 'spannung' },
  { id: 'spannung-action', title: 'Minispiel-Action', mood: 'spannung' },
  { id: 'vulkan', title: 'Im Vulkan', mood: 'vulkan' },
  { id: 'finale', title: 'Siegesfanfare', mood: 'finale' },
  { id: 'finale-karneval', title: 'Karnevals-Finale', mood: 'finale' },
  // Blockwelt: freie Stücke (CC0) von OpenGameArt im ruhigen Minecraft-Geist – Quellen in assets/LICENSES.md
  { id: 'block-lobby', title: 'Tiefblaues Klavier', mood: 'lobby', world: 'blocks', ext: 'm4a' },
  { id: 'block-overworld-1', title: 'Unendliche Welt', mood: 'insel', world: 'blocks', ext: 'm4a' },
  { id: 'block-overworld-2', title: 'Grillenzirpen', mood: 'insel', world: 'blocks', ext: 'm4a' },
  { id: 'block-overworld-3', title: 'Bastel-Abenteuer', mood: 'insel', world: 'blocks', ext: 'm4a' },
  { id: 'block-spannung', title: 'Einsame Nacht', mood: 'spannung', world: 'blocks', ext: 'm4a' },
  { id: 'block-nether-1', title: 'Abstieg in den Nether', mood: 'vulkan', world: 'blocks', ext: 'm4a' },
  { id: 'block-nether-2', title: 'Der Abgrund', mood: 'vulkan', world: 'blocks', ext: 'm4a' },
  // Weltall: freie Stücke (CC0) von OpenGameArt, freundliche Synth-/Space-Klänge – Quellen in assets/LICENSES.md
  { id: 'space-lobby', title: 'Sternenstaub', mood: 'lobby', world: 'space', ext: 'm4a' },
  { id: 'space-planet-1', title: 'Weltraum-Abenteuer', mood: 'insel', world: 'space', ext: 'm4a' },
  { id: 'space-planet-2', title: 'Helle Sterne', mood: 'insel', world: 'space', ext: 'm4a' },
  { id: 'space-planet-3', title: 'Sphärenklang', mood: 'insel', world: 'space', ext: 'm4a' },
  { id: 'space-spannung', title: 'Rätsel im All', mood: 'spannung', world: 'space', ext: 'm4a' },
  { id: 'space-hoehle-1', title: 'Kristallhöhle', mood: 'vulkan', world: 'space', ext: 'm4a' },
  { id: 'space-hoehle-2', title: 'Energiekristall', mood: 'vulkan', world: 'space', ext: 'm4a' },
  { id: 'space-finale', title: 'Mission erfüllt', mood: 'finale', world: 'space', ext: 'm4a' },
] as const satisfies readonly MusicTrackInfo[];
export type MusicTrackId = (typeof MUSIC_TRACKS)[number]['id'];
const TRACK_IDS = MUSIC_TRACKS.map((t) => t.id) as [MusicTrackId, ...MusicTrackId[]];
const TRACK_LIST: readonly MusicTrackInfo[] = MUSIC_TRACKS;

/** Welt eines Musikstücks (ohne Angabe: Insel). */
export const musicWorld = (t: MusicTrackInfo): Theme => t.world ?? 'island';

/** Adresse der Musikdatei zu einer Stück-ID. */
export function musicUrl(id: string): string {
  const t = TRACK_LIST.find((x) => x.id === id);
  return `/assets/audio/music/${id}.${t?.ext ?? 'mp3'}`;
}

/** Stücke einer Stimmung für eine Welt; hat die Welt dafür keine eigenen, kommen die der Insel. */
export function musicTracksFor(mood: MusicMood, world: Theme): MusicTrackId[] {
  const of = (w: Theme) => TRACK_LIST.filter((t) => t.mood === mood && musicWorld(t) === w).map((t) => t.id as MusicTrackId);
  const own = of(world);
  return own.length || world === 'island' ? own : of('island');
}

export const COMMENTARY_LEVELS = ['off', 'some', 'lots', 'crazy'] as const;
export type CommentaryLevel = (typeof COMMENTARY_LEVELS)[number];

/** Stufen des Plauder-Reglers (Sprüche je Minute, wenn gerade nichts passiert). */
export const CHATTER_STEPS = [0, 0.25, 0.5, 0.75, 1, 1.5, 2, 2.5, 3, 3.5, 4] as const;
/** Feste Werte je Stufe; nur beim Quatschkopf stellt die Regie sie mit dem Regler genau ein (Start: 1). */
export const CHATTER_PRESET: Record<CommentaryLevel, number> = { off: 0, some: 0, lots: 0.5, crazy: 1 };

export const CAMERA_STYLES = ['calm', 'lively'] as const;
export type CameraStyle = (typeof CAMERA_STYLES)[number];

/** Wetter auf dem Beamer (beide Welten) */
export const WEATHER_KINDS = ['clear', 'cloudy', 'rain', 'storm', 'snow', 'fog'] as const;
export type WeatherKind = (typeof WEATHER_KINDS)[number];
export const WEATHER_INFO: Record<WeatherKind, { label: string; icon: string }> = {
  clear: { label: 'Sonne', icon: '☀️' },
  cloudy: { label: 'Wolken', icon: '☁️' },
  rain: { label: 'Regen', icon: '🌧️' },
  storm: { label: 'Gewitter', icon: '⛈️' },
  snow: { label: 'Schnee', icon: '❄️' },
  fog: { label: 'Nebel', icon: '🌫️' },
};
export const SEASONS = ['spring', 'summer', 'autumn', 'winter'] as const;
export type Season = (typeof SEASONS)[number];
export const SEASON_INFO: Record<Season, { label: string; icon: string }> = {
  spring: { label: 'Frühling', icon: '🌸' },
  summer: { label: 'Sommer', icon: '🌻' },
  autumn: { label: 'Herbst', icon: '🍂' },
  winter: { label: 'Winter', icon: '⛄' },
};
export const FESTIVE_MODES = ['off', 'halloween', 'christmas'] as const;
export type Festive = (typeof FESTIVE_MODES)[number];
export const FESTIVE_INFO: Record<Festive, { label: string; icon: string }> = {
  off: { label: 'Normal', icon: '🏝️' },
  halloween: { label: 'Halloween', icon: '🎃' },
  christmas: { label: 'Weihnachten', icon: '🎄' },
};

/** Jahreszeit nach Datum (Nordhalbkugel) */
export function seasonFor(date: Date): Season {
  const m = date.getMonth() + 1;
  return m >= 3 && m <= 5 ? 'spring' : m >= 6 && m <= 8 ? 'summer' : m >= 9 && m <= 11 ? 'autumn' : 'winter';
}

/** Festzeit nach Datum: Halloween 17.10.–2.11., Weihnachten 1.–26.12. */
export function festiveFor(date: Date): Festive {
  const m = date.getMonth() + 1;
  const d = date.getDate();
  if ((m === 10 && d >= 17) || (m === 11 && d <= 2)) return 'halloween';
  if (m === 12 && d <= 26) return 'christmas';
  return 'off';
}

/** Wie wahrscheinlich welches Wetter je Jahreszeit ist (Automatik) */
const WEATHER_ODDS: Record<Season, Partial<Record<WeatherKind, number>>> = {
  spring: { clear: 40, cloudy: 30, rain: 25, storm: 5 },
  summer: { clear: 60, cloudy: 18, rain: 10, storm: 12 },
  autumn: { clear: 12, cloudy: 33, rain: 30, fog: 17, storm: 8 },
  winter: { snow: 50, cloudy: 22, fog: 15, clear: 13 },
};

export interface WeatherContext {
  season: Season;
  festive: Festive;
  /** gleicher Startwert = gleiches Wetter auf allen Beamern (z. B. aus der Spiel-ID) */
  seed: string;
  round: number;
  status: 'lobby' | 'running' | 'finished';
  /** Vulkandruck 0 … 1 */
  pressure: number;
  /** Ein Team ist kurz vor dem Gipfel – Finale */
  finale: boolean;
}

/**
 * Wetter-Automatik, passend zum Spiel: Jahreszeit bestimmt die Grundstimmung, das Wetter wechselt
 * alle paar Runden (für alle Beamer gleich), hoher Vulkandruck zieht dunkle Wolken auf, im Finale
 * wird es dramatisch (Gewitter bzw. Schneetreiben), beim Sieg reißt der Himmel auf.
 */
export function autoWeather(c: WeatherContext): WeatherKind {
  if (c.festive === 'christmas') return c.status === 'finished' ? 'snow' : c.round % 5 === 4 ? 'cloudy' : 'snow';
  if (c.status === 'finished') return c.season === 'winter' ? 'snow' : 'clear';
  if (c.finale) return c.season === 'winter' ? 'snow' : c.festive === 'halloween' ? 'storm' : c.season === 'summer' || c.season === 'autumn' ? 'storm' : 'rain';
  if (c.festive === 'halloween') return c.round % 3 === 2 ? 'cloudy' : 'fog';
  if (c.pressure >= 0.75) return c.season === 'winter' ? 'snow' : 'cloudy';
  if (c.status === 'lobby') return c.season === 'winter' ? 'snow' : c.season === 'autumn' ? 'cloudy' : 'clear';
  // alle drei Runden neu würfeln – deterministisch aus Spiel und Rundenblock
  const block = Math.floor(Math.max(0, c.round - 1) / 3);
  let h = 2166136261;
  for (const ch of `${c.seed}:${block}`) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  const roll = ((h >>> 0) % 1000) / 1000;
  const odds = Object.entries(WEATHER_ODDS[c.season]) as [WeatherKind, number][];
  const sum = odds.reduce((a, [, w]) => a + w, 0);
  let r = roll * sum;
  for (const [k, w] of odds) {
    r -= w;
    if (r < 0) return k;
  }
  return odds[0]![0];
}

/** Was der Beamer gerade zeigt (Automatik aufgelöst) */
export interface Atmosphere {
  weather: WeatherKind;
  season: Season;
  festive: Festive;
}

/** Ausschnitt des Spielstands, den die Wetter-Automatik braucht */
interface AtmosphereGame {
  id: string;
  round: number;
  status: 'lobby' | 'running' | 'finished';
  volcano: { pressure: number };
  teams: { position: number }[];
  config: { board: { fields: unknown[] }; rules: { volcano: { threshold: number } } };
}

export function atmosphereFor(s: Pick<ShowSettings, 'weather' | 'season' | 'festive'>, game: AtmosphereGame | null, now = new Date()): Atmosphere {
  const season = s.season === 'auto' ? seasonFor(now) : s.season;
  const festive = s.festive === 'auto' ? festiveFor(now) : s.festive;
  if (s.weather !== 'auto') return { weather: s.weather, season, festive };
  const goal = game ? game.config.board.fields.length - 1 : 72;
  const lead = game ? Math.max(0, ...game.teams.map((t) => t.position)) : 0;
  const weather = autoWeather({
    season,
    festive,
    seed: game?.id ?? 'lobby',
    round: game?.round ?? 0,
    status: game?.status ?? 'lobby',
    pressure: game ? game.volcano.pressure / Math.max(1, game.config.rules.volcano.threshold) : 0,
    finale: !!game && game.status === 'running' && lead >= goal - 6,
  });
  return { weather, season, festive };
}

const volume = z.number().min(0).max(1);

/** Felder ohne Vorgaben (für Teil-Änderungen aus der Regie). */
const SHOW_FIELDS = {
  quality: z.enum(QUALITY_LEVELS),
  resolution: z.enum(RESOLUTIONS),
  master: volume,
  music: z.boolean(),
  musicVolume: volume,
  /** Automatisch je Spielphase oder ein festes Stück */
  musicTrack: z.union([z.literal('auto'), z.enum(TRACK_IDS)]),
  /** Stücke der jeweiligen Stimmung nacheinander abspielen statt eines zu wiederholen */
  musicRotate: z.boolean(),
  sound: z.boolean(),
  soundVolume: volume,
  voice: z.boolean(),
  voiceVolume: volume,
  ambience: z.boolean(),
  ambienceVolume: volume,
  /** Wie oft der Kommentator etwas sagt. */
  commentary: z.enum(COMMENTARY_LEVELS),
  /** Quatschkopf: Sprüche zwischendurch je Minute (0 = nur zu Ereignissen), in halben Schritten. */
  crazyChatter: z.number().refine((v) => (CHATTER_STEPS as readonly number[]).includes(v), 'Ungültige Stufe'),
  camera: z.enum(CAMERA_STYLES),
  /** Nach jedem Zug kurz auf die Figur schauen (Jubel, Ärger …). */
  reactions: z.boolean(),
  /** Namensschilder über den Figuren. */
  tags: z.boolean(),
  /** Fotos gezogener Personen als Blasen über den Beamer fliegen lassen. */
  photos: z.boolean(),
  /** Bildrate oben rechts anzeigen. */
  fps: z.boolean(),
  /** Beamer im Vollbild (braucht beim ersten Mal einen Klick am Beamer, außer im Kiosk-Modus). */
  fullscreen: z.boolean(),
  /** Rangliste und Kopfzeile auf dem Beamer zeigen. */
  hud: z.boolean(),
  /** Wetter: Automatik (Jahreszeit + Spielverlauf) oder fest */
  weather: z.union([z.literal('auto'), z.enum(WEATHER_KINDS)]),
  /** Jahreszeit: Automatik nach Datum oder fest */
  season: z.union([z.literal('auto'), z.enum(SEASONS)]),
  /** Halloween/Weihnachten: Automatik nach Datum oder fest */
  festive: z.union([z.literal('auto'), z.enum(FESTIVE_MODES)]),
};

export type ShowSettings = { [K in keyof typeof SHOW_FIELDS]: z.infer<(typeof SHOW_FIELDS)[K]> };

export const DEFAULT_SHOW: ShowSettings = {
  quality: 'auto',
  resolution: 'auto',
  master: 0.9,
  music: true,
  musicVolume: 0.45,
  musicTrack: 'auto',
  musicRotate: true,
  sound: true,
  soundVolume: 0.8,
  voice: true,
  voiceVolume: 0.9,
  ambience: true,
  ambienceVolume: 0.5,
  commentary: 'some',
  crazyChatter: CHATTER_PRESET.crazy,
  camera: 'calm',
  reactions: true,
  tags: true,
  photos: true,
  fps: false,
  fullscreen: true,
  hud: true,
  weather: 'auto',
  season: 'auto',
  festive: 'auto',
};

export const showSettingsSchema = z.object(SHOW_FIELDS);
export const showPatchSchema = showSettingsSchema.partial().strict();
export type ShowPatch = z.infer<typeof showPatchSchema>;

/** Gespeicherte (evtl. ältere oder kaputte) Einstellungen sicher einlesen. */
export function parseShow(raw: unknown): ShowSettings {
  const base = typeof raw === 'object' && raw ? (raw as Record<string, unknown>) : {};
  const out: Record<string, unknown> = { ...DEFAULT_SHOW };
  for (const [key, schema] of Object.entries(SHOW_FIELDS)) {
    const r = (schema as z.ZodType).safeParse(base[key]);
    if (r.success) out[key] = r.data;
  }
  return out as ShowSettings;
}
/** Wie oft der Kommentator zwischendurch plaudert (Sprüche je Minute) – Regler nur beim Quatschkopf. */
export function effectiveChatter(s: Pick<ShowSettings, 'commentary' | 'crazyChatter'>): number {
  return s.commentary === 'crazy' ? s.crazyChatter : CHATTER_PRESET[s.commentary];
}

/** Spielerklärung auf dem Beamer: läuft, solange `running`; `id` startet sie neu. */
export interface ExplainerState {
  running: boolean;
  id: number;
  startedAt: number;
}

export interface ShowState {
  settings: ShowSettings;
  explainer: ExplainerState;
}

export const showCommandSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('set'), patch: showPatchSchema }),
  z.object({ type: z.literal('reset') }),
  z.object({ type: z.literal('explain'), action: z.enum(['start', 'stop']) }),
  /** Kurzer Testton auf allen Beamern (z. B. um die Lautstärke einzustellen). */
  z.object({ type: z.literal('test'), what: z.enum(['sound', 'voice', 'music']) }),
  /** Beamer-Seite neu laden. */
  z.object({ type: z.literal('reload') }),
  /** Aktuelle Frage nochmal vorlesen (Sprachaufnahme der Frage). */
  z.object({ type: z.literal('speak') }),
  /** Kamera fernsteuern: feste Einstellung, Schubsen (drehen/zoomen/schieben) oder zurück zur Automatik. */
  z.object({
    type: z.literal('camera'),
    /** inside/island: ins Vulkan-Innere bzw. zurück auf die Insel (nur, wenn gerade nichts passiert) */
    action: z.enum(['auto', 'overview', 'volcano', 'start', 'goal', 'team', 'nudge', 'inside', 'island']),
    teamId: z.string().max(64).optional(),
    yaw: z.number().min(-3).max(3).optional(),
    pitch: z.number().min(-1).max(1).optional(),
    zoom: z.number().min(-2).max(2).optional(),
    panX: z.number().min(-1).max(1).optional(),
    panZ: z.number().min(-1).max(1).optional(),
  }),
]);
export type ShowCommand = z.infer<typeof showCommandSchema>;
export type CameraCommand = Extract<ShowCommand, { type: 'camera' }>;

/** Was die Beamer zurückmelden (für die Anzeige in der Regie). */
export interface BeamerStats {
  id: string;
  fps: number;
  quality: RenderQuality;
  width: number;
  height: number;
  audio: boolean;
  fullscreen: boolean;
  /** Kamera gerade frei geführt */
  manual: boolean;
  explaining: boolean;
  /** Welche Welt der Beamer zeigt (Insel oder Vulkan-Inneres) */
  view?: 'island' | 'inside';
  /** Auf dem Spielbrett läuft gerade ein Zug/Auftritt */
  busy?: boolean;
}
