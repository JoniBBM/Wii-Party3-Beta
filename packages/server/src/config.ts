/** Laufzeit-Konfiguration aus Umgebungsvariablen (siehe .env.example). */
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
/** Projektwurzel (…/packages/server/src → ../../..) bzw. im Docker-Image /app. */
export const ROOT = resolve(here, '..', '..', '..');

function loadDotEnv() {
  const file = join(ROOT, '.env');
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (!m || line.trim().startsWith('#')) continue;
    const key = m[1]!;
    let value = m[2]!;
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}
loadDotEnv();

const env = process.env;
const bool = (v: string | undefined) => v === '1' || v?.toLowerCase() === 'true' || v?.toLowerCase() === 'yes';

export const DATA_DIR = resolve(env.DATA_DIR ?? join(ROOT, 'data'));
mkdirSync(DATA_DIR, { recursive: true });

function secret(): string {
  if (env.APP_SECRET && env.APP_SECRET.length >= 16) return env.APP_SECRET;
  const file = join(DATA_DIR, '.secret');
  if (existsSync(file)) return readFileSync(file, 'utf8').trim();
  const s = randomBytes(32).toString('hex');
  writeFileSync(file, s, { mode: 0o600 });
  return s;
}

export const config = {
  port: Number(env.PORT ?? 8080),
  host: env.HOST ?? '0.0.0.0',
  dataDir: DATA_DIR,
  dbFile: join(DATA_DIR, 'insel.db'),
  mediaDir: join(DATA_DIR, 'media'),
  webDist: resolve(env.WEB_DIST ?? join(ROOT, 'packages', 'web', 'dist')),
  secret: secret(),
  adminPassword: env.ADMIN_PASSWORD ?? '',
  moderatorPassword: env.MODERATOR_PASSWORD ?? '',
  /** Alle Passwortabfragen abschalten (nur für Tests!). */
  authDisabled: bool(env.AUTH_DISABLED),
  /** Feste öffentliche Adresse (z. B. https://insel.example.org). */
  publicUrl: env.PUBLIC_URL ?? '',
  /** IP des Host-Rechners im WLAN (vom Startskript gesetzt, da Docker sie nicht kennt). */
  hostIp: env.HOST_IP ?? '',
  /** Metrics-Adresse des Cloudflare-Tunnels (Profil „online“). */
  tunnelMetrics: env.TUNNEL_METRICS ?? '',
  version: '2.0.0',
  isProduction: env.NODE_ENV === 'production',
};

mkdirSync(config.mediaDir, { recursive: true });
