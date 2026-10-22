/** Konten verwalten (nur Admins): Spielleiter einladen, sperren, Passwort-Link schicken, löschen. */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import * as db from '../db.ts';
import { createUser, toAccount } from '../users.ts';
import { deliverLink } from './account-links.ts';
import { HttpError, requireAccount, type Ctx } from './common.ts';

const idParam = z.object({ id: z.string().regex(/^[a-z0-9]{4,40}$/) });
const email = z.string().trim().toLowerCase().email('Bitte eine gültige E-Mail-Adresse').max(200);
const role = z.enum(['admin', 'leader']);

export function usersRoutes(app: FastifyInstance, ctx: Ctx) {
  const { database, hub, live } = ctx;
  const changed = () => live.notifyStaff('users');
  const target = (req: { params: unknown }) => {
    const user = db.getUser(database, idParam.parse(req.params).id);
    if (!user) throw new HttpError(404, 'Konto nicht gefunden');
    return user;
  };

  app.get('/api/users', async (req) => {
    requireAccount(req, ctx, { admin: true });
    const games = db.listGames(database);
    const smtp = db.getSettings(database).smtp;
    const { online, lastSeen } = live.accounts();
    return {
      users: db.listUsers(database).map((u) => ({
        ...toAccount(u),
        games: games.filter((g) => g.ownerId === u.id).length,
        // offene Regie-Fenster/Geräte gerade jetzt; zuletzt gesehen (seit dem Serverstart)
        online: online[u.id] ?? 0,
        lastSeenAt: lastSeen[u.id] ?? null,
      })),
      mailReady: !!smtp,
    };
  });

  /** Neues Konto: bekommt eine Einladung (per E-Mail, sonst Link zum Weitergeben). */
  app.post('/api/users', async (req) => {
    requireAccount(req, ctx, { admin: true });
    const body = z.object({ email, name: z.string().trim().min(1, 'Bitte einen Namen eingeben').max(60), role: role.default('leader') }).parse(req.body);
    if (db.getUserByEmail(database, body.email)) throw new HttpError(409, 'Für diese E-Mail-Adresse gibt es schon ein Konto');
    const user = createUser(database, body);
    const delivery = await deliverLink(database, user, 'invite', req);
    changed();
    return { account: toAccount(user), ...delivery };
  });

  app.put('/api/users/:id', async (req) => {
    const acc = requireAccount(req, ctx, { admin: true });
    const user = target(req);
    const body = z.object({ name: z.string().trim().min(1).max(60).optional(), email: email.optional(), role: role.optional(), disabled: z.boolean().optional() }).parse(req.body);
    // sich selbst nicht aussperren
    if (user.id === acc.userId && (body.disabled || body.role === 'leader')) throw new HttpError(400, 'Du kannst dich nicht selbst sperren oder herabstufen');
    if (body.email && body.email !== user.email && db.getUserByEmail(database, body.email)) throw new HttpError(409, 'Für diese E-Mail-Adresse gibt es schon ein Konto');
    const patch: Partial<db.UserRecord> = { updatedAt: Date.now() };
    if (body.name) patch.name = body.name;
    if (body.email) patch.email = body.email;
    if (body.role) patch.role = body.role;
    if (body.disabled === true) {
      patch.status = 'disabled';
      patch.keyVersion = user.keyVersion + 1; // sofort überall abgemeldet
      db.deleteUserTokens(database, user.id);
    } else if (body.disabled === false && user.status === 'disabled') {
      patch.status = user.password ? 'active' : 'invited';
    }
    db.updateUser(database, user.id, patch);
    live.refreshAccounts();
    changed();
    return toAccount(db.getUser(database, user.id)!);
  });

  /** Einladung erneut schicken bzw. Link zum Passwort-Zurücksetzen erzeugen. */
  app.post('/api/users/:id/link', async (req) => {
    requireAccount(req, ctx, { admin: true });
    const user = target(req);
    if (user.status === 'disabled') throw new HttpError(400, 'Das Konto ist gesperrt – bitte erst entsperren');
    return deliverLink(database, user, user.status === 'invited' ? 'invite' : 'reset', req);
  });

  /** Überall abmelden (z. B. Handy verloren). */
  app.post('/api/users/:id/logout', async (req) => {
    requireAccount(req, ctx, { admin: true });
    const user = target(req);
    db.updateUser(database, user.id, { keyVersion: user.keyVersion + 1, updatedAt: Date.now() });
    live.refreshAccounts();
    return { ok: true };
  });

  /** Konto löschen: Spiele, Sammlungen und Vorlagen gehen an den Admin über. */
  app.delete('/api/users/:id', async (req) => {
    const acc = requireAccount(req, ctx, { admin: true });
    const user = target(req);
    if (user.id === acc.userId) throw new HttpError(400, 'Du kannst dein eigenes Konto nicht löschen');
    db.deleteUser(database, user.id);
    hub.refreshMeta();
    live.refreshAccounts();
    changed();
    live.notifyStaff('games');
    live.notifyStaff('library');
    return { ok: true };
  });
}
