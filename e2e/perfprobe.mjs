// Leistungsanalyse des Beamers: Draw-Calls je Gruppe und Bildrate bei abgeschalteten Teilen.
//   node e2e/perfprobe.mjs [url]   (Standard: http://localhost:8080)
import { chromium } from 'playwright';
const base = process.argv[2] ?? 'http://localhost:8080';
const quality = process.argv[3] ?? 'beauty';
const browser = await chromium.launch({ headless: true, args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=metal', '--disable-frame-rate-limit'] });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
await page.addInitScript((q) => localStorage.setItem('insel.beamer', JSON.stringify({ quality: q, sound: false })), quality);
await page.goto(`${base}/beamer?debug&quality=${quality}`);
await page.waitForFunction(() => window.__board, null, { timeout: 60000 });
await page.waitForTimeout(2500);
const fps = () => page.evaluate(() => new Promise((res) => { let n = 0; const t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 < 2500) requestAnimationFrame(f); else res(Math.round(n / ((performance.now() - t0) / 1000))); }; requestAnimationFrame(f); }));
const frameInfo = () => page.evaluate(() => new Promise((res) => { const r = window.__board.renderer; r.info.autoReset = false; requestAnimationFrame(() => { r.info.reset(); requestAnimationFrame(() => { const i = { calls: r.info.render.calls, tris: r.info.render.triangles }; r.info.autoReset = true; res(i); }); }); }));
console.log('Basis', await fps(), 'fps', JSON.stringify(await frameInfo()));
// Aufschlüsselung nach Gruppen
const groups = await page.evaluate(() => {
  const b = window.__board;
  const out = {};
  for (const g of b.scene.children) {
    let meshes = 0, tris = 0, cast = 0;
    g.traverse((o) => {
      if (!o.isMesh && !o.isPoints && !o.isLine) return;
      if (!o.visible) return;
      meshes++;
      const geo = o.geometry;
      const n = geo.index ? geo.index.count / 3 : (geo.attributes.position?.count ?? 0) / 3;
      tris += n * (o.isInstancedMesh ? o.count : 1);
      if (o.castShadow) cast++;
    });
    const key = (g.name || g.type) + (out[g.name || g.type] ? '#' + Math.random().toString(36).slice(2, 5) : '');
    out[key] = { meshes, ktris: Math.round(tris / 1000), cast };
  }
  return out;
});
console.table(groups);
const toggles = [
  ['ohne Schatten', 'b.sun ? 0 : 0; b.renderer.shadowMap.enabled=false; b.scene.traverse(o=>{if(o.material){[].concat(o.material).forEach(m=>m.needsUpdate=true)}})', 'b.renderer.shadowMap.enabled=true; b.scene.traverse(o=>{if(o.material){[].concat(o.material).forEach(m=>m.needsUpdate=true)}})'],
  ['ohne Gras', "b.scene.getObjectByName('grass').visible=false", "b.scene.getObjectByName('grass').visible=true"],
];
for (const [label, on, off] of toggles) {
  await page.evaluate((c) => { const b = window.__board; eval(c); }, on);
  await page.waitForTimeout(500);
  console.log(label, await fps(), 'fps');
  await page.evaluate((c) => { const b = window.__board; eval(c); }, off);
  await page.waitForTimeout(300);
}
// Gruppen einzeln ausblenden
const names = await page.evaluate(() => window.__board.scene.children.map((c, i) => [i, c.name || c.type]));
for (const [i, name] of names) {
  if (/Light|Camera/.test(name)) continue;
  await page.evaluate((k) => (window.__board.scene.children[k].visible = false), i);
  await page.waitForTimeout(300);
  const f = await fps();
  await page.evaluate((k) => (window.__board.scene.children[k].visible = true), i);
  console.log('ohne', name, f, 'fps');
}
await browser.close();
