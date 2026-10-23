/**
 * Spiele (anlegen, wählen, schließen, löschen, exportieren) und Vorlagen. Spielleiter sehen und
 * steuern nur ihre eigenen Spiele, Admins alle. Mehrere Spiele können gleichzeitig geöffnet sein.
 */
import { rmSync } from 'node:fs';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { defaultConfig, deviceModeSchema, gameConfigSchema, templateInputSchema, type GameConfig, type Template } from '@insel/shared';
import type { AccountCtx } from '../access.ts';
import { newId } from '../auth.ts';
import * as db from '../db.ts';
import { gameMediaDir } from '../media.ts';
import { displayName } from '../users.ts';
import { HttpError, readerOf, requireAccount, requireGame, requireStaff, sendJsonFile, type Ctx } from './common.ts';
import { visibleCollections } from './library-routes.ts';

export function removeGameMedia(gameId: string) {
  rmSync(gameMediaDir(gameId), { recursive: true, force: true });
}

const gameIdParam = z.object({ id: z.string().regex(/^[a-z0-9]{4,40}$/, 'Ungültige Spiel-ID') });

/** Vorlagen: die des Admins sehen alle, eigene nur der Besitzer; Admins sehen und ändern alle. */
export function visibleTemplates(database: db.DB, acc: AccountCtx): Template[] {
  return db
    .listTemplates(database)
    .filter((t) => acc.isAdmin || !t.ownerId || t.ownerId === acc.userId)
    .map((t) => ({ ...t, editable: acc.isAdmin || (!!t.ownerId && t.ownerId === acc.userId) }));
}

export function gameRoutes(app: FastifyInstance, ctx: Ctx) {
  const { database, hub, live } = ctx;
  const changed = () => live.notifyStaff('games');

  app.get('/api/games', async (req) => {
    const acc = requireAccount(req, ctx);
    const games = db.listGames(database, acc.isAdmin ? undefined : (acc.userId ?? ''));
    return {
      games: games.map((g) => ({ ...g, ownerName: displayName(database, g.ownerId), mine: g.ownerId === acc.userId })),
      currentGameId: hub.currentOf(acc.userId),
      // Kompatibilität mit älteren Oberflächen
      activeGameId: hub.currentOf(acc.userId),
    };
  });

  app.post('/api/games', async (req) => {
    const acc = requireAccount(req, ctx);
    const body = z
      .object({ name: z.string().trim().min(1).max(80), templateId: z.string().optional(), config: gameConfigSchema.optional(), devices: deviceModeSchema.optional() })
      .parse(req.body);
    // Während das eigene Spiel läuft, kein neues anlegen (erst beenden oder schließen)
    if (hub.get(hub.currentOf(acc.userId))?.state.status === 'running') throw new HttpError(409, 'Es läuft gerade ein Spiel – ein neues lässt sich erst anlegen, wenn es beendet oder geschlossen ist.');
    const visible = new Set(visibleCollections(database, acc).map((c) => c.id));
    let cfg: GameConfig;
    if (body.config) cfg = body.config;
    else if (body.templateId) {
      const t = visibleTemplates(database, acc).find((x) => x.id === body.templateId);
      if (!t) throw new HttpError(404, 'Vorlage nicht gefunden');
      cfg = structuredClone(t.config);
    } else {
      cfg = defaultConfig();
      cfg.collectionIds = [...visible];
    }
    // nur Sammlungen, die das Konto sehen darf
    cfg.collectionIds = cfg.collectionIds.filter((id) => visible.has(id));
    cfg.name = body.name;
    if (body.devices) cfg.devices = body.devices;
    const state = hub.create(gameConfigSchema.parse(cfg), acc.userId);
    changed();
    return { id: state.id, code: state.code };
  });

  /** Spiel wählen: wird geöffnet; Regie und Beamer des Kontos zeigen es. */
  const select = async (req: Parameters<typeof requireGame>[0]) => {
    const { id } = gameIdParam.parse(req.params);
    const acc = requireGame(req, ctx, id);
    hub.open(id);
    hub.setCurrent(acc.userId, id);
    changed();
    return { ok: true };
  };
  app.post('/api/games/:id/select', select);
  app.post('/api/games/:id/activate', select);

  /** Spiel schließen: Handys und Beamer kommen nicht mehr hinein, der Spielstand bleibt gespeichert. */
  app.post('/api/games/:id/close', async (req) => {
    const { id } = gameIdParam.parse(req.params);
    requireGame(req, ctx, id);
    hub.close(id);
    changed();
    return { ok: true };
  });

  /** Gewähltes Spiel schließen (Regie: „Spiel beenden“). */
  app.post('/api/games/deactivate', async (req) => {
    const acc = requireAccount(req, ctx);
    const id = hub.currentOf(acc.userId);
    if (id) {
      requireGame(req, ctx, id);
      hub.close(id);
    }
    hub.setCurrent(acc.userId, null);
    changed();
    return { ok: true };
  });

  app.delete('/api/games/:id', async (req) => {
    const { id } = gameIdParam.parse(req.params);
    requireGame(req, ctx, id);
    hub.delete(id);
    removeGameMedia(id);
    changed();
    return { ok: true };
  });

  /** Admin: Spiel einem anderen Konto geben (null = Admin). */
  app.post('/api/games/:id/owner', async (req) => {
    requireAccount(req, ctx, { admin: true });
    const { id } = gameIdParam.parse(req.params);
    const body = z.object({ ownerId: z.string().max(40).nullable() }).parse(req.body);
    if (!hub.meta(id)) throw new HttpError(404, 'Spiel nicht gefunden');
    if (body.ownerId && !db.getUser(database, body.ownerId)) throw new HttpError(404, 'Konto nicht gefunden');
    database.prepare('UPDATE games SET owner_id = ? WHERE id = ?').run(body.ownerId, id);
    hub.refreshMeta();
    live.refreshAccounts();
    changed();
    return { ok: true };
  });

  app.get('/api/games/:id/export', async (req, reply) => {
    const { id } = gameIdParam.parse(req.params);
    requireGame(req, ctx, id);
    const state = db.getGame(database, id);
    if (!state) throw new HttpError(404, 'Spiel nicht gefunden');
    const safe = { ...state, teams: state.teams.map((t) => ({ ...t, pin: '', joinToken: '' })) };
    sendJsonFile(reply, `spielstand-${state.config.name}.json`, { format: 'insel-spielstand', version: 1, state: safe });
  });

  /** Verlauf des Spiels, an dem die Spielleitung gerade hängt (Regie oder Moderator). */
  app.get('/api/games/active/log', async (req) => {
    const { gameId } = requireStaff(req, ctx);
    return { log: gameId ? db.recentLog(database, gameId) : [] };
  });

  /** Alle Fotos eines Spiels löschen (Datenschutz nach dem Spieleabend). */
  app.post('/api/games/:id/photos/delete', async (req) => {
    const { id } = gameIdParam.parse(req.params);
    requireGame(req, ctx, id);
    removeGameMedia(id);
    const rt = hub.get(id);
    if (rt) {
      rt.mutate((s) => {
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
    return { templates: visibleTemplates(database, readerOf(req, ctx)) };
  });

  app.post('/api/templates', async (req) => {
    const acc = requireAccount(req, ctx);
    const body = templateInputSchema.parse(req.body);
    const now = Date.now();
    const t = { id: newId(), ...body, ownerId: acc.userId, createdAt: now, updatedAt: now };
    db.upsertTemplate(database, t);
    changed();
    return t;
  });

  const editableTemplate = (req: Parameters<typeof requireAccount>[0]) => {
    const acc = requireAccount(req, ctx);
    const { id } = req.params as { id: string };
    const t = visibleTemplates(database, acc).find((x) => x.id === id);
    if (!t) throw new HttpError(404, 'Vorlage nicht gefunden');
    if (!t.editable) throw new HttpError(403, 'Diese Vorlage gehört dem Admin – speichere eine eigene Kopie');
    return t;
  };

  app.put('/api/templates/:id', async (req) => {
    const existing = editableTemplate(req);
    const body = templateInputSchema.parse(req.body);
    const t = { ...existing, ...body, updatedAt: Date.now() };
    db.upsertTemplate(database, t);
    changed();
    return t;
  });

  app.delete('/api/templates/:id', async (req) => {
    const t = editableTemplate(req);
    db.deleteTemplate(database, t.id);
    changed();
    return { ok: true };
  });
}
