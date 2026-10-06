/**
 * Sitzungen als signierte Tokens (HMAC-SHA256). Kein Server-Session-Speicher nötig:
 * Geräte behalten ihr Token im localStorage und schicken es bei REST und WebSocket mit.
 */
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { Role, Session } from '@insel/shared';
import { config } from './config.ts';

interface TokenPayload {
  r: Role;
  g?: string | null;
  t?: string | null;
  p?: string | null;
  k?: string | null;
  iat: number;
  exp: number;
}

/** Kurzer Fingerabdruck des Team-Schlüssels: Neue PIN → alte Team-Geräte ungültig. */
export function teamKey(joinToken: string): string {
  return createHash('sha256').update(joinToken).digest('base64url').slice(0, 12);
}

/**
 * Schlüssel der Spielleitung: hängt an den Passwörtern. Wer ADMIN_PASSWORD (oder
 * MODERATOR_PASSWORD) ändert, macht alle bisherigen Regie-, Moderator- und Beamer-Tokens ungültig.
 */
export function staffKey(): string {
  return createHmac('sha256', config.secret).update(`staff|${config.adminPassword}|${config.moderatorPassword}`).digest('base64url').slice(0, 12);
}

const DAY = 24 * 60 * 60 * 1000;
const LIFETIME: Partial<Record<Role, number>> = {
  admin: 3 * DAY,
  moderator: 2 * DAY,
  beamer: 30 * DAY,
  team: 3 * DAY,
  player: 3 * DAY,
};

const b64 = (buf: Buffer | string) => Buffer.from(buf).toString('base64url');

function sign(data: string): string {
  return createHmac('sha256', config.secret).update(data).digest('base64url');
}

export function issueToken(session: Session, lifetimeMs?: number): string {
  const now = Date.now();
  const payload: TokenPayload = {
    r: session.role,
    g: session.gameId ?? null,
    t: session.teamId ?? null,
    p: session.playerId ?? null,
    k: session.key ?? null,
    iat: now,
    exp: now + (lifetimeMs ?? LIFETIME[session.role] ?? DAY),
  };
  const body = b64(JSON.stringify(payload));
  return `v1.${body}.${sign(body)}`;
}

export function verifyToken(token: string | undefined | null): Session | null {
  if (!token || typeof token !== 'string') return null;
  const [v, body, sig] = token.split('.');
  if (v !== 'v1' || !body || !sig) return null;
  const expected = Buffer.from(sign(body));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const p = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as TokenPayload;
    if (typeof p.exp !== 'number' || p.exp < Date.now()) return null;
    return { role: p.r, gameId: p.g ?? null, teamId: p.t ?? null, playerId: p.p ?? null, key: p.k ?? null };
  } catch {
    return null;
  }
}

/** Passwortvergleich in konstanter Zeit (auch die Länge verrät nichts). */
export function checkPassword(given: string, expected: string): boolean {
  if (!expected) return false;
  const h = (v: string) => createHmac('sha256', config.secret).update(v).digest();
  return timingSafeEqual(h(given), h(expected));
}

/** Kurze, gut lesbare IDs. */
export function newId(len = 10): string {
  const alphabet = 'abcdefghijkmnopqrstuvwxyz23456789';
  const bytes = randomBytes(len);
  let out = '';
  for (let i = 0; i < len; i++) out += alphabet[bytes[i]! % alphabet.length];
  return out;
}

export function newSecretToken(): string {
  return randomBytes(18).toString('base64url');
}

/**
 * Bremse gegen Raten von PIN und Passwort. Gezählt werden nur **Fehlversuche**. Je IP: nach
 * `perIp` Fehlern ist diese IP gesperrt – mit jeder weiteren Sperre doppelt so lang (bis 1 h).
 * Insgesamt gibt es eine großzügige Obergrenze gegen massenhaftes Raten von vielen Adressen,
 * die nur das Raten bremst (erfolgreiche Anmeldungen werden nie gezählt).
 */
interface FailBucket {
  count: number;
  since: number;
  /** gesperrt bis (ms) */
  until: number;
  /** Anzahl bisheriger Sperren (für die Verdopplung) */
  strikes: number;
}
const failures = new Map<string, FailBucket>();

function bucket(key: string, windowMs: number): FailBucket {
  const now = Date.now();
  let b = failures.get(key);
  if (!b) {
    if (failures.size > 10_000) {
      // alte, nicht gesperrte Einträge aufräumen
      for (const [k, v] of failures) if (v.until < now && now - v.since > windowMs) failures.delete(k);
    }
    b = { count: 0, since: now, until: 0, strikes: 0 };
    failures.set(key, b);
  } else if (now - b.since > windowMs && b.until < now) {
    b.count = 0;
    b.since = now;
  }
  return b;
}

export function tooManyFailures(scope: string, ip: string, perIp = 10, global = 200, windowMs = 60_000): boolean {
  const now = Date.now();
  const mine = bucket(`${scope}:${ip}`, windowMs);
  if (mine.until > now) return true;
  return bucket(`${scope}:*`, windowMs).count >= global;
}

export function noteFailure(scope: string, ip: string, perIp = 10, windowMs = 60_000) {
  const mine = bucket(`${scope}:${ip}`, windowMs);
  mine.count += 1;
  if (mine.count >= perIp) {
    mine.strikes += 1;
    mine.until = Date.now() + Math.min(60 * 60_000, windowMs * 2 ** (mine.strikes - 1));
    mine.count = 0;
  }
  bucket(`${scope}:*`, windowMs).count += 1;
}

/** Einfache Mengenbremse (z. B. Anmeldungen), großzügig bemessen. */
const counters = new Map<string, { count: number; since: number }>();
export function rateLimited(key: string, max: number, windowMs = 60_000): boolean {
  const now = Date.now();
  const a = counters.get(key);
  if (!a || now - a.since > windowMs) {
    if (counters.size > 5000) counters.clear();
    counters.set(key, { count: 1, since: now });
    return false;
  }
  a.count += 1;
  return a.count > max;
}

export function bearer(header: string | undefined): string | null {
  if (!header) return null;
  const m = /^Bearer\s+(.+)$/i.exec(header);
  return m ? m[1]!.trim() : null;
}
