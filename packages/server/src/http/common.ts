import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Session } from '@insel/shared';
import { accountOf, canManage, effectiveSession, gameOf, type AccountCtx } from '../access.ts';
import {
  bearer,
  globalAttemptsExhausted,
  isGoodAddress,
  noteFailure,
  noteGoodAddress,
  spendAttempt,
  tooManyFailures,
  verifyToken,
  type AttemptLimits,
} from '../auth.ts';
import { clientAddress, ipKey } from '../net.ts';
import { config } from '../config.ts';
import * as db from '../db.ts';
import type { GameHub } from '../hub.ts';
import type { Live } from '../live.ts';

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

/** Was alle Routen brauchen. */
export interface Ctx {
  database: db.DB;
  hub: GameHub;
  live: Live;
}

/** Angaben aus dem Token (noch ungeprüft). */
export function rawSession(req: FastifyRequest): Session | null {
  return verifyToken(bearer(req.headers.authorization));
}

/** Angemeldetes Konto (Haupt-Admin oder Spielleiter) – sonst 401/403. `admin`: nur Admins. */
export function requireAccount(req: FastifyRequest, ctx: Ctx, opts: { admin?: boolean } = {}): AccountCtx {
  const acc = accountOf(ctx.database, rawSession(req));
  if (!acc) throw new HttpError(401, 'Bitte anmelden');
  if (opts.admin && !acc.isAdmin) throw new HttpError(403, 'Nur für Admins');
  return acc;
}

/** Konto, das dieses Spiel steuern darf (Admins alle, Spielleiter eigene). */
export function requireGame(req: FastifyRequest, ctx: Ctx, gameId: string): AccountCtx {
  const acc = requireAccount(req, ctx);
  if (!ctx.hub.meta(gameId)) throw new HttpError(404, 'Spiel nicht gefunden');
  if (!canManage(ctx.hub, acc, gameId)) throw new HttpError(403, 'Das ist nicht dein Spiel');
  return acc;
}

/** Spiel, an dem die Anfrage hängt (Konto: gewähltes Spiel, Team/Spieler/Moderator: Token, Gast: Spielcode). */
export function requestGame(req: FastifyRequest, ctx: Ctx, code?: string | null): string | null {
  return gameOf(ctx.database, ctx.hub, rawSession(req), { code });
}

/** Rolle der Anfrage in einem Spiel. */
export function gameSession(req: FastifyRequest, ctx: Ctx, gameId: string | null): Session {
  return effectiveSession(ctx.database, ctx.hub, rawSession(req), gameId);
}

/**
 * Wer liest Bibliothek und Vorlagen? Ein Konto – oder ein Moderator mit den Leserechten des
 * Spielbesitzers (ändern darf er nichts, dafür prüfen die Schreib-Routen requireAccount).
 */
export function readerOf(req: FastifyRequest, ctx: Ctx): AccountCtx {
  const acc = accountOf(ctx.database, rawSession(req));
  if (acc) return acc;
  const gameId = requestGame(req, ctx);
  if (!gameId || gameSession(req, ctx, gameId).role !== 'moderator') throw new HttpError(401, 'Bitte anmelden');
  const ownerId = ctx.hub.meta(gameId)?.ownerId ?? null;
  const user = ownerId ? db.getUser(ctx.database, ownerId) : undefined;
  return { userId: ownerId, isAdmin: ownerId === null || user?.role === 'admin', name: user?.name ?? 'Admin' };
}

/** Spielleitung (Konto oder Moderator) im Spiel der Anfrage – sonst 401/403. */
export function requireStaff(req: FastifyRequest, ctx: Ctx): { gameId: string | null; session: Session } {
  const gameId = requestGame(req, ctx);
  const session = gameSession(req, ctx, gameId);
  if (session.role === 'admin' || session.role === 'leader' || session.role === 'moderator') return { gameId, session };
  throw new HttpError(session.role === 'guest' ? 401 : 403, session.role === 'guest' ? 'Bitte anmelden' : 'Keine Berechtigung');
}

/**
 * Kommt die Anfrage (vermutlich) aus dem Internet? Internet-Betrieb (./start.sh online,
 * PUBLIC_URL) oder über den Cloudflare-Tunnel. Ein gefälschter Header macht es nur strenger.
 */
export function fromInternet(req: FastifyRequest): boolean {
  return config.online || req.headers['cf-connecting-ip'] !== undefined;
}

/** Absender der Anfrage (siehe net.ts): Adresse und ob sie einzelne Anschlüsse unterscheidet. */
export function client(req: FastifyRequest): { ip: string; distinct: boolean } {
  return clientAddress(req.socket.remoteAddress, req.headers);
}

/** Schlüssel für Mengenbremsen: Client-Adresse (IPv6 je /64). */
export function clientIp(req: FastifyRequest): string {
  return ipKey(client(req).ip);
}

export interface LoginLimits extends AttemptLimits {
  /** Sperre je Adresse nach so vielen Fehlversuchen in einer Minute (verdoppelt sich, bis 1 h) */
  perIp: number;
  /** Globaler Eimer? Bei unerratbaren Codes aus – dort würde er nur das Aussperren aller ermöglichen. */
  global?: boolean;
}

/**
 * Anmeldeversuche bremsen – zweischichtig:
 *  - ein globaler Fehlversuch-Eimer je Minute (und ggf. je Stunde): fängt verteiltes Raten ab,
 *    auch bei IP-Wechsel. Nur Fehlversuche zählen.
 *  - eine Sperre je Adresse – aber nur, wenn die Adresse echt ist (über den eigenen Tunnel/Proxy)
 *    und von dort noch niemand richtig angemeldet wurde. So sperren ein paar Tippfehler weder den
 *    Saal im WLAN noch alle Gäste hinter dem gemeinsamen Internetanschluss der Location aus.
 */
export function loginThrottled(scope: string, req: FastifyRequest, limits: LoginLimits): boolean {
  if (limits.global !== false && globalAttemptsExhausted(scope, limits)) return true;
  const { ip, distinct } = client(req);
  const key = ipKey(ip);
  // die Gesamtgrenze regelt der globale Eimer – hier nur die einzelne Adresse
  return distinct && !isGoodAddress(key) && tooManyFailures(scope, key, limits.perIp, Number.POSITIVE_INFINITY);
}
export function noteLoginFailure(scope: string, req: FastifyRequest, limits: LoginLimits) {
  if (limits.global !== false) spendAttempt(scope, limits);
  const { ip, distinct } = client(req);
  const key = ipKey(ip);
  if (distinct && !isGoodAddress(key)) noteFailure(scope, key, limits.perIp);
}
export function noteLoginSuccess(req: FastifyRequest) {
  const { ip, distinct } = client(req);
  if (distinct) noteGoodAddress(ipKey(ip));
}

export function sendJsonFile(reply: FastifyReply, filename: string, data: unknown) {
  reply
    .header('Content-Type', 'application/json; charset=utf-8')
    .header('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`)
    .send(JSON.stringify(data, null, 2));
}
