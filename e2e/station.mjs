// Gruppenmodus prüfen: Spiel mit „Gruppen teilen sich ein Gerät“ anlegen, an einer Anmeldestation
// mehrere Personen nacheinander anmelden (mit Selfie), Teams bilden, Team-Gerät per PIN verbinden,
// Nachzügler am Team-Gerät hinzufügen.   npm run build -w @insel/web && node e2e/station.mjs [ordner]
import { chromium, devices } from 'playwright';
import { io } from 'socket.io-client';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';

const out = process.argv[2] ?? join(tmpdir(), 'insel-station');
mkdirSync(out, { recursive: true });
const dataDir = mkdtempSync(join(tmpdir(), 'insel-station-'));
const port = 8105;
const base = `http://localhost:${port}`;
const server = spawn('npx', ['tsx', 'packages/server/src/main.ts'], { env: { ...process.env, DATA_DIR: dataDir, INSEL_PORT: String(port), ADMIN_PASSWORD: 'st', NODE_ENV: 'production' }, stdio: 'ignore' });
for (let i = 0; i < 80; i++) { try { if ((await fetch(`${base}/api/health`)).ok) break; } catch {} await new Promise((r) => setTimeout(r, 250)); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const post = async (path, body, token) => (await fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) })).json();
const browser = await chromium.launch();
const errors = [];
const shot = async (page, name) => {
  await page.screenshot({ path: join(out, `${name}.png`) });
  console.log('Foto', name);
};
// Testbild als „Selfie“ (ein Bild aus der Doku)
const selfie = join(process.cwd(), 'docs/bilder/handy-figur.webp');
try {
  const { token } = await post('/api/auth/admin', { password: 'st' });
  const templates = (await (await fetch(`${base}/api/templates`, { headers: { authorization: `Bearer ${token}` } })).json()).templates;
  await post('/api/games', { name: 'Station', devices: 'shared', templateId: templates.find((t) => t.name.startsWith('Standard')).id }, token);
  const sock = io(base, { auth: { token, view: 'regie' }, transports: ['websocket'] });
  let state = null;
  sock.on('state', (p) => (state = p.state));
  await new Promise((r) => sock.on('connect', r));
  for (let i = 0; i < 40 && !state; i++) await sleep(100);
  const cmd = (c) => new Promise((res) => sock.emit('cmd', c, (a) => { if (!a.ok) errors.push(`${c.type}: ${a.error}`); res(a); }));
  if (state.config.devices !== 'shared') errors.push('devices nicht übernommen');

  // Anmeldestation (Tablet)
  const stationCtx = await browser.newContext({ ...devices['iPad Mini'] });
  const station = await stationCtx.newPage();
  station.on('pageerror', (e) => errors.push('station: ' + e.message));
  await station.goto(`${base}/join`);
  await station.getByPlaceholder('Vorname der nächsten Person').waitFor({ timeout: 20000 });
  const names = ['Mia', 'Leon', 'Emma', 'Paul', 'Lena', 'Ben'];
  for (const [i, n] of names.entries()) {
    await station.getByPlaceholder('Vorname der nächsten Person').fill(n);
    await station.getByRole('button', { name: 'Los geht’s' }).click();
    await station.getByText(`Hallo ${n}!`).waitFor({ timeout: 10000 });
    if (i === 0) {
      await station.locator('input[type=file]').nth(1).setInputFiles(selfie);
      await sleep(1500);
      await shot(station, 'station-selfie');
      await station.getByRole('button', { name: /nächste Person/ }).click();
    } else await station.getByRole('button', { name: /nächste Person/ }).click();
    await station.getByText(`${n} ist angemeldet`).waitFor({ timeout: 10000 });
  }
  await shot(station, 'station-liste');
  const stationToken = await station.evaluate(() => localStorage.getItem('insel.token.member'));
  if (stationToken) errors.push('Station hat ein Spieler-Token gespeichert');
  if (state.players.length !== names.length) errors.push(`erwartet ${names.length} Spieler, sind ${state.players.length}`);
  if (!state.players.find((p) => p.name === 'Mia')?.photo) errors.push('Selfie von Mia fehlt');
  console.log('Spieler:', state.players.map((p) => `${p.name}${p.photo ? '📷' : ''}`).join(', '));

  // Teams bilden, Team-Gerät mit PIN verbinden
  await cmd({ type: 'teams.auto', count: 2 });
  const team = state.teams[0];
  const teamCtx = await browser.newContext({ ...devices['iPhone 13'] });
  const phone = await teamCtx.newPage();
  phone.on('pageerror', (e) => errors.push('team: ' + e.message));
  await phone.goto(`${base}/join`);
  await phone.getByRole('button', { name: 'Team-PIN' }).click();
  await phone.locator('input[inputmode=numeric]').fill(team.pin);
  await phone.waitForURL(/\/team/, { timeout: 10000 });
  await sleep(1500);
  await phone.getByRole('button', { name: 'Team', exact: true }).click();
  await sleep(800);
  await phone.getByRole('button', { name: 'Person hinzufügen' }).click();
  await phone.getByPlaceholder('Vorname').fill('Nachzügler');
  await phone.getByRole('button', { name: 'Hinzufügen' }).click();
  await phone.getByText('Selfie für Nachzügler?').waitFor({ timeout: 10000 });
  await shot(phone, 'team-nachzuegler');
  await phone.getByRole('button', { name: 'Fertig' }).click();
  await sleep(600);
  const late = state.players.find((p) => p.name === 'Nachzügler');
  if (!late || late.teamId !== team.id) errors.push('Nachzügler nicht im Team');
  if (await phone.getByText('Ich bin einer davon').count()) errors.push('„Ich bin einer davon“ im Gruppenmodus sichtbar');
  await shot(phone, 'team-seite');
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
