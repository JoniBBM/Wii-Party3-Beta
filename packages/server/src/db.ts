/**
 * SQLite-Speicher. Inhalte (Sammlungen, Fragen, Spiele) und Vorlagen sind normale Tabellen;
 * ein laufendes Spiel wird als JSON-Snapshot gespeichert (nach jeder Änderung).
 */
import Database from 'better-sqlite3';
import type { Collection, ContentItem, GameConfig, GameState, Template } from '@insel/shared';
import { upgradeConfig, upgradeState } from '@insel/shared';
import { config } from './config.ts';

export type DB = Database.Database;

const MIGRATIONS: string[] = [
  `
  CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
  CREATE TABLE collections (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    sort INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE TABLE items (
    id TEXT PRIMARY KEY,
    collection_id TEXT NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
    kind TEXT NOT NULL,
    data TEXT NOT NULL,
    sort INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE INDEX items_collection ON items(collection_id, sort);
  CREATE TABLE templates (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    config TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE TABLE games (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    status TEXT NOT NULL,
    state TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE TABLE game_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    game_id TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
    at INTEGER NOT NULL,
    actor TEXT NOT NULL,
    command TEXT NOT NULL,
    label TEXT NOT NULL,
    effects TEXT NOT NULL
  );
  CREATE INDEX game_log_game ON game_log(game_id, id);
  `,
];

export function openDb(file = config.dbFile): DB {
  const db = new Database(file);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('synchronous = NORMAL');
  const version = db.pragma('user_version', { simple: true }) as number;
  for (let v = version; v < MIGRATIONS.length; v++) {
    db.exec('BEGIN');
    db.exec(MIGRATIONS[v]!);
    db.pragma(`user_version = ${v + 1}`);
    db.exec('COMMIT');
  }
  return db;
}

// ---------------------------------------------------------------------------
// Einstellungen
// ---------------------------------------------------------------------------

export interface AppSettings {
  appName: string;
  activeGameId: string | null;
  /** Bevorzugte Beitritts-Adresse (leer = automatisch). */
  joinUrl: string;
  /** Beamer-Show (Grafik, Ton, Kommentator …) – wird beim Lesen geprüft. */
  show: unknown;
}

const DEFAULT_SETTINGS: AppSettings = {
  appName: 'Insel der Abenteuer',
  activeGameId: null,
  joinUrl: '',
  show: null,
};

export function getSettings(db: DB): AppSettings {
  const rows = db.prepare('SELECT key, value FROM settings').all() as { key: string; value: string }[];
  const out: Record<string, unknown> = { ...DEFAULT_SETTINGS };
  for (const r of rows) out[r.key] = JSON.parse(r.value);
  return out as unknown as AppSettings;
}

export function setSettings(db: DB, patch: Partial<AppSettings>) {
  const stmt = db.prepare('INSERT INTO settings(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');
  const tx = db.transaction(() => {
    for (const [k, v] of Object.entries(patch)) stmt.run(k, JSON.stringify(v));
  });
  tx();
}

// ---------------------------------------------------------------------------
// Bibliothek
// ---------------------------------------------------------------------------

interface CollectionRow {
  id: string;
  name: string;
  description: string;
  created_at: number;
  updated_at: number;
  item_count?: number;
}

const toCollection = (r: CollectionRow): Collection => ({
  id: r.id,
  name: r.name,
  description: r.description,
  itemCount: r.item_count ?? 0,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

export function listCollections(db: DB): Collection[] {
  const rows = db
    .prepare(
      `SELECT c.*, (SELECT COUNT(*) FROM items i WHERE i.collection_id = c.id) AS item_count
       FROM collections c ORDER BY c.sort, c.name COLLATE NOCASE`,
    )
    .all() as CollectionRow[];
  return rows.map(toCollection);
}

export function getCollection(db: DB, id: string): Collection | undefined {
  const r = db.prepare('SELECT * FROM collections WHERE id = ?').get(id) as CollectionRow | undefined;
  return r ? toCollection(r) : undefined;
}

export function insertCollection(db: DB, c: Collection) {
  const sort = (db.prepare('SELECT COALESCE(MAX(sort), 0) + 1 AS s FROM collections').get() as { s: number }).s;
  db.prepare('INSERT INTO collections(id, name, description, sort, created_at, updated_at) VALUES(?, ?, ?, ?, ?, ?)').run(
    c.id,
    c.name,
    c.description,
    sort,
    c.createdAt,
    c.updatedAt,
  );
}

export function updateCollection(db: DB, id: string, patch: { name: string; description: string }, now: number) {
  db.prepare('UPDATE collections SET name = ?, description = ?, updated_at = ? WHERE id = ?').run(
    patch.name,
    patch.description,
    now,
    id,
  );
}

export function deleteCollection(db: DB, id: string) {
  db.prepare('DELETE FROM collections WHERE id = ?').run(id);
}

interface ItemRow {
  id: string;
  collection_id: string;
  data: string;
}

const toItem = (r: ItemRow): ContentItem => ({ ...(JSON.parse(r.data) as ContentItem), id: r.id, collectionId: r.collection_id });

export function listItems(db: DB, collectionIds?: string[]): ContentItem[] {
  if (collectionIds && collectionIds.length === 0) return [];
  const rows = collectionIds
    ? (db
        .prepare(
          `SELECT id, collection_id, data FROM items WHERE collection_id IN (${collectionIds.map(() => '?').join(',')}) ORDER BY sort, created_at`,
        )
        .all(...collectionIds) as ItemRow[])
    : (db.prepare('SELECT id, collection_id, data FROM items ORDER BY sort, created_at').all() as ItemRow[]);
  return rows.map(toItem);
}

export function getItem(db: DB, id: string): ContentItem | undefined {
  const r = db.prepare('SELECT id, collection_id, data FROM items WHERE id = ?').get(id) as ItemRow | undefined;
  return r ? toItem(r) : undefined;
}

export function upsertItem(db: DB, item: ContentItem) {
  const existing = db.prepare('SELECT sort FROM items WHERE id = ?').get(item.id) as { sort: number } | undefined;
  const sort =
    existing?.sort ??
    (db.prepare('SELECT COALESCE(MAX(sort), 0) + 1 AS s FROM items WHERE collection_id = ?').get(item.collectionId) as { s: number }).s;
  db.prepare(
    `INSERT INTO items(id, collection_id, kind, data, sort, created_at, updated_at) VALUES(?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET collection_id = excluded.collection_id, kind = excluded.kind, data = excluded.data, updated_at = excluded.updated_at`,
  ).run(item.id, item.collectionId, item.kind, JSON.stringify(item), sort, item.createdAt, item.updatedAt);
  db.prepare('UPDATE collections SET updated_at = ? WHERE id = ?').run(item.updatedAt, item.collectionId);
}

export function deleteItem(db: DB, id: string) {
  db.prepare('DELETE FROM items WHERE id = ?').run(id);
}

export function reorderItems(db: DB, collectionId: string, ids: string[]) {
  const stmt = db.prepare('UPDATE items SET sort = ? WHERE id = ? AND collection_id = ?');
  db.transaction(() => ids.forEach((id, i) => stmt.run(i + 1, id, collectionId)))();
}

// ---------------------------------------------------------------------------
// Vorlagen
// ---------------------------------------------------------------------------

interface TemplateRow {
  id: string;
  name: string;
  description: string;
  config: string;
  created_at: number;
  updated_at: number;
}

const toTemplate = (r: TemplateRow): Template => ({
  id: r.id,
  name: r.name,
  description: r.description,
  config: upgradeConfig(JSON.parse(r.config) as GameConfig),
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

export function listTemplates(db: DB): Template[] {
  return (db.prepare('SELECT * FROM templates ORDER BY name COLLATE NOCASE').all() as TemplateRow[]).map(toTemplate);
}

export function getTemplate(db: DB, id: string): Template | undefined {
  const r = db.prepare('SELECT * FROM templates WHERE id = ?').get(id) as TemplateRow | undefined;
  return r ? toTemplate(r) : undefined;
}

export function upsertTemplate(db: DB, t: Template) {
  db.prepare(
    `INSERT INTO templates(id, name, description, config, created_at, updated_at) VALUES(?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET name = excluded.name, description = excluded.description, config = excluded.config, updated_at = excluded.updated_at`,
  ).run(t.id, t.name, t.description, JSON.stringify(t.config), t.createdAt, t.updatedAt);
}

export function deleteTemplate(db: DB, id: string) {
  db.prepare('DELETE FROM templates WHERE id = ?').run(id);
}

// ---------------------------------------------------------------------------
// Spiele
// ---------------------------------------------------------------------------

export interface GameSummary {
  id: string;
  name: string;
  status: GameState['status'];
  teams: number;
  players: number;
  round: number;
  createdAt: number;
  updatedAt: number;
}

export function listGames(db: DB): GameSummary[] {
  const rows = db.prepare('SELECT id, name, status, state, created_at, updated_at FROM games ORDER BY updated_at DESC').all() as {
    id: string;
    name: string;
    status: GameState['status'];
    state: string;
    created_at: number;
    updated_at: number;
  }[];
  return rows.map((r) => {
    const s = JSON.parse(r.state) as GameState;
    return {
      id: r.id,
      name: r.name,
      status: r.status,
      teams: s.teams.length,
      players: s.players.length,
      round: s.round,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    };
  });
}

export function getGame(db: DB, id: string): GameState | undefined {
  const r = db.prepare('SELECT state FROM games WHERE id = ?').get(id) as { state: string } | undefined;
  return r ? upgradeState(JSON.parse(r.state) as GameState) : undefined;
}

export function saveGame(db: DB, s: GameState) {
  db.prepare(
    `INSERT INTO games(id, name, status, state, created_at, updated_at) VALUES(?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET name = excluded.name, status = excluded.status, state = excluded.state, updated_at = excluded.updated_at`,
  ).run(s.id, s.config.name, s.status, JSON.stringify(s), s.createdAt, s.updatedAt);
}

export function deleteGame(db: DB, id: string) {
  db.prepare('DELETE FROM games WHERE id = ?').run(id);
}

export function appendLog(
  db: DB,
  entry: { gameId: string; at: number; actor: string; command: unknown; label: string; effects: string[] },
) {
  db.prepare('INSERT INTO game_log(game_id, at, actor, command, label, effects) VALUES(?, ?, ?, ?, ?, ?)').run(
    entry.gameId,
    entry.at,
    entry.actor,
    JSON.stringify(entry.command),
    entry.label,
    JSON.stringify(entry.effects),
  );
}

export function recentLog(db: DB, gameId: string, limit = 200) {
  return db
    .prepare('SELECT at, actor, label, effects FROM game_log WHERE game_id = ? ORDER BY id DESC LIMIT ?')
    .all(gameId, limit) as { at: number; actor: string; label: string; effects: string }[];
}
