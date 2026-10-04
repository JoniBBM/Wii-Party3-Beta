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

const DAY = 24 * 60 * 60 * 1000;
const LIFETIME: Partial<Record<Role, number>> = {
  admin: 14 * DAY,
  moderator: 2 * DAY,
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

export function checkPassword(given: string, expected: string): boolean {
  if (!expected) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
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
 * Bremse gegen Raten von PIN und Passwort. Gezählt werden nur **Fehlversuche** – sowohl je IP als
 * auch insgesamt. (Hinter Docker Desktop teilen sich oft alle Handys eine IP; erfolgreiche
 * Anmeldungen dürfen deshalb nie gebremst werden.)
 */
const failures = new Map<string, { count: number; since: number }>();

function bucket(key: string, windowMs: number) {
  const now = Date.now();
  let b = failures.get(key);
  if (!b || now - b.since > windowMs) {
    b = { count: 0, since: now };
    failures.set(key, b);
  }
  if (failures.size > 5000) failures.clear();
  return b;
}

export function tooManyFailures(scope: string, ip: string, perIp = 10, global = 40, windowMs = 60_000): boolean {
  return bucket(`${scope}:${ip}`, windowMs).count >= perIp || bucket(`${scope}:*`, windowMs).count >= global;
}

export function noteFailure(scope: string, ip: string, windowMs = 60_000) {
  bucket(`${scope}:${ip}`, windowMs).count += 1;
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
