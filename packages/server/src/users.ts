/**
 * Konten für Spielleiter (und weitere Admins): Passwörter (scrypt), Anmeldeschlüssel und
 * einmalige Links für Einladung und Passwort-Zurücksetzen. Der Haupt-Admin meldet sich weiter
 * mit ADMIN_PASSWORD an und hat kein Konto.
 */
import { createHash, createHmac, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import type { Account } from '@insel/shared';
import { newId, staffKey } from './auth.ts';
import { config, isWeakPassword } from './config.ts';
import * as db from './db.ts';

const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 32 };

function scryptAsync(password: string, salt: Buffer, keylen: number, opts: { N: number; r: number; p: number }): Promise<Buffer> {
  return new Promise((resolve, reject) => scrypt(password, salt, keylen, { ...opts, maxmem: 64 * 1024 * 1024 }, (err, key) => (err ? reject(err) : resolve(key))));
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scryptAsync(password, salt, SCRYPT.keylen, SCRYPT);
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString('base64url')}$${hash.toString('base64url')}`;
}

/** Vergleich in konstanter Zeit; ohne gespeichertes Passwort wird trotzdem gerechnet (kein Zeit-Hinweis). */
export async function verifyPassword(password: string, stored: string | null): Promise<boolean> {
  const parts = stored?.split('$') ?? [];
  if (parts.length !== 6 || parts[0] !== 'scrypt') {
    await scryptAsync(password, randomBytes(16), SCRYPT.keylen, SCRYPT);
    return false;
  }
  const [, N, r, p, salt, hash] = parts as [string, string, string, string, string, string];
  const expected = Buffer.from(hash, 'base64url');
  const given = await scryptAsync(password, Buffer.from(salt, 'base64url'), expected.length, { N: Number(N), r: Number(r), p: Number(p) });
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/** Passwortregeln für Konten (wie für die Regie: mind. 10 Zeichen, kein bekanntes Passwort). */
export function passwordProblem(password: string): string | null {
  if (password.length > 200) return 'Das Passwort ist zu lang';
  if (isWeakPassword(password)) return 'Bitte mindestens 10 Zeichen und kein allgemein bekanntes Passwort';
  return null;
}

/**
 * Anmeldeschlüssel eines Kontos: hängt an Passwort und Schlüsselversion. Neues Passwort,
 * Sperren oder „überall abmelden“ macht damit alle Anmeldungen (und Beamer) ungültig.
 */
export function userKey(u: db.UserRecord): string {
  return createHmac('sha256', config.secret).update(`user|${u.id}|${u.keyVersion}|${u.password ?? ''}`).digest('base64url').slice(0, 12);
}

/** Schlüssel eines Besitzers (Konto oder Haupt-Admin) – für Beamer und Moderatoren seiner Spiele. */
export function ownerKey(database: db.DB, ownerId: string | null): string | null {
  if (!ownerId) return staffKey();
  const u = db.getUser(database, ownerId);
  return u && u.status === 'active' ? userKey(u) : null;
}

/** Moderator-Zugang zu einem Spiel: hängt am Spiel und am Schlüssel des Besitzers. */
export function gameStaffKey(database: db.DB, gameId: string, ownerId: string | null): string | null {
  const owner = ownerKey(database, ownerId);
  return owner ? createHmac('sha256', config.secret).update(`game|${gameId}|${owner}`).digest('base64url').slice(0, 12) : null;
}

/** Beamer eines Besitzers: zeigt immer dessen gerade gewähltes Spiel. */
export function beamerKey(database: db.DB, ownerId: string | null): string | null {
  const owner = ownerKey(database, ownerId);
  return owner ? createHmac('sha256', config.secret).update(`beamer|${ownerId ?? ''}|${owner}`).digest('base64url').slice(0, 12) : null;
}

export function toAccount(u: db.UserRecord): Account {
  return { id: u.id, email: u.email, name: u.name, role: u.role, status: u.status, createdAt: u.createdAt, lastLoginAt: u.lastLoginAt };
}

export function displayName(database: db.DB, ownerId: string | null | undefined): string {
  if (!ownerId) return 'Admin';
  return db.getUser(database, ownerId)?.name ?? 'Gelöschtes Konto';
}

export function createUser(database: db.DB, input: { email: string; name: string; role: 'admin' | 'leader' }): db.UserRecord {
  const now = Date.now();
  const user: db.UserRecord = {
    id: newId(),
    email: input.email.trim().toLowerCase(),
    name: input.name.trim(),
    role: input.role,
    status: 'invited',
    password: null,
    keyVersion: 1,
    currentGameId: null,
    createdAt: now,
    updatedAt: now,
    lastLoginAt: null,
  };
  db.insertUser(database, user);
  return user;
}

// ---------------------------------------------------------------------------
// Einmalige Links (Einladung: 7 Tage, Zurücksetzen: 1 Stunde)
// ---------------------------------------------------------------------------

export type LinkPurpose = 'invite' | 'reset';
const LINK_LIFETIME: Record<LinkPurpose, number> = { invite: 7 * 24 * 60 * 60_000, reset: 60 * 60_000 };
const hashToken = (token: string) => createHash('sha256').update(token).digest('base64url');

/** Neuen Link erzeugen; ältere Links desselben Zwecks werden ungültig. Gespeichert wird nur der Hash. */
export function issueLink(database: db.DB, userId: string, purpose: LinkPurpose): string {
  db.deleteUserTokens(database, userId, purpose);
  const token = randomBytes(32).toString('base64url');
  const now = Date.now();
  db.insertUserToken(database, { hash: hashToken(token), userId, purpose, expiresAt: now + LINK_LIFETIME[purpose], createdAt: now });
  return token;
}

/** Link prüfen (ohne ihn zu verbrauchen). */
export function checkLink(database: db.DB, token: string): { user: db.UserRecord; purpose: LinkPurpose } | null {
  if (!token || token.length > 100) return null;
  const t = db.findUserToken(database, hashToken(token));
  if (!t || t.expiresAt < Date.now()) return null;
  const user = db.getUser(database, t.userId);
  if (!user || user.status === 'disabled') return null;
  return { user, purpose: t.purpose as LinkPurpose };
}

/** Passwort über einen Link setzen: verbraucht ihn, aktiviert das Konto, meldet alle Geräte ab. */
export async function setPasswordWithLink(database: db.DB, token: string, password: string): Promise<db.UserRecord> {
  const link = checkLink(database, token);
  if (!link) throw new Error('Dieser Link ist ungültig oder abgelaufen. Bitte einen neuen anfordern.');
  const problem = passwordProblem(password);
  if (problem) throw new Error(problem);
  const hash = await hashPassword(password);
  // nochmals prüfen: inzwischen verbraucht? (zwei gleichzeitige Anfragen)
  if (!checkLink(database, token)) throw new Error('Dieser Link ist ungültig oder abgelaufen. Bitte einen neuen anfordern.');
  db.deleteUserTokens(database, link.user.id);
  db.updateUser(database, link.user.id, { password: hash, status: 'active', keyVersion: link.user.keyVersion + 1, updatedAt: Date.now() });
  return db.getUser(database, link.user.id)!;
}
