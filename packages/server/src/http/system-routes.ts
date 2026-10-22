/** System: Beitritts-Adressen (WLAN, Tunnel, öffentlich), App-Name, Gesundheit. */
import { existsSync } from 'node:fs';
import { networkInterfaces } from 'node:os';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { accountOf } from '../access.ts';
import { config, security } from '../config.ts';
import * as db from '../db.ts';
import { buttonMail, mailError, sendMail } from '../mail.ts';
import { trustWarning } from '../net.ts';
import { client, gameSession, HttpError, rawSession, requestGame, requireAccount, type Ctx } from './common.ts';

const inDocker = existsSync('/.dockerenv');

let tunnelCache: { url: string | null; at: number } = { url: null, at: 0 };

async function tunnelUrl(): Promise<string | null> {
  if (!config.tunnelMetrics) return null;
  if (Date.now() - tunnelCache.at < 15_000) return tunnelCache.url;
  try {
    const res = await fetch(`${config.tunnelMetrics.replace(/\/$/, '')}/quicktunnel`, { signal: AbortSignal.timeout(1500) });
    const data = (await res.json()) as { hostname?: string };
    tunnelCache = { url: data.hostname ? `https://${data.hostname}` : null, at: Date.now() };
  } catch {
    tunnelCache = { url: null, at: Date.now() };
  }
  return tunnelCache.url;
}

function lanAddresses(): string[] {
  if (inDocker) return [];
  const out: string[] = [];
  for (const list of Object.values(networkInterfaces())) {
    for (const a of list ?? []) {
      if (a.family === 'IPv4' && !a.internal && !a.address.startsWith('169.254.')) out.push(a.address);
    }
  }
  return out;
}

export interface JoinUrl {
  kind: 'custom' | 'public' | 'tunnel' | 'lan' | 'origin';
  label: string;
  url: string;
}

export async function joinUrls(req: FastifyRequest, database: db.DB): Promise<JoinUrl[]> {
  const settings = db.getSettings(database);
  const port = Number(process.env.HOST_PORT ?? config.port);
  const urls: JoinUrl[] = [];
  const add = (u: JoinUrl) => {
    if (!urls.some((x) => x.url === u.url)) urls.push(u);
  };
  if (settings.joinUrl) add({ kind: 'custom', label: 'Eigene Adresse', url: settings.joinUrl.replace(/\/$/, '') });
  if (config.publicUrl) add({ kind: 'public', label: 'Öffentliche Adresse', url: config.publicUrl.replace(/\/$/, '') });
  const tunnel = await tunnelUrl();
  if (tunnel) add({ kind: 'tunnel', label: 'Internet (Tunnel)', url: tunnel });
  if (config.hostIp) add({ kind: 'lan', label: 'WLAN', url: `http://${config.hostIp}:${port}` });
  for (const ip of lanAddresses()) add({ kind: 'lan', label: 'WLAN', url: `http://${ip}:${port}` });
  const host = req.headers['x-forwarded-host'] ?? req.headers.host;
  const proto = (req.headers['x-forwarded-proto'] as string | undefined) ?? 'http';
  if (host && !/^(localhost|127\.)/.test(String(host))) add({ kind: 'origin', label: 'Aktuelle Adresse', url: `${proto}://${host}` });
  return urls;
}

const smtpInput = z.object({
  host: z.string().trim().min(1, 'Bitte den Mailserver angeben').max(200),
  port: z.number().int().min(1).max(65535),
  security: z.enum(['tls', 'starttls', 'none']),
  user: z.string().trim().max(200).default(''),
  /** leer = bisheriges Passwort behalten */
  password: z.string().max(500).default(''),
  fromAddress: z.string().trim().email('Bitte eine gültige Absenderadresse').max(200),
  fromName: z.string().trim().max(100).default(''),
});

export function systemRoutes(app: FastifyInstance, ctx: Ctx) {
  const { database, hub, live } = ctx;

  app.get('/api/health', async () => ({ ok: true, version: config.version }));

  app.get('/api/system/info', async (req) => {
    const settings = db.getSettings(database);
    // Netzwerkadressen und Spiel-ID nur für Spielleitung, Moderatoren und freigegebene Beamer (QR-Code)
    const gameId = requestGame(req, ctx);
    const session = gameSession(req, ctx, gameId);
    const trusted = !!accountOf(database, rawSession(req)) || session.role === 'moderator' || session.role === 'beamer';
    const urls = trusted ? await joinUrls(req, database) : [];
    return {
      appName: settings.appName,
      version: config.version,
      authDisabled: config.authDisabled,
      joinUrls: urls,
      joinUrl: urls[0]?.url ?? null,
      activeGameId: trusted ? gameId : null,
      serverNow: Date.now(),
    };
  });

  /** Sicherheitslage für die Regie (Warnhinweis bei schwachem Passwort o. Ä.) – nur für Admins. */
  app.get('/api/system/security', async (req) => {
    const acc = requireAccount(req, ctx);
    if (!acc.isAdmin) return { weakAdminPassword: false, weakModeratorPassword: false, authDisabled: false, online: config.online, unknownClients: false, trustUnsafe: false };
    // Kommt die Anfrage über Cloudflare, ohne dass der Tunnel als eigener Proxy erkannt wird?
    // Dann sehen alle Gäste gleich aus (nur globale Bremsen) – Hinweis auf TRUST_PROXY.
    const unknownClients = req.headers['cf-connecting-ip'] !== undefined && !client(req).distinct;
    return { ...security, authDisabled: config.authDisabled, online: config.online, unknownClients, trustUnsafe: trustWarning() !== null };
  });

  app.put('/api/system/settings', async (req) => {
    requireAccount(req, ctx, { admin: true });
    const body = z
      .object({
        appName: z.string().trim().min(1).max(60).optional(),
        joinUrl: z.union([z.literal(''), z.string().trim().url('Bitte eine vollständige Adresse mit http(s)://')]).optional(),
      })
      .parse(req.body);
    db.setSettings(database, body);
    live.notifyStaff('settings');
    const s = db.getSettings(database);
    return { appName: s.appName, joinUrl: s.joinUrl };
  });

  // -------------------------------------------------------------------------
  // E-Mail (SMTP) – das Passwort verlässt den Server nie wieder
  // -------------------------------------------------------------------------

  app.get('/api/system/smtp', async (req) => {
    requireAccount(req, ctx, { admin: true });
    const smtp = db.getSettings(database).smtp;
    return {
      smtp: smtp ? { ...smtp, password: '' } : null,
      hasPassword: !!smtp?.password,
      // Links in E-Mails brauchen eine feste Adresse (sonst ließen sie sich umbiegen)
      linkBase: config.publicUrl || db.getSettings(database).joinUrl || null,
    };
  });

  app.put('/api/system/smtp', async (req) => {
    requireAccount(req, ctx, { admin: true });
    const body = z.object({ smtp: smtpInput.nullable() }).parse(req.body);
    const before = db.getSettings(database).smtp;
    const smtp = body.smtp ? { ...body.smtp, password: body.smtp.password || before?.password || '' } : null;
    db.setSettings(database, { smtp });
    return { ok: true, configured: !!smtp };
  });

  /** Testmail an eine Adresse (prüft die Einstellungen). */
  app.post('/api/system/smtp/test', async (req) => {
    const acc = requireAccount(req, ctx, { admin: true });
    const body = z.object({ to: z.string().trim().email('Bitte eine gültige E-Mail-Adresse') }).parse(req.body);
    const settings = db.getSettings(database);
    if (!settings.smtp) throw new HttpError(400, 'Bitte zuerst den Mailserver eintragen und speichern');
    const base = config.publicUrl || settings.joinUrl || `http://${req.headers.host ?? 'localhost'}`;
    try {
      await sendMail(
        settings.smtp,
        buttonMail({
          to: body.to,
          appName: settings.appName,
          subject: `Testmail – ${settings.appName}`,
          lines: [`Hallo ${acc.name},`, 'der E-Mail-Versand funktioniert. Einladungen und Links zum Zurücksetzen von Passwörtern kommen jetzt an.'],
          button: 'Zur Regie',
          url: `${base.replace(/\/$/, '')}/regie`,
          footer: 'Diese E-Mail wurde aus den Einstellungen der Regie verschickt.',
        }),
      );
    } catch (err) {
      throw new HttpError(502, mailError(err));
    }
    return { ok: true };
  });

  /** Überblick für Admins: Konten, Spiele, geöffnete Spiele. */
  app.get('/api/system/overview', async (req) => {
    requireAccount(req, ctx, { admin: true });
    const games = db.listGames(database);
    return { users: db.listUsers(database).length, games: games.length, openGames: hub.openIds().length, mailReady: !!db.getSettings(database).smtp };
  });
}
