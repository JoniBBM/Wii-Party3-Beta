/** System: Beitritts-Adressen (WLAN, Tunnel, öffentlich), App-Name, Gesundheit. */
import { existsSync } from 'node:fs';
import { networkInterfaces } from 'node:os';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { config, security } from '../config.ts';
import * as db from '../db.ts';
import type { Live } from '../live.ts';
import type { GameRuntime } from '../runtime.ts';
import { isPrivileged } from '@insel/shared';
import { ADMIN, requireRole, sessionOf, STAFF } from './common.ts';

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

export function systemRoutes(app: FastifyInstance, runtime: GameRuntime, database: db.DB, live: Live) {
  app.get('/api/health', async () => ({ ok: true, version: config.version }));

  app.get('/api/system/info', async (req) => {
    const settings = db.getSettings(database);
    // Netzwerkadressen und Spiel-ID nur für Spielleitung und freigegebene Beamer (QR-Code)
    const role = sessionOf(req, runtime.state).role;
    const trusted = isPrivileged(role) || role === 'beamer';
    const urls = trusted ? await joinUrls(req, database) : [];
    return {
      appName: settings.appName,
      version: config.version,
      authDisabled: config.authDisabled,
      joinUrls: urls,
      joinUrl: urls[0]?.url ?? null,
      activeGameId: trusted ? (runtime.state?.id ?? null) : null,
      serverNow: Date.now(),
    };
  });

  /** Sicherheitslage für die Regie (Warnhinweis bei schwachem Passwort o. Ä.). */
  app.get('/api/system/security', async (req) => {
    requireRole(req, runtime, STAFF);
    return { ...security, authDisabled: config.authDisabled, online: config.online };
  });

  app.put('/api/system/settings', async (req) => {
    requireRole(req, runtime, ADMIN);
    const body = z
      .object({
        appName: z.string().trim().min(1).max(60).optional(),
        joinUrl: z.union([z.literal(''), z.string().trim().url('Bitte eine vollständige Adresse mit http(s)://')]).optional(),
      })
      .parse(req.body);
    db.setSettings(database, body);
    live.notifyStaff('settings');
    return db.getSettings(database);
  });
}
