/**
 * Einstiegspunkt: Datenbank öffnen, aktives Spiel laden, HTTP + WebSocket starten
 * und (in Produktion) die gebaute Weboberfläche ausliefern.
 */
import { existsSync } from 'node:fs';
import Fastify from 'fastify';
import multipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import { config } from './config.ts';
import { openDb } from './db.ts';
import { authRoutes } from './http/auth-routes.ts';
import { gameRoutes } from './http/game-routes.ts';
import { libraryRoutes } from './http/library-routes.ts';
import { mediaRoutes } from './http/media-routes.ts';
import { systemRoutes } from './http/system-routes.ts';
import { createLive } from './live.ts';
import { GameRuntime } from './runtime.ts';
import { seedIfEmpty } from './seed.ts';

export async function startServer(opts: { port?: number; dbFile?: string; quiet?: boolean } = {}) {
  const database = openDb(opts.dbFile);
  const app = Fastify({
    // Anfragen werden auf Info-Ebene protokolliert – im Betrieb nur Warnungen und Fehler
    logger: opts.quiet ? false : { level: process.env.LOG_LEVEL ?? 'warn' },
    bodyLimit: 5 * 1024 * 1024,
    trustProxy: true,
  });

  seedIfEmpty(database, (m) => app.log.warn(m));
  const runtime = new GameRuntime(database);
  runtime.boot();

  const live = createLive(app.server, runtime, database);

  await app.register(multipart);
  await app.register(fastifyStatic, {
    root: config.mediaDir,
    prefix: '/media/',
    decorateReply: false,
    maxAge: '7d',
    immutable: true,
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
  const server = await startServer();
  const auth = config.authDisabled ? ' (ACHTUNG: Passwörter deaktiviert)' : '';
  console.log(`\n🏝️  Insel der Abenteuer läuft auf http://localhost:${server.port}${auth}\n`);
  if (!config.adminPassword && !config.authDisabled) {
    console.warn('⚠️  Kein ADMIN_PASSWORD gesetzt – die Regie kann sich nicht anmelden. Siehe .env.example.');
  }
  for (const sig of ['SIGINT', 'SIGTERM'] as const) {
    process.on(sig, () => {
      void server.close().finally(() => process.exit(0));
    });
  }
}
