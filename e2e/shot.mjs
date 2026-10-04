// Schnelle Screenshots für die visuelle Kontrolle:
//   node e2e/shot.mjs <pfad> <ausgabe.png> [breite] [höhe] [slot]
// slot = admin | moderator → vorher anmelden (Passwort aus .env)
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';

const [, , path = '/', out = 'shot.png', w = '1440', h = '900', slot = ''] = process.argv;
const base = process.env.BASE ?? 'http://localhost:5173';
const env = Object.fromEntries(readFileSync(new URL('../.env', import.meta.url), 'utf8').split('\n').filter((l) => l.includes('=')).map((l) => l.split(/=(.*)/s).slice(0, 2)));

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: +w, height: +h }, deviceScaleFactor: 1 });
page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
page.on('console', (m) => m.type() === 'error' && console.log('CONSOLE', m.text()));
if (slot) {
  const endpoint = slot === 'admin' ? '/api/auth/admin' : '/api/auth/moderator';
  const res = await fetch(base + endpoint, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password: env.ADMIN_PASSWORD }) });
  const { token } = await res.json();
  await page.addInitScript(([s, t]) => localStorage.setItem(`insel.token.${s}`, t), [slot, token]);
}
await page.goto(base + path, { waitUntil: 'networkidle' });
await page.waitForTimeout(Number(process.env.WAIT ?? 1200));
await page.screenshot({ path: out, fullPage: process.env.FULL === '1' });
console.log('ok', out);
await browser.close();
