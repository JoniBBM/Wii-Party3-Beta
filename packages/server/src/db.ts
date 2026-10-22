/**
 * SQLite-Speicher. Inhalte (Sammlungen, Fragen, Spiele) und Vorlagen sind normale Tabellen;
 * ein laufendes Spiel wird als JSON-Snapshot gespeichert (nach jeder Änderung).
 */
import { randomBytes } from 'node:crypto';
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
  // v2: Konten (Spielleiter), mehrere Spiele gleichzeitig, Besitz von Inhalten
  `
  CREATE TABLE users (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    role TEXT NOT NULL,
    status TEXT NOT NULL,
    password TEXT,
    key_version INTEGER NOT NULL DEFAULT 1,
    current_game_id TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    last_login_at INTEGER
  );
  CREATE TABLE user_tokens (
    hash TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    purpose TEXT NOT NULL,
    expires_at INTEGER NOT NULL,
    created_at INTEGER NOT NULL
  );
  ALTER TABLE games ADD COLUMN owner_id TEXT;
  ALTER TABLE games ADD COLUMN code TEXT;
  ALTER TABLE games ADD COLUMN open INTEGER NOT NULL DEFAULT 0;
  ALTER TABLE games ADD COLUMN show TEXT;
  CREATE UNIQUE INDEX games_code ON games(code);
  ALTER TABLE collections ADD COLUMN owner_id TEXT;
  ALTER TABLE collections ADD COLUMN published INTEGER NOT NULL DEFAULT 0;
  ALTER TABLE templates ADD COLUMN owner_id TEXT;
  `,
];

/** Daten an neue Spalten anpassen (läuft einmal direkt nach der jeweiligen Migration). */
const DATA_MIGRATIONS: Record<number, (db: DB) => void> = {
  2: (db) => {
    // Bisherige Inhalte gehören dem Admin und sind für alle sichtbar
    db.exec('UPDATE collections SET published = 1');
    // Jedes Spiel bekommt einen Spielcode; das bisher aktive Spiel bleibt geöffnet
    const settings = Object.fromEntries(
      (db.prepare('SELECT key, value FROM settings').all() as { key: string; value: string }[]).map((r) => [r.key, JSON.parse(r.value) as unknown]),
    );
    for (const { id, state } of db.prepare('SELECT id, state FROM games').all() as { id: string; state: string }[]) {
      const code = freeCode(db);
      const s = JSON.parse(state) as GameState;
      s.code = code;
      db.prepare('UPDATE games SET code = ?, state = ?, open = ?, show = ? WHERE id = ?').run(
        code,
        JSON.stringify(s),
        id === settings.activeGameId ? 1 : 0,
        settings.show ? JSON.stringify(settings.show) : null,
        id,
      );
    }
    if (typeof settings.activeGameId === 'string') {
      db.prepare("INSERT INTO settings(key, value) VALUES('adminGameId', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(
        JSON.stringify(settings.activeGameId),
      );
    }
  },
};

/** Spielcodes: 4 Zeichen ohne Verwechsler (kein I, O, 0, 1). */
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export function freeCode(db: DB): string {
  for (let i = 0; i < 1000; i++) {
    const bytes = randomBytes(4);
    const code = [...bytes].map((b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');
    if (!db.prepare('SELECT 1 FROM games WHERE code = ?').get(code)) return code;
  }
  throw new Error('Kein freier Spielcode');
}

export function openDb(file = config.dbFile): DB {
  const db = new Database(file);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('synchronous = NORMAL');
  const version = db.pragma('user_version', { simple: true }) as number;
  for (let v = version; v < MIGRATIONS.length; v++) {
    db.exec('BEGIN');
    db.exec(MIGRATIONS[v]!);
    DATA_MIGRATIONS[v + 1]?.(db);
    db.pragma(`user_version = ${v + 1}`);
    db.exec('COMMIT');
  }
  return db;
}

// ---------------------------------------------------------------------------
// Einstellungen
// ---------------------------------------------------------------------------

/** E-Mail-Versand (Einladungen, Passwort zurücksetzen). */
export interface SmtpSettings {
  host: string;
  port: number;
  /** tls = verschlüsselt ab Verbindungsbeginn (meist 465), starttls = später verschlüsselt (587), none = unverschlüsselt */
  security: 'tls' | 'starttls' | 'none';
  user: string;
  password: string;
  fromAddress: string;
  fromName: string;
}

export interface AppSettings {
  appName: string;
  /** Spiel, das der Haupt-Admin gerade steuert (seine Beamer zeigen es). */
  adminGameId: string | null;
  /** Bevorzugte Beitritts-Adresse (leer = automatisch). */
  joinUrl: string;
  /** E-Mail-Versand; null = nicht eingerichtet */
  smtp: SmtpSettings | null;
}

const DEFAULT_SETTINGS: AppSettings = {
  appName: 'Insel der Abenteuer',
  adminGameId: null,
  joinUrl: '',
  smtp: null,
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
  owner_id: string | null;
  published: number;
  created_at: number;
  updated_at: number;
  item_count?: number;
}

const toCollection = (r: CollectionRow): Collection => ({
  id: r.id,
  name: r.name,
  description: r.description,
  itemCount: r.item_count ?? 0,
  ownerId: r.owner_id,
  published: r.published === 1,
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
  db.prepare('INSERT INTO collections(id, name, description, owner_id, published, sort, created_at, updated_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?)').run(
    c.id,
    c.name,
    c.description,
    c.ownerId ?? null,
    c.published ? 1 : 0,
    sort,
    c.createdAt,
    c.updatedAt,
  );
}

export function setCollectionPublished(db: DB, id: string, published: boolean, now: number) {
  db.prepare('UPDATE collections SET published = ?, updated_at = ? WHERE id = ?').run(published ? 1 : 0, now, id);
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
  owner_id: string | null;
  created_at: number;
  updated_at: number;
}

const toTemplate = (r: TemplateRow): Template => ({
  id: r.id,
  name: r.name,
  description: r.description,
  config: upgradeConfig(JSON.parse(r.config) as GameConfig),
  ownerId: r.owner_id,
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
    `INSERT INTO templates(id, name, description, config, owner_id, created_at, updated_at) VALUES(?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET name = excluded.name, description = excluded.description, config = excluded.config, updated_at = excluded.updated_at`,
  ).run(t.id, t.name, t.description, JSON.stringify(t.config), t.ownerId ?? null, t.createdAt, t.updatedAt);
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
  code: string;
  status: GameState['status'];
  /** Geöffnet = Handys und Beamer können beitreten */
  open: boolean;
  ownerId: string | null;
  teams: number;
  players: number;
  round: number;
  createdAt: number;
  updatedAt: number;
}

interface GameRow {
  id: string;
  name: string;
  code: string;
  status: GameState['status'];
  open: number;
  owner_id: string | null;
  state: string;
  created_at: number;
  updated_at: number;
}

export function listGames(db: DB, ownerId?: string): GameSummary[] {
  const rows = (
    ownerId === undefined
      ? db.prepare('SELECT * FROM games ORDER BY updated_at DESC').all()
      : db.prepare('SELECT * FROM games WHERE owner_id = ? ORDER BY updated_at DESC').all(ownerId)
  ) as GameRow[];
  return rows.map((r) => {
    const s = JSON.parse(r.state) as GameState;
    return {
      id: r.id,
      name: r.name,
      code: r.code,
      status: r.status,
      open: r.open === 1,
      ownerId: r.owner_id,
      teams: s.teams.length,
      players: s.players.length,
      round: s.round,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    };
  });
}

export interface GameMeta {
  id: string;
  code: string;
  ownerId: string | null;
  open: boolean;
  show: unknown;
}

export function getGameMeta(db: DB, id: string): GameMeta | undefined {
  const r = db.prepare('SELECT id, code, owner_id, open, show FROM games WHERE id = ?').get(id) as
    | { id: string; code: string; owner_id: string | null; open: number; show: string | null }
    | undefined;
  return r ? { id: r.id, code: r.code, ownerId: r.owner_id, open: r.open === 1, show: r.show ? (JSON.parse(r.show) as unknown) : null } : undefined;
}

export function gameIdByCode(db: DB, code: string): string | null {
  const r = db.prepare('SELECT id FROM games WHERE code = ?').get(code.toUpperCase()) as { id: string } | undefined;
  return r?.id ?? null;
}

export function openGameIds(db: DB): string[] {
  return (db.prepare('SELECT id FROM games WHERE open = 1').all() as { id: string }[]).map((r) => r.id);
}

export function getGame(db: DB, id: string): GameState | undefined {
  const r = db.prepare('SELECT state FROM games WHERE id = ?').get(id) as { state: string } | undefined;
  return r ? upgradeState(JSON.parse(r.state) as GameState) : undefined;
}

/** Neues Spiel anlegen (mit Besitzer und Beamer-Einstellungen). */
export function insertGame(db: DB, s: GameState, ownerId: string | null, show: unknown) {
  db.prepare('INSERT INTO games(id, name, code, status, state, owner_id, open, show, created_at, updated_at) VALUES(?, ?, ?, ?, ?, ?, 0, ?, ?, ?)').run(
    s.id,
    s.config.name,
    s.code,
    s.status,
    JSON.stringify(s),
    ownerId,
    show === null || show === undefined ? null : JSON.stringify(show),
    s.createdAt,
    s.updatedAt,
  );
}

export function saveGame(db: DB, s: GameState) {
  db.prepare('UPDATE games SET name = ?, status = ?, state = ?, updated_at = ? WHERE id = ?').run(s.config.name, s.status, JSON.stringify(s), s.updatedAt, s.id);
}

export function setGameOpen(db: DB, id: string, open: boolean) {
  db.prepare('UPDATE games SET open = ? WHERE id = ?').run(open ? 1 : 0, id);
}

export function setGameShow(db: DB, id: string, show: unknown) {
  db.prepare('UPDATE games SET show = ? WHERE id = ?').run(JSON.stringify(show), id);
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

// ---------------------------------------------------------------------------
// Konten (Spielleiter, weitere Admins) und Einladungs-/Zurücksetzen-Links
// ---------------------------------------------------------------------------

export interface UserRecord {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'leader';
  status: 'invited' | 'active' | 'disabled';
  /** scrypt-Hash; null = noch kein Passwort (Einladung offen) */
  password: string | null;
  /** erhöht = alle Anmeldungen dieses Kontos ungültig */
  keyVersion: number;
  currentGameId: string | null;
  createdAt: number;
  updatedAt: number;
  lastLoginAt: number | null;
}

interface UserRow {
  id: string;
  email: string;
  name: string;
  role: UserRecord['role'];
  status: UserRecord['status'];
  password: string | null;
  key_version: number;
  current_game_id: string | null;
  created_at: number;
  updated_at: number;
  last_login_at: number | null;
}

const toUser = (r: UserRow): UserRecord => ({
  id: r.id,
  email: r.email,
  name: r.name,
  role: r.role,
  status: r.status,
  password: r.password,
  keyVersion: r.key_version,
  currentGameId: r.current_game_id,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
  lastLoginAt: r.last_login_at,
});

export function listUsers(db: DB): UserRecord[] {
  return (db.prepare('SELECT * FROM users ORDER BY name COLLATE NOCASE').all() as UserRow[]).map(toUser);
}

/** Konten werden bei jeder Zustandsänderung je Gerät geprüft – deshalb im Speicher zwischengespeichert. */
const userCache = new WeakMap<DB, Map<string, UserRecord | null>>();
function clearUserCache(db: DB) {
  userCache.delete(db);
}

export function getUser(db: DB, id: string): UserRecord | undefined {
  let cache = userCache.get(db);
  if (!cache) userCache.set(db, (cache = new Map()));
  if (cache.has(id)) return cache.get(id) ?? undefined;
  const r = db.prepare('SELECT * FROM users WHERE id = ?').get(id) as UserRow | undefined;
  const u = r ? toUser(r) : null;
  if (cache.size > 1000) cache.clear();
  cache.set(id, u);
  return u ?? undefined;
}

export function getUserByEmail(db: DB, email: string): UserRecord | undefined {
  const r = db.prepare('SELECT * FROM users WHERE email = ?').get(email.trim().toLowerCase()) as UserRow | undefined;
  return r ? toUser(r) : undefined;
}

export function insertUser(db: DB, u: UserRecord) {
  db.prepare(
    `INSERT INTO users(id, email, name, role, status, password, key_version, current_game_id, created_at, updated_at, last_login_at)
     VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(u.id, u.email.toLowerCase(), u.name, u.role, u.status, u.password, u.keyVersion, u.currentGameId, u.createdAt, u.updatedAt, u.lastLoginAt);
  clearUserCache(db);
}

export function updateUser(db: DB, id: string, patch: Partial<Omit<UserRecord, 'id' | 'createdAt'>>) {
  const cols: Record<string, string> = {
    email: 'email',
    name: 'name',
    role: 'role',
    status: 'status',
    password: 'password',
    keyVersion: 'key_version',
    currentGameId: 'current_game_id',
    updatedAt: 'updated_at',
    lastLoginAt: 'last_login_at',
  };
  const sets: string[] = [];
  const values: unknown[] = [];
  for (const [k, v] of Object.entries(patch)) {
    const col = cols[k];
    if (!col) continue;
    sets.push(`${col} = ?`);
    values.push(k === 'email' && typeof v === 'string' ? v.toLowerCase() : v);
  }
  if (!sets.length) return;
  db.prepare(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`).run(...values, id);
  clearUserCache(db);
}

/** Konto löschen: Spiele, Sammlungen und Vorlagen gehen an den Admin über. */
export function deleteUser(db: DB, id: string) {
  db.transaction(() => {
    db.prepare('UPDATE games SET owner_id = NULL WHERE owner_id = ?').run(id);
    db.prepare('UPDATE collections SET owner_id = NULL WHERE owner_id = ?').run(id);
    db.prepare('UPDATE templates SET owner_id = NULL WHERE owner_id = ?').run(id);
    db.prepare('DELETE FROM users WHERE id = ?').run(id);
  })();
  clearUserCache(db);
}

export function insertUserToken(db: DB, t: { hash: string; userId: string; purpose: string; expiresAt: number; createdAt: number }) {
  db.prepare('INSERT INTO user_tokens(hash, user_id, purpose, expires_at, created_at) VALUES(?, ?, ?, ?, ?)').run(t.hash, t.userId, t.purpose, t.expiresAt, t.createdAt);
}

export function findUserToken(db: DB, hash: string): { userId: string; purpose: string; expiresAt: number } | undefined {
  const r = db.prepare('SELECT user_id, purpose, expires_at FROM user_tokens WHERE hash = ?').get(hash) as
    | { user_id: string; purpose: string; expires_at: number }
    | undefined;
  return r ? { userId: r.user_id, purpose: r.purpose, expiresAt: r.expires_at } : undefined;
}

/** Links eines Kontos löschen (alle oder nur eines Zwecks) und abgelaufene aufräumen. */
export function deleteUserTokens(db: DB, userId: string, purpose?: string) {
  if (purpose) db.prepare('DELETE FROM user_tokens WHERE user_id = ? AND purpose = ?').run(userId, purpose);
  else db.prepare('DELETE FROM user_tokens WHERE user_id = ?').run(userId);
  db.prepare('DELETE FROM user_tokens WHERE expires_at < ?').run(Date.now());
}
