/**
 * Spielerfotos: werden verkleinert, gedreht (EXIF) und als WebP ohne Metadaten gespeichert.
 * Fotos liegen nur lokal unter data/media/<spiel>/ und landen nie in Exporten.
 */
import { randomBytes } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import sharp from 'sharp';
import { isPrivileged } from '@insel/shared';
import { gameMediaDir, removeFile } from '../media.ts';
import type { GameRuntime } from '../runtime.ts';
import { rateLimited } from '../auth.ts';
import { clientIp, HttpError, sessionOf } from './common.ts';

const MAX_BYTES = 8 * 1024 * 1024;
/** Nur echte Fotos (kein SVG, PDF …) */
const FORMATS = new Set(['jpeg', 'png', 'webp', 'heif', 'avif', 'gif']);

// Bildverarbeitung begrenzen: ein Thread, höchstens zwei Fotos gleichzeitig
sharp.concurrency(1);
let busy = 0;
const waiting: (() => void)[] = [];
async function withSlot<T>(fn: () => Promise<T>): Promise<T> {
  if (busy >= 2) await new Promise<void>((r) => waiting.push(r));
  busy++;
  try {
    return await fn();
  } finally {
    busy--;
    waiting.shift()?.();
  }
}

export function mediaRoutes(app: FastifyInstance, runtime: GameRuntime) {
  function targetPlayer(req: Parameters<typeof sessionOf>[0], requested: string | undefined) {
    const state = runtime.state;
    if (!state) throw new HttpError(404, 'Es läuft gerade kein Spiel');
    const session = sessionOf(req, state);
    let playerId: string | undefined;
    if (isPrivileged(session.role)) playerId = requested;
    else if (session.role === 'player') playerId = session.playerId ?? undefined;
    else if (session.role === 'team') {
      const p = state.players.find((x) => x.id === requested);
      if (p && p.teamId === session.teamId) playerId = p.id;
    }
    const player = state.players.find((p) => p.id === playerId);
    if (!player) throw new HttpError(403, 'Foto kann hier nicht geändert werden');
    return { state, player, actor: { role: session.role, teamId: session.teamId ?? null, playerId: session.playerId ?? null } };
  }

  app.post('/api/media/photo', async (req) => {
    if (rateLimited(`photo:${clientIp(req)}`, 30)) throw new HttpError(429, 'Zu viele Fotos – bitte kurz warten');
    const file = await req.file({ limits: { fileSize: MAX_BYTES, files: 1, fields: 4 } });
    if (!file) throw new HttpError(400, 'Kein Foto empfangen');
    const fields = file.fields as Record<string, { value?: string } | undefined>;
    const { state, player } = targetPlayer(req, fields.playerId?.value);
    if (rateLimited(`photo:p:${player.id}`, 6)) throw new HttpError(429, 'Zu viele Fotos – bitte kurz warten');
    const input = await file.toBuffer();
    if (file.file.truncated) throw new HttpError(413, 'Das Foto ist zu groß (höchstens 8 MB)');
    let output: Buffer;
    try {
      output = await withSlot(async () => {
        const img = sharp(input, { limitInputPixels: 30_000_000, failOn: 'error' });
        const meta = await img.metadata();
        if (!meta.format || !FORMATS.has(meta.format)) throw new Error('format');
        return img.rotate().resize(360, 360, { fit: 'cover', position: 'attention' }).webp({ quality: 82 }).toBuffer();
      });
    } catch {
      throw new HttpError(400, 'Das Bild konnte nicht gelesen werden (bitte ein Foto: JPG, PNG, HEIC …)');
    }
    const dir = gameMediaDir(state.id);
    mkdirSync(dir, { recursive: true });
    const name = `${player.id}-${randomBytes(12).toString('hex')}.webp`; // nicht erratbar
    writeFileSync(join(dir, name), output);
    const url = `/media/${state.id}/${name}`;
    const old = player.photo;
    runtime.dispatch({ type: 'player.update', playerId: player.id, photo: url }, { role: 'admin', system: true });
    removeFile(old);
    return { photo: url };
  });

  app.delete('/api/media/photo', async (req) => {
    const { playerId } = req.query as { playerId?: string };
    const { player } = targetPlayer(req, playerId);
    const old = player.photo;
    runtime.dispatch({ type: 'player.update', playerId: player.id, photo: null }, { role: 'admin', system: true });
    removeFile(old);
    return { ok: true };
  });
}
