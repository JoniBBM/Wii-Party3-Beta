import type { FastifyReply, FastifyRequest } from 'fastify';
import type { GameState, Role, Session } from '@insel/shared';
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
import { resolveSession } from '../live.ts';
import { config } from '../config.ts';
import type { GameRuntime } from '../runtime.ts';

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export function sessionOf(req: FastifyRequest, state: GameState | null): Session {
  return resolveSession(verifyToken(bearer(req.headers.authorization)), state, 'guest');
}

export function requireRole(req: FastifyRequest, runtime: GameRuntime, roles: Role[]): Session {
  const s = sessionOf(req, runtime.state);
  if (!roles.includes(s.role)) {
    throw new HttpError(s.role === 'guest' ? 401 : 403, s.role === 'guest' ? 'Bitte anmelden' : 'Keine Berechtigung');
  }
  return s;
}

export const STAFF: Role[] = ['admin', 'moderator'];
export const ADMIN: Role[] = ['admin'];

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
