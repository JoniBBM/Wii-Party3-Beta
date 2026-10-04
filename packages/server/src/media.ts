import { rmSync } from 'node:fs';
import { join } from 'node:path';
import { config } from './config.ts';

/** Löscht eine Mediendatei anhand ihres öffentlichen Pfads (/media/<spiel>/<datei>). */
export function removeFile(publicPath: string | null | undefined) {
  if (!publicPath?.startsWith('/media/')) return;
  const rel = publicPath.slice('/media/'.length);
  if (rel.includes('..')) return;
  rmSync(join(config.mediaDir, rel), { force: true });
}
