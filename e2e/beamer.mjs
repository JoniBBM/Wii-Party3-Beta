// Beamer-Szenen-Test: steuert ein Spiel per WebSocket (wie die Regie) und fotografiert den Beamer.
//   npm run build -w @insel/web && node e2e/beamer.mjs [ausgabeordner] [szenen,…]
import { chromium } from 'playwright';
import { io } from 'socket.io-client';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';

const out = process.argv[2] ?? join(tmpdir(), 'insel-beamer');
const only = process.argv[3]?.split(',') ?? null;
mkdirSync(out, { recursive: true });
const dataDir = mkdtempSync(join(tmpdir(), 'insel-beamer-data-'));
const port = 8096;
const base = `http://localhost:${port}`;
const PASS = 'beamer-test';
const W = Number(process.env.W ?? 1920);
const H = Number(process.env.H ?? 1080);

const server = spawn('npx', ['tsx', 'packages/server/src/main.ts'], {
  env: { ...process.env, DATA_DIR: dataDir, INSEL_PORT: String(port), ADMIN_PASSWORD: PASS, NODE_ENV: 'production' },
  stdio: ['ignore', 'ignore', 'pipe'],
});
server.stderr.on('data', (d) => process.stderr.write(`[server] ${d}`));
for (let i = 0; i < 80; i++) {
  try {
    if ((await fetch(`${base}/api/health`)).ok) break;
  } catch {}
  await new Promise((r) => setTimeout(r, 250));
}

const post = async (path, body, token) => {
  const r = await fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });
  return r.json();
};
const { token } = await post('/api/auth/admin', { password: PASS });
// Beamer-Zugang (sonst zeigt der Beamer nur den Kopplungscode)
const { token: beamerToken } = await post('/api/auth/beamer-link', {}, token);
const templates = await (await fetch(`${base}/api/templates`, { headers: { authorization: `Bearer ${token}` } })).json();
const tpl = templates.templates.find((t) => t.name.startsWith('Standard'));
await post('/api/games', { name: 'Beamer-Test', templateId: tpl.id }, token);

const sock = io(base, { auth: { token, view: 'regie' }, transports: ['websocket'] });
let state = null;
sock.on('state', (p) => (state = p.state));
await new Promise((r) => sock.on('connect', r));
const cmd = (c) =>
  new Promise((res) => {
    sock.emit('cmd', c, (ack) => {
      if (!ack.ok) console.log('⚠️ ', c.type, ack.error);
      res(ack);
    });
  });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch({ args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: W, height: H } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
await page.addInitScript(() => localStorage.setItem('insel.beamer', JSON.stringify({ quality: localStorage.getItem('q') ?? 'beauty', sound: false, music: false, ambience: false, tags: true })));
await page.goto(`${base}/beamer#bt=${beamerToken}`);
await page.waitForFunction(() => !document.body.innerText.includes('Lade Insel') && !document.body.innerText.includes('wird'), null, { timeout: 60000 }).catch(() => {});
await sleep(1500);

let n = 0;
const shot = async (name) => {
  if (only && !only.includes(name)) return;
  n++;
  const file = join(out, `${String(n).padStart(2, '0')}-${name}.png`);
  await page.screenshot({ path: file });
  console.log('📸', file);
};

try {
  // Lobby mit Spielern
  for (const name of ['Anna', 'Ben', 'Cem', 'Dana', 'Emil', 'Fiona', 'Gül', 'Hannes', 'Ida']) await post('/api/auth/register', { name });
  await sleep(800);
  await shot('lobby-spieler');
  await cmd({ type: 'teams.auto', count: 4 });
  await sleep(1500);
  await shot('lobby-teams');
  await cmd({ type: 'game.start' });
  await sleep(2500);
  await shot('start');

  // Teams auf der Insel verteilen
  const goal = state.config.board.fields.length - 1;
  const spots = [6, 21, 38, goal - 9];
  for (let i = 0; i < state.teams.length; i++) await cmd({ type: 'team.setPosition', teamId: state.teams[i].id, position: spots[i] });
  await sleep(4500);
  await shot('verteilt');

  // Frage
  const items = (await (await fetch(`${base}/api/library/items`, { headers: { authorization: `Bearer ${token}` } })).json()).items;
  const q = items.find((i) => i.title === 'Hauptstadt Australiens');
  await cmd({ type: 'content.select', source: 'manual', itemId: q.id });
  await sleep(1200);
  await cmd({ type: 'content.open' });
  await sleep(1500);
  await shot('frage-offen');
  for (const [i, t] of state.teams.entries()) await cmd({ type: 'answer.submit', teamId: t.id, value: i % 3 === 0 ? 2 : 1 });
  await cmd({ type: 'content.reveal' });
  await sleep(1500);
  await shot('frage-aufgeloest');
  await cmd({ type: 'content.finish' });
  await sleep(2600);
  await shot('ergebnis');
  await cmd({ type: 'results.confirm' });
  await sleep(1800);
  await shot('wuerfelrunde');

  // Würfeln: erster Wurf, mitten in der Animation fotografieren
  await cmd({ type: 'dice.roll', main: 5 });
  await sleep(1100);
  await shot('wuerfel-rollt');
  await sleep(2400);
  await shot('figur-laeuft');
  await sleep(4000);

  // Spiel (mit Spielerfotos/Emojis) als Inhalt
  // (zuerst Runde zu Ende bringen)
  while (state.phase.name === 'dice') {
    if (state.phase.dice.fieldGame) {
      await cmd({ type: 'fieldgame.setup' });
      await sleep(1500);
      await shot('feldminispiel');
      await cmd({ type: 'fieldgame.result', won: true });
    } else if (state.phase.dice.challenge) {
      const c = state.phase.dice.challenge;
      await cmd(c.kind === 'river' ? { type: 'challenge.choose', choice: 'barrels', force: true } : { type: 'challenge.roll', force: true });
    }
    else await cmd({ type: 'dice.roll', force: true });
    await sleep(600);
  }
  await sleep(4000);
  const game = items.find((i) => i.title === 'Becherturm');
  await cmd({ type: 'content.select', source: 'manual', itemId: game.id });
  await sleep(2500);
  await shot('spiel-ausgelost');
  await cmd({ type: 'content.abort' });

  // Vulkanausbruch
  await cmd({ type: 'volcano.erupt' });
  await sleep(2600);
  await shot('ausbruch');
  await sleep(4500);
  await shot('nach-ausbruch');

  // Sieg
  const leader = [...state.teams].sort((a, b) => b.position - a.position)[0];
  await cmd({ type: 'team.setPosition', teamId: leader.id, position: goal });
  await sleep(3500);
  await cmd({ type: 'game.finish', teamId: leader.id });
  await sleep(3500);
  await shot('sieg');

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
