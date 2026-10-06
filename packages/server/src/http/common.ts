import type { FastifyReply, FastifyRequest } from 'fastify';
import type { GameState, Role, Session } from '@insel/shared';
import { bearer, verifyToken } from '../auth.ts';
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

export function sendJsonFile(reply: FastifyReply, filename: string, data: unknown) {
  reply
    .header('Content-Type', 'application/json; charset=utf-8')
    .header('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`)
    .send(JSON.stringify(data, null, 2));
}
