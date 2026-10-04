// Bildrate des Beamers messen (beide Qualitätsstufen).  node e2e/fps.mjs
import { chromium } from 'playwright';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
const dataDir = mkdtempSync(join(tmpdir(), 'insel-fps-'));
const port = 8098;
const server = spawn('npx', ['tsx', 'packages/server/src/main.ts'], { env: { ...process.env, DATA_DIR: dataDir, INSEL_PORT: String(port), ADMIN_PASSWORD: 'x' }, stdio: 'ignore' });
for (let i = 0; i < 80; i++) { try { if ((await fetch(`http://localhost:${port}/api/health`)).ok) break; } catch {} await new Promise((r) => setTimeout(r, 250)); }
const browser = await chromium.launch({ headless: process.env.HEADED ? false : true, args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=metal', '--disable-frame-rate-limit'] });
try {
  for (const quality of ['beauty', 'fast']) {
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
    await page.addInitScript((q) => localStorage.setItem('insel.beamer', JSON.stringify({ quality: q, sound: false })), quality);
    await page.goto(`http://localhost:${port}/beamer?debug`);
    await page.waitForFunction(() => window.__board, null, { timeout: 60000 });
    await page.waitForTimeout(2000);
    const fps = await page.evaluate(() => new Promise((res) => { let n = 0; const t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 < 4000) requestAnimationFrame(f); else res(n / ((performance.now() - t0) / 1000)); }; requestAnimationFrame(f); }));
    const info = await page.evaluate(() => { const r = window.__board.renderer; const gl = r.getContext(); const ext = gl.getExtension('WEBGL_debug_renderer_info'); return { gpu: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : '?', calls: r.info.render.calls, tris: r.info.render.triangles }; });
    console.log(quality, Math.round(fps), 'fps', JSON.stringify(info));
    await page.close();
  }
} finally { await browser.close(); server.kill(); rmSync(dataDir, { recursive: true, force: true }); }
