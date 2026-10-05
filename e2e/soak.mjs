// Dauertest: eine komplette Partie bis zum Sieg (alle Inhaltsarten, Feld-Minispiele, Vulkan),
// Beamer läuft mit und wird auf Fehler und Speicherwachstum geprüft.
//   npm run build -w @insel/web && node e2e/soak.mjs [maxRunden]
import { chromium } from 'playwright';
import { io } from 'socket.io-client';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';

const maxRounds = Number(process.argv[2] ?? 60);
const dataDir = mkdtempSync(join(tmpdir(), 'insel-soak-'));
const port = 8093;
const base = `http://localhost:${port}`;
const server = spawn('npx', ['tsx', 'packages/server/src/main.ts'], {
  env: { ...process.env, DATA_DIR: dataDir, INSEL_PORT: String(port), ADMIN_PASSWORD: 'soak', NODE_ENV: 'production' },
  stdio: ['ignore', 'ignore', 'pipe'],
});
let serverErrors = '';
server.stderr.on('data', (d) => (serverErrors += d));
for (let i = 0; i < 80; i++) {
  try {
    if ((await fetch(`${base}/api/health`)).ok) break;
  } catch {}
  await new Promise((r) => setTimeout(r, 250));
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const post = async (path, body, token) =>
  (await fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) })).json();
const { token } = await post('/api/auth/admin', { password: 'soak' });
const templates = (await (await fetch(`${base}/api/templates`, { headers: { authorization: `Bearer ${token}` } })).json()).templates;
await post('/api/games', { name: 'Dauertest', templateId: templates.find((t) => t.name.startsWith('Standard')).id }, token);
const sock = io(base, { auth: { token, view: 'regie' }, transports: ['websocket'] });
let state = null;
sock.on('state', (p) => (state = p.state));
await new Promise((r) => sock.on('connect', r));
const failures = [];
const cmd = (c, allowFail = false) =>
  new Promise((res) =>
    sock.emit('cmd', c, (a) => {
      if (!a.ok && !allowFail) failures.push(`${c.type}: ${a.error}`);
      res(a);
    }),
  );

const browser = await chromium.launch({ args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=metal', '--enable-precise-memory-info'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));
page.on('console', (m) => m.type() === 'error' && pageErrors.push(m.text()));
await page.addInitScript(() => localStorage.setItem('insel.beamer', JSON.stringify({ quality: 'beauty', sound: false })));
await page.goto(`${base}/beamer?debug`);
await page.waitForFunction(() => window.__board, null, { timeout: 60000 });
const mem = () => page.evaluate(() => ({ heap: Math.round((performance.memory?.usedJSHeapSize ?? 0) / 1e6), geo: window.__board.renderer.info.memory.geometries, tex: window.__board.renderer.info.memory.textures }));
const memStart = await mem();

try {
  for (let i = 0; i < 15; i++) await post('/api/auth/register', { name: `Spieler ${i + 1}` });
  await cmd({ type: 'teams.auto', count: 5 });
  await cmd({ type: 'game.start' });
  const stats = { rounds: 0, kinds: {}, fieldGames: 0, eruptions: 0, undos: 0 };
  while (state.status === 'running' && stats.rounds < maxRounds) {
    stats.rounds++;
    const r = await cmd({ type: 'content.select', source: 'random' });
    if (!r.ok) break;
    const c = state.phase.content;
    stats.kinds[c.item.kind] = (stats.kinds[c.item.kind] ?? 0) + 1;
    await cmd({ type: 'content.open' });
    const teams = state.teams;
    if (c.item.kind === 'game') {
      const ranking = teams.map((t, i) => ({ teamId: t.id, rank: i + 1 })).sort(() => Math.random() - 0.5).map((x, i) => ({ ...x, rank: i + 1 }));
      await cmd({ type: 'content.rank', ranking });
      await cmd({ type: 'content.finish' });
    } else if (c.item.kind === 'buzzer') {
      // Buzzer per Team-Token geht hier nicht – Regie bewertet direkt
      await cmd({ type: 'content.reveal' });
      await cmd({ type: 'content.finish' });
    } else {
      for (const t of teams) {
        const value = c.item.kind === 'choice' ? Math.floor(Math.random() * 3) : c.item.kind === 'estimate' ? Math.round(Math.random() * 3000) : 'Antwort';
        await cmd({ type: 'answer.submit', teamId: t.id, value }, true);
      }
      if (state.phase.content.stage !== 'revealed') await cmd({ type: 'content.reveal' });
      await cmd({ type: 'content.finish' });
    }
    await cmd({ type: 'results.confirm' });
    // Gelegentlich Rückgängig testen
    if (stats.rounds % 7 === 3) {
      await new Promise((res) => sock.emit('undo', res));
      stats.undos++;
      await cmd({ type: 'results.confirm' });
    }
    while (state.phase.name === 'dice') {
      const d = state.phase.dice;
      if (d.fieldGame) {
        stats.fieldGames++;
        await cmd({ type: 'fieldgame.setup' });
        await sleep(400);
        await cmd({ type: 'fieldgame.result', won: Math.random() < 0.5 });
      } else {
        const wait = d.busyUntil - Date.now();
        if (wait > 0) await sleep(Math.min(wait, 1800));
        if (d.vine) {
          stats.vines = (stats.vines ?? 0) + 1;
          await cmd({ type: 'vine.roll', force: true });
        } else await cmd({ type: 'dice.roll', force: true });
      }
      await sleep(150);
    }
    stats.eruptions = state.volcano.eruptions;
    if (state.phase.name === 'round_end') await cmd({ type: 'round.next' });
    if (stats.rounds % 5 === 0) console.log(`Runde ${stats.rounds}: Positionen`, state.teams.map((t) => t.position).join(', '), '| Speicher', JSON.stringify(await mem()));
  }
  await sleep(8000);
  const memEnd = await mem();
  await page.screenshot({ path: join(tmpdir(), 'insel-soak-ende.png') });
  console.log('\nErgebnis:', state.status, 'Sieger:', state.teams.find((t) => t.id === state.winnerTeamId)?.name ?? '–');
  console.log('Statistik:', JSON.stringify(stats));
  const feedText = state.feed.map((f) => f.text).join('\n');
  console.log('Liane:', (feedText.match(/schwingt an der Liane/g) ?? []).length, '| Lavahöhle:', (feedText.match(/Lavahöhle/g) ?? []).length);
  console.log('Fluss gestürzt:', (feedText.match(/Platsch/g) ?? []).length, '| balanciert:', (feedText.match(/balanciert sicher/g) ?? []).length, '| Krater:', (feedText.match(/rutscht in den Krater/g) ?? []).length, '| herausgeklettert:', (feedText.match(/klettert aus dem Krater/g) ?? []).length);
  console.log('Speicher Start:', JSON.stringify(memStart), 'Ende:', JSON.stringify(memEnd));
  console.log('Fehlgeschlagene Befehle:', failures.length ? failures.join('\n') : 'keine');
  console.log('Browserfehler:', pageErrors.length ? [...new Set(pageErrors)].join('\n') : 'keine');
  console.log('Serverfehler:', serverErrors.trim() ? serverErrors.trim().slice(0, 2000) : 'keine');
} catch (e) {
  console.error('❌', e);
  process.exitCode = 1;
} finally {
  sock.close();
  await browser.close();
  server.kill();
  rmSync(dataDir, { recursive: true, force: true });
}
