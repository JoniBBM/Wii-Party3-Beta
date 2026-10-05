// Fässer im Fluss und Kraterloch auf dem Beamer durchspielen und fotografieren.
//   npm run build -w @insel/web && node e2e/hazards.mjs [ausgabeordner]
import { chromium } from 'playwright';
import { io } from 'socket.io-client';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';

const out = process.argv[2] ?? join(tmpdir(), 'insel-hazards');
mkdirSync(out, { recursive: true });
const dataDir = mkdtempSync(join(tmpdir(), 'insel-hazards-'));
const port = 8099;
const base = `http://localhost:${port}`;
const server = spawn('npx', ['tsx', 'packages/server/src/main.ts'], { env: { ...process.env, DATA_DIR: dataDir, INSEL_PORT: String(port), ADMIN_PASSWORD: 'h', NODE_ENV: 'production' }, stdio: 'ignore' });
for (let i = 0; i < 80; i++) { try { if ((await fetch(`${base}/api/health`)).ok) break; } catch {} await new Promise((r) => setTimeout(r, 250)); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const post = async (path, body, token) => (await fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) })).json();
const browser = await chromium.launch({ args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=metal'] });
const errors = [];
try {
  const { token } = await post('/api/auth/admin', { password: 'h' });
  const templates = (await (await fetch(`${base}/api/templates`, { headers: { authorization: `Bearer ${token}` } })).json()).templates;
  await post('/api/games', { name: 'Gefahren', templateId: templates.find((t) => t.name.startsWith('Standard')).id }, token);
  const sock = io(base, { auth: { token, view: 'regie' }, transports: ['websocket'] });
  let state = null;
  sock.on('state', (p) => (state = p.state));
  await new Promise((r) => sock.on('connect', r));
  const cmd = (c) => new Promise((res) => sock.emit('cmd', c, (a) => { if (!a.ok) errors.push(`${c.type}: ${a.error}`); res(a); }));
  for (let i = 0; i < 4; i++) await post('/api/auth/register', { name: `Spieler ${i + 1}` });
  await cmd({ type: 'teams.auto', count: 2 });
  await cmd({ type: 'game.start' });
  const fields = state.config.board.fields;
  const ford = fields.indexOf('river');
  const crater = fields.indexOf('crater');
  console.log('Furt bei Feld', ford, '| Krater bei Feld', crater);
  const config = structuredClone(state.config);
  config.rules.river.fallChance = 100;
  config.rules.volcano.enabled = false;
  await cmd({ type: 'config.update', config });

  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  page.on('pageerror', (e) => errors.push('page: ' + e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push('console: ' + m.text()));
  await page.addInitScript(() => localStorage.setItem('insel.beamer', JSON.stringify({ quality: 'beauty', sound: false })));
  await page.goto(`${base}/beamer?debug`);
  await page.waitForFunction(() => window.__board, null, { timeout: 60000 });

  // Eine Spielrunde, damit gewürfelt wird
  const round = async () => {
    await cmd({ type: 'content.select', source: 'random' });
    await cmd({ type: 'content.open' });
    const c = state.phase.content;
    if (c.item.kind === 'game') await cmd({ type: 'content.rank', ranking: state.teams.map((t, i) => ({ teamId: t.id, rank: i + 1 })) });
    else if (c.stage !== 'revealed') await cmd({ type: 'content.reveal' });
    await cmd({ type: 'content.finish' });
    await cmd({ type: 'results.confirm' });
  };
  const [a, b] = state.teams;
  const rollFor = async (teamId, main) => {
    while (state.phase.name === 'dice' && state.phase.dice.order[state.phase.dice.index] !== teamId) await cmd({ type: 'dice.skip' });
    await cmd({ type: 'team.setBonus', teamId, bonusDie: 0 });
    const wait = state.phase.dice.busyUntil - Date.now();
    if (wait > 0) await sleep(wait);
    await cmd({ type: 'dice.roll', main, force: true });
  };
  const shoot = async (name, delay) => {
    await sleep(delay);
    await page.screenshot({ path: join(out, `${name}.png`) });
    console.log('Foto', name);
  };

  // --- Furt: Team A springt auf das erste Fass und fällt hinein ---
  await cmd({ type: 'team.setPosition', teamId: a.id, position: ford - 3 });
  await round();
  await rollFor(a.id, 3);
  await shoot('fluss-1-wackeln', 3600);
  await shoot('fluss-2-platsch', 1300);
  await shoot('fluss-3-treiben', 1600);
  await sleep(2500);
  console.log('Team A nach dem Sturz auf Feld', state.teams[0].position);
  while (state.phase.name === 'dice') await cmd({ type: 'dice.skip' });
  if (state.phase.name === 'round_end') await cmd({ type: 'round.next' });

  // --- Krater: Team B fällt hinein, klettert, kommt heraus ---
  await cmd({ type: 'team.setPosition', teamId: b.id, position: crater - 2 });
  await sleep(1500);
  await round();
  await rollFor(b.id, 2);
  await shoot('krater-1-sturz', 5400);
  await shoot('krater-1b-unten', 1300);
  await sleep(1500);
  while (state.phase.name === 'dice') await cmd({ type: 'dice.skip' });
  if (state.phase.name === 'round_end') await cmd({ type: 'round.next' });
  await round();
  await rollFor(b.id, 5);
  await shoot('krater-2-klettern', 3300);
  await sleep(1500);
  while (state.phase.name === 'dice') await cmd({ type: 'dice.skip' });
  if (state.phase.name === 'round_end') await cmd({ type: 'round.next' });
  await round();
  await rollFor(b.id, 6);
  await shoot('krater-3-raus', 4000);
  console.log('Team B: Feld', state.teams[1].position, 'Krater', JSON.stringify(state.teams[1].crater));
  sock.close();
} catch (e) {
  console.error('❌', e);
  process.exitCode = 1;
} finally {
  console.log('Fehler:', errors.length ? errors.join('\n') : 'keine');
  await browser.close();
  server.kill();
  rmSync(dataDir, { recursive: true, force: true });
}
