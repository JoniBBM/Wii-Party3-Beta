import { rmSync } from 'node:fs';
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
