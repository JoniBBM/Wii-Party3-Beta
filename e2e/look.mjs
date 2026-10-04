// Kamera frei setzen und fotografieren (Debug):  node e2e/look.mjs out.png x y z lookX lookY lookZ [W H]
import { chromium } from 'playwright';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
const [, , out, ...a] = process.argv;
const [x, y, z, lx, ly, lz] = a.slice(0, 6).map(Number);
const W = Number(a[6] ?? 1600), H = Number(a[7] ?? 900);
const dataDir = mkdtempSync(join(tmpdir(), 'insel-look-'));
const port = 8097;
const server = spawn('npx', ['tsx', 'packages/server/src/main.ts'], { env: { ...process.env, DATA_DIR: dataDir, INSEL_PORT: String(port), ADMIN_PASSWORD: 'x' }, stdio: 'ignore' });
for (let i = 0; i < 80; i++) { try { if ((await fetch(`http://localhost:${port}/api/health`)).ok) break; } catch {} await new Promise((r) => setTimeout(r, 250)); }
const browser = await chromium.launch();
try {
const page = await browser.newPage({ viewport: { width: W, height: H } });
page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
page.on('console', (m) => ['error', 'warning'].includes(m.type()) && console.log('CONSOLE', m.text()));
await page.addInitScript(() => localStorage.setItem('insel.beamer', JSON.stringify({ quality: 'beauty', sound: false, tags: true })));
await page.goto(`http://localhost:${port}/beamer?debug`);
await page.waitForFunction(() => window.__board, null, { timeout: 60000 });
await page.evaluate(([x, y, z, lx, ly, lz]) => {
  const b = window.__board; const V = b.camera.position.constructor;
  b.rig.set({ kind: 'focus', position: new V(x, y, z), lookAt: new V(lx, ly, lz) }, 60);
  document.querySelectorAll('.glass').forEach((e) => (e.style.display = 'none'));
}, [x, y, z, lx, ly, lz]);
await page.waitForTimeout(2500);
await page.screenshot({ path: out });
console.log('ok', out);
} finally {
  await browser.close(); server.kill(); rmSync(dataDir, { recursive: true, force: true });
}
