/**
 * Bibliothek: Sammlungen und Inhalte (Spiele & Fragen), Import/Export.
 * Jeder Spielleiter hat eigene Sammlungen; veröffentlichte („gemeinsame“) sehen alle. Admins sehen
 * und pflegen alles. Fremde Sammlungen lassen sich als eigene Kopie übernehmen.
 */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { randomBytes } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildItem, collectionInputSchema, contentItemInputSchema, spokenText, type Collection, type ContentItem, type ContentItemInput } from '@insel/shared';
import type { AccountCtx } from '../access.ts';
import { newId } from '../auth.ts';
import { audioDir, removeAudio } from '../media.ts';
import * as db from '../db.ts';
import { convertLegacyFolder, type LegacyFolder } from '../legacy.ts';
import { displayName } from '../users.ts';
import { HttpError, readerOf, requireAccount, sendJsonFile, type Ctx } from './common.ts';

/** Sammlungen, die ein Konto sieht – mit Besitzername und ob es sie bearbeiten darf. */
export function visibleCollections(database: db.DB, acc: AccountCtx): Collection[] {
  return db
    .listCollections(database)
    .filter((c) => acc.isAdmin || c.published || (!!c.ownerId && c.ownerId === acc.userId))
    .map((c) => ({ ...c, ownerName: displayName(database, c.ownerId), editable: acc.isAdmin || (!!c.ownerId && c.ownerId === acc.userId) }));
}

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

export function importCollections(database: db.DB, collections: ExportFile['collections'], owner: { ownerId: string | null; published: boolean } = { ownerId: null, published: true }) {
  const now = Date.now();
  let items = 0;
  const created: string[] = [];
  database.transaction(() => {
    for (const raw of collections.slice(0, 500)) {
      // Namen und Beschreibung prüfen (Importdateien kommen von außen)
      const meta = collectionMeta.safeParse(raw);
      if (!meta.success || !Array.isArray(raw.items)) continue;
      const c = { ...meta.data, items: raw.items.slice(0, 5000) };
      const collection = { id: newId(), name: c.name, description: c.description ?? '', ownerId: owner.ownerId, published: owner.published, createdAt: now, updatedAt: now };
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

export function libraryRoutes(app: FastifyInstance, ctx: Ctx) {
  const { database, live } = ctx;
  const changed = () => live.notifyStaff('library');

  /** Sammlung, die das Konto bearbeiten darf – sonst 404/403. */
  const editableCollection = (acc: AccountCtx, id: string): Collection => {
    const c = visibleCollections(database, acc).find((x) => x.id === id);
    if (!c) throw new HttpError(404, 'Sammlung nicht gefunden');
    if (!c.editable) throw new HttpError(403, 'Diese Sammlung gehört jemand anderem – übernimm sie als eigene Kopie, um sie zu ändern');
    return c;
  };
  /** Inhalt, dessen Sammlung das Konto bearbeiten darf. */
  const editableItem = (acc: AccountCtx, id: string): ContentItem => {
    const item = db.getItem(database, id);
    if (!item) throw new HttpError(404, 'Inhalt nicht gefunden');
    editableCollection(acc, item.collectionId);
    return item;
  };

  app.get('/api/library', async (req) => {
    return { collections: visibleCollections(database, readerOf(req, ctx)) };
  });

  app.get('/api/library/items', async (req) => {
    const acc = readerOf(req, ctx);
    const q = z.object({ collectionId: z.string().optional() }).parse(req.query);
    const visible = visibleCollections(database, acc).map((c) => c.id);
    const ids = q.collectionId ? visible.filter((id) => id === q.collectionId) : visible;
    return { items: db.listItems(database, ids) };
  });

  app.post('/api/library/collections', async (req) => {
    const acc = requireAccount(req, ctx);
    const body = collectionInputSchema.parse(req.body);
    const now = Date.now();
    // Admins legen gemeinsame Sammlungen an, Spielleiter zunächst eigene
    const c = { id: newId(), name: body.name, description: body.description, ownerId: acc.userId, published: acc.isAdmin, createdAt: now, updatedAt: now };
    db.insertCollection(database, c);
    changed();
    return c;
  });

  app.put('/api/library/collections/:id', async (req) => {
    const acc = requireAccount(req, ctx);
    const { id } = req.params as { id: string };
    editableCollection(acc, id);
    db.updateCollection(database, id, collectionInputSchema.parse(req.body), Date.now());
    changed();
    return visibleCollections(database, acc).find((c) => c.id === id);
  });

  /** Für alle veröffentlichen bzw. wieder nur für sich behalten. */
  app.put('/api/library/collections/:id/published', async (req) => {
    const acc = requireAccount(req, ctx);
    const { id } = req.params as { id: string };
    editableCollection(acc, id);
    const body = z.object({ published: z.boolean() }).parse(req.body);
    db.setCollectionPublished(database, id, body.published, Date.now());
    changed();
    return visibleCollections(database, acc).find((c) => c.id === id);
  });

  /** Sichtbare Sammlung als eigene Kopie übernehmen (z. B. um gemeinsame Fragen anzupassen). */
  app.post('/api/library/collections/:id/copy', async (req) => {
    const acc = requireAccount(req, ctx);
    const { id } = req.params as { id: string };
    const source = visibleCollections(database, acc).find((c) => c.id === id);
    if (!source) throw new HttpError(404, 'Sammlung nicht gefunden');
    const now = Date.now();
    const copy = { id: newId(), name: `${source.name} (Kopie)`.slice(0, 120), description: source.description, ownerId: acc.userId, published: false, createdAt: now, updatedAt: now };
    database.transaction(() => {
      db.insertCollection(database, copy);
      for (const item of db.listItems(database, [source.id])) {
        // Aufnahmen bleiben bei der Vorlage – die Kopie fordert sie bei Bedarf neu an
        db.upsertItem(database, { ...item, id: newId(), collectionId: copy.id, audioRequest: !!(item.audioRequest || item.audioUrl), audioUrl: null, audioText: null, createdAt: now, updatedAt: now });
      }
    })();
    changed();
    return visibleCollections(database, acc).find((c) => c.id === copy.id);
  });

  app.delete('/api/library/collections/:id', async (req) => {
    const acc = requireAccount(req, ctx);
    const { id } = req.params as { id: string };
    editableCollection(acc, id);
    for (const item of db.listItems(database, [id])) removeAudio(item.audioUrl);
    db.deleteCollection(database, id);
    changed();
    return { ok: true };
  });

  app.put('/api/library/collections/:id/order', async (req) => {
    const acc = requireAccount(req, ctx);
    const { id } = req.params as { id: string };
    editableCollection(acc, id);
    const body = z.object({ itemIds: z.array(z.string()).max(2000) }).parse(req.body);
    db.reorderItems(database, id, body.itemIds);
    changed();
    return { ok: true };
  });

  app.post('/api/library/collections/:id/items', async (req) => {
    const acc = requireAccount(req, ctx);
    const { id } = req.params as { id: string };
    editableCollection(acc, id);
    const input = contentItemInputSchema.parse(req.body);
    const item = withAudio(buildItem(input, { id: newId(), collectionId: id, now: Date.now() }), undefined);
    db.upsertItem(database, item);
    changed();
    return item;
  });

  app.put('/api/library/items/:id', async (req) => {
    const acc = requireAccount(req, ctx);
    const { id } = req.params as { id: string };
    const existing = editableItem(acc, id);
    const body = req.body as { collectionId?: string };
    // Verschieben nur in eine Sammlung, die das Konto auch bearbeiten darf
    const collectionId = body.collectionId && body.collectionId !== existing.collectionId ? editableCollection(acc, body.collectionId).id : existing.collectionId;
    const input = contentItemInputSchema.parse(req.body);
    const item = withAudio(buildItem(input, { id, collectionId, now: Date.now(), createdAt: existing.createdAt }), existing);
    db.upsertItem(database, item);
    changed();
    return item;
  });

  app.post('/api/library/items/:id/duplicate', async (req) => {
    const acc = requireAccount(req, ctx);
    const existing = editableItem(acc, (req.params as { id: string }).id);
    const now = Date.now();
    // Kopie bekommt keine eigene Datei – Aufnahme wird für sie neu angefordert
    const copy = { ...existing, id: newId(), title: `${existing.title} (Kopie)`, audioRequest: !!(existing.audioRequest || existing.audioUrl), audioUrl: null, audioText: null, createdAt: now, updatedAt: now };
    db.upsertItem(database, copy);
    changed();
    return copy;
  });

  app.delete('/api/library/items/:id', async (req) => {
    const acc = requireAccount(req, ctx);
    const item = editableItem(acc, (req.params as { id: string }).id);
    removeAudio(item.audioUrl);
    db.deleteItem(database, item.id);
    changed();
    return { ok: true };
  });

  // -------------------------------------------------------------------------
  // Sprachaufnahmen der Fragen („Audio erstellen“) – nur Admins (Aufnahmen kosten Geld)
  // -------------------------------------------------------------------------

  /** Offene Wünsche: Fragen mit Häkchen „Audio erstellen“ ohne passende Aufnahme. */
  app.get('/api/library/audio-requests', async (req) => {
    requireAccount(req, ctx, { admin: true });
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
    requireAccount(req, ctx, { admin: true });
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
    requireAccount(req, ctx, { admin: true });
    const item = db.getItem(database, (req.params as { id: string }).id);
    if (!item) throw new HttpError(404, 'Inhalt nicht gefunden');
    removeAudio(item.audioUrl);
    const updated: ContentItem = { ...item, audioUrl: null, audioText: null, updatedAt: Date.now() };
    db.upsertItem(database, updated);
    changed();
    return updated;
  });

  app.get('/api/library/export', async (req, reply) => {
    const acc = requireAccount(req, ctx);
    const q = z.object({ collectionId: z.string().optional() }).parse(req.query);
    const collections = visibleCollections(database, acc).filter((c) => (q.collectionId ? c.id === q.collectionId : c.editable));
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

  /** Import: eigenes Exportformat oder alte minigames.json – landet in eigenen Sammlungen. */
  app.post('/api/library/import', async (req) => {
    const acc = requireAccount(req, ctx);
    const body = req.body as Partial<ExportFile> & LegacyFolder;
    let collections: ExportFile['collections'];
    if (body?.format === EXPORT_FORMAT && Array.isArray(body.collections)) {
      collections = body.collections;
    } else if (Array.isArray(body?.minigames)) {
      collections = [convertLegacyFolder(body)];
    } else {
      throw new HttpError(400, 'Unbekanntes Dateiformat');
    }
    const result = importCollections(database, collections, { ownerId: acc.userId, published: acc.isAdmin });
    changed();
    return result;
  });
}
