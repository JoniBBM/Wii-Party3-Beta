// Alle Feld-Auftritte auf dem Beamer durchspielen und in Bildfolgen fotografieren:
// Sprungfeder, Flugzeug, UFO-Tausch, Käfig, Minispiel-Bühne, Geysir, Liane, Lavahöhle.
//   npm run build -w @insel/web && node e2e/stunts.mjs [ausgabeordner] [nur,diese]
import { chromium, devices } from 'playwright';
import { io } from 'socket.io-client';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';

const out = process.argv[2] ?? join(tmpdir(), 'insel-stunts');
const only = process.argv[3] ? new Set(process.argv[3].split(',')) : null;
mkdirSync(out, { recursive: true });
const dataDir = mkdtempSync(join(tmpdir(), 'insel-stunts-'));
const port = 8102;
const base = `http://localhost:${port}`;
const server = spawn('npx', ['tsx', 'packages/server/src/main.ts'], { env: { ...process.env, DATA_DIR: dataDir, INSEL_PORT: String(port), ADMIN_PASSWORD: 'st', NODE_ENV: 'production' }, stdio: 'ignore' });
for (let i = 0; i < 80; i++) { try { if ((await fetch(`${base}/api/health`)).ok) break; } catch {} await new Promise((r) => setTimeout(r, 250)); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const post = async (path, body, token) => (await fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) })).json();
const browser = await chromium.launch({ args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=metal'] });
const errors = [];
try {
  const { token } = await post('/api/auth/admin', { password: 'st' });
  const templates = (await (await fetch(`${base}/api/templates`, { headers: { authorization: `Bearer ${token}` } })).json()).templates;
  await post('/api/games', { name: 'Auftritte', templateId: templates.find((t) => t.name.startsWith('Standard')).id }, token);
  const sock = io(base, { auth: { token, view: 'regie' }, transports: ['websocket'] });
  let state = null;
  sock.on('state', (p) => (state = p.state));
  await new Promise((r) => sock.on('connect', r));
  const cmd = (c) => new Promise((res) => sock.emit('cmd', c, (a) => { if (!a.ok) errors.push(`${c.type}: ${a.error}`); res(a); }));
  const tokens = [];
  for (let i = 0; i < 4; i++) tokens.push((await post('/api/auth/register', { name: `Spieler ${i + 1}` })).token);
  await cmd({ type: 'teams.auto', count: 2 });
  await cmd({ type: 'game.start' });
  const fields = [...state.config.board.fields];
  const vine = fields.indexOf('vine');
  const cave = fields.indexOf('cave');
  // Sonderfelder für die Probe an feste Stellen legen
  for (let i = 1; i < fields.length - 1; i++) if (!['vine', 'cave', 'river', 'crater'].includes(fields[i])) fields[i] = 'normal';
  Object.assign(fields, { 3: 'catapult_forward', 12: 'catapult_backward', 15: 'swap', 18: 'barrier', 28: 'minigame', 44: 'volcano' });
  const config = structuredClone(state.config);
  config.board.fields = fields;
  config.rules.catapultForward = { min: 5, max: 5 };
  config.rules.catapultBackward = { min: 6, max: 6 };
  config.rules.swapMinDistance = 0;
  config.rules.volcano.pressurePerField = 1;
  config.rules.volcano.threshold = 20;
  await cmd({ type: 'config.update', config });

  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  page.on('pageerror', (e) => errors.push('page: ' + e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push('console: ' + m.text()));
  await page.addInitScript(() => localStorage.setItem('insel.beamer', JSON.stringify({ quality: 'beauty', sound: false })));
  await page.goto(`${base}/beamer?debug`);
  await page.waitForFunction(() => window.__board, null, { timeout: 60000 });
  const [a, b] = state.teams;

  const round = async () => {
    while (state.phase.name === 'dice') await cmd({ type: 'dice.skip' });
    if (state.phase.name === 'round_end') await cmd({ type: 'round.next' });
    await cmd({ type: 'content.select', source: 'random' });
    await cmd({ type: 'content.open' });
    const c = state.phase.content;
    if (c.item.kind === 'game') await cmd({ type: 'content.rank', ranking: state.teams.map((t, i) => ({ teamId: t.id, rank: i + 1 })) });
    else if (c.stage !== 'revealed') await cmd({ type: 'content.reveal' });
    await cmd({ type: 'content.finish' });
    await cmd({ type: 'results.confirm' });
  };
  const rollFor = async (teamId, main) => {
    while (state.phase.name === 'dice' && state.phase.dice.order[state.phase.dice.index] !== teamId) await cmd({ type: 'dice.skip' });
    await cmd({ type: 'team.setBonus', teamId, bonusDie: 0 });
    const wait = state.phase.dice.busyUntil - Date.now();
    if (wait > 0) await sleep(wait);
    await cmd({ type: 'dice.roll', main, force: true });
  };
  const place = async (teamId, pos) => {
    await cmd({ type: 'team.setPosition', teamId, position: pos });
    await sleep(2500);
  };
  const burst = async (name, startMs, count, everyMs) => {
    await sleep(startMs);
    for (let i = 0; i < count; i++) {
      await page.screenshot({ path: join(out, `${name}-${i + 1}.png`) });
      if (i < count - 1) await sleep(everyMs);
    }
    console.log('Bildfolge', name);
  };
  const scene = async (name, fn) => {
    if (only && !only.has(name)) return;
    await fn();
    await sleep(1500);
  };

  await scene('feder', async () => {
    await place(a.id, 0);
    await place(b.id, 0);
    await round();
    await rollFor(a.id, 3);
    await burst('feder', 3700, 5, 300);
  });
  await scene('flugzeug', async () => {
    await place(b.id, 9);
    await round();
    await rollFor(b.id, 3);
    await burst('flugzeug', 4300, 6, 600);
  });
  await scene('ufo', async () => {
    await place(a.id, 12);
    await place(b.id, 30);
    await round();
    await rollFor(a.id, 3);
    await burst('ufo', 4300, 6, 650);
  });
  await scene('kaefig', async () => {
    await place(a.id, 15);
    await round();
    await rollFor(a.id, 3);
    await burst('kaefig', 4000, 3, 350);
    await cmd({ type: 'team.unblock', teamId: a.id });
  });
  await scene('buehne', async () => {
    await place(b.id, 25);
    await round();
    await rollFor(b.id, 3);
    await burst('buehne', 4300, 2, 1200);
    await cmd({ type: 'fieldgame.cancel' });
  });
  await scene('geysir', async () => {
    await place(a.id, 41);
    await round();
    await rollFor(a.id, 3);
    await burst('geysir', 4000, 3, 400);
  });
  await scene('liane', async () => {
    await place(a.id, vine - 3);
    await round();
    await rollFor(a.id, 3);
    await burst('liane-greifen', 4300, 2, 900);
    // Handy des Teams an der Liane
    const pl = state.players.find((p) => p.teamId === a.id);
    const tok = tokens[state.players.indexOf(pl)];
    const phoneCtx = await browser.newContext({ ...devices['iPhone 13'] });
    await phoneCtx.addInitScript((t) => localStorage.setItem('insel.token.member', t), tok);
    const phone = await phoneCtx.newPage();
    await phone.goto(`${base}/team`);
    await sleep(2500);
    await phone.screenshot({ path: join(out, 'handy-liane.png') });
    console.log('Foto handy-liane');
    await phoneCtx.close();
    await sleep(Math.max(0, state.phase.dice.busyUntil - Date.now()));
    await cmd({ type: 'vine.roll', value: 5, force: true });
    await burst('liane-schwung', 2400, 6, 380);
  });
  await scene('hoehle', async () => {
    await place(b.id, cave - 2);
    await round();
    await rollFor(b.id, 2);
    await burst('hoehle-sturz', 4000, 4, 450);
    await burst('hoehle-ausgang', 700, 4, 500);
  });
  // Rückgängig mitten im Auftritt: Figuren müssen danach exakt auf ihren Feldern stehen
  const undoCheck = async (name, setup, delay) => {
    if (only && !only.has(name)) return;
    await setup();
    await sleep(delay);
    await new Promise((res) => sock.emit('undo', res));
    await sleep(2500);
    const vineTeam = state.phase.name === 'dice' ? state.phase.dice.vine?.teamId : null;
    const res = await page.evaluate(([teams, vineTeam]) => {
      const b = window.__board;
      return teams.map((t) => {
        const p = b.pieces.get(t.id);
        const slot = b.pieces.slotOn(t.id, t.position);
        // hängt laut Zustand an der Liane → muss oben an der Liane hängen
        if (t.id === vineTeam) return { name: t.name, ok: p.holder.visible && p.holder.position.y > slot.y + 0.6, busy: false, liane: true };
        return { name: t.name, ok: b.pieces.positionOf(t.id) === t.position && p.holder.visible && p.holder.scale.x === 1 && p.holder.position.distanceTo(slot) < 0.6, busy: p.busy };
      });
    }, [state.teams.map((t) => ({ id: t.id, name: t.name, position: t.position })), vineTeam]);
    const temps = await page.evaluate(() => window.__board.stunts.group.children.length);
    console.log('Rückgängig', name, JSON.stringify(res), 'Objekte', temps);
    if (res.some((r) => !r.ok || r.busy)) errors.push(`Rückgängig ${name}: Figur nicht korrekt`);
  };
  await undoCheck('undo-ufo', async () => {
    await place(a.id, 12);
    await place(b.id, 30);
    await round();
    await rollFor(a.id, 3);
  }, 5600);
  await undoCheck('undo-flugzeug', async () => {
    await place(b.id, 9);
    await round();
    await rollFor(b.id, 3);
  }, 5200);
  await undoCheck('undo-liane', async () => {
    await place(a.id, vine - 3);
    await round();
    await rollFor(a.id, 3);
    await sleep(Math.max(0, state.phase.dice.busyUntil - Date.now()));
    await cmd({ type: 'vine.roll', value: 4, force: true });
  }, 2600);
  console.log('Positionen', state.teams.map((t) => t.position).join(', '));
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
