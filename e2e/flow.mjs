// End-to-End-Durchlauf mit echten Browsern: Regie + 4 Handys + Moderator + Beamer.
// Startet einen eigenen Server mit leerer Datenbank (gebaute Weboberfläche nötig: npm run build).
//   node e2e/flow.mjs [ausgabeordner]
import { chromium, devices } from 'playwright';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';

const out = process.argv[2] ?? join(tmpdir(), 'insel-e2e');
mkdirSync(out, { recursive: true });
const dataDir = mkdtempSync(join(tmpdir(), 'insel-e2e-data-'));
const port = 8095;
const base = `http://localhost:${port}`;
const PASS = 'e2e-passwort';

const server = spawn('npx', ['tsx', 'packages/server/src/main.ts'], {
  env: { ...process.env, DATA_DIR: dataDir, INSEL_PORT: String(port), ADMIN_PASSWORD: PASS, AUTH_DISABLED: 'false', NODE_ENV: 'production' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
server.stderr.on('data', (d) => process.stderr.write(`[server] ${d}`));
for (let i = 0; i < 60; i++) {
  try {
    if ((await fetch(`${base}/api/health`)).ok) break;
  } catch {}
  await new Promise((r) => setTimeout(r, 250));
}

let step = 0;
const errors = [];
const shot = async (page, name) => {
  step += 1;
  const file = join(out, `${String(step).padStart(2, '0')}-${name}.png`);
  await page.screenshot({ path: file });
  console.log('📸', file);
};
const watch = (page, label) => {
  page.on('pageerror', (e) => errors.push(`${label}: ${e.message}`));
  page.on('console', (m) => m.type() === 'error' && !m.text().includes('favicon') && errors.push(`${label} console: ${m.text()}`));
};

const browser = await chromium.launch();
try {
  // Regie
  const regieCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const regie = await regieCtx.newPage();
  watch(regie, 'regie');
  await regie.goto(`${base}/regie`);
  await regie.getByPlaceholder('Passwort').fill(PASS);
  await regie.getByRole('button', { name: 'Anmelden' }).click();
  await regie.getByRole('button', { name: 'Spiel anlegen' }).click();
  await regie.getByText('Anmeldung offen').waitFor();
  await shot(regie, 'regie-lobby-leer');

  // Beamer
  const beamerCtx = await browser.newContext({ viewport: { width: 1600, height: 900 } });
  const beamer = await beamerCtx.newPage();
  watch(beamer, 'beamer');
  await beamer.goto(`${base}/beamer`);

  // Vier Handys melden sich an
  const names = ['Anna', 'Ben', 'Cem', 'Dana'];
  const phones = [];
  for (const name of names) {
    const ctx = await browser.newContext({ ...devices['iPhone 13'] });
    const p = await ctx.newPage();
    watch(p, `handy-${name}`);
    await p.goto(`${base}/join`);
    await p.getByPlaceholder('Vorname').fill(name);
    await p.getByRole('button', { name: 'Los geht’s' }).click();
    await p.getByRole('button', { name: 'Ohne Foto weiter' }).click();
    await p.getByText('Gleich werden die Teams eingeteilt').waitFor();
    phones.push(p);
  }
  await shot(phones[0], 'handy-wartet-auf-team');
  await shot(regie, 'regie-lobby-4-spieler');

  // Teams bilden (2) und starten
  await regie.getByRole('button', { name: 'Teams bilden' }).click();
  await regie.getByText('PIN', { exact: false }).first().waitFor();
  await shot(regie, 'regie-teams-gebildet');
  await phones[0].getByText('Willkommen bei').waitFor();
  await shot(phones[0], 'handy-team-lobby');
  await shot(beamer, 'beamer-lobby');
  await regie.getByRole('button', { name: 'Spiel starten' }).click();

  // Frage aus der Liste wählen
  await regie.getByRole('tab', { name: /Auswahl/ }).click();
  await regie.getByPlaceholder('Suchen …').fill('Krabbeltier');
  await regie.getByRole('button', { name: /Krabbeltier/ }).click();
  await regie.getByRole('button', { name: 'Diesen Inhalt starten' }).click();
  await regie.getByRole('button', { name: 'Antworten freigeben' }).click();
  await shot(regie, 'regie-frage-offen');

  // Handys antworten: Anna richtig (B), ein Spieler des anderen Teams falsch (A)
  await phones[0].getByRole('button', { name: /^Antwort B:/ }).click();
  await shot(phones[0], 'handy-antwort-gewaehlt');
  await phones[0].getByRole('button', { name: 'Antwort abschicken' }).click();
  await phones[0].getByText('Antwort abgeschickt').waitFor();
  // Spieler aus anderem Team finden
  let other = null;
  for (const p of phones.slice(1)) {
    // Teamname steht im ersten Absatz der Kopfzeile
    const header = await p.locator('header p').first().innerText();
    const annaHeader = await phones[0].locator('header p').first().innerText();
    if (header !== annaHeader) {
      other = p;
      break;
    }
  }
  if (!other) throw new Error('Kein Spieler im anderen Team gefunden');
  await other.getByRole('button', { name: /^Antwort A:/ }).click();
  await other.getByRole('button', { name: 'Antwort abschicken' }).click();
  await regie.getByRole('button', { name: 'Auflösen' }).waitFor();
  await shot(beamer, 'beamer-frage');
  await regie.getByRole('button', { name: 'Auflösen' }).click();
  await phones[0].getByText('Richtig').waitFor();
  await shot(phones[0], 'handy-richtig');
  await shot(regie, 'regie-aufgeloest');
  await regie.getByRole('button', { name: 'Ergebnis zeigen' }).click();
  await shot(regie, 'regie-ergebnis');
  await regie.getByRole('button', { name: 'Würfelrunde starten' }).click();

  // Annas Team ist zuerst dran (richtig geantwortet)
  await phones[0].getByRole('button', { name: /^🎲 Würfeln/ }).waitFor();
  await shot(phones[0], 'handy-wuerfeln');
  await phones[0].getByRole('button', { name: /^🎲 Würfeln/ }).click();
  await phones[0].waitForTimeout(1800);
  await shot(phones[0], 'handy-wurf-ergebnis');
  await shot(regie, 'regie-wuerfelrunde');
  await beamer.waitForTimeout(2500);
  await shot(beamer, 'beamer-wuerfeln');

  // Regie würfelt für das zweite Team (erzwingt während Animation)
  await regie.getByRole('button', { name: 'Für Team würfeln' }).click();
  await regie.waitForTimeout(800);
  await shot(regie, 'regie-runde-vorbei');

  // Moderator
  const modCtx = await browser.newContext({ ...devices['iPad Mini'] });
  const mod = await modCtx.newPage();
  watch(mod, 'moderator');
  await mod.goto(`${base}/moderator`);
  await mod.getByPlaceholder('Passwort').fill(PASS);
  await mod.getByRole('button', { name: 'Anmelden' }).click();
  await mod.getByText('Nächste Runde vorbereiten').waitFor({ timeout: 5000 }).catch(() => {});
  await shot(mod, 'moderator');

  // Team-Seite mit Figuren-Editor
  await phones[0].getByRole('button', { name: 'Team', exact: true }).click();
  await phones[0].waitForTimeout(800);
  await shot(phones[0], 'handy-team-seite');
  await phones[0].getByRole('button', { name: 'Rangliste' }).click();
  await shot(phones[0], 'handy-rangliste');

  console.log(errors.length ? `\n⚠️  ${errors.length} Fehler:\n${errors.join('\n')}` : '\n✅ Keine Fehler in den Browser-Konsolen');
} catch (e) {
  console.error('❌ Abbruch:', e.message);
  console.log(errors.join('\n'));
  process.exitCode = 1;
} finally {
  await browser.close();
  server.kill();
  rmSync(dataDir, { recursive: true, force: true });
}
