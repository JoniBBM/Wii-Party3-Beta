// Optische Prüfung: Alle Seiten in mehreren Bildschirmbreiten und Spielphasen öffnen und melden,
// wo Text aus seinem Kasten ragt oder die Seite seitlich scrollt.
// Startet einen eigenen Server mit leerer Datenbank (gebaute Weboberfläche nötig: npm run build).
//   node e2e/layout.mjs [ordner-für-bilder]
import { chromium } from 'playwright';
import { io } from 'socket.io-client';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { audit } from './audit.mjs';

const out = process.argv[2] ?? join(tmpdir(), 'insel-layout');
mkdirSync(out, { recursive: true });
const dataDir = mkdtempSync(join(tmpdir(), 'insel-layout-'));
const port = 8098;
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
const call = async (method, path, body, token) =>
  (await fetch(base + path, { method, headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined })).json();
const post = (path, body, token) => call('POST', path, body ?? {}, token);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const WIDTHS = [
  { name: 'handy', width: 375, height: 800, mobile: true },
  { name: 'tablet', width: 768, height: 1024, mobile: true },
  { name: 'laptop-klein', width: 1024, height: 768 },
  { name: 'laptop', width: 1280, height: 800 },
  { name: 'monitor', width: 1600, height: 900 },
];

const findings = [];
const browser = await chromium.launch();
try {
  const { token: admin } = await post('/api/auth/admin', { password: PASS });
  const tpl = (await call('GET', '/api/templates', null, admin)).templates.find((t) => t.name.startsWith('Standard'));
  const items = (await call('GET', '/api/library/items', null, admin)).items;
  const { token: beamerToken } = await post('/api/auth/beamer-link', {}, admin);
  const sock = io(base, { auth: { token: admin, view: 'regie' }, transports: ['websocket'] });
  let state = null;
  sock.on('state', (p) => (state = p.state));
  await new Promise((r) => sock.on('connect', r));
  const cmd = (c) => new Promise((res) => sock.emit('cmd', c, res));

  /** Neues Spiel (wird das gewählte des Admins): 6 Spieler mit langen Namen, 3 Teams, eins mit langem Namen. */
  async function newGame(name) {
    const { code } = await post('/api/games', { name, templateId: tpl.id }, admin);
    const players = [];
    for (const n of ['Maximilian-Alexander', 'Anna', 'Konstantin', 'Leonie-Sophie', 'Ben', 'Emilia']) players.push((await post('/api/auth/register', { name: n, code })).token);
    await sleep(300);
    await cmd({ type: 'teams.auto', count: 3 });
    await sleep(200);
    await cmd({ type: 'team.update', teamId: state.teams[0].id, name: 'Die unglaublich wilden Vulkanbezwinger' });
    return { code, players };
  }

  const REGIE = ['/regie', '/regie/beamer', '/regie/teams', '/regie/einrichten', '/regie/bibliothek', '/regie/spiele', '/regie/konten', '/regie/einstellungen'];

  async function check(phase, { path, slot, token, width, beamer = false, action }) {
    const ctx = await browser.newContext({ viewport: { width: width.width, height: width.height }, isMobile: !!width.mobile, hasTouch: !!width.mobile, deviceScaleFactor: 1 });
    await ctx.addInitScript(
      ([s, t]) => {
        if (s && t) localStorage.setItem(`insel.token.${s}`, t);
      },
      [slot, token],
    );
    const page = await ctx.newPage();
    await page.goto(base + path);
    await sleep(beamer ? 3500 : 1200);
    let where = path;
    if (action) {
      try {
        await action(page);
        await sleep(700);
        where = `${path} › ${action.label}`;
      } catch (e) {
        findings.push({ phase, path, width: width.name, kind: 'aktion-fehlgeschlagen', text: action.label, detail: e.message.split('\n')[0] });
      }
    }
    const res = await page.evaluate(audit);
    for (const f of res) findings.push({ phase, path: where, width: width.name, ...f });
    if (res.length) await page.screenshot({ path: join(out, `${phase}-${where.replace(/[^a-z0-9]+/gi, '_')}-${width.name}.png`) });
    await ctx.close();
  }

  async function round(phase, players, { all = true } = {}) {
    for (const width of WIDTHS) {
      for (const path of all ? REGIE : ['/regie']) await check(phase, { path, slot: 'admin', token: admin, width });
      await check(phase, { path: '/moderator', slot: 'moderator', token: admin, width });
      if (width.mobile) await check(phase, { path: '/team', slot: 'member', token: players[0], width });
    }
    for (const width of [
      { name: 'beamer-1080', width: 1920, height: 1080 },
      { name: 'beamer-720', width: 1280, height: 720 },
    ])
      await check(phase, { path: '/beamer', slot: 'beamer', token: beamerToken, width, beamer: true });
  }

  const act = (label, fn) => Object.assign(fn, { label });
  /** Spiel einrichten: Reiter unter „Alle Einstellungen“ bzw. n-mal „Weiter“ im Assistenten */
  const allSettings = async (p, tab) => {
    await p.getByRole('tab', { name: 'Alle Einstellungen' }).click();
    await p.getByRole('tab', { name: tab }).click();
  };
  const wizard = async (p, next) => {
    await p.getByRole('radio', { name: /Insel der Abenteuer/ }).click();
    await p.getByRole('radio', { name: /Nach Spieldauer/ }).click();
    for (let i = 0; i < next; i++) await p.getByRole('button', { name: 'Weiter' }).click();
  };
  const DIALOGS = [
    ['/regie/bibliothek', act('Inhalt bearbeiten', (p) => p.getByRole('button', { name: /Riesenplanet/ }).first().click())],
    ['/regie/bibliothek', act('Neue Sammlung', (p) => p.getByRole('button', { name: 'Sammlung', exact: true }).click())],
    ['/regie/spiele', act('Neues Spiel', (p) => p.getByRole('button', { name: 'Neues Spiel' }).click())],
    ['/regie/konten', act('Einladen', (p) => p.getByRole('button', { name: 'Spielleiter einladen' }).click())],
    ['/regie/teams', act('Team-QR', (p) => p.getByRole('button', { name: 'QR-Code zeigen' }).first().click())],
    ['/regie/teams', act('Spieler bearbeiten', (p) => p.getByRole('button', { name: 'Bearbeiten' }).first().click())],
    ['/regie/einrichten', act('Ablaufplan', (p) => allSettings(p, 'Ablaufplan'))],
    ['/regie/einrichten', act('Spielfeld', (p) => allSettings(p, 'Spielfeld'))],
    ['/regie/einrichten', act('Regeln', (p) => allSettings(p, 'Regeln'))],
    ['/regie/einrichten', act('Assistent Dauer', (p) => wizard(p, 0))],
    ['/regie/einrichten', act('Assistent Sonderfelder', (p) => wizard(p, 2))],
    ['/regie/einrichten', act('Assistent Sammlungen', (p) => wizard(p, 4))],
    ['/regie/einstellungen', act('Moderator-QR', (p) => p.getByRole('button', { name: 'Moderator-QR-Code erzeugen' }).click())],
  ];

  // Ohne Anmeldung: Startseite, Beitritt, Anmeldungen
  const first = await newGame('Sommerfreizeit Hintertupfingen 2026');
  for (const width of WIDTHS) {
    for (const path of ['/', '/join', `/join/${first.code}`, '/konto', '/moderator', '/regie']) await check('ohne-anmeldung', { path, width });
  }
  console.log('… Lobby');
  await round('lobby', first.players);
  console.log('… Dialoge');
  for (const width of WIDTHS) for (const [path, action] of DIALOGS) await check('dialoge', { path, slot: 'admin', token: admin, width, action });

  console.log('… Auswahl');
  await cmd({ type: 'game.start' });
  await sleep(300);
  await round('auswahl', first.players, { all: false });

  console.log('… Auswahlfrage');
  const choice = items.find((i) => i.kind === 'choice' && i.options.some((o) => o.length > 18)) ?? items.find((i) => i.kind === 'choice');
  await cmd({ type: 'content.select', source: 'manual', itemId: choice.id });
  await cmd({ type: 'content.open' });
  await sleep(300);
  await round('frage', first.players);
  console.log('… aufgelöst');
  await cmd({ type: 'content.close' });
  await cmd({ type: 'content.reveal' });
  await sleep(300);
  await round('aufgeloest', first.players, { all: false });
  console.log('… Würfeln');
  await cmd({ type: 'content.finish' });
  await cmd({ type: 'results.confirm' });
  await sleep(300);
  await round('wuerfeln', first.players, { all: false });

  // weitere Inhaltsarten, je in einem eigenen Spiel
  for (const [kind, label] of [
    ['estimate', 'schaetzfrage'],
    ['text', 'freitext'],
    ['buzzer', 'buzzer'],
    ['game', 'minispiel'],
  ]) {
    const item = items.find((i) => i.kind === kind);
    if (!item) continue;
    console.log(`… ${label}`);
    const g = await newGame(`Testabend ${label}`);
    await cmd({ type: 'game.start' });
    await cmd({ type: 'content.select', source: 'manual', itemId: item.id });
    await cmd({ type: 'content.open' });
    await sleep(300);
    await round(label, g.players, { all: false });
  }
  sock.close();
} finally {
  await browser.close();
  server.kill();
  rmSync(dataDir, { recursive: true, force: true });
}

// Zusammenfassen: gleiche Funde über Breiten/Phasen hinweg bündeln
const groups = new Map();
for (const f of findings) {
  const key = `${f.path} | ${f.kind} | ${f.text} | ${f.detail ?? ''}`.replace(/\d+>\d+|-?\d+…\d+ \/ \d+|\d+px statt \d+px/g, '#');
  const g = groups.get(key) ?? { ...f, where: new Set() };
  g.where.add(`${f.phase}/${f.width}`);
  groups.set(key, g);
}
console.log(`\n${groups.size} Stellen (${findings.length} Funde):`);
for (const g of groups.values()) console.log(`- ${g.path} [${g.kind}] «${g.text}» ${g.detail ?? ''}\n    bei: ${[...g.where].slice(0, 6).join(', ')}${g.where.size > 6 ? ' …' : ''}`);
console.log(groups.size ? `\nBilder: ${out}` : '\n✅ Nichts ragt heraus');
