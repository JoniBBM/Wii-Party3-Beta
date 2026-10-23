// Rundgang durch eine Welt (Standard: Blockwelt): eigenes Spiel mit dieser Welt, dann Handy (Figur,
// Frage) und Beamer (Lobby, Frage, Würfeln, Inneres, Sieg) fotografieren und auf Fehler prüfen.
// Startet einen eigenen Server mit leerer Datenbank (gebaute Weboberfläche nötig: npm run build).
//   node e2e/blocks.mjs [ordner-für-bilder]          (Blockwelt)
//   WORLD=space node e2e/blocks.mjs [ordner]           (Weltall)
import { chromium, devices } from 'playwright';
import { io } from 'socket.io-client';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { audit } from './audit.mjs';

const world = process.env.WORLD ?? 'blocks';
const out = process.argv[2] ?? join(tmpdir(), `insel-${world}`);
mkdirSync(out, { recursive: true });
const dataDir = mkdtempSync(join(tmpdir(), 'insel-blocks-'));
const port = 8095;
const base = `http://localhost:${port}`;
const PASS = 'e2e-passwort';
const server = spawn('npx', ['tsx', 'packages/server/src/main.ts'], {
  env: { ...process.env, DATA_DIR: dataDir, INSEL_PORT: String(port), ADMIN_PASSWORD: PASS, AUTH_DISABLED: 'false', NODE_ENV: 'production' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
for (let i = 0; i < 60; i++) {
  try {
    if ((await fetch(`${base}/api/health`)).ok) break;
  } catch {}
  await new Promise((r) => setTimeout(r, 250));
}
const post = async (path, body, token) =>
  (await fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) })).json();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const problems = [];
const browser = await chromium.launch({ args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
try {
  const { token: admin } = await post('/api/auth/admin', { password: PASS });
  const { code } = await post('/api/games', { name: `Welt-Test ${world}` }, admin);
  const sock = io(base, { auth: { token: admin, view: 'regie' }, transports: ['websocket'] });
  let state = null;
  sock.on('state', (p) => (state = p.state));
  await new Promise((r) => sock.on('connect', r));
  const cmd = (c) => new Promise((res) => sock.emit('cmd', c, res));
  const players = [];
  for (const n of ['Steve', 'Alex', 'Mia', 'Ben', 'Lea', 'Tom']) players.push((await post('/api/auth/register', { name: n, code })).token);
  await sleep(300);
  await cmd({ type: 'teams.auto', count: 3 });
  await sleep(200);
  const r = await cmd({ type: 'config.update', config: { ...state.config, theme: world } });
  if (!r.ok) problems.push(`Welt setzen: ${r.error}`);
  await sleep(300);
  const { token: beamerToken } = await post('/api/auth/beamer-link', {}, admin);

  const errors = [];
  // Beamer
  const bctx = await browser.newContext({ viewport: { width: 1600, height: 900 } });
  await bctx.addInitScript((t) => localStorage.setItem('insel.token.beamer', t), beamerToken);
  const beamer = await bctx.newPage();
  beamer.on('pageerror', (e) => errors.push(`Beamer: ${e.message}`));
  await beamer.goto(`${base}/beamer?debug`);
  await beamer.waitForFunction((w) => window.__board?.theme === w, world, { timeout: 120_000 });
  await sleep(3000);
  await beamer.screenshot({ path: join(out, 'beamer-lobby.png') });
  // Handy
  const pctx = await browser.newContext({ ...devices['iPhone 13'] });
  await pctx.addInitScript((t) => localStorage.setItem('insel.token.member', t), players[0]);
  const phone = await pctx.newPage();
  phone.on('pageerror', (e) => errors.push(`Handy: ${e.message}`));
  await phone.goto(`${base}/team`);
  await sleep(2500);
  const shot = async (page, name) => {
    const res = await page.evaluate(audit);
    for (const f of res) problems.push(`${name}: ${f.kind} «${f.text}» ${f.detail ?? ''}`);
    await page.screenshot({ path: join(out, `${name}.png`) });
  };
  await shot(phone, 'handy-lobby');
  if ((await phone.evaluate(() => document.documentElement.dataset.world)) !== world) problems.push(`Handy: Oberfläche der Welt „${world}“ nicht aktiv`);

  // Spiel starten, Frage
  await cmd({ type: 'game.start' });
  await cmd({ type: 'content.select', source: 'random', kinds: ['choice'] });
  await cmd({ type: 'content.open' });
  await sleep(2500);
  await shot(phone, 'handy-frage');
  await beamer.screenshot({ path: join(out, 'beamer-frage.png') });
  await cmd({ type: 'content.close' });
  await cmd({ type: 'content.reveal' });
  await cmd({ type: 'content.finish' });
  await cmd({ type: 'results.confirm' });
  await sleep(1500);
  // Würfeln: drei Züge
  for (let i = 0; i < 3; i++) {
    await cmd({ type: 'dice.roll', main: 5, force: true });
    await sleep(2600);
  }
  await beamer.screenshot({ path: join(out, 'beamer-wuerfeln.png') });
  await shot(phone, 'handy-wuerfeln');
  // Inneres ansehen (Nether bzw. Alien-Höhle, Innen-Ansicht direkt)
  // wie der Regie-Knopf: geht erst, wenn auf dem Beamer gerade nichts passiert
  const visit = (to) =>
    beamer.evaluate(async (t) => {
      for (let i = 0; i < 30; i++) {
        if (await window.__board.visit(t)) return true;
        await new Promise((r) => setTimeout(r, 500));
      }
      return false;
    }, to);
  if (!(await visit('inside'))) problems.push('Besuch im Inneren nicht möglich');
  await sleep(3000);
  await beamer.screenshot({ path: join(out, 'beamer-inneres.png') });
  // Siegerehrung
  await visit('island');
  await sleep(1500);
  await cmd({ type: 'game.finish' });
  await sleep(7000);
  await beamer.screenshot({ path: join(out, 'beamer-sieg.png') });
  if (errors.length) problems.push(...errors);
  sock.close();
} catch (e) {
  problems.push(`Abbruch: ${e.message.split('\n')[0]}`);
} finally {
  await browser.close();
  server.kill();
  rmSync(dataDir, { recursive: true, force: true });
}
if (problems.length) {
  console.log(`${problems.length} Problem(e):\n- ${problems.join('\n- ')}\nBilder: ${out}`);
  process.exit(1);
}
console.log(`✅ Rundgang „${world}“ ohne Fehler. Bilder: ${out}`);
