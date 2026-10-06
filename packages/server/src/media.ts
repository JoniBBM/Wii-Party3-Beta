import { mkdirSync, rmSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import { config } from './config.ts';

const MEDIA_FILE = /^\/media\/([a-z0-9]+)\/([a-z0-9]+-[0-9a-f]+\.webp)$/;

/** Löscht eine Mediendatei anhand ihres öffentlichen Pfads (/media/<spiel>/<datei>). */
export function removeFile(publicPath: string | null | undefined) {
  const m = publicPath ? MEDIA_FILE.exec(publicPath) : null;
  if (!m) return;
  try {
    rmSync(join(config.mediaDir, m[1]!, m[2]!), { force: true });
  } catch {
    /* Datei fehlt – egal */
  }
}

/** Medienordner eines Spiels (nur gültige IDs, garantiert innerhalb von data/media). */
export function gameMediaDir(gameId: string): string {
  if (!/^[a-z0-9]{4,40}$/.test(gameId)) throw new Error('Ungültige Spiel-ID');
  const dir = resolve(config.mediaDir, gameId);
  if (!dir.startsWith(resolve(config.mediaDir) + sep)) throw new Error('Ungültiger Pfad');
  return dir;
}

const AUDIO_FILE = /^\/media\/audio\/([a-z0-9]+-[0-9a-f]+\.(mp3|ogg|wav))$/;

/** Ordner für Sprachaufnahmen der Fragen (data/media/audio). */
export function audioDir(): string {
  const dir = resolve(config.mediaDir, 'audio');
  mkdirSync(dir, { recursive: true });
  return dir;
}

/** Löscht eine Sprachaufnahme anhand ihres öffentlichen Pfads (/media/audio/<datei>). */
export function removeAudio(publicPath: string | null | undefined) {
  const m = publicPath ? AUDIO_FILE.exec(publicPath) : null;
  if (!m) return;
  try {
    rmSync(join(audioDir(), m[1]!), { force: true });
  } catch {
    /* Datei fehlt – egal */
  }
}
