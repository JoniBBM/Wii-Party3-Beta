// Tiere fotografieren (mehrere Kamerapositionen und Zeitpunkte, ein Serverstart).
//   node e2e/animals-look.mjs shots.json outDir [query]
// shots.json: [{ "name": "affe", "pos": [x,y,z], "look": [x,y,z], "times": [0, 400, 800], "fov": 42 }]
// query z. B. "zoo" → /beamer?debug&zoo.  Eigener Server auf Port 8192.
import { chromium } from 'playwright';
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
const [, , spec, outDir, query = ''] = process.argv;
const shots = JSON.parse(readFileSync(spec, 'utf8'));
mkdirSync(outDir, { recursive: true });
const dataDir = mkdtempSync(join(tmpdir(), 'insel-alook-'));
const port = 8192;
const server = spawn('npx', ['tsx', 'packages/server/src/main.ts'], { env: { ...process.env, DATA_DIR: dataDir, INSEL_PORT: String(port), ADMIN_PASSWORD: 'x' }, stdio: 'ignore' });
for (let i = 0; i < 80; i++) { try { if ((await fetch(`http://localhost:${port}/api/health`)).ok) break; } catch {} await new Promise((r) => setTimeout(r, 250)); }
const browser = await chromium.launch({ headless: true, args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=metal'] });
let errors = 0;
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('pageerror', (e) => { errors++; console.log('PAGEERROR', e.message); });
  page.on('console', (m) => { if (m.type() === 'error') { errors++; console.log('CONSOLE', m.text()); } });
  await page.addInitScript(() => localStorage.setItem('insel.beamer', JSON.stringify({ quality: 'beauty', sound: false, tags: false })));
  await page.goto(`http://localhost:${port}/beamer?debug${query ? '&' + query : ''}`);
  await page.waitForFunction(() => window.__board, null, { timeout: 60000 });
  await page.evaluate(() => document.querySelectorAll('.glass').forEach((e) => (e.style.display = 'none')));
  for (const s of shots) {
    // optional: Ausdruck vorab ausführen (z. B. Verhalten erzwingen über userData.animal)
    if (s.pre) await page.evaluate((code) => { const b = window.__board; eval(code); }, s.pre);
    await page.evaluate(({ pos, look, fov, follow, index, offset }) => {
      // Kamera fest setzen (ohne Kamerafahrt und Ausweichen vor Bäumen)
      const b = window.__board;
      b.rig.update = () => {};
      b.camera.fov = fov ?? 42;
      b.camera.updateProjectionMatrix();
      if (follow) {
        // auf ein Tier (Name der Gruppe, n-tes Exemplar) mit Versatz schauen
        const list = b.scene.getObjectByName('animals').children.filter((o) => o.name === follow);
        const o = list[index ?? 0];
        if (!o) return;
        const p = o.position;
        if (offset[0] === 'path') {
          // von der Seite des nächsten Spielfelds aus (dort steht sonst die Kamera)
          let best = null;
          for (const f of b.layout.fields) if (!best || Math.hypot(f.x - p.x, f.z - p.z) < Math.hypot(best.x - p.x, best.z - p.z)) best = f;
          const d = Math.hypot(best.x - p.x, best.z - p.z) || 1;
          const [, dist, up] = offset;
          b.camera.position.set(p.x + ((best.x - p.x) / d) * dist, p.y + up, p.z + ((best.z - p.z) / d) * dist);
        } else b.camera.position.set(p.x + offset[0], p.y + offset[1], p.z + offset[2]);
        b.camera.lookAt(p.x, p.y + 0.3, p.z);
        return;
      }
      b.camera.position.set(...pos);
      b.camera.lookAt(...look);
    }, s);
    await page.waitForTimeout(s.settle ?? 2500);
    let last = 0;
    for (const t of s.times ?? [0]) {
      await page.waitForTimeout(Math.max(0, t - last));
      last = t;
      const file = join(outDir, `${s.name}-${t}.png`);
      await page.screenshot({ path: file });
      console.log('ok', file);
    }
  }
} finally {
  await browser.close(); server.kill(); rmSync(dataDir, { recursive: true, force: true });
}
console.log('Fehler:', errors);
