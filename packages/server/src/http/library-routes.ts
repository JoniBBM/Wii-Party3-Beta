/** Bibliothek: Sammlungen und Inhalte (Spiele & Fragen), Import/Export. */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { randomBytes } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildItem, collectionInputSchema, contentItemInputSchema, spokenText, type ContentItem, type ContentItemInput } from '@insel/shared';
import { newId } from '../auth.ts';
import { audioDir, removeAudio } from '../media.ts';
import * as db from '../db.ts';
import { convertLegacyFolder, type LegacyFolder } from '../legacy.ts';
import type { Live } from '../live.ts';
import type { GameRuntime } from '../runtime.ts';
import { ADMIN, HttpError, requireRole, sendJsonFile, STAFF } from './common.ts';

export const EXPORT_FORMAT = 'insel-inhalte';

export interface ExportFile {
  format: typeof EXPORT_FORMAT;
  version: 1;
  exportedAt: string;
  collections: { name: string; description: string; items: ContentItemInput[] }[];
}

function stripMeta(item: ContentItem): ContentItemInput {
  // Aufnahmen bleiben auf diesem Rechner; der Wunsch danach reist mit
  const { id: _id, collectionId: _c, createdAt: _a, updatedAt: _u, audioUrl, audioText: _t, ...rest } = item;
  return { ...rest, audioRequest: !!(rest.audioRequest || audioUrl) } as ContentItemInput;
}

/**
 * Sprachaufnahme beim Speichern: Häkchen „Audio erstellen“ = Aufnahme behalten bzw. anfordern.
 * Passt der Vorlesetext nicht mehr zur Aufnahme (Frage geändert), wird sie neu angefordert.
 */
function withAudio(item: ContentItem, existing: ContentItem | undefined): ContentItem {
  const wanted = !!item.audioRequest && spokenText(item) !== null;
  if (existing?.audioUrl) {
    if (wanted && spokenText(item) === existing.audioText) return { ...item, audioRequest: false, audioUrl: existing.audioUrl, audioText: existing.audioText };
    removeAudio(existing.audioUrl);
    return { ...item, audioRequest: wanted, audioUrl: null, audioText: null };
  }
  return { ...item, audioRequest: wanted, audioUrl: null, audioText: null };
}

/** Echte Audiodatei? (MP3, OGG oder WAV an den ersten Bytes erkennen) */
function audioKind(b: Buffer): 'mp3' | 'ogg' | 'wav' | null {
  if (b.length < 12) return null;
  if (b.subarray(0, 3).toString('latin1') === 'ID3' || (b[0] === 0xff && (b[1]! & 0xe0) === 0xe0)) return 'mp3';
  if (b.subarray(0, 4).toString('latin1') === 'OggS') return 'ogg';
  if (b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WAVE') return 'wav';
  return null;
}

const collectionMeta = z.object({ name: z.string().trim().min(1).max(120), description: z.string().max(2000).optional().default('') });

export function importCollections(database: db.DB, collections: ExportFile['collections']) {
  const now = Date.now();
  let items = 0;
  const created: string[] = [];
  database.transaction(() => {
    for (const raw of collections.slice(0, 500)) {
      // Namen und Beschreibung prüfen (Importdateien kommen von außen)
      const meta = collectionMeta.safeParse(raw);
      if (!meta.success || !Array.isArray(raw.items)) continue;
      const c = { ...meta.data, items: raw.items.slice(0, 5000) };
      const collection = { id: newId(), name: c.name, description: c.description ?? '', createdAt: now, updatedAt: now };
      db.insertCollection(database, collection);
      created.push(collection.id);
      for (const raw of c.items) {
        const parsed = contentItemInputSchema.safeParse(raw);
        if (!parsed.success) continue;
        db.upsertItem(database, buildItem(parsed.data, { id: newId(), collectionId: collection.id, now }));
        items += 1;
      }
    }
  })();
  return { collections: created.length, items, collectionIds: created };
}

export function libraryRoutes(app: FastifyInstance, runtime: GameRuntime, database: db.DB, live: Live) {
  const changed = () => live.notifyStaff('library');

  app.get('/api/library', async (req) => {
    requireRole(req, runtime, STAFF);
    return { collections: db.listCollections(database) };
  });

  app.get('/api/library/items', async (req) => {
    requireRole(req, runtime, STAFF);
    const q = z.object({ collectionId: z.string().optional() }).parse(req.query);
    return { items: db.listItems(database, q.collectionId ? [q.collectionId] : undefined) };
  });

  app.post('/api/library/collections', async (req) => {
    requireRole(req, runtime, ADMIN);
    const body = collectionInputSchema.parse(req.body);
    const now = Date.now();
    const c = { id: newId(), name: body.name, description: body.description, createdAt: now, updatedAt: now };
    db.insertCollection(database, c);
    changed();
    return c;
  });

  app.put('/api/library/collections/:id', async (req) => {
    requireRole(req, runtime, ADMIN);
    const { id } = req.params as { id: string };
    if (!db.getCollection(database, id)) throw new HttpError(404, 'Sammlung nicht gefunden');
    db.updateCollection(database, id, collectionInputSchema.parse(req.body), Date.now());
    changed();
    return db.getCollection(database, id);
  });

  app.delete('/api/library/collections/:id', async (req) => {
    requireRole(req, runtime, ADMIN);
    db.deleteCollection(database, (req.params as { id: string }).id);
    changed();
    return { ok: true };
  });

  app.put('/api/library/collections/:id/order', async (req) => {
    requireRole(req, runtime, ADMIN);
    const body = z.object({ itemIds: z.array(z.string()).max(2000) }).parse(req.body);
    db.reorderItems(database, (req.params as { id: string }).id, body.itemIds);
    changed();
    return { ok: true };
  });

  app.post('/api/library/collections/:id/items', async (req) => {
    requireRole(req, runtime, STAFF);
    const { id } = req.params as { id: string };
    if (!db.getCollection(database, id)) throw new HttpError(404, 'Sammlung nicht gefunden');
    const input = contentItemInputSchema.parse(req.body);
    const item = withAudio(buildItem(input, { id: newId(), collectionId: id, now: Date.now() }), undefined);
    db.upsertItem(database, item);
    changed();
    return item;
  });

  app.put('/api/library/items/:id', async (req) => {
    requireRole(req, runtime, STAFF);
    const { id } = req.params as { id: string };
    const existing = db.getItem(database, id);
    if (!existing) throw new HttpError(404, 'Inhalt nicht gefunden');
    const body = req.body as { collectionId?: string };
    const collectionId = body.collectionId && db.getCollection(database, body.collectionId) ? body.collectionId : existing.collectionId;
    const input = contentItemInputSchema.parse(req.body);
    const item = withAudio(buildItem(input, { id, collectionId, now: Date.now(), createdAt: existing.createdAt }), existing);
    db.upsertItem(database, item);
    changed();
    return item;
  });

  app.post('/api/library/items/:id/duplicate', async (req) => {
    requireRole(req, runtime, ADMIN);
    const existing = db.getItem(database, (req.params as { id: string }).id);
    if (!existing) throw new HttpError(404, 'Inhalt nicht gefunden');
    const now = Date.now();
    // Kopie bekommt keine eigene Datei – Aufnahme wird für sie neu angefordert
    const copy = { ...existing, id: newId(), title: `${existing.title} (Kopie)`, audioRequest: !!(existing.audioRequest || existing.audioUrl), audioUrl: null, audioText: null, createdAt: now, updatedAt: now };
    db.upsertItem(database, copy);
    changed();
    return copy;
  });

  app.delete('/api/library/items/:id', async (req) => {
    requireRole(req, runtime, ADMIN);
    removeAudio(db.getItem(database, (req.params as { id: string }).id)?.audioUrl);
    db.deleteItem(database, (req.params as { id: string }).id);
    changed();
    return { ok: true };
  });

  // -------------------------------------------------------------------------
  // Sprachaufnahmen der Fragen („Audio erstellen“)
  // -------------------------------------------------------------------------

  /** Offene Wünsche: Fragen mit Häkchen „Audio erstellen“ ohne passende Aufnahme. */
  app.get('/api/library/audio-requests', async (req) => {
    requireRole(req, runtime, ADMIN);
    const names = new Map(db.listCollections(database).map((c) => [c.id, c.name]));
    const items = db
      .listItems(database)
      .filter((i) => i.audioRequest && !i.audioUrl)
      .map((i) => ({ id: i.id, title: i.title, kind: i.kind, collection: names.get(i.collectionId) ?? '', text: spokenText(i) }))
      .filter((i) => i.text);
    return { items };
  });

  /** Aufnahme zu einer Frage hochladen (MP3/OGG/WAV, höchstens 6 MB). */
  app.post('/api/library/items/:id/audio', async (req) => {
    requireRole(req, runtime, ADMIN);
    const item = db.getItem(database, (req.params as { id: string }).id);
    if (!item) throw new HttpError(404, 'Inhalt nicht gefunden');
    const text = spokenText(item);
    if (!text) throw new HttpError(400, 'Nur Fragen können vorgelesen werden');
    const file = await req.file({ limits: { fileSize: 6 * 1024 * 1024, files: 1, fields: 2 } });
    if (!file) throw new HttpError(400, 'Keine Datei empfangen');
    const buf = await file.toBuffer();
    if (file.file.truncated) throw new HttpError(413, 'Die Datei ist zu groß (höchstens 6 MB)');
    const ext = audioKind(buf);
    if (!ext) throw new HttpError(400, 'Keine Audiodatei (MP3, OGG oder WAV)');
    const name = `${item.id.toLowerCase().replace(/[^a-z0-9]/g, '')}-${randomBytes(8).toString('hex')}.${ext}`;
    writeFileSync(join(audioDir(), name), buf);
    removeAudio(item.audioUrl);
    const updated: ContentItem = { ...item, audioRequest: false, audioUrl: `/media/audio/${name}`, audioText: text, updatedAt: Date.now() };
    db.upsertItem(database, updated);
    changed();
    return updated;
  });

  /** Aufnahme entfernen. */
  app.delete('/api/library/items/:id/audio', async (req) => {
    requireRole(req, runtime, ADMIN);
    const item = db.getItem(database, (req.params as { id: string }).id);
    if (!item) throw new HttpError(404, 'Inhalt nicht gefunden');
    removeAudio(item.audioUrl);
    const updated: ContentItem = { ...item, audioUrl: null, audioText: null, updatedAt: Date.now() };
    db.upsertItem(database, updated);
    changed();
    return updated;
  });

  app.get('/api/library/export', async (req, reply) => {
    requireRole(req, runtime, ADMIN);
    const q = z.object({ collectionId: z.string().optional() }).parse(req.query);
    const collections = db.listCollections(database).filter((c) => !q.collectionId || c.id === q.collectionId);
    const file: ExportFile = {
      format: EXPORT_FORMAT,
      version: 1,
      exportedAt: new Date().toISOString(),
      collections: collections.map((c) => ({
        name: c.name,
        description: c.description,
        items: db.listItems(database, [c.id]).map(stripMeta),
      })),
    };
    const name = collections.length === 1 ? collections[0]!.name : 'alle-inhalte';
    sendJsonFile(reply, `${name}.json`, file);
  });

  /** Import: eigenes Exportformat oder alte minigames.json. */
  app.post('/api/library/import', async (req) => {
    requireRole(req, runtime, ADMIN);
    const body = req.body as Partial<ExportFile> & LegacyFolder;
    let collections: ExportFile['collections'];
    if (body?.format === EXPORT_FORMAT && Array.isArray(body.collections)) {
      collections = body.collections;
    } else if (Array.isArray(body?.minigames)) {
      collections = [convertLegacyFolder(body)];
    } else {
      throw new HttpError(400, 'Unbekanntes Dateiformat');
    }
    const result = importCollections(database, collections);
    changed();
    return result;
  });
}
