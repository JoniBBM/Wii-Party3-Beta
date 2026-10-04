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
import { config } from '../config.ts';
import { removeFile } from '../media.ts';
import type { GameRuntime } from '../runtime.ts';
import { HttpError, sessionOf } from './common.ts';

const MAX_BYTES = 15 * 1024 * 1024;

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
    const file = await req.file({ limits: { fileSize: MAX_BYTES, files: 1 } });
    if (!file) throw new HttpError(400, 'Kein Foto empfangen');
    const fields = file.fields as Record<string, { value?: string } | undefined>;
    const { state, player } = targetPlayer(req, fields.playerId?.value);
    const input = await file.toBuffer();
    if (file.file.truncated) throw new HttpError(413, 'Das Foto ist zu groß');
    let output: Buffer;
    try {
      output = await sharp(input, { limitInputPixels: 50_000_000 })
        .rotate()
        .resize(360, 360, { fit: 'cover', position: 'attention' })
        .webp({ quality: 82 })
        .toBuffer();
    } catch {
      throw new HttpError(400, 'Das Bild konnte nicht gelesen werden');
    }
    const dir = join(config.mediaDir, state.id);
    mkdirSync(dir, { recursive: true });
    const name = `${player.id}-${randomBytes(4).toString('hex')}.webp`;
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
