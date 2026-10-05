// Leistung der Tiere messen: Bildrate, Draw-Calls, Meshes in `animals` (mit/ohne Tiere).
//   node e2e/animals-perf.mjs [beauty|fast]   (eigener Server auf Port 8191)
import { chromium } from 'playwright';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
const qualities = process.argv[2] ? [process.argv[2]] : ['beauty', 'fast'];
const dataDir = mkdtempSync(join(tmpdir(), 'insel-aperf-'));
const port = 8191;
const server = spawn('npx', ['tsx', 'packages/server/src/main.ts'], { env: { ...process.env, DATA_DIR: dataDir, INSEL_PORT: String(port), ADMIN_PASSWORD: 'x' }, stdio: 'ignore' });
for (let i = 0; i < 80; i++) { try { if ((await fetch(`http://localhost:${port}/api/health`)).ok) break; } catch {} await new Promise((r) => setTimeout(r, 250)); }
const browser = await chromium.launch({ headless: true, args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=metal', '--disable-frame-rate-limit'] });
try {
  for (const quality of qualities) {
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message));
    page.on('console', (m) => m.type() === 'error' && errors.push('CONSOLE ' + m.text()));
    await page.addInitScript((q) => localStorage.setItem('insel.beamer', JSON.stringify({ quality: q, sound: false })), quality);
    await page.goto(`http://localhost:${port}/beamer?debug`);
    await page.waitForFunction(() => window.__board, null, { timeout: 60000 });
    await page.waitForTimeout(2500);
    const fps = () => page.evaluate(() => new Promise((res) => { let n = 0; const t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 < 4000) requestAnimationFrame(f); else res(Math.round(n / ((performance.now() - t0) / 1000))); }; requestAnimationFrame(f); }));
    const frameInfo = () => page.evaluate(() => new Promise((res) => { const r = window.__board.renderer; r.info.autoReset = false; requestAnimationFrame(() => { r.info.reset(); requestAnimationFrame(() => { const i = { calls: r.info.render.calls, tris: r.info.render.triangles }; r.info.autoReset = true; res(i); }); }); }));
    const stats = await page.evaluate(() => {
      const g = window.__board.scene.getObjectByName('animals');
      if (!g) return null;
      let meshes = 0, cast = 0, skinned = 0, instanced = 0, instances = 0, bones = 0;
      g.traverse((o) => {
        if (o.isBone) bones++;
        if (!o.isMesh) return;
        meshes++;
        if (o.castShadow) cast++;
        if (o.isSkinnedMesh) skinned++;
        if (o.isInstancedMesh) { instanced++; instances += o.count; }
      });
      return { meshes, cast, skinned, instanced, instances, bones };
    });
    // CPU-Zeit fürs Abschicken der Draw-Calls je Bild (weniger anfällig für fremde GPU-Last)
    const cpu = () => page.evaluate(() => new Promise((res) => {
      const r = window.__board.renderer;
      const orig = r.render;
      let sum = 0;
      r.render = function (...a) { const t0 = performance.now(); const out = orig.apply(this, a); sum += performance.now() - t0; return out; };
      let n = 0;
      const t0 = performance.now();
      const f = () => { n++; if (performance.now() - t0 < 3000) requestAnimationFrame(f); else { r.render = orig; res(+(sum / n).toFixed(2)); } };
      requestAnimationFrame(f);
    }));
    const f1 = await fps();
    const i1 = await frameInfo();
    const c1 = await cpu();
    await page.evaluate(() => { const g = window.__board.scene.getObjectByName('animals'); if (g) g.visible = false; });
    await page.waitForTimeout(300);
    const f2 = await fps();
    const i2 = await frameInfo();
    const c2 = await cpu();
    await page.evaluate(() => { const g = window.__board.scene.getObjectByName('animals'); if (g) g.visible = true; });
    // reine Rechenzeit der Tier-Updates je Bild (ms)
    const upd = await page.evaluate(() => {
      const b = window.__board;
      const a = b.animals;
      if (!a) return null;
      const t0 = performance.now();
      for (let i = 0; i < 300; i++) a.update(20 + i / 60, 1 / 60, b.camera);
      return +((performance.now() - t0) / 300).toFixed(3);
    });
    console.log(quality, JSON.stringify({ fps: f1, ...i1, renderCpuMs: c1, animals: stats, updateMs: upd }));
    console.log(quality, 'Tiere ausgeblendet', JSON.stringify({ fps: f2, ...i2, renderCpuMs: c2 }));
    if (errors.length) console.log(errors.join('\n'));
    await page.close();
    // ganz ohne Tiere (auch ohne Updates)
    const p2 = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
    await p2.addInitScript((q) => localStorage.setItem('insel.beamer', JSON.stringify({ quality: q, sound: false })), quality);
    await p2.goto(`http://localhost:${port}/beamer?debug&noanimals`);
    await p2.waitForFunction(() => window.__board, null, { timeout: 60000 });
    await p2.waitForTimeout(2500);
    const f3 = await p2.evaluate(() => new Promise((res) => { let n = 0; const t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 < 4000) requestAnimationFrame(f); else res(Math.round(n / ((performance.now() - t0) / 1000))); }; requestAnimationFrame(f); }));
    console.log(quality, '?noanimals', f3, 'fps');
    await p2.close();
  }
} finally { await browser.close(); server.kill(); rmSync(dataDir, { recursive: true, force: true }); }
