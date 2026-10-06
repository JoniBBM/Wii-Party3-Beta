// Beamer-Show prüfen: Fernsteuerung aus der Regie (Grafik, Kamera, Neu laden), Spielerklärung,
// Reaktion nach dem Zug, Foto-Blasen, Siegerehrung – mit Bildschirmfotos.
//   npm run build -w @insel/web && node e2e/show.mjs [ausgabeordner] [nur,diese]
import { chromium } from 'playwright';
import { io } from 'socket.io-client';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';

const out = process.argv[2] ?? join(tmpdir(), 'insel-show');
const only = process.argv[3] ? new Set(process.argv[3].split(',')) : null;
const want = (k) => !only || only.has(k);
mkdirSync(out, { recursive: true });
const dataDir = mkdtempSync(join(tmpdir(), 'insel-show-'));
const port = 8094;
const base = `http://localhost:${port}`;
const server = spawn('npx', ['tsx', 'packages/server/src/main.ts'], { env: { ...process.env, DATA_DIR: dataDir, INSEL_PORT: String(port), ADMIN_PASSWORD: 'sh', NODE_ENV: 'production' }, stdio: 'ignore' });
for (let i = 0; i < 80; i++) { try { if ((await fetch(`${base}/api/health`)).ok) break; } catch {} await new Promise((r) => setTimeout(r, 250)); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const post = async (path, body, token) => (await fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) })).json();
const browser = await chromium.launch({ args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=metal', '--autoplay-policy=no-user-gesture-required'] });
const errors = [];
const checks = [];
const check = (ok, label) => {
  checks.push(`${ok ? '✅' : '❌'} ${label}`);
  if (!ok) errors.push('Prüfung: ' + label);
};
try {
  const { token } = await post('/api/auth/admin', { password: 'sh' });
  // Beamer-Zugang (sonst zeigt der Beamer nur den Kopplungscode)
  const { token: beamerToken } = await post('/api/auth/beamer-link', {}, token);
  const templates = (await (await fetch(`${base}/api/templates`, { headers: { authorization: `Bearer ${token}` } })).json()).templates;
  await post('/api/games', { name: 'Show', templateId: templates.find((t) => t.name.startsWith('Standard')).id }, token);
  const sock = io(base, { auth: { token, view: 'regie' }, transports: ['websocket'] });
  let state = null;
  let beamers = [];
  let show = null;
  sock.on('state', (p) => (state = p.state));
  sock.on('beamers', (b) => (beamers = b));
  sock.on('show', (s) => (show = s));
  await new Promise((r) => sock.on('connect', r));
  const cmd = (c) => new Promise((res) => sock.emit('cmd', c, (a) => { if (!a.ok) errors.push(`${c.type}: ${a.error}`); res(a); }));
  const showCmd = (c) => new Promise((res) => sock.emit('show', c, (a) => { if (!a.ok) errors.push(`show ${c.type}: ${a.error}`); res(a); }));
  for (let i = 0; i < 6; i++) await post('/api/auth/register', { name: `Spieler ${i + 1}` });
  await cmd({ type: 'teams.auto', count: 3 });

  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  page.on('pageerror', (e) => errors.push('page: ' + e.message));
  page.on('console', (m) => m.type() === 'error' && !/favicon/.test(m.text()) && errors.push('console: ' + m.text()));
  await page.goto(`${base}/beamer?debug#bt=${beamerToken}`);
  await page.waitForFunction(() => window.__board, null, { timeout: 60000 });
  await page.mouse.click(800, 450); // Ton freischalten (wie am echten Beamer)
  await sleep(2500);
  const board = (fn, arg) => page.evaluate(fn, arg);
  /** bis zur Würfelrunde: ggf. nächste Runde, Inhalt wählen, auswerten */
  const toDice = async () => {
    if (state.phase.name === 'dice') return;
    if (state.phase.name === 'round_end') await cmd({ type: 'round.next' });
    await cmd({ type: 'content.select', source: 'random' });
    await cmd({ type: 'content.open' });
    const c = state.phase.content;
    if (c.item.kind === 'game') await cmd({ type: 'content.rank', ranking: state.teams.map((t, i) => ({ teamId: t.id, rank: i + 1 })) });
    else if (c.stage !== 'revealed') await cmd({ type: 'content.reveal' });
    await cmd({ type: 'content.finish' });
    await cmd({ type: 'results.confirm' });
  };
  const shot = (name) => page.screenshot({ path: join(out, `${name}.png`) });

  // --- Fernsteuerung (Lobby, Spiel noch nicht gestartet) -------------------------
  if (want('remote')) {
    check(!(await page.locator('[aria-label="Einstellungen"]').count()), 'kein Einstellungs-Zahnrad am Beamer');
    await showCmd({ type: 'set', patch: { quality: 'eco' } });
    await sleep(800);
    check((await board(() => window.__board.quality)) === 'eco', 'Grafikstufe aus der Regie: Sparsam');
    await showCmd({ type: 'set', patch: { quality: 'balanced', fps: true } });
    await sleep(800);
    check((await board(() => window.__board.quality)) === 'balanced', 'Grafikstufe aus der Regie: Ausgewogen');
    await showCmd({ type: 'set', patch: { quality: 'high' } });
    await sleep(2600);
    check(beamers.length === 1 && beamers[0].quality === 'high', `Beamer meldet sich bei der Regie (${JSON.stringify(beamers[0] ?? null)})`);
    await showCmd({ type: 'camera', action: 'volcano' });
    await sleep(2500);
    check(await board(() => !!window.__board.rig.manual), 'Kamera aus der Regie: Vulkan');
    await shot('fern-vulkan');
    await showCmd({ type: 'camera', action: 'nudge', yaw: 0.8, zoom: -0.3 });
    await sleep(1500);
    await shot('fern-gedreht');
    await showCmd({ type: 'camera', action: 'auto' });
    await sleep(500);
    check(await board(() => !window.__board.rig.manual), 'Kamera zurück auf Automatik');
    // Maus: ziehen = drehen
    await page.mouse.move(800, 450);
    await page.mouse.down();
    await page.mouse.move(600, 420, { steps: 8 });
    await page.mouse.up();
    await sleep(300);
    check(await board(() => !!window.__board.rig.manual), 'Kamera mit der Maus steuerbar');
    await page.keyboard.press('Space');
    await sleep(300);
    check(await board(() => !window.__board.rig.manual), 'Leertaste = zurück zur Automatik');
    // Tasten schalten kein Vollbild (früher: F) – vorher Vollbild vom Klick verlassen
    await page.evaluate(() => document.fullscreenElement && document.exitFullscreen().catch(() => {}));
    await sleep(300);
    await page.keyboard.press('f');
    await sleep(300);
    check(await page.evaluate(() => !document.fullscreenElement), 'Taste F schaltet kein Vollbild');
    // Auflösung fest auf 720p
    await showCmd({ type: 'set', patch: { resolution: '720' } });
    await sleep(2600);
    check(beamers[0]?.height === 720, `Auflösung aus der Regie: 720p (${beamers[0]?.width}×${beamers[0]?.height})`);
    await showCmd({ type: 'set', patch: { resolution: 'auto' } });
    // Ultra: echte Materialien werden nachgeladen
    await showCmd({ type: 'set', patch: { quality: 'ultra' } });
    await page.waitForFunction(() => window.__board.scene.getObjectByName('terrain')?.material.customProgramCacheKey?.() === 'insel-terrain-ultra', null, { timeout: 30000 }).catch(() => null);
    check((await board(() => window.__board.quality)) === 'ultra', 'Grafikstufe aus der Regie: Ultra');
    check(await board(() => window.__board.scene.getObjectByName('terrain')?.material.customProgramCacheKey?.() === 'insel-terrain-ultra'), 'Ultra: Gelände mit echten Materialien');
    await sleep(2500);
    await shot('ultra-insel');
    await showCmd({ type: 'set', patch: { quality: 'high' } });
    await sleep(800);
    check(await board(() => window.__board.scene.getObjectByName('terrain')?.material.customProgramCacheKey?.() === 'insel-terrain'), 'zurück auf Schön: normales Gelände');
    // Musik: festes Stück, dann wieder automatisch und rotierend
    await showCmd({ type: 'set', patch: { musicTrack: 'insel-calypso' } });
    await sleep(800);
    check((await board(() => window.__board.audio.musicTrack)) === 'insel-calypso', 'Musik: festes Stück aus der Regie');
    await showCmd({ type: 'set', patch: { musicTrack: 'auto', musicRotate: true } });
    await sleep(800);
    check(/^lobby/.test((await board(() => window.__board.audio.musicTrack)) ?? ''), 'Musik: automatisch (Lobby)');
    await showCmd({ type: 'set', patch: { commentary: 'crazy' } });
    await sleep(500);
    check((await board(() => window.__board.commentator.level)) === 'crazy', 'Kommentator: Quatschkopf');
    await showCmd({ type: 'set', patch: { fps: false, commentary: 'lots' } });
  }

  // --- Spielerklärung -------------------------------------------------------------
  if (want('erklaerung')) {
    await showCmd({ type: 'explain', action: 'start' });
    const t0 = Date.now();
    // Zeitpunkte der Bilder (Sekunden), anpassbar: SHOTS=150,155,160 node e2e/show.mjs …
    const shots = process.env.SHOTS ? process.env.SHOTS.split(',').map(Number) : [4, 16, 30, 58, 75, 92, 104, 116, 128, 140, 152, 164, 176];
    for (const s of shots) {
      const wait = t0 + s * 1000 - Date.now();
      if (wait > 0) await sleep(wait);
      await shot(`erklaerung-${String(s).padStart(3, '0')}`);
      if (!show.explainer.running) break;
    }
    for (let i = 0; i < 90 && show.explainer.running; i++) await sleep(1000);
    check(!show.explainer.running, `Erklärung läuft durch und meldet sich fertig (${Math.round((Date.now() - t0) / 1000)} s)`);
    check(await board(() => !window.__board.pieces.get('__demo_a')), 'Vorführ-Figuren wieder weg');
    check((await board(() => window.__board.view)) === 'island', 'nach der Erklärung wieder auf der Insel');
  }

  // --- Spiel: Foto-Blasen, Reaktion, Siegerehrung -------------------------------------
  await cmd({ type: 'game.start' });
  await sleep(1500);
  if (want('blasen')) {
    const items = (await (await fetch(`${base}/api/library/items`, { headers: { authorization: `Bearer ${token}` } })).json()).items ?? [];
    const game = items.find((i) => i.kind === 'game' && i.playerCount && i.playerCount !== 'all');
    await cmd(game ? { type: 'content.select', source: 'manual', itemId: game.id } : { type: 'content.select', source: 'random' });
    await sleep(1800);
    await shot('blasen');
    const n = await page.evaluate(() => [...document.querySelectorAll('.will-change-transform')].filter((e) => Number(getComputedStyle(e).opacity) > 0.5).length);
    check(n > 0, `Foto-Blasen beim Ziehen (${n} sichtbar)`);
    await cmd({ type: 'content.abort' });
  }
  if (want('reaktion')) {
    const s0 = state;
    if (s0.phase.name !== 'dice') {
      // direkt in die Würfelrunde
      await cmd({ type: 'content.select', source: 'random' });
      await cmd({ type: 'content.open' });
      const c = state.phase.content;
      if (c.item.kind === 'game') await cmd({ type: 'content.rank', ranking: state.teams.map((t, i) => ({ teamId: t.id, rank: i + 1 })) });
      else if (c.stage !== 'revealed') await cmd({ type: 'content.reveal' });
      await cmd({ type: 'content.finish' });
      await cmd({ type: 'results.confirm' });
    }
    const id = state.phase.dice.order[state.phase.dice.index];
    const fields = state.config.board.fields;
    // hinter der Liane starten, damit keine Mutprobe dazwischenkommt
    const startPos = fields.indexOf('vine') + 1;
    await cmd({ type: 'team.setBonus', teamId: id, bonusDie: 0 });
    await cmd({ type: 'team.setPosition', teamId: id, position: startPos });
    await sleep(1500);
    // Ein normales Feld als Ziel suchen
    let main = 6;
    for (let m = 6; m >= 1; m--) if (fields[startPos + m] === 'normal' && !fields.slice(startPos + 1, startPos + m).some((f) => f !== 'normal')) { main = m; break; }
    await cmd({ type: 'dice.roll', main, force: true });
    const steps = [2600, 2200, 1300, 600, 500];
    let k = 0;
    for (const ms of steps) {
      await sleep(ms);
      await shot(`reaktion-${k++}`);
    }
  }
  if (want('vulkan')) {
    // Totenkopf → Vulkan-Inneres → genau aufs Ausgangsfeld → zurück auf die Insel
    const fields = state.config.board.fields;
    const skull = fields.indexOf('skull');
    check(skull > 0, `Brett hat ein Totenkopf-Feld (${skull})`);
    if (state.phase.name !== 'dice') {
      await cmd({ type: 'content.select', source: 'random' });
      await cmd({ type: 'content.open' });
      const c = state.phase.content;
      if (c.item.kind === 'game') await cmd({ type: 'content.rank', ranking: state.teams.map((t, i) => ({ teamId: t.id, rank: i + 1 })) });
      else if (c.stage !== 'revealed') await cmd({ type: 'content.reveal' });
      await cmd({ type: 'content.finish' });
      await cmd({ type: 'results.confirm' });
    }
    const id = state.phase.dice.order[state.phase.dice.index];
    await cmd({ type: 'team.setBonus', teamId: id, bonusDie: 0 });
    await cmd({ type: 'team.setPosition', teamId: id, position: skull - 1 });
    await sleep(2500);
    await cmd({ type: 'dice.roll', main: 1, force: true });
    check(!!state.teams.find((t) => t.id === id).inside, 'Team ist im Vulkan-Inneren');
    await sleep(5200);
    check((await board(() => window.__board.view)) === 'inside', 'Beamer zeigt das Vulkan-Innere');
    await shot('vulkan-innen-1');
    await sleep(1500);
    await shot('vulkan-innen-2');
    // Runde zu Ende bringen, nächste Runde: genau aufs Ausgangsfeld
    while (state.phase.name === 'dice') await cmd({ type: 'dice.skip' });
    if (state.phase.name === 'round_end') await cmd({ type: 'round.next' });
    await cmd({ type: 'content.select', source: 'random' });
    await cmd({ type: 'content.open' });
    const c2 = state.phase.content;
    if (c2.item.kind === 'game') await cmd({ type: 'content.rank', ranking: state.teams.map((t, i) => ({ teamId: t.id, rank: i + 1 })) });
    else if (c2.stage !== 'revealed') await cmd({ type: 'content.reveal' });
    await cmd({ type: 'content.finish' });
    await cmd({ type: 'results.confirm' });
    while (state.phase.name === 'dice' && state.phase.dice.order[state.phase.dice.index] !== id) await cmd({ type: 'dice.skip' });
    await cmd({ type: 'team.setBonus', teamId: id, bonusDie: 0 });
    await sleep(Math.max(0, state.phase.dice.busyUntil - Date.now()) + 2500);
    check((await board(() => window.__board.view)) === 'inside', 'am Zug im Vulkan: Beamer zeigt das Innere');
    await shot('vulkan-zug');
    await cmd({ type: 'dice.roll', main: state.config.rules.inside.shout, force: true });
    check(!state.teams.find((t) => t.id === id).inside, 'genau aufs Ausgangsfeld: sofort draußen');
    await sleep(4200);
    await shot('vulkan-weg');
    await sleep(3500);
    await shot('vulkan-warp');
    await sleep(3000);
    check((await board(() => window.__board.view)) === 'island', 'danach wieder auf der Insel');
    check(state.teams.find((t) => t.id === id).position === skull, 'zurück auf dem Totenkopf-Feld');
  }
  if (want('sieg')) {
    await toDice();
    // offene Mutprobe erst erledigen
    if (state.phase.name === 'dice' && state.phase.dice.challenge) {
      const c = state.phase.dice.challenge;
      await cmd(c.kind === 'river' ? { type: 'challenge.choose', choice: 'barrels', result: 'safe', force: true } : { type: 'challenge.roll', value: 6, force: true });
      await sleep(500);
      await toDice();
    }
    while (state.phase.name === 'dice' && state.phase.dice.index < state.phase.dice.order.length) {
      const id = state.phase.dice.order[state.phase.dice.index];
      const goal = state.config.board.fields.length - 1;
      await cmd({ type: 'team.setPosition', teamId: id, position: goal });
      await cmd({ type: 'team.setPosition', teamId: state.teams.find((t) => t.id !== id).id, position: goal - 4 });
      await sleep(1200);
      await cmd({ type: 'dice.roll', main: 6, force: true });
      break;
    }
    check(state.phase.name === 'finished', `Sieg (${state.phase.name})`);
    for (const s of [2, 5, 8, 11, 15]) {
      await sleep(s === 2 ? 2000 : 3000);
      await shot(`sieg-${String(s).padStart(2, '0')}`);
    }
    check(await board(() => window.__board.ceremony.active), 'Siegerpodest steht');
    await page.reload();
    await page.waitForFunction(() => window.__board, null, { timeout: 60000 });
    await sleep(3000);
    check(await board(() => window.__board.ceremony.active), 'Podest auch nach Neuladen');
    await shot('sieg-neuladen');
  }
  if (want('remote')) {
    await showCmd({ type: 'reload' });
    await sleep(500);
    await page.waitForFunction(() => window.__board, null, { timeout: 60000 });
    check(true, 'Neu laden aus der Regie');
  }
  sock.close();
} finally {
  await browser.close();
  server.kill();
  rmSync(dataDir, { recursive: true, force: true });
}
console.log(checks.join('\n'));
console.log(errors.length ? `\n❌ ${errors.length} Fehler:\n` + errors.join('\n') : '\n✅ ohne Fehler');
console.log('Bilder:', out);
process.exit(errors.length ? 1 : 0);
