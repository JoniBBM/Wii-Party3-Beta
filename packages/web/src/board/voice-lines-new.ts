/**
 * Neue Sprüche des Kommentators – noch OHNE Sprachdatei. Erst wenn die Dateien unter
 * /assets/voice/<id>.mp3 erzeugt sind, wandern die Zeilen nach voice-lines.ts (sonst würde der
 * Beamer Dateien abspielen wollen, die es nicht gibt). Gleiche Stimme und Regieanweisungen
 * ([laughs] …) wie dort. Zurzeit leer – alle Sprüche sind vertont.
 */
import type { VoiceCategory } from './voice-lines.ts';

export const NEW_VOICE_LINES: Partial<Record<VoiceCategory, [string, string][]>> = {};
