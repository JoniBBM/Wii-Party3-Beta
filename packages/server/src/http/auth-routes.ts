/**
 * Anmeldung: Haupt-Admin (ADMIN_PASSWORD), Spielleiter-Konten (E-Mail + Passwort), Moderator
 * (Link/Passwort + Spielcode), Teams (PIN + Spielcode / QR), Spieler (Registrierung mit Spielcode),
 * Konto-Links (Einladung, Passwort vergessen) und das eigene Konto.
 */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { EngineError, teamColor } from '@insel/shared';
import { accountOf } from '../access.ts';
import { checkPassword, issueToken, rateLimited, staffKey, teamKey } from '../auth.ts';
import { config, security } from '../config.ts';
import * as db from '../db.ts';
import { beamerKey, checkLink, gameStaffKey, hashPassword, passwordProblem, setPasswordWithLink, toAccount, userKey, verifyPassword } from '../users.ts';
import { CODE_LIMITS } from '../live.ts';
import { deliverLink } from './account-links.ts';
import {
  clientIp,
  fromInternet,
  gameSession,
  HttpError,
  loginThrottled,
  noteLoginFailure,
  noteLoginSuccess,
  rawSession,
  requestGame,
  requireAccount,
  type Ctx,
  type LoginLimits,
} from './common.ts';

/**
 * Grenzen für Fehlversuche. Passwörter sind lang (mind. 10 Zeichen) – da reicht die Minute.
 * Team-PINs sind kurz: zusätzlich höchstens 100 Fehlversuche je Stunde für alle zusammen.
 * Team-Codes aus dem QR-Code und Konto-Links sind unerratbar – kein globaler Eimer, sonst könnte
 * jemand mit Unsinn alle QR-Beitritte blockieren.
 */
const LIMITS = {
  admin: { perMinute: 15, perIp: 8 },
  login: { perMinute: 20, perIp: 8 },
  mod: { perMinute: 15, perIp: 8 },
  pin: { perMinute: 20, perHour: 100, perIp: 10 },
  link: { perMinute: 30, perIp: 20, global: false },
  forgot: { perMinute: 10, perHour: 60, perIp: 5 },
  // Spielcodes sind kurz: Durchprobieren bremsen (gemeinsamer Eimer mit dem WebSocket, siehe live.ts)
  code: { ...CODE_LIMITS, perIp: 20 },
} satisfies Record<string, LoginLimits>;

const INSECURE_ONLINE = 'Anmeldung übers Internet gesperrt: Das Passwort ist zu schwach oder öffentlich bekannt. Bitte in .env ein sicheres Passwort setzen (mindestens 10 Zeichen) und neu starten.';
const codeSchema = z.string().trim().regex(/^[A-Za-z0-9]{4,8}$/, 'Bitte den Spielcode eingeben');
const email = z.string().trim().toLowerCase().email('Bitte eine gültige E-Mail-Adresse').max(200);

export function authRoutes(app: FastifyInstance, ctx: Ctx) {
  const { database, hub } = ctx;
  /** Geöffnetes Spiel zu einem Spielcode – sonst 404. */
  const gameByCode = (code: string) => {
    const id = hub.byCode(code);
    const rt = hub.get(id);
    if (!id || !rt) throw new HttpError(404, 'Zu diesem Spielcode läuft gerade kein Spiel');
    return rt;
  };

  // -------------------------------------------------------------------------
  // Haupt-Admin und Spielleiter-Konten
  // -------------------------------------------------------------------------

  app.post('/api/auth/admin', async (req) => {
    const body = z.object({ password: z.string().max(200).default('') }).parse(req.body ?? {});
    // übers Internet nur mit sicherem Passwort (auch wenn jemand den Tunnel von Hand startet)
    if (fromInternet(req) && (config.authDisabled || security.weakAdminPassword)) throw new HttpError(403, INSECURE_ONLINE);
    if (loginThrottled('admin', req, LIMITS.admin)) throw new HttpError(429, 'Zu viele Fehlversuche – bitte etwas warten');
    if (!config.authDisabled) {
      if (!config.adminPassword) throw new HttpError(500, 'Es ist kein ADMIN_PASSWORD gesetzt (siehe .env)');
      if (!checkPassword(body.password, config.adminPassword)) {
        noteLoginFailure('admin', req, LIMITS.admin);
        throw new HttpError(401, 'Falsches Passwort');
      }
    }
    noteLoginSuccess(req);
    return { token: issueToken({ role: 'admin', key: staffKey() }) };
  });

  /** Spielleiter (und weitere Admins) mit E-Mail und Passwort. */
  app.post('/api/auth/login', async (req) => {
    const body = z.object({ email: z.string().trim().toLowerCase().max(200), password: z.string().max(200) }).parse(req.body);
    if (loginThrottled('login', req, LIMITS.login)) throw new HttpError(429, 'Zu viele Fehlversuche – bitte etwas warten');
    const user = db.getUserByEmail(database, body.email);
    // auch ohne Konto rechnen, damit die Antwortzeit nichts verrät
    const ok = await verifyPassword(body.password, user?.password ?? null);
    if (!user || !ok || user.status !== 'active') {
      noteLoginFailure('login', req, LIMITS.login);
      // „gesperrt“ nur mit richtigem Passwort verraten – sonst ließen sich Konten erraten
      throw new HttpError(401, ok && user?.status === 'disabled' ? 'Dieses Konto ist gesperrt' : 'E-Mail oder Passwort falsch');
    }
    noteLoginSuccess(req);
    db.updateUser(database, user.id, { lastLoginAt: Date.now() });
    return { token: issueToken({ role: 'leader', userId: user.id, key: userKey(user) }), account: toAccount(user) };
  });

  /** Passwort vergessen: Link per E-Mail. Antwortet immer gleich (verrät nicht, ob es das Konto gibt). */
  app.post('/api/auth/forgot', async (req) => {
    const body = z.object({ email }).parse(req.body);
    if (loginThrottled('forgot', req, LIMITS.forgot)) throw new HttpError(429, 'Zu viele Anfragen – bitte etwas warten');
    noteLoginFailure('forgot', req, LIMITS.forgot); // jede Anfrage zählt
    const user = db.getUserByEmail(database, body.email);
    if (user && user.status !== 'disabled' && !rateLimited(`forgot:${user.id}`, 1, 2 * 60_000)) {
      // ohne Passwort (Einladung offen) gibt es einen neuen Einladungslink
      void deliverLink(database, user, user.status === 'invited' ? 'invite' : 'reset').catch(() => {});
    }
    return { ok: true, mail: !!db.getSettings(database).smtp };
  });

  /** Link prüfen (für die Seite „Passwort festlegen“). */
  app.post('/api/auth/link-info', async (req) => {
    const body = z.object({ token: z.string().max(100) }).parse(req.body);
    if (loginThrottled('link', req, LIMITS.link)) throw new HttpError(429, 'Zu viele Versuche – bitte etwas warten');
    const link = checkLink(database, body.token);
    if (!link) {
      noteLoginFailure('link', req, LIMITS.link);
      throw new HttpError(404, 'Dieser Link ist ungültig oder abgelaufen. Bitte einen neuen anfordern.');
    }
    return { email: link.user.email, name: link.user.name, purpose: link.purpose };
  });

  /** Passwort über Einladungs-/Zurücksetzen-Link festlegen – danach gleich angemeldet. */
  app.post('/api/auth/set-password', async (req) => {
    const body = z.object({ token: z.string().max(100), password: z.string().max(200) }).parse(req.body);
    if (loginThrottled('link', req, LIMITS.link)) throw new HttpError(429, 'Zu viele Versuche – bitte etwas warten');
    let user: db.UserRecord;
    try {
      user = await setPasswordWithLink(database, body.token, body.password);
    } catch (err) {
      if (!checkLink(database, body.token)) noteLoginFailure('link', req, LIMITS.link);
      throw new HttpError(400, err instanceof Error ? err.message : 'Passwort konnte nicht gesetzt werden');
    }
    noteLoginSuccess(req);
    ctx.live.refreshAccounts();
    db.updateUser(database, user.id, { lastLoginAt: Date.now() });
    return { token: issueToken({ role: 'leader', userId: user.id, key: userKey(user) }), account: toAccount(user) };
  });

  /** Eigenes Konto: Name ändern. */
  app.put('/api/account', async (req) => {
    const acc = requireAccount(req, ctx);
    if (!acc.userId) throw new HttpError(400, 'Der Haupt-Admin hat kein Konto (Passwort steht in .env)');
    const body = z.object({ name: z.string().trim().min(1).max(60) }).parse(req.body);
    db.updateUser(database, acc.userId, { name: body.name, updatedAt: Date.now() });
    ctx.live.notifyStaff('users');
    return toAccount(db.getUser(database, acc.userId)!);
  });

  /** Eigenes Passwort ändern – andere Geräte werden abgemeldet, dieses bekommt einen neuen Zugang. */
  app.post('/api/account/password', async (req) => {
    const acc = requireAccount(req, ctx);
    if (!acc.userId) throw new HttpError(400, 'Das Admin-Passwort steht in der Datei .env');
    const body = z.object({ current: z.string().max(200), next: z.string().max(200) }).parse(req.body);
    if (loginThrottled('login', req, LIMITS.login)) throw new HttpError(429, 'Zu viele Fehlversuche – bitte etwas warten');
    const user = db.getUser(database, acc.userId)!;
    if (!(await verifyPassword(body.current, user.password))) {
      noteLoginFailure('login', req, LIMITS.login);
      throw new HttpError(401, 'Das bisherige Passwort stimmt nicht');
    }
    const problem = passwordProblem(body.next);
    if (problem) throw new HttpError(400, problem);
    db.updateUser(database, user.id, { password: await hashPassword(body.next), keyVersion: user.keyVersion + 1, updatedAt: Date.now() });
    ctx.live.refreshAccounts();
    const fresh = db.getUser(database, user.id)!;
    return { token: issueToken({ role: 'leader', userId: fresh.id, key: userKey(fresh) }) };
  });

  // -------------------------------------------------------------------------
  // Moderator und Beamer
  // -------------------------------------------------------------------------

  /** Moderator mit Passwort (MODERATOR_PASSWORD bzw. Regie-Passwort) und Spielcode. */
  app.post('/api/auth/moderator', async (req) => {
    const body = z.object({ password: z.string().max(200).default(''), code: codeSchema }).parse(req.body ?? {});
    if (fromInternet(req) && (config.authDisabled || security.weakAdminPassword || security.weakModeratorPassword)) throw new HttpError(403, INSECURE_ONLINE);
    if (loginThrottled('mod', req, LIMITS.mod)) throw new HttpError(429, 'Zu viele Fehlversuche – bitte etwas warten');
    const ok =
      config.authDisabled ||
      (config.moderatorPassword && checkPassword(body.password, config.moderatorPassword)) ||
      (config.adminPassword && checkPassword(body.password, config.adminPassword));
    if (!ok) {
      noteLoginFailure('mod', req, LIMITS.mod);
      throw new HttpError(401, 'Falsches Passwort');
    }
    const rt = gameByCode(body.code);
    const key = gameStaffKey(database, rt.state.id, hub.meta(rt.state.id)?.ownerId ?? null);
    if (!key) throw new HttpError(403, 'Das Konto dieses Spiels ist nicht aktiv');
    noteLoginSuccess(req);
    return { token: issueToken({ role: 'moderator', gameId: rt.state.id, key }) };
  });

  /** Regie erzeugt einen Moderator-Link für ihr gewähltes Spiel (QR-Code), gültig für 24 Stunden. */
  app.post('/api/auth/moderator-link', async (req) => {
    const acc = requireAccount(req, ctx);
    const gameId = hub.currentOf(acc.userId);
    if (!gameId || !hub.get(gameId)) throw new HttpError(409, 'Bitte zuerst ein Spiel wählen');
    const key = gameStaffKey(database, gameId, hub.meta(gameId)?.ownerId ?? null);
    if (!key) throw new HttpError(403, 'Das Konto dieses Spiels ist nicht aktiv');
    return { token: issueToken({ role: 'moderator', gameId, key }, 24 * 60 * 60 * 1000) };
  });

  /**
   * Regie öffnet einen Beamer (Link mit Freigabe, 30 Tage). Er gehört dem Besitzer des gewählten
   * Spiels (bzw. dem eigenen Konto) und zeigt immer dessen gewähltes Spiel.
   */
  app.post('/api/auth/beamer-link', async (req) => {
    const acc = requireAccount(req, ctx);
    const gameId = hub.currentOf(acc.userId);
    const ownerId = gameId ? (hub.meta(gameId)?.ownerId ?? null) : acc.userId;
    const key = beamerKey(database, ownerId);
    if (!key) throw new HttpError(403, 'Das Konto des Spiels ist nicht aktiv');
    return { token: issueToken({ role: 'beamer', userId: ownerId, key }) };
  });

  // -------------------------------------------------------------------------
  // Teams und Spieler
  // -------------------------------------------------------------------------

  /** Spielcode prüfen (Beitrittsseite): Name des Spiels oder 404. */
  app.post('/api/join/check', async (req) => {
    const body = z.object({ code: codeSchema }).parse(req.body);
    if (loginThrottled('code', req, LIMITS.code)) throw new HttpError(429, 'Zu viele Versuche – bitte etwas warten');
    const id = hub.byCode(body.code);
    const rt = hub.get(id);
    if (!rt) {
      noteLoginFailure('code', req, LIMITS.code);
      throw new HttpError(404, 'Zu diesem Spielcode läuft gerade kein Spiel');
    }
    return { code: rt.state.code, name: rt.state.config.name };
  });

  app.post('/api/auth/pin', async (req) => {
    // neue PINs haben 6 Ziffern, ältere Spielstände noch 4
    const body = z.object({ pin: z.string().trim().regex(/^(\d{4}|\d{6})$/, 'Die PIN hat 6 Ziffern'), code: codeSchema }).parse(req.body);
    if (loginThrottled('pin', req, LIMITS.pin)) {
      throw new HttpError(429, 'Gerade zu viele falsche PINs – bitte etwas warten oder den QR-Code des Teams scannen');
    }
    const id = hub.byCode(body.code);
    const state = hub.get(id)?.state;
    const team = state?.teams.find((t) => t.pin === body.pin);
    if (!state || !team) {
      noteLoginFailure('pin', req, LIMITS.pin);
      throw new HttpError(404, state ? 'Diese PIN gibt es nicht' : 'Zu diesem Spielcode läuft gerade kein Spiel');
    }
    noteLoginSuccess(req);
    return { token: issueToken({ role: 'team', gameId: state.id, teamId: team.id, key: teamKey(team.joinToken) }), teamName: team.name, code: state.code };
  });

  /** Beitritt per Team-QR-Code: /join/t#c=<teamId>.<joinToken> (ältere Codes: /join/t/<…>) */
  app.post('/api/auth/team-link', async (req) => {
    const body = z.object({ code: z.string().max(200) }).parse(req.body);
    if (loginThrottled('link', req, LIMITS.link)) throw new HttpError(429, 'Zu viele ungültige Codes – bitte etwas warten');
    const [teamId, secret] = body.code.split('.');
    const found = teamId ? hub.findTeam(teamId) : null;
    if (!found || !secret || !checkPassword(secret, found.team.joinToken)) {
      noteLoginFailure('link', req, LIMITS.link);
      throw new HttpError(404, 'Dieser Team-Code ist nicht (mehr) gültig');
    }
    noteLoginSuccess(req);
    const { team, gameId } = found;
    return {
      token: issueToken({ role: 'team', gameId, teamId: team.id, key: teamKey(team.joinToken) }),
      teamName: team.name,
      code: hub.get(gameId)?.state.code ?? '',
    };
  });

  /** Öffentliche Anmeldung als Spieler (Lobby) – mit Spielcode oder von einem Team-Gerät. */
  app.post('/api/auth/register', async (req) => {
    const body = z
      .object({ name: z.string().trim().min(1, 'Bitte einen Namen eingeben').max(40), emoji: z.string().max(16).optional(), code: codeSchema.optional() })
      .parse(req.body);
    // großzügig: an einer Anmeldestation (und im WLAN über eine gemeinsame Adresse) melden sich
    // viele hintereinander an; die Gesamtzahl begrenzt ohnehin MAX_PLAYERS in der Engine
    if (rateLimited(`reg:${clientIp(req)}`, 180)) throw new HttpError(429, 'Zu viele Anmeldungen – bitte kurz warten');
    const gameId = requestGame(req, ctx, body.code ?? null);
    const rt = hub.get(gameId);
    if (!rt) throw new HttpError(404, 'Zu diesem Spielcode läuft gerade kein Spiel');
    const session = gameSession(req, ctx, rt.state.id);
    const actor = session.role === 'team' ? { role: 'team' as const, teamId: session.teamId } : { role: 'guest' as const };
    const result = rt.dispatch({ type: 'player.register', name: body.name, emoji: body.emoji }, actor);
    const playerId = String(result.meta.playerId);
    return { token: issueToken({ role: 'player', gameId: rt.state.id, playerId }), playerId, code: rt.state.code };
  });

  /** Ein Team-Gerät wird zu einem bestimmten Spieler des Teams (z. B. nach Gerätewechsel). */
  app.post('/api/auth/become-player', async (req) => {
    const body = z.object({ playerId: z.string().max(64) }).parse(req.body);
    const gameId = requestGame(req, ctx);
    const state = hub.get(gameId)?.state;
    const session = gameSession(req, ctx, gameId);
    if (session.role !== 'team' && session.role !== 'player') throw new HttpError(401, 'Bitte zuerst mit der Team-PIN beitreten');
    const ownTeam = session.role === 'team' ? session.teamId : state?.players.find((p) => p.id === session.playerId)?.teamId;
    const player = state?.players.find((p) => p.id === body.playerId);
    if (!state || !player || !ownTeam || player.teamId !== ownTeam) throw new HttpError(404, 'Spieler nicht in eurem Team');
    const team = state.teams.find((t) => t.id === ownTeam);
    // An das Team binden: eine neue PIN (joinToken wechselt) macht auch diesen Spieler-Token ungültig
    return { token: issueToken({ role: 'player', gameId: state.id, playerId: player.id, key: team ? teamKey(team.joinToken) : null }) };
  });

  /** Wer bin ich? (Rolle im Spiel, Konto, Team/Spieler) */
  app.get('/api/auth/me', async (req) => {
    const q = z.object({ code: z.string().max(8).optional() }).parse(req.query);
    const gameId = requestGame(req, ctx, q.code ?? null);
    const state = hub.get(gameId)?.state ?? null;
    const session = gameSession(req, ctx, gameId);
    const acc = accountOf(database, rawSession(req));
    const user = acc?.userId ? db.getUser(database, acc.userId) : undefined;
    const player = state?.players.find((p) => p.id === session.playerId);
    const teamId = session.teamId ?? player?.teamId ?? null;
    const team = state?.teams.find((t) => t.id === teamId);
    return {
      session,
      authDisabled: config.authDisabled,
      account: acc ? { id: acc.userId, name: acc.name, isAdmin: acc.isAdmin, email: user?.email ?? null, main: acc.userId === null } : null,
      game: state ? { id: state.id, code: state.code, name: state.config.name } : null,
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
