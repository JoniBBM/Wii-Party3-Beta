// Galerie aller Oberflächen (für Endkontrolle und Dokumentation).
//   npm run build -w @insel/web && node e2e/screens.mjs [ausgabeordner]
import { chromium, devices } from 'playwright';
import { io } from 'socket.io-client';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';

const out = process.argv[2] ?? join(tmpdir(), 'insel-screens');
mkdirSync(out, { recursive: true });
const dataDir = mkdtempSync(join(tmpdir(), 'insel-screens-data-'));
const port = 8094;
const base = `http://localhost:${port}`;
const PASS = 'screens';
const server = spawn('npx', ['tsx', 'packages/server/src/main.ts'], {
  env: { ...process.env, DATA_DIR: dataDir, INSEL_PORT: String(port), ADMIN_PASSWORD: PASS, NODE_ENV: 'production', HOST_IP: '192.168.178.20', HOST_PORT: '8080' },
  stdio: ['ignore', 'ignore', 'pipe'],
});
server.stderr.on('data', (d) => process.stderr.write(`[server] ${d}`));
for (let i = 0; i < 80; i++) {
  try {
    if ((await fetch(`${base}/api/health`)).ok) break;
  } catch {}
  await new Promise((r) => setTimeout(r, 250));
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const post = async (path, body, token) =>
  (await fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) })).json();
const { token } = await post('/api/auth/admin', { password: PASS });
// Beamer-Zugang (sonst zeigt der Beamer nur den Kopplungscode)
const { token: beamerToken } = await post('/api/auth/beamer-link', {}, token);
const auth = { authorization: `Bearer ${token}` };
const templates = (await (await fetch(`${base}/api/templates`, { headers: auth })).json()).templates;
await post('/api/games', { name: 'Sommerfreizeit 2026', templateId: templates.find((t) => t.name.startsWith('Standard')).id }, token);
const sock = io(base, { auth: { token, view: 'regie' }, transports: ['websocket'] });
let state = null;
sock.on('state', (p) => (state = p.state));
await new Promise((r) => sock.on('connect', r));
const cmd = (c) => new Promise((res) => sock.emit('cmd', c, (a) => (a.ok ? res(a) : (console.log('⚠️', c.type, a.error), res(a)))));
const items = (await (await fetch(`${base}/api/library/items`, { headers: auth })).json()).items;

const browser = await chromium.launch({ args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=metal'] });
const errors = [];
const open = async (path, ctxOpts, setup) => {
  const ctx = await browser.newContext(ctxOpts);
  if (setup) await ctx.addInitScript(setup.fn, setup.arg);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`${path}: ${e.message}`));
  await page.goto(base + path);
  return page;
};
const shot = async (page, name, wait = 1200) => {
  await sleep(wait);
  await page.screenshot({ path: join(out, `${name}.png`) });
  console.log('📸', name);
};
const staff = (slot) => ({ fn: ([s, t]) => localStorage.setItem(`insel.token.${s}`, t), arg: [slot, token] });

try {
  // Handys melden sich an
  const names = ['Mia', 'Leon', 'Emma', 'Paul', 'Lena', 'Ben', 'Hanna', 'Finn', 'Sofia', 'Noah', 'Lea', 'Elias'];
  const tokens = [];
  for (const n of names) tokens.push((await post('/api/auth/register', { name: n })).token);
  const beamer = await open(`/beamer#bt=${beamerToken}`, { viewport: { width: 1920, height: 1080 } }, { fn: () => localStorage.setItem('insel.beamer', JSON.stringify({ quality: 'beauty', sound: false })) });
  await beamer.waitForFunction(() => !document.body.innerText.includes('Lade Insel'), null, { timeout: 60000 }).catch(() => {});
  const regie = await open('/regie', { viewport: { width: 1440, height: 900 } }, staff('admin'));
  await shot(beamer, 'beamer-lobby-anmeldung', 2500);
  // Inselansichten ohne Einblendungen
  const view = await open(`/beamer?debug#bt=${beamerToken}`, { viewport: { width: 1920, height: 1080 } }, { fn: () => localStorage.setItem('insel.beamer', JSON.stringify({ quality: 'beauty', sound: false })) });
  await view.waitForFunction(() => window.__board, null, { timeout: 60000 });
  for (const [name, cam] of [
    ['insel-gesamt', [62, 58, 86, 0, 3, -3]],
    ['insel-hafen', [-13, 11, 34, -26, 1, 18]],
    ['insel-ruinen', [12, 12, 33, -1, 3, 15]],
    ['insel-furt', [30, 11, 7, 17, 3, -6]],
    ['insel-lagune', [20, 10, 38, 28, 0, 24]],
    ['insel-leuchtturm', [28, 13, -2, 41, 6, -14]],
    ['insel-vulkan', [-22, 30, 18, -1, 12, -8]],
    ['insel-norden', [8, 24, -52, 0, 7, -18]],
  ]) {
    await view.evaluate(([x, y, z, lx, ly, lz]) => {
      const b = window.__board;
      const V = b.camera.position.constructor;
      b.rig.set({ kind: 'focus', position: new V(x, y, z), lookAt: new V(lx, ly, lz) }, 60);
      document.querySelectorAll('.glass').forEach((e) => (e.style.display = 'none'));
    }, cam);
    await shot(view, name, 1800);
  }
  await view.context().close();
  await cmd({ type: 'teams.auto', count: 4 });
  await shot(regie, 'regie-lobby', 1500);
  await shot(beamer, 'beamer-lobby-teams', 1500);
  const phone = await open('/team', { ...devices['iPhone 13'] }, { fn: (t) => localStorage.setItem('insel.token.member', t), arg: tokens[0] });
  await shot(phone, 'handy-lobby', 1500);

  await cmd({ type: 'game.start' });
  const goal = state.config.board.fields.length - 1;
  const spots = [9, 17, 26, 34];
  for (let i = 0; i < state.teams.length; i++) await cmd({ type: 'team.setPosition', teamId: state.teams[i].id, position: spots[i] });
  await sleep(5000);
  await shot(regie, 'regie-auswahl', 500);

  // Auswahlfrage
  const q = items.find((i) => i.title === 'Riesenplanet');
  await cmd({ type: 'content.select', source: 'manual', itemId: q.id });
  await cmd({ type: 'content.open' });
  await sleep(1200);
  await shot(beamer, 'beamer-frage', 800);
  await shot(phone, 'handy-frage', 300);
  await cmd({ type: 'answer.submit', teamId: state.teams[1].id, value: 1 });
  await cmd({ type: 'answer.submit', teamId: state.teams[2].id, value: 2 });
  await shot(regie, 'regie-frage-live', 800);
  const mod = await open('/moderator', { ...devices['iPhone 13'] }, staff('moderator'));
  await shot(mod, 'moderator-frage', 2000);
  for (const t of state.teams) await cmd({ type: 'answer.submit', teamId: t.id, value: 1 });
  await cmd({ type: 'content.reveal' });
  await shot(beamer, 'beamer-aufloesung', 1500);
  await shot(phone, 'handy-richtig', 300);
  await cmd({ type: 'content.finish' });
  await shot(beamer, 'beamer-ergebnis', 2500);
  await cmd({ type: 'results.confirm' });
  await sleep(500);
  await shot(regie, 'regie-wuerfelrunde', 800);
  const first = state.phase.dice.order[0];
  const myTeam = state.players.find((p) => p.name === 'Mia').teamId;
  if (first === myTeam) await shot(phone, 'handy-wuerfeln', 500);
  await cmd({ type: 'dice.roll', main: 4 });
  await sleep(1100);
  await shot(beamer, 'beamer-wuerfel', 0);
  await sleep(6000);
  await shot(beamer, 'beamer-wuerfelrunde', 0);

  // Spiel mit ausgelosten Spielern
  while (state.phase.name === 'dice') {
    if (state.phase.dice.fieldGame) await cmd({ type: 'fieldgame.cancel' });
    else if (state.phase.dice.challenge) {
      const c = state.phase.dice.challenge;
      await cmd(c.kind === 'river' ? { type: 'challenge.choose', choice: 'crates', force: true } : { type: 'challenge.roll', force: true });
    }
    else await cmd({ type: 'dice.roll', force: true });
    await sleep(300);
  }
  await sleep(6000);
  await cmd({ type: 'content.select', source: 'manual', itemId: items.find((i) => i.title === 'Montagsmaler').id });
  await shot(beamer, 'beamer-spiel', 2500);
  await shot(regie, 'regie-spiel', 300);

  // Regie-Seiten
  await regie.goto(`${base}/regie/teams`);
  await shot(regie, 'regie-teams', 1500);
  await regie.goto(`${base}/regie/einrichten`);
  await regie.getByRole('tab', { name: 'Spielfeld' }).click();
  await shot(regie, 'regie-spielfeld', 1200);
  await regie.getByRole('tab', { name: 'Regeln' }).click();
  await shot(regie, 'regie-regeln', 800);
  await regie.goto(`${base}/regie/bibliothek`);
  await shot(regie, 'regie-bibliothek', 1200);
  await regie.goto(`${base}/regie/beamer`);
  await shot(regie, 'regie-beamer', 2500);
  const tablet = await open('/regie', { viewport: { width: 1024, height: 768 } }, staff('admin'));
  await shot(tablet, 'regie-tablet', 2000);
  await phone.getByRole('button', { name: 'Team', exact: true }).click();
  await shot(phone, 'handy-figur', 1500);
  await phone.getByRole('button', { name: 'Rangliste' }).click();
  await shot(phone, 'handy-rangliste', 800);

  // Schnell-Modus
  const fast = await open(`/beamer#bt=${beamerToken}`, { viewport: { width: 1280, height: 720 } }, { fn: () => localStorage.setItem('insel.beamer', JSON.stringify({ quality: 'fast', sound: false })) });
  await fast.waitForFunction(() => !document.body.innerText.includes('Lade Insel'), null, { timeout: 60000 }).catch(() => {});
  await shot(fast, 'beamer-schnell', 3000);

  console.log(errors.length ? `\n⚠️  Browserfehler:\n${[...new Set(errors)].join('\n')}` : '\n✅ Keine Browserfehler');
} catch (e) {
  console.error('❌', e);
  process.exitCode = 1;
} finally {
  sock.close();
  await browser.close();
  server.kill();
  rmSync(dataDir, { recursive: true, force: true });
}
