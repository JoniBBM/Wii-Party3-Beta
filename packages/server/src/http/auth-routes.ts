/** Anmeldung: Regie (Passwort), Moderator (Link/Passwort), Teams (PIN/QR), Spieler (Registrierung). */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { EngineError, teamColor } from '@insel/shared';
import { checkPassword, issueToken, noteFailure, rateLimited, staffKey, teamKey, tooManyFailures } from '../auth.ts';
import { config, security } from '../config.ts';
import type { GameRuntime } from '../runtime.ts';
import { clientIp, fromInternet, HttpError, requireRole, sessionOf, ADMIN } from './common.ts';

const INSECURE_ONLINE = 'Anmeldung übers Internet gesperrt: Das Passwort ist zu schwach oder öffentlich bekannt. Bitte in .env ein sicheres Passwort setzen (mindestens 10 Zeichen) und neu starten.';

export function authRoutes(app: FastifyInstance, runtime: GameRuntime) {
  app.post('/api/auth/admin', async (req) => {
    const body = z.object({ password: z.string().max(200).default('') }).parse(req.body ?? {});
    // übers Internet nur mit sicherem Passwort (auch wenn jemand den Tunnel von Hand startet)
    if (fromInternet(req) && (config.authDisabled || security.weakAdminPassword)) throw new HttpError(403, INSECURE_ONLINE);
    const ip = clientIp(req);
    if (tooManyFailures('admin', ip, 8, 60)) throw new HttpError(429, 'Zu viele Fehlversuche – bitte etwas warten');
    if (!config.authDisabled) {
      if (!config.adminPassword) throw new HttpError(500, 'Es ist kein ADMIN_PASSWORD gesetzt (siehe .env)');
      if (!checkPassword(body.password, config.adminPassword)) {
        noteFailure('admin', ip, 8);
        throw new HttpError(401, 'Falsches Passwort');
      }
    }
    return { token: issueToken({ role: 'admin', key: staffKey() }) };
  });

  app.post('/api/auth/moderator', async (req) => {
    const body = z.object({ password: z.string().max(200).default('') }).parse(req.body ?? {});
    if (fromInternet(req) && (config.authDisabled || security.weakAdminPassword || security.weakModeratorPassword)) throw new HttpError(403, INSECURE_ONLINE);
    const ip = clientIp(req);
    if (tooManyFailures('mod', ip, 8, 60)) throw new HttpError(429, 'Zu viele Fehlversuche – bitte etwas warten');
    const ok =
      config.authDisabled ||
      (config.moderatorPassword && checkPassword(body.password, config.moderatorPassword)) ||
      (config.adminPassword && checkPassword(body.password, config.adminPassword));
    if (!ok) {
      noteFailure('mod', ip, 8);
      throw new HttpError(401, 'Falsches Passwort');
    }
    return { token: issueToken({ role: 'moderator', key: staffKey() }) };
  });

  /** Regie erzeugt einen Moderator-Link (QR-Code), gültig für 24 Stunden. */
  app.post('/api/auth/moderator-link', async (req) => {
    requireRole(req, runtime, ADMIN);
    return { token: issueToken({ role: 'moderator', key: staffKey() }, 24 * 60 * 60 * 1000) };
  });

  /** Regie öffnet einen Beamer (Link mit Freigabe, 30 Tage gültig; neues Passwort = ungültig). */
  app.post('/api/auth/beamer-link', async (req) => {
    requireRole(req, runtime, ADMIN);
    return { token: issueToken({ role: 'beamer', key: staffKey() }) };
  });

  app.post('/api/auth/pin', async (req) => {
    const body = z.object({ pin: z.string().trim().regex(/^\d{4}$/, 'Die PIN hat 4 Ziffern') }).parse(req.body);
    const ip = clientIp(req);
    if (tooManyFailures('pin', ip, 10, 200)) throw new HttpError(429, 'Zu viele falsche PINs – bitte etwas warten');
    const state = runtime.state;
    const team = state?.teams.find((t) => t.pin === body.pin);
    if (!state || !team) {
      noteFailure('pin', ip, 10);
      throw new HttpError(404, 'Diese PIN gibt es nicht');
    }
    return { token: issueToken({ role: 'team', gameId: state.id, teamId: team.id, key: teamKey(team.joinToken) }), teamName: team.name };
  });

  /** Beitritt per Team-QR-Code: /join/t#c=<teamId>.<joinToken> (ältere Codes: /join/t/<…>) */
  app.post('/api/auth/team-link', async (req) => {
    const body = z.object({ code: z.string().max(200) }).parse(req.body);
    const ip = clientIp(req);
    if (tooManyFailures('link', ip, 20, 400)) throw new HttpError(429, 'Zu viele ungültige Codes – bitte etwas warten');
    const [teamId, secret] = body.code.split('.');
    const state = runtime.state;
    const team = state?.teams.find((t) => t.id === teamId);
    if (!state || !team || !secret || !checkPassword(secret, team.joinToken)) {
      noteFailure('link', ip, 20);
      throw new HttpError(404, 'Dieser Team-Code ist nicht (mehr) gültig');
    }
    return { token: issueToken({ role: 'team', gameId: state.id, teamId: team.id, key: teamKey(team.joinToken) }), teamName: team.name };
  });

  /** Öffentliche Anmeldung als Spieler (Lobby). */
  app.post('/api/auth/register', async (req) => {
    const body = z.object({ name: z.string().trim().min(1, 'Bitte einen Namen eingeben').max(40), emoji: z.string().max(16).optional() }).parse(req.body);
    // großzügig: an einer Anmeldestation melden sich viele hintereinander an
    if (rateLimited(`reg:${clientIp(req)}`, 60)) throw new HttpError(429, 'Zu viele Anmeldungen – bitte kurz warten');
    const state = runtime.state;
    if (!state) throw new HttpError(404, 'Es läuft gerade kein Spiel');
    const session = sessionOf(req, state);
    const actor =
      session.role === 'team'
        ? { role: 'team' as const, teamId: session.teamId }
        : { role: 'guest' as const };
    const result = runtime.dispatch({ type: 'player.register', name: body.name, emoji: body.emoji }, actor);
    const playerId = String(result.meta.playerId);
    return { token: issueToken({ role: 'player', gameId: state.id, playerId }), playerId };
  });

  /** Ein Team-Gerät wird zu einem bestimmten Spieler des Teams (z. B. nach Gerätewechsel). */
  app.post('/api/auth/become-player', async (req) => {
    const body = z.object({ playerId: z.string().max(64) }).parse(req.body);
    const state = runtime.state;
    const session = sessionOf(req, state);
    if (session.role !== 'team' && session.role !== 'player') throw new HttpError(401, 'Bitte zuerst mit der Team-PIN beitreten');
    const ownTeam = session.role === 'team' ? session.teamId : state?.players.find((p) => p.id === session.playerId)?.teamId;
    const player = state?.players.find((p) => p.id === body.playerId);
    if (!state || !player || !ownTeam || player.teamId !== ownTeam) throw new HttpError(404, 'Spieler nicht in eurem Team');
    return { token: issueToken({ role: 'player', gameId: state.id, playerId: player.id }) };
  });

  app.get('/api/auth/me', async (req) => {
    const state = runtime.state;
    const session = sessionOf(req, state);
    const player = state?.players.find((p) => p.id === session.playerId);
    const teamId = session.teamId ?? player?.teamId ?? null;
    const team = state?.teams.find((t) => t.id === teamId);
    return {
      session,
      authDisabled: config.authDisabled,
      player: player ? { id: player.id, name: player.name } : null,
      team: team ? { id: team.id, name: team.name, color: teamColor(team.color).hex } : null,
    };
  });

  app.setErrorHandler((err, _req, reply) => {
    if (err instanceof HttpError) return reply.status(err.status).send({ error: err.message });
    if (err instanceof EngineError) {
      const status = { invalid: 400, forbidden: 403, not_found: 404, busy: 409 }[err.code];
      return reply.status(status).send({ error: err.message, code: err.code });
    }
    if (err instanceof z.ZodError) {
      const issue = err.issues[0];
      return reply.status(400).send({ error: issue?.message ?? 'Ungültige Eingabe', path: issue?.path });
    }
    const e = err as { statusCode?: number; message?: string };
    if (e.statusCode && e.statusCode < 500) return reply.status(e.statusCode).send({ error: e.message });
    app.log.error(err);
    return reply.status(500).send({ error: 'Unerwarteter Fehler auf dem Server' });
  });
}
