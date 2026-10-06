import type { FastifyReply, FastifyRequest } from 'fastify';
import type { GameState, Role, Session } from '@insel/shared';
import { bearer, globalAttemptsExhausted, noteFailure, spendAttempt, tooManyFailures, verifyToken } from '../auth.ts';
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

/** Client-IP. Weitergeleitete Header gelten nur von lokalen Proxys (siehe trustProxy in main.ts). */
export function clientIp(req: FastifyRequest): string {
  return req.ip;
}

/**
 * Anmeldeversuche bremsen – zweischichtig:
 *  - immer ein globaler Fehlversuch-Eimer (`perMinute`): fängt verteiltes Raten ab, auch wenn
 *    alle Geräte im WLAN dieselbe Adresse haben oder online die IP gewechselt wird. Nur
 *    Fehlversuche zählen, ein richtiges Passwort/eine richtige PIN wird nie gesperrt.
 *  - zusätzlich übers Internet (echte IP je Gerät) die bisherige Sperre je Adresse (`perIp`).
 *    Im WLAN entfällt sie, damit ein paar Tippfehler nicht den ganzen Saal aussperren.
 */
export function loginThrottled(scope: string, req: FastifyRequest, perMinute: number, perIp: number): boolean {
  if (globalAttemptsExhausted(scope, perMinute)) return true;
  return fromInternet(req) && tooManyFailures(scope, clientIp(req), perIp);
}
export function noteLoginFailure(scope: string, req: FastifyRequest, perMinute: number, perIp: number) {
  spendAttempt(scope, perMinute);
  if (fromInternet(req)) noteFailure(scope, clientIp(req), perIp);
}

export function sendJsonFile(reply: FastifyReply, filename: string, data: unknown) {
  reply
    .header('Content-Type', 'application/json; charset=utf-8')
    .header('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`)
    .send(JSON.stringify(data, null, 2));
}
