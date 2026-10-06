/**
 * Einstiegspunkt: Datenbank öffnen, aktives Spiel laden, HTTP + WebSocket starten
 * und (in Produktion) die gebaute Weboberfläche ausliefern.
 */
import { existsSync } from 'node:fs';
import Fastify from 'fastify';
import multipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import { config, security } from './config.ts';
import { openDb } from './db.ts';
import { authRoutes } from './http/auth-routes.ts';
import { gameRoutes } from './http/game-routes.ts';
import { libraryRoutes } from './http/library-routes.ts';
import { mediaRoutes } from './http/media-routes.ts';
import { systemRoutes } from './http/system-routes.ts';
import { createLive } from './live.ts';
import { GameRuntime } from './runtime.ts';
import { seedExtras, seedIfEmpty } from './seed.ts';

export async function startServer(opts: { port?: number; dbFile?: string; quiet?: boolean } = {}) {
  const database = openDb(opts.dbFile);
  const app = Fastify({
    // Anfragen werden auf Info-Ebene protokolliert – im Betrieb nur Warnungen und Fehler
    logger: opts.quiet ? false : { level: process.env.LOG_LEVEL ?? 'warn' },
    bodyLimit: 2 * 1024 * 1024,
    // Weitergeleitete Adressen nur von lokalen Proxys glauben: Entwicklungs-Proxy (localhost) und
    // Tunnel im Docker-Netz – aber nicht dem Docker-Gateway (.1), über das Geräte im WLAN kommen.
    trustProxy: (address: string) => {
      const a = address.replace(/^::ffff:/, '');
      if (a === '127.0.0.1' || a === '::1') return !config.isProduction;
      return /^172\.(1[6-9]|2\d|3[01])\.\d+\.\d+$/.test(a) && !a.endsWith('.1');
    },
  });

  // Sicherheits-Header für alle Antworten
  const CSP = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "media-src 'self' blob:",
    "font-src 'self' data:",
    "connect-src 'self' ws: wss: data: blob:",
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; ');
  app.addHook('onSend', async (req, reply, payload) => {
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('X-Frame-Options', 'DENY');
    reply.header('Referrer-Policy', 'no-referrer');
    reply.header('Permissions-Policy', 'geolocation=(), microphone=(), payment=(), usb=()');
    reply.header('Cross-Origin-Opener-Policy', 'same-origin');
    if (config.isProduction) reply.header('Content-Security-Policy', CSP);
    if (req.url.startsWith('/api/')) reply.header('Cache-Control', 'no-store');
    return payload;
  });

  seedIfEmpty(database, (m) => app.log.warn(m));
  seedExtras(database, (m) => app.log.warn(m));
  const runtime = new GameRuntime(database);
  runtime.boot();

  const live = createLive(app.server, runtime, database);

  await app.register(multipart);
  await app.register(fastifyStatic, {
    root: config.mediaDir,
    prefix: '/media/',
    decorateReply: false,
    // Spielerfotos: nicht in fremden Zwischenspeichern ablegen, kein Verzeichnislisting
    cacheControl: false,
    setHeaders: (res) => void res.header('Cache-Control', 'private, max-age=3600'),
    index: false,
    list: false,
  });

  authRoutes(app, runtime);
  libraryRoutes(app, runtime, database, live);
  gameRoutes(app, runtime, database, live);
  mediaRoutes(app, runtime);
  systemRoutes(app, runtime, database, live);

  if (existsSync(config.webDist)) {
    await app.register(fastifyStatic, { root: config.webDist, prefix: '/', wildcard: false });
    // Single-Page-App: alle unbekannten Seiten liefern index.html
    app.setNotFoundHandler((req, reply) => {
      const path = req.url.split('?')[0] ?? '';
      if (path.startsWith('/api/') || path.startsWith('/media/') || req.method !== 'GET' || /\.[a-z0-9]{2,5}$/i.test(path)) {
        return reply.status(404).send({ error: 'Nicht gefunden' });
      }
      return reply.type('text/html').sendFile('index.html', config.webDist, { maxAge: 0 });
    });
  }

  const port = opts.port ?? config.port;
  await app.listen({ port, host: config.host });

  const close = async () => {
    runtime.shutdown();
    await live.close();
    await app.close();
    database.close();
  };
  return { app, runtime, database, port: (app.server.address() as { port: number }).port, close };
}

const isMain = import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('main.js');
if (isMain) {
  // Öffentlich erreichbar nur mit sicherem Passwort und nie ohne Passwörter
  if (config.online && config.authDisabled) {
    console.error('❌ AUTH_DISABLED=true ist im Internet-Betrieb nicht erlaubt. Bitte in .env auf false setzen.');
    process.exit(1);
  }
  if (config.online && (security.weakAdminPassword || security.weakModeratorPassword)) {
    console.error('❌ Das Regie- bzw. Moderator-Passwort ist zu schwach oder öffentlich bekannt (mind. 10 Zeichen, kein Standardpasswort).');
    console.error('   Bitte in .env ein sicheres ADMIN_PASSWORD setzen – im Internet-Betrieb startet die Insel sonst nicht.');
    process.exit(1);
  }
  const server = await startServer();
  const auth = config.authDisabled ? ' (ACHTUNG: Passwörter deaktiviert)' : '';
  console.log(`\n🏝️  Insel der Abenteuer läuft auf http://localhost:${server.port}${auth}\n`);
  if (!config.adminPassword && !config.authDisabled) {
    console.warn('⚠️  Kein ADMIN_PASSWORD gesetzt – die Regie kann sich nicht anmelden. Siehe .env.example.');
  } else if (security.weakAdminPassword) {
    console.warn('⚠️  Das Regie-Passwort ist unsicher (zu kurz oder öffentlich bekannt). Bitte in .env ändern!');
  }
  for (const sig of ['SIGINT', 'SIGTERM'] as const) {
    process.on(sig, () => {
      void server.close().finally(() => process.exit(0));
    });
  }
}
