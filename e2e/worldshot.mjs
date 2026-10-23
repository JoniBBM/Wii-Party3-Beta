// Beamer-Bilder einer Welt aus festen Blickwinkeln (Dev-Server, Passwort aus .env):
//   node e2e/worldshot.mjs <ordner> [welt=blocks] [blicke=overview,harbor,volcano,river,field]
// Ein Blick ist auch als x,y,z>x,y,z angebbar (Kamera > Ziel). Wetter: ATMO='weather=snow&festive=christmas'.
// Benannt u. a.: vine, swing (swing1 … swing6 = so viele Felder weit), creek, ford, f12 (Feld 12). NOUI=1 blendet die Oberfläche aus.
import { chromium } from 'playwright';
import { mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const [, , out = 'worldshot', world = 'blocks', which = 'overview,harbor,volcano,river,field'] = process.argv;
mkdirSync(out, { recursive: true });
const base = process.env.BASE ?? 'http://localhost:5173';
const env = Object.fromEntries(readFileSync(new URL('../.env', import.meta.url), 'utf8').split('\n').filter((l) => l.includes('=')).map((l) => l.split(/=(.*)/s).slice(0, 2)));
const post = async (path, body, token) =>
  (await fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) })).json();

const VIEWS = {
  overview: [[0, 70, 78], [0, 0, -2]],
  harbor: [[-40, 14, 34], [-26, 2, 18]],
  volcano: [[14, 30, 14], [-1, 16, -9]],
  river: [[30, 14, 10], [16, 3, -6]],
  field: [[-8, 8, 30], [-6, 1, 20]],
  crater: [[-1, 34, 4], [-1, 18, -9]],
  coast: [[-44, 9, 40], [-38, -3, 30]],
  meadow: [[18, 10, 24], [10, 2, 14]],
};

const { token: admin } = await post('/api/auth/admin', { username: 'admin', password: env.ADMIN_PASSWORD });
const { token: beamer } = await post('/api/auth/beamer-link', {}, admin);
const browser = await chromium.launch({ args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: Number(process.env.W ?? 1600), height: Number(process.env.H ?? 900) }, deviceScaleFactor: 1 });
page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
page.on('console', (m) => m.type() === 'error' && console.log('CONSOLE', m.text().slice(0, 300)));
await page.addInitScript((t) => localStorage.setItem('insel.token.beamer', t), beamer);
await page.goto(`${base}/beamer?world=${world}&debug${process.env.Q ? `&quality=${process.env.Q}` : ''}${process.env.ATMO ? `&${process.env.ATMO}` : ''}`);
await page.waitForFunction(() => !!window.__board, null, { timeout: 120_000 });
await page.waitForTimeout(2500);
for (const name of which.split(',')) {
  const v = VIEWS[name] ?? (name.includes('>') ? name.split('>').map((p) => p.split(',').map(Number)) : name);
  await page.evaluate((v) => {
    const b = window.__board;
    const THREE_V = b.camera.position.constructor;
    // benannte Einstellungen aus der Szene selbst
    const named = {
      vine: () => b.stunts.vineShot(),
      // Schwung von der Liane zum übernächsten Feld (swing3 = drei Felder weit wie in der Erklärung)
      swing: () => swing(2),
      // Bach an der Liane von oben
      creek: () => {
        const vf = b.layout.plan.vineField;
        const a = b.layout.fields[vf];
        const c = b.layout.fields[vf + 1];
        const m = new THREE_V((a.x + c.x) / 2, (a.y + c.y) / 2, (a.z + c.z) / 2);
        return { position: new THREE_V(m.x + 0.5, m.y + 14, m.z + 6), lookAt: m };
      },
      ford: () => b.stunts.riverShot(),
      cave: () => b.rig.fieldShot(b.layout.plan.caveField, 6, 4),
      start: () => b.rig.fieldShot(0, 8, 5),
      nether: () => (b.setView('inside'), b.inside?.overviewShot()),
      plate: () => (b.setView('inside'), b.inside?.plateShot(2)),
      portal: () => (b.setView('inside'), b.inside?.portalShot()),
      island: () => (b.setView('island'), b.rig.fieldShot(5, 9, 6)),
    };
    function swing(k) {
      const vf = b.layout.plan.vineField;
      const f = b.layout.fields[Math.min(b.layout.fields.length - 1, vf + k)];
      return b.stunts.swingShot(new THREE_V(f.x, f.y, f.z));
    }
    // f12 = Feld 12 aus der Nähe
    const field = typeof v === 'string' && /^f\d+$/.test(v) ? () => b.rig.fieldShot(Number(v.slice(1)), 7, 4.2) : typeof v === 'string' && /^swing\d$/.test(v) ? () => swing(Number(v.slice(5))) : null;
    const shot = typeof v === 'string' ? (field ?? named[v])?.() : { position: new THREE_V(...v[0]), lookAt: new THREE_V(...v[1]) };
    if (shot) b.rig.manualShot(shot, 120);
  }, v);
  await page.waitForTimeout(Number(process.env.WAIT ?? 2200));
  // NOUI=1: nur das 3D-Bild (Lobby-Karte, Hinweise usw. für das Foto ausblenden)
  const noUi = process.env.NOUI ? await page.addStyleTag({ content: 'body * { visibility: hidden !important } canvas { visibility: visible !important }' }) : null;
  const file = join(out, `${name.replace(/[^a-z0-9]+/gi, '_')}.png`);
  await page.screenshot({ path: file });
  await noUi?.evaluate((el) => el.remove());
  console.log('ok', file);
}
await browser.close();
