// „Überall abmelden“ im echten Browser: Spielleiter ist in der Regie angemeldet, der Admin meldet ihn
// ab – die Regie muss sofort (ohne Neuladen) zur Anmeldung springen.
// Startet einen eigenen Server mit leerer Datenbank (gebaute Weboberfläche nötig: npm run build).
//   node e2e/logout.mjs
import { chromium, devices } from 'playwright';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';

const dataDir = mkdtempSync(join(tmpdir(), 'insel-logout-'));
const port = 8096;
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

const browser = await chromium.launch();
let ok = false;
try {
  const { token: admin } = await post('/api/auth/admin', { password: PASS });
  const inv = await post('/api/users', { email: 'lea@example.org', name: 'Lea' }, admin);
  const linkToken = new URL(inv.link).hash.slice(3);
  await post('/api/auth/set-password', { token: linkToken, password: 'Testkonto-Lea-2026' });

  // Lea meldet sich in der Regie an (Handy)
  const page = await (await browser.newContext({ ...devices['iPhone 13'] })).newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${base}/regie`);
  await page.getByPlaceholder('Benutzername oder E-Mail').fill('lea@example.org');
  await page.getByPlaceholder('Passwort', { exact: true }).fill('Testkonto-Lea-2026');
  await page.getByRole('button', { name: 'Anmelden', exact: true }).click();
  await page.getByText('Kein Spiel aktiv').waitFor();
  console.log('Lea ist in der Regie angemeldet');

  // Admin: „Überall abmelden“
  const t0 = Date.now();
  await post(`/api/users/${inv.account.id}/logout`, {}, admin);
  await page.getByPlaceholder('Benutzername oder E-Mail').waitFor({ timeout: 3000 });
  console.log(`Regie zeigt die Anmeldung nach ${Date.now() - t0} ms (ohne Neuladen)`);
  const token = await page.evaluate(() => localStorage.getItem('insel.token.admin'));
  console.log('Zugang im Browser gelöscht:', token === null);
  ok = token === null && errors.length === 0;
  if (errors.length) console.log('Fehler:', errors.join('\n'));
} catch (e) {
  console.log('❌', e.message);
} finally {
  await browser.close();
  server.kill();
  rmSync(dataDir, { recursive: true, force: true });
}
console.log(ok ? '✅ Überall abmelden wirkt sofort' : '❌ Abmelden hat nicht wie erwartet gewirkt');
process.exit(ok ? 0 : 1);
