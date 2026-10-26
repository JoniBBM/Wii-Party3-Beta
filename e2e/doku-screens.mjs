// Bildschirme für die Doku (docs/doku/screens, Tab „Oberfläche“ im Portal): spielt eine Partie bis zur ersten
// Frage, fotografiert die wichtigsten Oberflächen und misst die anklickbaren Bereiche (Hotspots) aus.
// Titel, Bausteine und Text der Bildschirme pflegt man in docs/doku/screens/<id>.md – das Skript ersetzt dort
// nur „image“ und „hotspots“.
//   npm run build -w @insel/web && node e2e/doku-screens.mjs        (DISCOVER=1: alle Bedienelemente auflisten)
import { chromium, devices } from 'playwright';
import { io } from 'socket.io-client';
import sharp from 'sharp';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';

const DOC = 'docs/doku';
mkdirSync(join(DOC, 'assets/screens'), { recursive: true });
mkdirSync(join(DOC, 'screens'), { recursive: true });
const dataDir = mkdtempSync(join(tmpdir(), 'insel-doku-screens-'));
const port = 8096;
const base = `http://localhost:${port}`;
const PASS = 'doku-screens';
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
const { token: beamerToken } = await post('/api/auth/beamer-link', {}, token);
const auth = { authorization: `Bearer ${token}` };

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
const staff = (slot) => ({ fn: ([s, t]) => localStorage.setItem(`insel.token.${s}`, t), arg: [slot, token] });
const desktop = { viewport: { width: 1440, height: 900 } };
// volle Bildschirmhöhe eines iPhone 13 (ohne Browserleisten), damit „Antwort abschicken“ sichtbar ist
const phoneSize = { ...devices['iPhone 13'], viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 };
const tabletSize = { viewport: { width: 834, height: 1112 }, deviceScaleFactor: 1.5, isMobile: true, hasTouch: true };
const beamerSize = { viewport: { width: 1600, height: 900 } };

/** Prozentwerte (auf eine Stelle) eines Kastens relativ zum sichtbaren Bild, auf das Bild beschnitten */
const percent = (box, vw, vh) => {
  const cl = (n) => Math.min(100, Math.max(0, n));
  const x = cl((box.x / vw) * 100);
  const y = cl((box.y / vh) * 100);
  const r = (n) => Math.round(n * 10) / 10;
  return [r(x), r(y), r(cl(((box.x + box.width) / vw) * 100) - x), r(cl(((box.y + box.height) / vh) * 100) - y)];
};

/** Ersetzt ein Frontmatter-Feld (einzeilig oder Liste) oder hängt es an */
function setField(text, key, value) {
  const m = text.match(/^---\n([\s\S]*?)\n---/);
  const lines = m[1].split('\n');
  const start = lines.findIndex((l) => l.startsWith(`${key}:`));
  let end = start + 1;
  if (start >= 0) while (end < lines.length && /^\s+-/.test(lines[end])) end++;
  const repl = Array.isArray(value) ? [`${key}:`, ...value.map((v) => `  - ${v}`)] : [`${key}: ${value}`];
  if (start >= 0) lines.splice(start, end - start, ...repl);
  else lines.push(...repl);
  return text.replace(/^---\n[\s\S]*?\n---/, () => `---\n${lines.join('\n')}\n---`);
}

/**
 * Foto + Hotspots eines Bildschirms. spots: [locator, ziele, erklärung] – ziele: Baustein-IDs, flow:<id>, screen:<id>.
 * meta (nur beim ersten Anlegen der .md): title, url, order, components, text
 */
async function capture(id, page, spots, meta) {
  await sleep(meta.wait ?? 1000);
  const vp = page.viewportSize();
  if (process.env.DISCOVER) {
    const found = await page.evaluate(() =>
      [...document.querySelectorAll('a[href], button, input:not([type=hidden]), select, textarea, [role=button], [role=tab], [role=radio], summary, h1, h2, h3, canvas, img')]
        .map((el) => ({ el, r: el.getBoundingClientRect() }))
        .filter(({ r }) => r.width > 4 && r.height > 4 && r.bottom > 0 && r.top < innerHeight)
        .map(({ el, r }) => `${el.tagName.toLowerCase()}${el.getAttribute('role') ? `[${el.getAttribute('role')}]` : ''} "${(el.getAttribute('aria-label') || el.innerText || el.placeholder || el.alt || '').trim().replace(/\s+/g, ' ').slice(0, 50)}" @${Math.round(r.x)},${Math.round(r.y)} ${Math.round(r.width)}x${Math.round(r.height)}`),
    );
    console.log(`\n── ${id} ──\n${found.join('\n')}`);
  }
  const lines = [];
  for (const [loc, refs, text] of spots) {
    // feste Prozentwerte für Bereiche ohne eigenes Element (z. B. in der 3D-Welt)
    if (Array.isArray(loc)) {
      lines.push(`${loc.join(',')}: ${refs} "${text}"`);
      continue;
    }
    const boxes = await Promise.all((loc.union ? await loc(page).all() : [loc(page).first()]).map((l) => l.boundingBox({ timeout: 2000 }).catch(() => null)));
    const box = boxes.filter(Boolean).reduce((a, b) => {
      if (!a) return b;
      const x = Math.min(a.x, b.x);
      const y = Math.min(a.y, b.y);
      return { x, y, width: Math.max(a.x + a.width, b.x + b.width) - x, height: Math.max(a.y + a.height, b.y + b.height) - y };
    }, null);
    if (!box) {
      console.log(`⚠️  ${id}: Bereich „${text}“ nicht gefunden`);
      continue;
    }
    lines.push(`${percent(box, vp.width, vp.height).join(',')}: ${refs} "${text}"`);
  }
  const png = await page.screenshot();
  await sharp(png).webp({ quality: 80 }).toFile(join(DOC, 'assets/screens', `${id}.webp`));
  const md = join(DOC, 'screens', `${id}.md`);
  let text = existsSync(md)
    ? readFileSync(md, 'utf8')
    : `---\ntitle: ${meta.title}\nurl: ${meta.url}\norder: ${meta.order}\ncomponents: [${meta.components.join(', ')}]\n---\n${meta.text ?? 'Was man auf diesem Bildschirm sieht und tun kann.'}\n`;
  text = setField(text, 'image', `assets/screens/${id}.webp`);
  text = setField(text, 'hotspots', lines);
  writeFileSync(md, text);
  console.log(`📸 ${id}: ${lines.length} Bereiche`);
}

const role = (r, name, exact = false) => (p) => p.getByRole(r, { name, exact });
const text = (t, exact = false) => (p) => p.getByText(t, { exact });
const css = (sel, hasText) => (p) => p.locator(sel, hasText ? { hasText } : undefined);
/** Ein Bereich um alle Treffer des Locators */
const union = (fn) => Object.assign(fn, { union: true });
/** Elternelement eines Knopfs – für ganze Knopfgruppen */
const groupOf = (name) => (p) => p.getByRole('button', { name, exact: true }).locator('..');
/** Seitenleiste und Kopfzeile der Regie (gleich auf allen Regie-Seiten) */
const regieFrame = [
  [role('link', 'Live', true), 'regie, screen:regie-live', 'Live: das laufende Spiel steuern'],
  [role('link', 'Beamer', true), 'regie, screen:regie-beamer', 'Beamer fernsteuern und freigeben'],
  [role('link', 'Spiel einrichten', true), 'regie, screen:regie-einrichten', 'Alle Einstellungen des Spiels'],
  [role('link', 'Beamer öffnen'), 'beamer, screen:beamer', 'Beamer-Ansicht in neuem Fenster öffnen'],
  [role('link', 'Moderator-Ansicht'), 'moderator, screen:moderator', 'Moderator-Ansicht öffnen'],
  [role('button', 'Einstellungen suchen'), 'regie', 'Alle Einstellungen durchsuchen (Strg/⌘+K)'],
  [role('button', 'Rückgängig'), 'engine, echtzeit, flow:befehl-und-spielstand', 'Letzten Schritt zurücknehmen'],
];

let sock;
try {
  // Startseite
  const home = await open('/', desktop);
  await capture('start', home, [
    [role('button', 'Mitspielen'), 'handy, flow:beitritt, screen:handy-beitritt', 'Als Team mitspielen: Spielcode eingeben oder QR-Code scannen'],
    [role('link', 'Beamer'), 'beamer, flow:beamer-kopplung, screen:beamer', 'Diesen Bildschirm zum Beamer machen'],
    [role('link', 'Regie'), 'regie, screen:regie-anmeldung', 'Zur Regie der Spielleitung (mit Anmeldung)'],
    [role('link', 'Moderator'), 'moderator, screen:moderator', 'Vorleseansicht für den Moderator'],
  ], { title: 'Startseite', url: '/', order: 10, components: ['web-grundlage'] });
  await home.context().close();

  // Anmeldung der Spielleitung
  const login = await open('/regie', desktop);
  await capture('regie-anmeldung', login, [
    [(p) => p.getByPlaceholder('Benutzername oder E-Mail'), 'konten, flow:anmeldung-spielleitung', 'Benutzername oder E-Mail des Kontos'],
    [(p) => p.getByPlaceholder('Passwort', { exact: true }), 'konten', 'Passwort – nach mehreren Fehlversuchen wird kurz gesperrt'],
    [role('button', 'Anmelden', true), 'konten, flow:anmeldung-spielleitung, screen:regie-live', 'Anmelden und zur Regie'],
    [role('button', 'Passwort vergessen?'), 'konten, smtp', 'Link zum Zurücksetzen per E-Mail anfordern'],
  ], { title: 'Anmeldung der Spielleitung', url: '/regie', order: 20, components: ['regie', 'konten'] });
  await login.context().close();

  // Neues Spiel über den Assistenten
  const regie = await open('/regie/spiele', desktop, staff('admin'));
  await regie.getByRole('button', { name: 'Neues Spiel erstellen', exact: true }).click();
  await regie.waitForURL('**/regie/einrichten');
  await capture('regie-assistent', regie, [
    [groupOf('1 Welt'), 'regie, flow:spiel-einrichten', 'Acht Schritte des Assistenten – jeder lässt sich direkt anspringen'],
    [role('radio', 'Insel der Abenteuer'), 'insel', 'Welt Insel: tropische Vulkaninsel'],
    [role('radio', 'Blockwelt'), 'blockwelt', 'Welt Blockwelt im Minecraft-Stil'],
    [role('radio', 'Weltall'), 'weltall', 'Welt Weltall: Alien-Planet'],
    [text('Von einer gespeicherten Vorlage starten'), 'http-api, datenbank', 'Statt Schritt für Schritt eine gespeicherte Vorlage übernehmen'],
    [role('tab', 'Alle Einstellungen'), 'regie, screen:regie-einrichten', 'Zu allen Einstellungen auf einmal wechseln'],
    ...regieFrame,
  ], { title: 'Assistent für ein neues Spiel', url: '/regie/einrichten', order: 30, components: ['regie', 'engine'], wait: 1500 });

  // Spiel per Befehl weiterführen
  sock = io(base, { auth: { token, view: 'regie' }, transports: ['websocket'] });
  let state = null;
  sock.on('state', (p) => (state = p.state));
  await new Promise((r) => sock.on('connect', r));
  await new Promise((r) => setTimeout(r, 500));
  const cmd = (c) => new Promise((res) => sock.emit('cmd', c, (a) => (a.ok ? res(a) : (console.log('⚠️', c.type, a.error), res(a)))));
  const gameCode = state.code;
  const items = (await (await fetch(`${base}/api/library/items`, { headers: auth })).json()).items;

  // Beitritt am Handy
  const join = await open(`/join/${gameCode}`, phoneSize);
  await capture('handy-beitritt', join, [
    [role('button', 'Neu anmelden'), 'konten, flow:beitritt', 'Neu anmelden: Vorname und Symbol wählen'],
    [role('button', 'Team-PIN'), 'konten', 'Gruppen-Gerät mit der PIN eines Teams verbinden'],
    [(p) => p.getByPlaceholder('Vorname'), 'konten', 'Vorname, wie er im Spiel erscheint'],
    [groupOf('😀'), 'handy', 'Eigenes Symbol aussuchen'],
    [role('button', 'Los geht’s'), 'konten, echtzeit, flow:beitritt, screen:handy-frage', 'Anmelden und ins Spiel'],
  ], { title: 'Beitritt am Handy', url: '/join/SPIELCODE', order: 40, components: ['handy', 'konten'], wait: 1500 });
  await join.context().close();

  const names = ['Mia', 'Leon', 'Emma', 'Paul', 'Lena', 'Ben', 'Hanna', 'Finn'];
  const tokens = [];
  for (const n of names) tokens.push((await post('/api/auth/register', { name: n, code: gameCode })).token);
  await cmd({ type: 'teams.auto', count: 4 });
  await cmd({ type: 'game.start' });
  const spots = [9, 17, 26, 34];
  for (let i = 0; i < state.teams.length; i++) await cmd({ type: 'team.setPosition', teamId: state.teams[i].id, position: spots[i] });

  const beamer = await open(`/beamer#bt=${beamerToken}`, beamerSize, { fn: () => localStorage.setItem('insel.beamer', JSON.stringify({ quality: 'beauty', sound: false })) });
  await beamer.waitForFunction(() => !document.body.innerText.includes('Lade Insel'), null, { timeout: 60000 }).catch(() => {});
  const phone = await open('/team', phoneSize, { fn: (t) => localStorage.setItem('insel.token.member', t), arg: tokens[0] });
  await sleep(5000);

  // Frage läuft – Regie vorher laden, damit die 30 Sekunden für die Fotos reichen
  await regie.goto(`${base}/regie`);
  await regie.getByText('Rangliste', { exact: true }).waitFor({ timeout: 30000 });
  await cmd({ type: 'content.select', source: 'manual', itemId: items.find((i) => i.title === 'Riesenplanet').id });
  await cmd({ type: 'content.open' });
  // zwei andere Teams antworten schon – das Team des fotografierten Handys noch nicht
  const myTeam = state.players.find((pl) => pl.name === 'Mia').teamId;
  const others = state.teams.filter((t) => t.id !== myTeam);
  await cmd({ type: 'answer.submit', teamId: others[0].id, value: 1 });
  await cmd({ type: 'answer.submit', teamId: others[1].id, value: 2 });
  await regie.getByText('Jetzt antworten!').waitFor({ timeout: 15000 });
  await capture('regie-live', regie, [
    [text('Jetzt antworten!'), 'regie, flow:spielrunde', 'Phase der Runde: gerade wird geantwortet'],
    [groupOf('Pause'), 'echtzeit, engine', 'Zeit anhalten oder um 15 Sekunden ändern'],
    [role('button', 'Antworten schließen'), 'echtzeit, engine, flow:spielrunde', 'Keine weiteren Antworten annehmen'],
    [role('button', 'Auflösen'), 'echtzeit, engine, flow:spielrunde, flow:befehl-und-spielstand', 'Richtige Antwort auf Beamer und Handys zeigen'],
    [role('button', 'Abbrechen', true), 'echtzeit, engine', 'Frage ohne Wertung abbrechen'],
    [groupOf('Spiel verlangsamen'), 'engine', 'Spiel-Tempo: das Spiel unauffällig verlangsamen oder beschleunigen'],
    [(p) => p.getByText('Antworten', { exact: true }).locator('xpath=../..'), 'echtzeit, flow:spielrunde', 'Antworten der Teams – live, mit Antwortzeit'],
    [(p) => p.getByRole('button', { name: /^1 Team/ }).locator('xpath=../..'), 'regie', 'Rangliste – Team antippen für Details und Korrekturen'],
    [role('link', 'Alle Regler'), 'regie, show, screen:regie-beamer', 'Alle Beamer-Regler öffnen'],
    ...regieFrame,
  ], { title: 'Regie während einer Frage', url: '/regie', order: 50, components: ['regie', 'echtzeit'], wait: 2000 });
  await phone.getByRole('button', { name: 'Antwort B: Jupiter' }).click({ timeout: 10000 });
  await capture('handy-frage', phone, [
    [union((p) => p.getByRole('button', { name: /^Antwort [A-D]:/ })), 'handy, flow:spielrunde', 'Antwort antippen (doppelt tippen schickt sofort ab)'],
    [role('button', 'Antwort abschicken'), 'echtzeit, flow:spielrunde, flow:befehl-und-spielstand', 'Antwort an den Server schicken'],
    [role('button', 'Team gestalten'), 'figuren, handy', 'Figur des Teams gestalten'],
    [groupOf('Rangliste'), 'handy', 'Wechsel zwischen Spiel, Rangliste und Team'],
    [role('button', 'Abmelden'), 'konten', 'Vom Handy abmelden'],
  ], { title: 'Frage am Handy', url: '/team', order: 60, components: ['handy', 'echtzeit'] });
  const mod = await open('/moderator', tabletSize, staff('moderator'));
  await capture('moderator', mod, [
    [text('Jetzt antworten!'), 'moderator, flow:spielrunde', 'Phase der Runde – Auswahl, Spielen, Ergebnis, Würfeln'],
    [text('Welcher Planet ist der größte'), 'moderator', 'Frage zum Vorlesen in großer Schrift'],
    [(p) => p.getByText('Jupiter', { exact: true }).first().locator('..'), 'moderator', 'Lösung ist markiert – nur hier und in der Regie sichtbar'],
    [groupOf('Pause'), 'echtzeit, engine', 'Zeit anhalten oder um 15 Sekunden ändern'],
    [(p) => p.getByText('Antworten', { exact: true }).locator('xpath=../..'), 'echtzeit', 'Antworten der Teams – live'],
    [role('button', 'Auflösen'), 'echtzeit, engine, flow:spielrunde', 'Mitsteuern: Antworten schließen und auflösen'],
    [groupOf('Spiel verlangsamen'), 'engine', 'Spiel-Tempo'],
    [role('button', 'Design wechseln'), 'web-grundlage', 'Hell oder dunkel'],
  ], { title: 'Moderator', url: '/moderator', order: 70, components: ['moderator', 'echtzeit'], wait: 2000 });
  await capture('beamer', beamer, [
    [css('.glass', 'Runde 1'), 'beamer', 'Name des Spiels und aktuelle Runde'],
    [css('.glass', 'Riesenplanet'), 'beamer, flow:spielrunde', 'Frage mit Antworten und Restzeit'],
    [text('Teams haben geantwortet'), 'echtzeit', 'Wer schon geantwortet hat – live'],
    [css('.glass.w-\\[22rem\\]'), 'beamer', 'Rangliste mit Fortschritt und Vulkandruck'],
    [[38, 22, 46, 70], 'szene, insel, figuren, flow:wuerfelzug-beamer, flow:vulkan-besuch', '3D-Spielwelt: Figuren laufen hier ihre Felder ab'],
  ], { title: 'Beamer', url: '/beamer', order: 80, components: ['beamer', 'szene', 'insel', 'figuren'], wait: 1500 });

  // Einstellungen und Beamer-Fernsteuerung
  await regie.goto(`${base}/regie/einrichten`);
  await capture('regie-einrichten', regie, [
    [(p) => p.locator('nav[aria-label="Bereiche"]:visible').getByRole('button', { name: 'Welt & Stimmung' }), 'insel, blockwelt, weltall, stimmung', 'Welt, Wetter, Jahreszeit und Festzeit'],
    [(p) => p.locator('nav[aria-label="Bereiche"]:visible').getByRole('button', { name: 'Spielfeld' }), 'spielfeld', 'Länge und Felder des Spielfelds'],
    [(p) => p.locator('nav[aria-label="Bereiche"]:visible').getByRole('button', { name: 'Vulkan' }), 'engine', 'Regeln für Vulkan, Ausbruch und Inneres'],
    [role('radio', 'Jede Person hat ein eigenes Handy'), 'handy, konten', 'Eigenes Handy oder Gruppen-Gerät'],
    [role('button', 'Als Vorlage'), 'http-api, datenbank', 'Einstellungen als Vorlage speichern'],
    [role('tab', 'Geführt'), 'regie, flow:spiel-einrichten, screen:regie-assistent', 'Zurück zum Assistenten'],
    ...regieFrame,
  ], { title: 'Spiel einrichten', url: '/regie/einrichten', order: 90, components: ['regie', 'spielfeld'], wait: 1500 });
  await regie.goto(`${base}/regie/beamer`);
  await capture('regie-beamer', regie, [
    [groupOf('Freigeben'), 'konten, flow:beamer-kopplung', 'Code vom Beamer eingeben und freigeben'],
    [role('button', 'Neu laden'), 'show', 'Beamer aus der Ferne neu laden'],
    [role('button', 'Spielerklärung starten'), 'show, stimmung', 'Spielerklärung mit Sprecher abspielen'],
    [role('button', '🌋 In den Vulkan'), 'szene, flow:vulkan-besuch', 'Kamerafahrt ins Vulkan-Innere'],
    [groupOf('Automatik'), 'szene', 'Kamera: Automatik oder fester Blick'],
    [role('button', 'Näher heran'), 'szene', 'Kamera von Hand bewegen'],
    [groupOf('🪄 Automatisch'), 'szene', 'Grafikstufe des Beamers'],
    [role('button', 'Wetter & Stimmung'), 'stimmung, show', 'Wetter, Jahreszeit und Festzeit'],
    ...regieFrame,
  ], { title: 'Beamer fernsteuern', url: '/regie/beamer', order: 100, components: ['regie', 'show'], wait: 2500 });

  console.log(errors.length ? `\n⚠️  Browserfehler:\n${[...new Set(errors)].join('\n')}` : '\n✅ Keine Browserfehler');
} catch (e) {
  console.error('❌', e);
  process.exitCode = 1;
} finally {
  sock?.close();
  await browser.close();
  server.kill();
  rmSync(dataDir, { recursive: true, force: true });
}
