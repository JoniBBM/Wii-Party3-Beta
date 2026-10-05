/** Spiele (anlegen, aktivieren, löschen, exportieren) und Vorlagen. */
import { rmSync } from 'node:fs';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { defaultConfig, deviceModeSchema, gameConfigSchema, templateInputSchema, type GameConfig } from '@insel/shared';
import { newId } from '../auth.ts';
import * as db from '../db.ts';
import { gameMediaDir } from '../media.ts';
import type { Live } from '../live.ts';
import type { GameRuntime } from '../runtime.ts';
import { ADMIN, HttpError, requireRole, sendJsonFile, STAFF } from './common.ts';

export function removeGameMedia(gameId: string) {
  rmSync(gameMediaDir(gameId), { recursive: true, force: true });
}

const gameIdParam = z.object({ id: z.string().regex(/^[a-z0-9]{4,40}$/, 'Ungültige Spiel-ID') });

export function gameRoutes(app: FastifyInstance, runtime: GameRuntime, database: db.DB, live: Live) {
  const changed = () => live.notifyStaff('games');

  app.get('/api/games', async (req) => {
    requireRole(req, runtime, STAFF);
    return { games: db.listGames(database), activeGameId: runtime.state?.id ?? null };
  });

  app.post('/api/games', async (req) => {
    requireRole(req, runtime, ADMIN);
    const body = z
      .object({ name: z.string().trim().min(1).max(80), templateId: z.string().optional(), config: gameConfigSchema.optional(), devices: deviceModeSchema.optional() })
      .parse(req.body);
    let cfg: GameConfig;
    if (body.config) cfg = body.config;
    else if (body.templateId) {
      const t = db.getTemplate(database, body.templateId);
      if (!t) throw new HttpError(404, 'Vorlage nicht gefunden');
      cfg = structuredClone(t.config);
    } else {
      cfg = defaultConfig();
      cfg.collectionIds = db.listCollections(database).map((c) => c.id);
    }
    cfg.name = body.name;
    if (body.devices) cfg.devices = body.devices;
    const state = runtime.createGame(gameConfigSchema.parse(cfg));
    changed();
    return { id: state.id };
  });

  app.post('/api/games/:id/activate', async (req) => {
    requireRole(req, runtime, ADMIN);
    const { id } = gameIdParam.parse(req.params);
    if (!db.getGame(database, id)) throw new HttpError(404, 'Spiel nicht gefunden');
    runtime.activate(id);
    changed();
    return { ok: true };
  });

  app.post('/api/games/deactivate', async (req) => {
    requireRole(req, runtime, ADMIN);
    runtime.activate(null);
    changed();
    return { ok: true };
  });

  app.delete('/api/games/:id', async (req) => {
    requireRole(req, runtime, ADMIN);
    const { id } = gameIdParam.parse(req.params);
    if (!db.getGame(database, id)) throw new HttpError(404, 'Spiel nicht gefunden');
    if (runtime.state?.id === id) runtime.activate(null);
    db.deleteGame(database, id);
    removeGameMedia(id);
    changed();
    return { ok: true };
  });

  app.get('/api/games/:id/export', async (req, reply) => {
    requireRole(req, runtime, ADMIN);
    const state = db.getGame(database, gameIdParam.parse(req.params).id);
    if (!state) throw new HttpError(404, 'Spiel nicht gefunden');
    const safe = { ...state, teams: state.teams.map((t) => ({ ...t, pin: '', joinToken: '' })) };
    sendJsonFile(reply, `spielstand-${state.config.name}.json`, { format: 'insel-spielstand', version: 1, state: safe });
  });

  app.get('/api/games/active/log', async (req) => {
    requireRole(req, runtime, STAFF);
    if (!runtime.state) return { log: [] };
    return { log: db.recentLog(database, runtime.state.id) };
  });

  /** Alle Fotos des aktiven Spiels löschen (Datenschutz nach dem Spieleabend). */
  app.post('/api/games/:id/photos/delete', async (req) => {
    requireRole(req, runtime, ADMIN);
    const { id } = gameIdParam.parse(req.params);
    if (!db.getGame(database, id)) throw new HttpError(404, 'Spiel nicht gefunden');
    removeGameMedia(id);
    if (runtime.state?.id === id) {
      runtime.mutate((s) => {
        for (const p of s.players) p.photo = null;
      });
    } else {
      const s = db.getGame(database, id);
      if (s) {
        for (const p of s.players) p.photo = null;
        db.saveGame(database, s);
      }
    }
    return { ok: true };
  });

  // --- Vorlagen ------------------------------------------------------------

  app.get('/api/templates', async (req) => {
    requireRole(req, runtime, STAFF);
    return { templates: db.listTemplates(database) };
  });

  app.post('/api/templates', async (req) => {
    requireRole(req, runtime, ADMIN);
    const body = templateInputSchema.parse(req.body);
    const now = Date.now();
    const t = { id: newId(), ...body, createdAt: now, updatedAt: now };
    db.upsertTemplate(database, t);
    changed();
    return t;
  });

  app.put('/api/templates/:id', async (req) => {
    requireRole(req, runtime, ADMIN);
    const { id } = req.params as { id: string };
    const existing = db.getTemplate(database, id);
    if (!existing) throw new HttpError(404, 'Vorlage nicht gefunden');
    const body = templateInputSchema.parse(req.body);
    const t = { ...existing, ...body, updatedAt: Date.now() };
    db.upsertTemplate(database, t);
    changed();
    return t;
  });

  app.delete('/api/templates/:id', async (req) => {
    requireRole(req, runtime, ADMIN);
    db.deleteTemplate(database, (req.params as { id: string }).id);
    changed();
    return { ok: true };
  });
}
