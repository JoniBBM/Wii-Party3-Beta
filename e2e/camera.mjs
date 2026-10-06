// Kameraprüfung: eine Partie mit allen Auftritten läuft, die Beamer-Kamera wird vermessen
// (Abstand zum Gelände, verdeckte Bilder, Drehrate, Beschleunigung). Bei verdeckter Sicht
// wird ein Foto gemacht.   npm run build -w @insel/web && node e2e/camera.mjs [runden] [ordner]
import { chromium } from 'playwright';
import { io } from 'socket.io-client';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';

const rounds = Number(process.argv[2] ?? 12);
const out = process.argv[3] ?? join(tmpdir(), 'insel-camera');
mkdirSync(out, { recursive: true });
const dataDir = mkdtempSync(join(tmpdir(), 'insel-camera-'));
const port = 8103;
const base = `http://localhost:${port}`;
const server = spawn('npx', ['tsx', 'packages/server/src/main.ts'], { env: { ...process.env, DATA_DIR: dataDir, INSEL_PORT: String(port), ADMIN_PASSWORD: 'cam', NODE_ENV: 'production' }, stdio: 'ignore' });
for (let i = 0; i < 80; i++) { try { if ((await fetch(`${base}/api/health`)).ok) break; } catch {} await new Promise((r) => setTimeout(r, 250)); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const post = async (path, body, token) => (await fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) })).json();
const browser = await chromium.launch({ args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=metal'] });
const errors = [];
let shots = 0;
try {
  const { token } = await post('/api/auth/admin', { password: 'cam' });
  const templates = (await (await fetch(`${base}/api/templates`, { headers: { authorization: `Bearer ${token}` } })).json()).templates;
  await post('/api/games', { name: 'Kamera', templateId: templates.find((t) => t.name.startsWith('Standard')).id }, token);
  const sock = io(base, { auth: { token, view: 'regie' }, transports: ['websocket'] });
  let state = null;
  sock.on('state', (p) => (state = p.state));
  await new Promise((r) => sock.on('connect', r));
  const cmd = (c) => new Promise((res) => sock.emit('cmd', c, (a) => res(a)));
  for (let i = 0; i < 12; i++) await post('/api/auth/register', { name: `Spieler ${i + 1}` });
  await cmd({ type: 'teams.auto', count: 4 });
  await cmd({ type: 'game.start' });
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  page.on('pageerror', (e) => errors.push('page: ' + e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push('console: ' + m.text()));
  await page.addInitScript(() => localStorage.setItem('insel.beamer', JSON.stringify({ quality: 'beauty', sound: false })));
  await page.goto(`${base}/beamer?debug`);
  await page.waitForFunction(() => window.__board, null, { timeout: 60000 });
  await page.evaluate(() => Object.assign(window.__board.rig.stats, { frames: 0, minClearance: Infinity, occludedFrames: 0, maxTurnRate: 0, maxAccel: 0, spikes: [], lowFrames: 0 }));
  // Zwischendurch prüfen, ob das Motiv verdeckt ist → Foto
  let watching = true;
  const watcher = (async () => {
    while (watching) {
      await sleep(900);
      const occ = await page.evaluate(() => window.__board.rig.currentOcclusion()).catch(() => 0);
      if (occ > 0.2 && shots < 8) {
        shots++;
        await page.screenshot({ path: join(out, `verdeckt-${shots}.png`) });
        console.log(`verdeckt (${Math.round(occ * 100)} %) → Foto ${shots}`);
      }
    }
  })();
  for (let r = 0; r < rounds && state.status === 'running'; r++) {
    await cmd({ type: 'content.select', source: 'random' });
    await cmd({ type: 'content.open' });
    const c = state.phase.content;
    if (c.item.kind === 'game') await cmd({ type: 'content.rank', ranking: state.teams.map((t, i) => ({ teamId: t.id, rank: i + 1 })) });
    else if (c.stage !== 'revealed') await cmd({ type: 'content.reveal' });
    await cmd({ type: 'content.finish' });
    await cmd({ type: 'results.confirm' });
    while (state.phase.name === 'dice') {
      const d = state.phase.dice;
      const wait = d.busyUntil - Date.now();
      if (wait > 0) await sleep(wait + 100);
      if (d.fieldGame) {
        await cmd({ type: 'fieldgame.setup' });
        await sleep(1500);
        await cmd({ type: 'fieldgame.result', won: Math.random() < 0.5 });
      } else if (d.challenge) await cmd((d.challenge.kind === 'river' ? { type: 'challenge.choose', choice: Math.random() < 0.5 ? 'barrels' : 'crates' } : { type: 'challenge.roll' }));
      else await cmd({ type: 'dice.roll' });
      await sleep(200);
    }
    if (state.phase.name === 'round_end') {
      await sleep(2500);
      await cmd({ type: 'round.next' });
    }
    console.log(`Runde ${r + 1}: Felder`, state.teams.map((t) => t.position).join(', '));
  }
  await sleep(3000);
  watching = false;
  await watcher;
  const stats = await page.evaluate(() => JSON.parse(JSON.stringify(window.__board.rig.stats)));
  console.log('Auffällige Momente:', JSON.stringify(stats.spikes.slice(0, 20)));
  console.log('\nKamera:', JSON.stringify({ ...stats, occludedShare: (stats.occludedFrames / Math.max(1, stats.frames)).toFixed(3), minClearance: stats.minClearance.toFixed(2), maxTurnRate: stats.maxTurnRate.toFixed(2), maxAccel: stats.maxAccel.toFixed(1) }));
  sock.close();
} catch (e) {
  console.error('❌', e);
  process.exitCode = 1;
} finally {
  console.log('Fehler:', errors.length ? [...new Set(errors)].join('\n') : 'keine');
  await browser.close();
  server.kill();
  rmSync(dataDir, { recursive: true, force: true });
}
