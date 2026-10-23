// Geführte Einrichtung im echten Browser: neues Spiel anlegen → Assistent „Nach Spieldauer“ ganz
// durchklicken (Dauer, Länge, Häufigkeiten, Mutproben, Arten, Sammlungen, Sieg) → prüfen, was im
// Spiel ankommt. Danach „Manuell“ am Handy. Jede Folie wird auf Überstand geprüft und fotografiert.
// Startet einen eigenen Server mit leerer Datenbank (gebaute Weboberfläche nötig: npm run build).
//   node e2e/wizard.mjs [ordner-für-bilder]
import { chromium, devices } from 'playwright';
import { io } from 'socket.io-client';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { audit } from './audit.mjs';

const out = process.argv[2] ?? join(tmpdir(), 'insel-wizard');
mkdirSync(out, { recursive: true });
const dataDir = mkdtempSync(join(tmpdir(), 'insel-wizard-'));
const port = 8097;
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

const browser = await chromium.launch();
const problems = [];
const check = (cond, msg) => {
  if (!cond) problems.push(msg);
  console.log(`${cond ? '✓' : '✗'} ${msg}`);
};
try {
  const { token: admin } = await post('/api/auth/admin', { password: PASS });
  const sock = io(base, { auth: { token: admin, view: 'regie' }, transports: ['websocket'] });
  let state = null;
  sock.on('state', (p) => (state = p.state));
  await new Promise((r) => sock.on('connect', r));

  const errors = [];
  /** Folie prüfen (Überstand) und fotografieren */
  const slide = async (page, name) => {
    await sleep(450);
    const res = await page.evaluate(audit);
    for (const f of res) problems.push(`${name}: ${f.kind} «${f.text}» ${f.detail ?? ''}`);
    await page.screenshot({ path: join(out, `${name}.png`), fullPage: true });
  };

  // --- Laptop: „Nach Spieldauer“ ---------------------------------------------------------------
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 } });
  await ctx.addInitScript((t) => localStorage.setItem('insel.token.admin', t), admin);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${base}/regie/spiele`);
  await page.getByRole('button', { name: 'Neues Spiel' }).click();
  await page.getByRole('button', { name: 'Anlegen & wählen' }).click();
  await page.waitForURL('**/regie/einrichten');
  await page.getByText('In welcher Welt wird gespielt?').waitFor();
  check(true, 'Neues Spiel führt direkt in den Assistenten');
  await slide(page, '0-welt');
  await page.getByRole('radio', { name: /Blockwelt/ }).click();
  await page.getByText('Wie möchtest du das Spiel einrichten?').waitFor();
  await slide(page, '1-start');

  await page.getByRole('radio', { name: /Nach Spieldauer/ }).click();
  await page.getByText('Wie lange soll das Spiel ungefähr dauern?').waitFor();
  await page.getByRole('button', { name: '45 Min.', exact: true }).click();
  await page.getByRole('button', { name: '3', exact: true }).click();
  const suggestion = Number((await page.getByText(/Vorschlag: \d+ Felder/).innerText()).match(/(\d+) Felder/)[1]);
  check(suggestion >= 25 && suggestion <= 45, `Vorschlag für 45 Min. bei 3 Teams: ${suggestion} Felder`);
  await slide(page, '2-dauer');

  await page.getByRole('button', { name: 'Weiter' }).click();
  const fieldsInput = page.getByRole('textbox', { name: 'Anzahl Felder', exact: true });
  check(Number(await fieldsInput.inputValue()) === suggestion, 'Spielfeld übernimmt den Vorschlag');
  await fieldsInput.fill(String(suggestion + 15));
  await fieldsInput.press('Enter');
  await page.getByRole('button', { name: /Vorschlag für 45 Min\./ }).waitFor();
  check(true, 'Abweichende Länge bietet den Vorschlag wieder an');
  await slide(page, '3-spielfeld');
  await page.getByRole('button', { name: /Vorschlag für 45 Min\./ }).click();
  check(Number(await fieldsInput.inputValue()) === suggestion, 'Vorschlag lässt sich zurückholen');

  await page.getByRole('button', { name: 'Weiter' }).click();
  await page.getByRole('radiogroup', { name: 'Häufigkeit Totenkopf' }).getByRole('radio', { name: 'Aus' }).click();
  await page.getByRole('radiogroup', { name: 'Häufigkeit Minispiel-Feld' }).getByRole('radio', { name: 'Sehr oft' }).click();
  await page.locator('li', { hasText: 'Liane' }).getByRole('switch').click();
  await slide(page, '4-sonderfelder');

  await page.getByRole('button', { name: 'Weiter' }).click();
  await page.getByRole('checkbox', { name: /Buzzer-Frage/ }).click();
  await page.getByRole('checkbox', { name: /Freitextfrage/ }).click();
  await slide(page, '5-arten');

  await page.getByRole('button', { name: 'Weiter' }).click();
  await page.getByRole('button', { name: 'Keine', exact: true }).click();
  await page.getByRole('button', { name: 'Alle passenden' }).click();
  await page.getByRole('button', { name: /Inhalte von .* ansehen/ }).first().click();
  await slide(page, '6-sammlungen');

  await page.getByRole('button', { name: 'Weiter' }).click();
  await page.getByRole('radio', { name: /Wer oben ist, gewinnt/ }).click();
  await slide(page, '7-handys-sieg');

  await page.getByRole('button', { name: 'Weiter' }).click();
  await page.getByText('Alles bereit?').waitFor();
  await slide(page, '8-uebersicht');
  await page.getByRole('button', { name: 'Übernehmen' }).click();
  await page.waitForURL(`${base}/regie`);
  check(true, '„Übernehmen“ führt zur Live-Ansicht');
  await sleep(500);

  const c = state.config;
  check(c.tempoEnabled === true && c.targetMinutes === 45, `Spieldauer im Spiel: ${c.targetMinutes} Min., Tempo an`);
  check(c.board.fields.length - 1 === suggestion, `Spielfeld: ${c.board.fields.length - 1} Felder`);
  check(c.board.mix?.skull === 0 && c.board.mix?.minigame === 2, `Häufigkeiten gespeichert: ${JSON.stringify(c.board.mix)}`);
  check(!c.board.fields.includes('skull'), 'kein Totenkopf auf dem Feld');
  check(c.rules.vine.enabled === false, 'Liane ausgeschaltet');
  check(JSON.stringify(c.contentKinds) === JSON.stringify(['game', 'choice', 'estimate']), `Arten: ${c.contentKinds.join(', ')}`);
  check(c.collectionIds.length > 0, `${c.collectionIds.length} Sammlungen gewählt`);
  check(c.rules.winRule === 'reach', 'Siegbedingung: Wer oben ist, gewinnt');
  check(c.theme === 'blocks', 'Welt: Blockwelt');
  await page.getByText('Passt: Das Spiel richtet sich nach ca. 45 Minuten.').waitFor();
  check(true, 'Live-Ansicht zeigt die Spieldauer');
  await slide(page, '9-live');
  await ctx.close();

  // --- Handy: „Manuell“ ----------------------------------------------------------------------
  const phone = await browser.newContext({ ...devices['iPhone 13'] });
  await phone.addInitScript((t) => localStorage.setItem('insel.token.admin', t), admin);
  const p2 = await phone.newPage();
  p2.on('pageerror', (e) => errors.push(e.message));
  await p2.goto(`${base}/regie/einrichten`);
  await p2.getByRole('radio', { name: /Insel der Abenteuer/ }).click();
  await p2.getByRole('radio', { name: /Manuell/ }).click();
  const input = p2.getByRole('textbox', { name: 'Anzahl Felder', exact: true });
  await input.fill('30');
  await input.blur();
  await slide(p2, 'handy-1-spielfeld');
  await p2.getByRole('button', { name: 'Weiter' }).click();
  await slide(p2, 'handy-2-sonderfelder');
  for (let i = 0; i < 4; i++) {
    await p2.getByRole('button', { name: 'Weiter' }).click();
    await slide(p2, `handy-${i + 3}`);
  }
  await p2.getByRole('button', { name: 'Übernehmen' }).click();
  await p2.waitForURL(`${base}/regie`);
  await sleep(500);
  check(state.config.tempoEnabled === false && state.config.targetMinutes === null, 'Manuell: Spiel-Tempo aus, keine Spieldauer');
  check(state.config.board.fields.length === 31, 'Manuell: 30 Felder');
  check(state.config.theme === 'island', 'Welt zurück auf Insel');
  await p2.getByText('Manuell eingerichtet: reine Zufallswürfe, ohne Spiel-Tempo.').waitFor();
  check(true, 'Live-Ansicht am Handy zeigt „manuell eingerichtet“');
  await slide(p2, 'handy-live');

  check(errors.length === 0, `keine Fehler im Browser${errors.length ? `: ${errors.join(' | ')}` : ''}`);
  sock.close();
} catch (e) {
  problems.push(`Abbruch: ${e.message.split('\n')[0]}`);
} finally {
  await browser.close();
  server.kill();
  rmSync(dataDir, { recursive: true, force: true });
}
if (problems.length) {
  console.log(`\n${problems.length} Problem(e):\n- ${problems.join('\n- ')}\nBilder: ${out}`);
  process.exit(1);
}
console.log(`\n✅ Assistent funktioniert, nichts ragt heraus. Bilder: ${out}`);
