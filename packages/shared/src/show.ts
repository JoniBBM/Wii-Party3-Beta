/**
 * Beamer-Show: Einstellungen, die die Regie live für alle Beamer setzt
 * (Grafikstufe, Musik, Lautstärken, Kommentator, Kamera …) und die Spielerklärung.
 */
import { z } from 'zod';

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

/** Musikstücke (Dateien unter /assets/audio/music/<id>.mp3) mit ihrer Stimmung. */
export const MUSIC_MOODS = ['lobby', 'insel', 'spannung', 'vulkan', 'finale'] as const;
export type MusicMood = (typeof MUSIC_MOODS)[number];
export const MUSIC_MOOD_LABEL: Record<MusicMood, string> = {
  lobby: 'Lobby & Pausen',
  insel: 'Würfeln auf der Insel',
  spannung: 'Fragen & Minispiele',
  vulkan: 'Im Vulkan',
  finale: 'Siegerehrung',
};
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
] as const satisfies readonly { id: string; title: string; mood: MusicMood }[];
export type MusicTrackId = (typeof MUSIC_TRACKS)[number]['id'];
const TRACK_IDS = MUSIC_TRACKS.map((t) => t.id) as [MusicTrackId, ...MusicTrackId[]];

export const COMMENTARY_LEVELS = ['off', 'some', 'lots', 'crazy'] as const;
export type CommentaryLevel = (typeof COMMENTARY_LEVELS)[number];

export const CAMERA_STYLES = ['calm', 'lively'] as const;
export type CameraStyle = (typeof CAMERA_STYLES)[number];

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
  camera: 'calm',
  reactions: true,
  tags: true,
  photos: true,
  fps: false,
  fullscreen: true,
  hud: true,
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
  /** Kamera fernsteuern: feste Einstellung, Schubsen (drehen/zoomen/schieben) oder zurück zur Automatik. */
  z.object({
    type: z.literal('camera'),
    action: z.enum(['auto', 'overview', 'volcano', 'start', 'goal', 'team', 'nudge']),
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
}
