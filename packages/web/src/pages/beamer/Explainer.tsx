/**
 * Spielerklärung auf dem Beamer: DiMario erklärt in gut drei Minuten das Spiel, die Kamera
 * fährt zu den passenden Orten, Vorführ-Figuren zeigen Sprungfeder, Flugzeug, UFO, Käfig,
 * Liane, Fässer oder Kisten, Lavahöhle, Vulkan-Inneres & Co. Jeder Satz ist eine eigene
 * Sprachdatei – die Vorführung startet genau mit dem Satz, der sie ankündigt.
 * Gestartet und gestoppt wird aus der Regie.
 *
 * Blockwelt: gleiche Abläufe (die Auftritte sind dort schon aus Blöcken), aber eigene Begriffe auf
 * Karten und im Untertitel – Schleimblock, Knaller, Teleport-Perle, Spinnennetz, Ranke, Nether …
 */
import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import * as THREE from 'three';
import { DEFAULT_FIGURE, DEFAULT_RULES, FIELD_INFO, THEME_INFO, islandLandmarks, type ExplainerState, type FieldType, type GameState } from '@insel/shared';
import type { BoardScene } from '../../board/scene.ts';
import { BLOCK_EXPLAINER_LINES, EXPLAINER_LINES, SPACE_EXPLAINER_LINES, stripTags, voiceUrl, type ExplainerLineId } from '../../board/voice-lines.ts';
import { beamerReport } from '../../lib/live.ts';
import { boardAudio } from './BoardCanvas.tsx';

/** Vulkandruck der Vorführung (Balken in der Karte); `bump` = Zuwachs als kleine Blase */
interface Meter {
  value: number;
  max: number;
  bump?: { id: number; text: string };
}

interface Card {
  icon: string;
  title: string;
  items?: { icon: string; text: string; color?: string }[];
  /** Punkte untereinander statt zweispaltig (längere Sätze) */
  wide?: boolean;
  steps?: string[];
  /** Vorführung: Antwort per Doppeltipp */
  tap?: boolean;
  meter?: Meter;
}

const UP = new THREE.Vector3(0, 1, 0);

/** Abschnitte der Erklärung (für die Fortschrittspunkte oben). */
const SECTIONS = 12;

const DEMO_A = '__demo_a';
const DEMO_B = '__demo_b';

class Aborted extends Error {}

/** Ablauf mit Abbruch (Stopp aus der Regie). */
class Run {
  stopped = false;
  check() {
    if (this.stopped) throw new Aborted();
  }
  wait(ms: number) {
    return new Promise<void>((resolve, reject) => {
      const t0 = performance.now();
      const tick = () => {
        if (this.stopped) return reject(new Aborted());
        if (performance.now() - t0 >= ms) return resolve();
        window.setTimeout(tick, Math.min(100, ms));
      };
      tick();
    });
  }
}

/** gerade laufende Erklärung (es gibt nur einen Beamer je Seite) */
let activeRun: Run | null = null;

function firstField(state: GameState | null, type: FieldType, fallback: number) {
  const i = state?.config.board.fields.indexOf(type) ?? -1;
  return i > 0 ? i : fallback;
}

export function Explainer({ scene, state, explainer }: { scene: BoardScene | null; state: GameState | null; explainer: ExplainerState }) {
  const [card, setCard] = useState<Card | null>(null);
  const [subtitle, setSubtitle] = useState<string | null>(null);
  const [step, setStep] = useState(0);
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    if (!explainer.running || !scene) return;
    const run = new Run();
    // Neustart während einer laufenden Erklärung: Reste der alten sofort wegräumen
    if (activeRun) {
      activeRun.stopped = true;
      scene.stunts.abortAll();
      scene.pieces.abortAll();
    }
    activeRun = run;
    // Spielablauf ruht: keine Kamera-, Ansichts- oder Figurenkorrekturen dazwischen
    scene.director.setPaused(true);
    scene.pieces.abortAll();
    void play(run, scene, () => stateRef.current, { setCard, setSubtitle, setStep })
      .then(() => beamerReport('beamer:explained', explainer.id))
      .catch((e: unknown) => {
        if (!(e instanceof Aborted)) console.warn('Erklärung abgebrochen', e);
      })
      .finally(() => {
        // eine neuere Erklärung hat übernommen – die räumt selbst auf
        if (activeRun !== run) return;
        activeRun = null;
        cleanup(scene, setCard, setSubtitle);
      });
    return () => {
      run.stopped = true;
      boardAudio.stopVoice();
    };
  }, [explainer.running, explainer.id, scene]);

  return (
    <div className="pointer-events-none absolute inset-0 z-20">
      <AnimatePresence>
        {explainer.running && (
          <motion.div
            key="badge"
            initial={{ y: -40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -40, opacity: 0 }}
            className="glass absolute top-5 left-1/2 flex -translate-x-1/2 items-center gap-3 rounded-full px-5 py-2"
          >
            <span className="text-3xl">🎙️</span>
            <span className="font-display text-2xl font-semibold text-ink">So geht’s!</span>
            <span className="flex gap-1">
              {Array.from({ length: SECTIONS }, (_, i) => (
                <span key={i} className={`h-2 rounded-full transition-all ${i < step ? 'w-5 bg-accent' : i === step ? 'w-8 bg-accent' : 'w-2 bg-black/15'}`} />
              ))}
            </span>
          </motion.div>
        )}
      </AnimatePresence>
      <AnimatePresence mode="wait">
        {card && (
          <motion.div
            key={card.title}
            initial={{ x: -60, opacity: 0, scale: 0.95 }}
            animate={{ x: 0, opacity: 1, scale: 1 }}
            exit={{ x: -40, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 260, damping: 26 }}
            className="glass absolute top-[6.5rem] left-6 w-[min(40rem,46vw)] rounded-[2rem] p-7"
          >
            <p className="font-display text-5xl leading-tight font-semibold text-ink">
              <span className="mr-3">{card.icon}</span>
              {card.title}
            </p>
            {card.steps && (
              <ol className="mt-5 flex flex-col gap-3">
                {card.steps.map((s, i) => (
                  <motion.li
                    key={s}
                    initial={{ x: -30, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    transition={{ delay: 0.6 + i * 1.6 }}
                    className="flex items-center gap-4 rounded-3xl bg-white/80 px-4 py-3 text-3xl font-bold text-ink"
                  >
                    <span className="grid size-12 shrink-0 place-items-center rounded-full bg-accent font-display text-2xl text-white">{i + 1}</span>
                    {s}
                  </motion.li>
                ))}
              </ol>
            )}
            {card.tap && <TapDemo />}
            {card.items && (
              <div className={`mt-5 grid gap-3 ${card.wide ? 'grid-cols-1' : 'grid-cols-2'}`}>
                {card.items.map((it, i) => (
                  <motion.div
                    key={it.text}
                    initial={{ scale: 0.6, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ delay: 0.4 + i * 0.9, type: 'spring', stiffness: 320, damping: 18 }}
                    className="flex items-center gap-3 rounded-3xl bg-white/85 px-4 py-3 text-2xl font-bold text-ink"
                    style={it.color ? { boxShadow: `inset 0 0 0 4px ${it.color}` } : undefined}
                  >
                    <span className="text-4xl">{it.icon}</span>
                    {it.text}
                  </motion.div>
                ))}
              </div>
            )}
            {card.meter && <PressureMeter meter={card.meter} />}
          </motion.div>
        )}
      </AnimatePresence>
      <AnimatePresence mode="wait">
        {subtitle && (
          <motion.div
            key={subtitle}
            initial={{ y: 30, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 10, opacity: 0 }}
            className="absolute inset-x-0 bottom-[6%] flex justify-center px-10"
          >
            <p className="max-w-[70rem] rounded-[1.6rem] bg-black/60 px-7 py-3 text-center text-3xl leading-snug font-bold text-white shadow-lifted">{subtitle}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** Knopf B: wie die anderen bei 0,3 s erscheinen, ab 3,2 s zweimal angetippt (Zeitpunkte in Sekunden). */
const B_TAP = (() => {
  const at = [0, 0.3, 0.65, 3.2, 3.365, 3.53, 3.695, 3.97, 4.3];
  const duration = at[at.length - 1]!;
  return { scale: [0.7, 0.7, 1, 1, 0.9, 1, 0.9, 1.06, 1], times: at.map((t) => t / duration), duration };
})();

/** Antwortknöpfe wie auf dem Handy: B wird doppelt angetippt und ist sofort eingeloggt. */
function TapDemo() {
  const opts = [
    { k: 'A', c: '#e5484d' },
    { k: 'B', c: '#2f7de1' },
    { k: 'C', c: '#f5a623' },
    { k: 'D', c: '#30a46c' },
  ];
  return (
    <div className="mt-5 grid grid-cols-2 gap-3">
      {opts.map((o) => (
        <motion.div
          key={o.k}
          initial={{ scale: 0.7, opacity: 0 }}
          animate={o.k === 'B' ? { scale: B_TAP.scale, opacity: 1 } : { scale: 1, opacity: 1 }}
          transition={
            o.k === 'B'
              ? // erscheint wie die anderen, wird dann zweimal angetippt
                { scale: { duration: B_TAP.duration, times: B_TAP.times, ease: 'easeInOut' }, opacity: { delay: 0.3, duration: 0.25 } }
              : { delay: 0.3, type: 'spring', stiffness: 300, damping: 18 }
          }
          className="relative grid h-24 place-items-center rounded-3xl font-display text-6xl font-semibold text-white shadow-lifted"
          style={{ background: o.c }}
        >
          {o.k}
          {o.k === 'B' && (
            <>
              <motion.span initial={{ opacity: 0, y: 20 }} animate={{ opacity: [0, 1, 1, 0], y: [20, 0, 0, 10] }} transition={{ delay: 2.9, duration: 1.4 }} className="absolute -right-3 -bottom-4 text-6xl">
                👆
              </motion.span>
              <motion.span
                initial={{ opacity: 0, scale: 0.5 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 4.3, type: 'spring', stiffness: 320, damping: 14 }}
                className="absolute -top-3 -right-3 rounded-full bg-white px-3 py-1 text-2xl font-bold text-good shadow"
              >
                ✓ eingeloggt
              </motion.span>
            </>
          )}
        </motion.div>
      ))}
    </div>
  );
}

/** Vulkandruck groß wie im Spiel: ein Kästchen je Druckpunkt (bei vielen ein durchgehender Balken), Zuwachs als Blase. */
function PressureMeter({ meter }: { meter: Meter }) {
  const { value, max, bump } = meter;
  const full = value >= max;
  const fill = 'linear-gradient(90deg, #f5b031, #f2555a 70%, #b3261e)';
  return (
    <div className={`mt-4 rounded-3xl bg-white/85 px-5 py-4 transition-shadow ${full ? 'shadow-[inset_0_0_0_4px_#e5484d]' : ''}`}>
      <div className="flex items-center justify-between text-2xl font-bold text-ink">
        <span>🌡️ Vulkandruck</span>
        <span className={`relative font-display text-3xl tabular-nums ${full ? 'text-bad' : ''}`}>
          {value} / {max}
          <AnimatePresence>
            {bump && (
              <motion.span
                key={bump.id}
                initial={{ y: 12, opacity: 0, scale: 0.6 }}
                animate={{ y: -38, opacity: [0, 1, 1, 0], scale: 1 }}
                transition={{ duration: 2.2, times: [0, 0.15, 0.75, 1] }}
                className="absolute -top-2 right-0 rounded-full bg-bad px-3 py-0.5 font-sans text-xl font-bold whitespace-nowrap text-white shadow"
              >
                {bump.text}
              </motion.span>
            )}
          </AnimatePresence>
        </span>
      </div>
      {max <= 12 ? (
        <div className="mt-3 flex gap-1.5">
          {Array.from({ length: max }, (_, i) => (
            <div key={i} className="h-7 flex-1 overflow-hidden rounded-full bg-black/10">
              <div className="h-full rounded-full transition-all duration-500" style={{ width: i < value ? '100%' : '0%', background: fill }} />
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-3 h-7 overflow-hidden rounded-full bg-black/10">
          <div className="h-full rounded-full transition-all duration-700" style={{ width: `${Math.min(1, value / max) * 100}%`, background: fill }} />
        </div>
      )}
    </div>
  );
}

function cleanup(scene: BoardScene, setCard: (c: Card | null) => void, setSubtitle: (s: string | null) => void) {
  setCard(null);
  setSubtitle(null);
  // Vulkandruck der Vorführung zurück auf den echten Stand
  const st = scene.state;
  const v = st?.config.rules.volcano;
  scene.volcano.setPressure(st && v?.enabled ? st.volcano.pressure / Math.max(1, v.threshold) : 0);
  const wasInside = scene.view === 'inside';
  // laufende Vorführungen (UFO, Flugzeug, Bretter …) sofort wegräumen
  scene.stunts.abortAll();
  scene.stunts.syncVine(null);
  scene.pieces.removeDemo(DEMO_A);
  scene.pieces.removeDemo(DEMO_B);
  scene.stunts.stageOff();
  scene.inside?.highlight(null);
  void scene.dice.hide(0);
  scene.setView('island');
  scene.rig.endManual();
  scene.rig.set({ kind: 'overview', tour: true }, 0.8);
  if (wasInside) scene.rig.jump();
  // Spielablauf übernimmt wieder: Figuren hart an ihre Plätze, Kamera aufs Geschehen
  scene.director.setPaused(false);
}

interface Ui {
  setCard: (c: Card | null) => void;
  setSubtitle: (s: string | null) => void;
  setStep: (n: number) => void;
}

/** Ablauf der Erklärung: je Satz Kamera, Karte, Vorführung – und DiMario spricht. */
async function play(run: Run, s: BoardScene, getState: () => GameState | null, ui: Ui) {
  const rig = s.rig;
  rig.endManual();
  const goal = s.layout.fields.length - 1;
  const st = getState();
  const marks = islandLandmarks(goal);
  const springField = firstField(st, 'catapult_forward', 6);
  const planeField = firstField(st, 'catapult_backward', 14);
  const swapField = firstField(st, 'swap', 12);
  const cageField = firstField(st, 'barrier', 10);
  const gameField = firstField(st, 'minigame', 18);
  const volcanoField = firstField(st, 'volcano', 30);
  const skullField = firstField(st, 'skull', marks.cave[0] ?? 40);
  const vineField = marks.vine[0] ?? 4;
  const riverBank = (marks.river[0] ?? 20) - 1;
  const riverExit = (marks.river[marks.river.length - 1] ?? 20) + 1;
  const caveField = marks.cave[0] ?? 40;
  const caveNeed = st?.config.rules.cave?.need ?? 3;
  const finalMin = st?.config.rules.winRule === 'final_roll' ? st.config.rules.finalRollMin : null;
  const ins = s.inside;
  const shout = st?.config.rules.inside?.shout ?? 4;
  const reward = st?.config.rules.fieldGame.rewardWin ?? DEFAULT_RULES.fieldGame.rewardWin;
  // Vulkan: echte Regeln dieses Spiels (Karten, Druckbalken und Vorführung richten sich danach)
  const vr = st?.config.rules.volcano ?? DEFAULT_RULES.volcano;
  // Vulkan in diesem Spiel abgeschaltet: Vulkanfelder und Ausbruch werden nicht erklärt
  const volcanoOn = vr.enabled;
  const threshold = Math.max(1, vr.threshold);
  const perField = vr.pressurePerField;
  const perRound = vr.pressurePerRound;
  const zoneSize = Math.max(1, Math.min(goal, vr.zoneSize));
  const zoneStart = goal - zoneSize + 1;
  const kbMin = Math.min(vr.knockback.min, vr.knockback.max);
  const kbMax = Math.max(vr.knockback.min, vr.knockback.max);
  const kbText = kbMin === kbMax ? `${kbMax}` : `${kbMin}–${kbMax}`;
  const blocks = s.theme === 'blocks';
  const space = s.theme === 'space';

  // Sprachdateien vorab laden (Dauer für den Fall ohne Ton)
  /** Blockwelt/Weltall: eigene Aufnahme, wo es eine gibt (bw_<id> bzw. sw_<id>), sonst die Insel-Aufnahme */
  const lineOf = (id: ExplainerLineId) => {
    const own = blocks ? BLOCK_EXPLAINER_LINES[id] : space ? SPACE_EXPLAINER_LINES[id] : undefined;
    return { text: own ?? EXPLAINER_LINES.find(([k]) => k === id)?.[1] ?? '', url: voiceUrl(own ? `${blocks ? 'bw' : 'sw'}_${id}` : id) };
  };
  await Promise.all(EXPLAINER_LINES.map(([id]) => boardAudio.prepare(lineOf(id).url)));
  run.check();

  let section = -1;
  /** Satz sprechen (ohne Ton: Untertitel so lange zeigen, wie das Vorlesen dauern würde). */
  const speak = async (id: ExplainerLineId) => {
    const { text, url } = lineOf(id);
    ui.setSubtitle(stripTags(text));
    const spoken = await boardAudio.say(url, { interrupt: true });
    run.check();
    if (!spoken) await run.wait(Math.max(2500, stripTags(text).length * 62));
    await run.wait(250);
  };
  /** Ein Satz samt Vorführung: beide starten zugleich, weiter geht es, wenn beides fertig ist. */
  const beat = async (id: ExplainerLineId, demo?: () => Promise<unknown>) => {
    await Promise.all([speak(id), demo ? demo() : Promise.resolve()]);
    run.check();
  };
  /** gerade gezeigte Karte (für Änderungen am Druckbalken) */
  let shown: Card | null = null;
  const show = (c: Card | null) => {
    shown = c;
    ui.setCard(c);
  };
  const next = (c: Card | null) => {
    section += 1;
    ui.setStep(section);
    show(c);
  };
  let pressure = 0;
  let bumpId = 0;
  /** Vulkandruck der Vorführung: Balken in der Karte, Glut und Rauch am Vulkan */
  const setPressure = (value: number, bump?: string) => {
    pressure = Math.max(0, Math.min(threshold, value));
    s.volcano.setPressure(pressure / threshold);
    if (shown?.meter) show({ ...shown, meter: { value: pressure, max: threshold, bump: bump ? { id: ++bumpId, text: bump } : undefined } });
  };
  type Shot = { position: THREE.Vector3; lookAt: THREE.Vector3 };
  /** weit weg von der jetzigen Kamera? Dann Schwarzblende statt Flug quer über die Insel */
  const far = (p: THREE.Vector3) => s.camera.position.distanceTo(p) > 22;
  const cut = async (fn: () => void) => {
    await s.fadeCut(fn);
    run.check();
  };
  /** Feste Einstellung: nah = gleiten, weit = Schnitt mit Blende */
  const go = async (sh: Shot, stiff = 1.4) => {
    const set = () => rig.set({ kind: 'focus', position: sh.position, lookAt: sh.lookAt }, stiff);
    if (far(sh.position)) await cut(set);
    else set();
  };
  /** Figur verfolgen (nah = gleiten, weit = Schnitt) */
  const goFollow = async (id: string, distance = 9, height = 6) => {
    const set = () => rig.set({ kind: 'follow', target: () => s.pieces.worldPos(id), distance, height }, 1.6);
    const at = s.pieces.worldPos(id);
    if (at && s.camera.position.distanceTo(at) > distance + 16) await cut(set);
    else set();
  };
  /** Überblick über die Insel */
  const goOverview = async (tour = false) => {
    const set = () => rig.set({ kind: 'overview', tour }, 0.9);
    if (s.camera.position.y < 25) await cut(set);
    else set();
  };
  /** Nahaufnahme eines Feldes mit freier Sicht */
  const close = (id: string, field: number, dist = 8, height = 5) => rig.clearShot(s.pieces.slotOn(id, field), dist, height);
  const place = (id: string, field: number, mode: Parameters<typeof s.pieces.setMode>[1] = 'idle') => {
    s.pieces.setInside(id, null);
    s.pieces.release(id, field, mode, false);
    const p = s.pieces.get(id);
    if (p) p.holder.visible = true;
  };
  /** Vulkanfeld von der Bergseite weg, erhöht: Figur unten, rauchender Gipfel oben im Bild */
  const heatShot = (field: number): Shot => {
    const f = s.pieces.slotOn(DEMO_A, field);
    const top = s.volcano.craterTop;
    const out = new THREE.Vector3(f.x - top.x, 0, f.z - top.z);
    if (out.lengthSq() < 1) out.set(0, 0, 1);
    out.normalize().applyAxisAngle(UP, 0.3);
    return { position: f.clone().addScaledVector(out, 24).setY(f.y + 14), lookAt: f.clone().lerp(top, 0.4) };
  };
  /**
   * Ausbruch: Krater, Figur am Gipfel, Flugbogen und Landeplatz zugleich im Bild. Schräg von der
   * Seite (frontal flöge die Figur nur auf die Kamera zu), mit freier Sicht auf Start, Landeplatz
   * und Krater; das Motiv rechts oben (links steht die Karte, unten der Untertitel).
   */
  const eruptionShot = (from: THREE.Vector3, to: THREE.Vector3): Shot => {
    const lift = new THREE.Vector3(0, 0.8, 0);
    const a = from.clone().add(lift);
    const b = to.clone().add(lift);
    const top = s.volcano.craterTop.clone().setY(s.volcano.craterTop.y + 2.5);
    const points = [top, a, b, a.clone().lerp(b, 0.5).setY(Math.max(a.y, b.y) + 5)];
    const center = new THREE.Box3().setFromPoints(points).getCenter(new THREE.Vector3());
    const r = Math.max(4, ...points.map((p) => p.distanceTo(center)));
    const v = s.layout.volcano;
    const out = new THREE.Vector3(center.x - v.x, 0, center.z - v.z);
    if (out.lengthSq() < 1) out.set(0, 0, 1);
    out.normalize();
    const base = (r / Math.tan(THREE.MathUtils.degToRad(s.camera.fov / 2))) * 1.3;
    const pitch = 0.5;
    // Kraterrand mit ins Motiv (sonst steckt ein Teil des Kraters hinter der Karte)
    const rim = [0, 1, 2, 3].map((i) => top.clone().add(new THREE.Vector3(Math.cos((i * Math.PI) / 2) * 3, -1.5, Math.sin((i * Math.PI) / 2) * 3)));
    const motif = [...points, ...rim];
    const cam = s.camera.clone();
    /** liegt alles rechts neben der Karte (linke Bildhälfte) und über dem Untertitel? */
    const fits = (sh: Shot) => {
      cam.position.copy(sh.position);
      cam.lookAt(sh.lookAt);
      cam.updateMatrixWorld();
      return motif.every((p) => {
        const q = p.clone().project(cam);
        return q.z < 1 && q.x > 0.02 && q.x < 0.96 && q.y > -0.55 && q.y < 0.9;
      });
    };
    const shotFrom = (angle: number, shift: number, far: number): Shot => {
      const dist = base * far;
      const dir = out.clone().applyAxisAngle(UP, angle);
      const position = center.clone().addScaledVector(dir, dist * Math.cos(pitch)).setY(center.y + dist * Math.sin(pitch));
      const right = new THREE.Vector3().crossVectors(dir.clone().negate(), UP).normalize();
      return { position, lookAt: center.clone().addScaledVector(right, -r * shift).setY(center.y - r * 0.3) };
    };
    const angles = [-0.9, -0.6, -1.2, 0.9, 0.6, 1.2, -0.3, 0.3];
    const free = (sh: Shot) => [a, b, top].every((p) => rig.occlusion(sh.position, p, true) === 0);
    // erst die engste Einstellung, die frei ist und neben die Karte passt; dann nur frei; dann irgendwas
    for (const [shift, far] of [[0.3, 1], [0.45, 1.1], [0.6, 1.25], [0.7, 1.45], [0.8, 1.7]] as const) {
      for (const angle of angles) {
        const sh = shotFrom(angle, shift, far);
        if (free(sh) && fits(sh)) return sh;
      }
    }
    for (const angle of angles) {
      const sh = shotFrom(angle, 0.6, 1.25);
      if (free(sh)) return sh;
    }
    return shotFrom(0, 0.6, 1.25);
  };
  /** Gefahrenzone am Gipfel: rote Funken laufen die Felder hinauf */
  const flashZone = async () => {
    for (let i = zoneStart; i <= goal; i++) {
      const f = s.layout.fields[i];
      if (f) s.effects.sparkle(f.x, s.fields.topY[i] ?? f.y, f.z, new THREE.Color('#ff4a3a'), 16, 1.1);
      await run.wait(70);
    }
  };

  // 1) Begrüßung über der Insel (bzw. der Blockwelt)
  rig.set({ kind: 'overview' }, 0.9);
  next({ icon: THEME_INFO[s.theme].icon, title: THEME_INFO[s.theme].label });
  s.effects.confettiBurst(0, 12, 0, ['#ffd23f', '#ff6fb5', '#5fe0d8', '#ffffff'], 160, 1.2);
  await beat('ex_welcome');

  // 2) Geräte: Handy, Tablet oder Laptop
  rig.set({ kind: 'overview', tour: true }, 0.9);
  next({
    icon: '📱',
    title: 'Mitspielen',
    items: [
      { icon: '📱', text: 'Handy' },
      { icon: '📲', text: 'Tablet' },
      { icon: '💻', text: 'Laptop' },
      { icon: '🔳', text: 'Code scannen' },
    ],
  });
  await beat('ex_devices');

  // 3) Teams und Figuren – zwei Vorführ-Figuren am Start
  s.pieces.addDemo(DEMO_A, { ...DEFAULT_FIGURE, hairStyle: 'spiky' }, 'blue', blocks ? 'Die Diamanten' : space ? 'Die Kometen' : 'Die Papageien', 1);
  s.pieces.addDemo(DEMO_B, { ...DEFAULT_FIGURE, hairStyle: 'long', hairColor: 3 }, 'orange', blocks ? 'Die Schleime' : space ? 'Die Marsmännchen' : 'Die Kokosnüsse', 1);
  await go(rig.portraitShot(s.pieces.worldPos(DEMO_A) ?? new THREE.Vector3(), 6), 1.4);
  next({
    icon: '👥',
    title: 'Teams',
    items: [
      { icon: '🎨', text: 'eigene Farbe', color: '#2f7de1' },
      { icon: '🧑‍🎤', text: 'eigene Figur', color: '#f5a623' },
      { icon: '✏️', text: 'eigener Name' },
      { icon: '👕', text: 'Frisur & Outfit' },
    ],
  });
  s.pieces.setMode(DEMO_A, 'wave');
  s.pieces.setMode(DEMO_B, 'dance');
  await beat('ex_teams');
  s.pieces.setMode(DEMO_A, 'idle');
  s.pieces.setMode(DEMO_B, 'idle');

  // 4) Ziel: der Vulkangipfel
  await go(rig.volcanoShot(), 1);
  next({
    icon: '🌋',
    title: 'Ziel: der Gipfel',
    items: [
      { icon: '⛰️', text: 'zuerst oben ankommen' },
      { icon: '🎲', text: finalMin ? `Siegeswurf: mind. ${finalMin}` : 'Ziel erreichen' },
    ],
  });
  await beat('explain_03');

  // 5) Ablauf einer Runde
  await goOverview();
  next({ icon: '🔁', title: 'Jede Runde', steps: ['Minispiel oder Frage', 'Die Besten: Bonuswürfel', 'Alle würfeln und laufen'] });
  await beat('explain_04');

  // 6) Fragen, Doppeltipp, Minispiele
  rig.set({ kind: 'overview', tour: true }, 0.9);
  next({
    icon: '🧠',
    title: 'Fragen & Minispiele',
    items: [
      { icon: '❓', text: 'Quizfragen' },
      { icon: '🎯', text: 'Schätzfragen' },
      { icon: '🔔', text: 'Buzzer-Runden' },
      { icon: '🎮', text: 'Minispiele' },
    ],
  });
  await beat('ex_questions');
  show({ icon: '👆', title: 'Doppelt tippen = eingeloggt', tap: true });
  await beat('ex_doubletap');
  show({ icon: '🎮', title: 'Minispiele', items: [{ icon: '🎲', text: 'Spieler werden gezogen' }, { icon: '🙋', text: 'immer bereit sein!' }] });
  await beat('ex_minigames');

  // 7) Würfeln
  await goFollow(DEMO_A, 8, 5);
  next({ icon: '🎲', title: 'Würfeln', items: [{ icon: '👆', text: 'Würfel antippen' }, { icon: '📳', text: 'am Handy: schütteln' }] });
  await beat('ex_dice', async () => {
    await run.wait(2400);
    boardAudio.play('dice-shake', { volume: 0.8 });
    await s.dice.roll(4, 0, 0, () => boardAudio.play('dice-throw-1'));
    run.check();
    void s.dice.hide(0.6);
    await s.pieces.walk(DEMO_A, 1, 5);
  });

  // 8) Sonderfelder – jede Vorführung genau zu ihrem Satz
  next({
    icon: '✨',
    title: 'Sonderfelder',
    items: blocks
      ? [
          { icon: '🟩', text: 'Schleimblock', color: FIELD_INFO.catapult_forward.color },
          { icon: '💥', text: 'Knaller', color: FIELD_INFO.catapult_backward.color },
          { icon: '🔮', text: 'Teleport-Perle', color: FIELD_INFO.swap.color },
          { icon: '🕸️', text: 'Spinnennetz', color: FIELD_INFO.barrier.color },
        ]
      : space
        ? [
            { icon: '🚀', text: 'Jetpack', color: FIELD_INFO.catapult_forward.color },
            { icon: '🕳️', text: 'Schwarzes Loch', color: FIELD_INFO.catapult_backward.color },
            { icon: '🌀', text: 'Teleporter', color: FIELD_INFO.swap.color },
            { icon: '⚡', text: 'Energiekäfig', color: FIELD_INFO.barrier.color },
          ]
        : (['catapult_forward', 'catapult_backward', 'swap', 'barrier'] as FieldType[]).map((t) => ({ icon: FIELD_INFO[t].icon, text: FIELD_INFO[t].short, color: FIELD_INFO[t].color })),
  });
  // „Unterwegs warten Sonderfelder. Die Sprungfeder …“
  place(DEMO_A, Math.max(1, springField - 1));
  await goFollow(DEMO_A, 12, 7);
  await beat('ex_spring', async () => {
    await s.pieces.walk(DEMO_A, Math.max(1, springField - 1), springField);
    run.check();
    await run.wait(700);
    rig.set({ kind: 'follow', target: () => s.pieces.worldPos(DEMO_A), distance: 14, height: 8 }, 1.6);
    await s.stunts.spring(DEMO_A);
    run.check();
    await s.pieces.fly(DEMO_A, Math.min(goal - 2, springField + 6), { height: 6, duration: 1.7, spin: Math.PI * 2 });
    run.check();
    boardAudio.play('land');
  });
  // „Das Flugzeug bringt euch leider wieder zurück.“ (Blockwelt: der Knaller, mit eigenen Geräuschen)
  place(DEMO_B, planeField);
  await goFollow(DEMO_B, 14, 9);
  await beat('ex_plane', async () => {
    if (!blocks && !space) boardAudio.play('flugzeug', { volume: 0.7 });
    await s.stunts.plane(DEMO_B, Math.max(1, planeField - 5), '#f5a623');
  });
  // „Das UFO tauscht euren Platz …“
  place(DEMO_A, swapField);
  const posB = s.pieces.positionOf(DEMO_B);
  await goFollow(DEMO_A, 15, 9);
  rig.set({ kind: 'follow', target: () => s.stunts.ufoTarget?.clone().setY(s.stunts.ufoTarget.y - 3) ?? s.pieces.worldPos(DEMO_A), distance: 15, height: 9 }, 2.8);
  await beat('ex_ufo', async () => {
    await s.stunts.ufoSwap(DEMO_A, DEMO_B, swapField, posB);
  });
  // „Und im Käfig sitzt ihr fest …“
  place(DEMO_A, cageField);
  await go(close(DEMO_A, cageField, 6, 3.5), 1.8);
  await beat('ex_cage', async () => {
    await run.wait(600);
    s.pieces.setMode(DEMO_A, 'stuck');
    await s.pieces.setCage(DEMO_A, true, () => boardAudio.play('kaefig'));
  });
  await s.pieces.setCage(DEMO_A, false);
  s.pieces.setMode(DEMO_A, 'idle');

  // 9) Minispiel-Feld und Vulkanfeld
  place(DEMO_A, gameField);
  await go(close(DEMO_A, gameField, 8, 5), 1.4);
  next({
    icon: '🎮',
    title: 'Minispiel-Feld',
    items: [
      { icon: FIELD_INFO.minigame.icon, text: 'Extra-Minispiel', color: FIELD_INFO.minigame.color },
      { icon: '🏃', text: reward > 0 ? `Sieg: ${reward} Felder vor` : 'Sieger ziehen vor' },
    ],
  });
  s.stunts.stageOn(gameField);
  boardAudio.play('pfiff', { volume: 0.7 });
  await beat('ex_gamefield');
  s.stunts.stageOff();
  // „Und die Vulkanfelder? …“ – Figur landet drauf, der Druckbalken steigt, am Ende der Runde noch
  // einmal; der Vulkan oben im Bild raucht und glüht stärker. Startwert so, dass danach genau noch
  // eine Runde bis zum Ausbruch fehlt (wird in Abschnitt 11 vorgeführt).
  if (volcanoOn) {
    const heatFrom = Math.max(0, volcanoField - 2);
    setPressure(threshold - perField - 2 * perRound);
    show({
      icon: FIELD_INFO.volcano.icon,
      title: 'Vulkanfelder',
      wide: true,
      items: [
        ...(perField > 0 ? [{ icon: FIELD_INFO.volcano.icon, text: `Auf dem Vulkanfeld landen: +${perField} Druck`, color: FIELD_INFO.volcano.color }] : []),
        ...(perRound > 0 ? [{ icon: '🔁', text: `Nach jeder Runde: +${perRound} Druck` }] : []),
        { icon: '💥', text: `Druck voll (${threshold}): Ausbruch!`, color: '#e5484d' },
      ],
      meter: { value: pressure, max: threshold },
    });
    // Ortswechsel mit Blende: die Figur springt nicht sichtbar ans andere Ende der Insel
    const heat = heatShot(volcanoField);
    await cut(() => {
      place(DEMO_A, heatFrom);
      rig.set({ kind: 'focus', ...heat }, 1.2);
    });
    await beat('ex_volcanofield', async () => {
      await run.wait(700);
      await s.pieces.walk(DEMO_A, heatFrom, volcanoField);
      run.check();
      s.stunts.geyser(volcanoField);
      boardAudio.play('lava');
      s.rig.shake(0.15, 0.6);
      s.pieces.setMode(DEMO_A, 'shock');
      if (perField > 0) setPressure(pressure + perField, `+${perField} Vulkanfeld`);
      await run.wait(2400);
      if (perRound > 0) {
        boardAudio.play('rumble', { volume: 0.6 });
        s.rig.shake(0.1, 0.8);
        setPressure(pressure + perRound, `+${perRound} Rundenende`);
        await run.wait(1800);
      }
      s.pieces.setMode(DEMO_A, 'idle');
    });
  }

  // 10) Mutproben: Liane, Fässer oder Kisten, Lavahöhle, Totenkopf + Vulkan-Inneres, Krater
  //     (Blockwelt: Ranke, Boden bricht weg, Nether)
  const worldLabel: Partial<Record<FieldType, string>> = blocks
    ? { vine: 'Ranke', skull: 'Boden bricht weg' }
    : space
      ? { vine: 'Greifhaken', river: 'Kisten oder Kapseln', cave: 'Kristallhöhle', skull: 'Wurmloch' }
      : {};
  next({
    icon: '💪',
    title: 'Mutproben',
    items: (['vine', 'river', 'cave', 'skull', 'crater'] as FieldType[]).map((t) => ({ icon: FIELD_INFO[t].icon, text: worldLabel[t] ?? FIELD_INFO[t].label, color: FIELD_INFO[t].color })),
  });
  place(DEMO_A, vineField);
  await go(s.stunts.vineShot(), 1.4);
  // „An der Liane kommt keiner vorbei: Ihr schwingt über den Bach …“
  await beat('ex_vine', async () => {
    await run.wait(1600);
    boardAudio.play('liane');
    await s.stunts.vineGrab(DEMO_A);
    run.check();
    await run.wait(2200);
    const to = Math.min(goal - 1, vineField + 3);
    rig.set({ kind: 'focus', ...s.stunts.swingShot(s.pieces.slotOn(DEMO_A, to)) }, 1.6);
    await s.stunts.vineSwing(DEMO_A, to);
  });
  // „Fässer oder Kisten? Eins davon hält, das andere bricht. Wer reinfällt, schwimmt rüber …“
  place(DEMO_B, riverBank);
  await go(s.stunts.riverShot(), 1.4);
  await beat('ex_river', async () => {
    await run.wait(900);
    await s.stunts.riverPonder(DEMO_B);
    run.check();
    await run.wait(600);
    await s.stunts.riverCross(DEMO_B, 'crates', 'fall', riverExit);
  });
  // „Vor der Lavahöhle braucht ihr eine Drei oder mehr. Sonst geht’s ab ins Innere …“
  place(DEMO_A, caveField);
  // von der Seeseite: die Bergflanke mit der Höhle liegt hinter der Figur, nicht neben der Kamera
  await go(rig.fieldShot(caveField, 8.5, 5, true), 1.4);
  show({
    icon: space ? '💎' : '🦇',
    title: space ? 'Kristallhöhle' : 'Lavahöhle',
    items: [{ icon: '🎲', text: `mind. ${caveNeed} würfeln` }, blocks ? { icon: '🔥', text: 'sonst: ab in den Nether' } : space ? { icon: '👽', text: 'sonst: ab in die Alien-Höhle' } : { icon: '🌋', text: 'sonst: ab ins Innere' }],
  });
  await beat('ex_cave', async () => {
    s.pieces.setMode(DEMO_A, 'shock');
    await run.wait(2600);
    boardAudio.play('dice-shake', { volume: 0.7 });
    await s.dice.roll(Math.max(1, caveNeed - 1), 0, 0, () => boardAudio.play('dice-throw-2'));
    run.check();
    void s.dice.hide(0.5);
    boardAudio.play('hoehle');
    await s.stunts.caveFall(DEMO_A);
  });
  // „Genau wie auf den Totenkopf-Feldern. Da drin lauft ihr ein paar Straffelder über die Lava.
  //  Wer genau das leuchtende Feld trifft, kommt früher raus.“
  place(DEMO_B, skullField);
  await go(close(DEMO_B, skullField, 7, 4.5), 1.8);
  show(
    blocks
      ? { icon: '🔥', title: 'Nether', items: [{ icon: '💀', text: 'Boden bricht weg' }, { icon: '🧱', text: 'Strafweg über Netherziegel' }, ...(shout > 0 ? [{ icon: '✨', text: `genau aufs Feld ${shout}: ab durchs Portal` }] : [{ icon: '🌀', text: 'bis zum Portal laufen' }]), { icon: '🟩', text: 'zurück, wo man fiel' }] }
      : space
        ? { icon: '👽', title: 'Alien-Höhle', items: [{ icon: '🌀', text: 'Wurmloch' }, { icon: '💎', text: 'Strafweg über Kristallinseln' }, ...(shout > 0 ? [{ icon: '✨', text: `genau aufs Feld ${shout}: Teleporter raus` }] : [{ icon: '🏁', text: 'bis zum Ende laufen' }]), { icon: '🪐', text: 'zurück, wo man fiel' }] }
        : { icon: '💀', title: 'Vulkan-Inneres', items: [{ icon: '💀', text: 'Totenkopf-Feld' }, { icon: '🔥', text: 'Strafweg über Lava' }, ...(shout > 0 ? [{ icon: '✨', text: `genau aufs Feld ${shout}: sofort raus` }] : [{ icon: '🏁', text: 'bis zum Ende laufen' }]), { icon: '🏝️', text: 'zurück, wo man fiel' }] },
  );
  await beat('ex_skull', async () => {
    await run.wait(500);
    await s.stunts.trapdoor(DEMO_B, skullField);
    run.check();
    if (!ins) {
      await s.stunts.warpOut(DEMO_B, skullField);
      return;
    }
    // In den Berg: Kamera taucht in den Krater, Überblendung ins Innere – erst der ganze
    // Lavasee als eigener Ort, dann zur ersten Platte; das Ausgangsfeld leuchtet
    await s.travel('inside', {
      approach: true,
      before: () => {
        s.pieces.setInside(DEMO_B, 0);
        const p = s.pieces.get(DEMO_B);
        if (p) p.holder.visible = false;
      },
      arrive: () => {
        rig.set({ kind: 'focus', ...ins.overviewShot() }, 3);
        if (shout > 0) ins.highlight(shout, '#7dffa0');
      },
    });
    run.check();
    await run.wait(700);
    rig.set({ kind: 'focus', ...ins.plateShot(0) }, 1.3);
    boardAudio.play('whoosh-down');
    await s.pieces.insideDrop(DEMO_B, ins.dropPoint);
    run.check();
    boardAudio.play(space ? 'blase' : 'lavaplatsch');
    ins.lavaBurst(s.pieces.worldPos(DEMO_B) ?? ins.dropPoint);
    s.rig.shake(0.15, 0.4);
    await run.wait(350);
    // von Platte zu Platte, die Kamera fährt mit
    await s.pieces.insideWalk(DEMO_B, 0, Math.max(1, shout || 3), (st) => {
      boardAudio.step(false);
      rig.set({ kind: 'focus', ...ins.plateShot(st) }, 2.2);
    });
    run.check();
    await run.wait(300);
    boardAudio.play('warp');
    ins.warpFlash(s.pieces.worldPos(DEMO_B) ?? ins.portal);
    await s.pieces.insideVanish(DEMO_B);
    run.check();
    // hinauf und zurück auf die Insel – über dem Krater auftauchen, dann zum Feld des Sturzes
    const exit = s.islandReturn(DEMO_B, skullField);
    await s.travel('island', {
      approach: true,
      before: () => {
        ins.highlight(null);
        s.pieces.setInside(DEMO_B, null);
      },
      arrive: exit.arrive,
    });
    run.check();
    rig.set({ kind: 'focus', ...exit.target() }, 1.6);
    if (exit.fromCrater()) await run.wait(800);
    await s.stunts.warpOut(DEMO_B, skullField);
  });
  // „Und wer am Kraterloch zu kurz würfelt, rutscht hinein …“
  place(DEMO_A, s.layout.craterField);
  // Schnitt statt Flug: der Weg dorthin führt sonst dicht über den Kraterrand an den Gipfelfeldern vorbei
  await cut(() => rig.set({ kind: 'focus', ...rig.craterShot() }, 1.4));
  show({ icon: FIELD_INFO.crater.icon, title: 'Kraterloch', items: [{ icon: '🕳️', text: 'hineinrutschen' }, { icon: '🧗', text: 'Augen sammeln, rausklettern' }] });
  await beat('ex_crater', async () => {
    await run.wait(2200);
    boardAudio.play('fallen');
    await s.pieces.fallIntoCrater(DEMO_A);
    run.check();
    await run.wait(500);
    await s.pieces.climb(DEMO_A, 0.5);
  });

  // 11) Vulkanausbruch: Druck läuft voll, der Vulkan bricht aus und wirft die Figur am Gipfel
  //     zurück – wie im Spiel (Gefahrenzone = letzte Felder, Rückwurf aus den Regeln)
  // Figur auf den Weg kurz unter dem Gipfel, in die Gefahrenzone (nicht aufs Kraterloch)
  if (volcanoOn) {
    let victimField = Math.max(zoneStart, goal - 3);
    if (victimField === s.layout.craterField && victimField - 1 >= zoneStart) victimField -= 1;
    const victimTo = Math.max(0, victimField - kbMax);
    const from = s.pieces.slotOn(DEMO_B, victimField);
    const to = s.pieces.slotOn(DEMO_B, victimTo);
    const eShot = eruptionShot(from, to);
    await cut(() => {
      s.pieces.removeDemo(DEMO_A); // sitzt noch im Krater – beim Ausbruch nur im Weg
      place(DEMO_B, victimField);
      rig.set({ kind: 'focus', ...eShot }, 1.1);
    });
    next({
      icon: '🌋',
      title: 'Achtung, Vulkan!',
      wide: true,
      items: [
        ...(perRound > 0 ? [{ icon: '🔁', text: `Nach jeder Runde: +${perRound} Druck` }] : []),
        { icon: '⛰️', text: zoneSize > 1 ? `Gefahrenzone: die letzten ${zoneSize} Felder vorm Gipfel` : 'Gefahrenzone: der Gipfel', color: '#e5484d' },
        { icon: '💥', text: `Ausbruch: Wer dort steht, fliegt ${kbText} ${kbMax === 1 ? 'Feld' : 'Felder'} zurück!` },
      ],
      meter: { value: pressure, max: threshold },
    });
    await beat('ex_pressure', async () => {
      await run.wait(1200);
      void flashZone();
      // Runde um Runde bis der Balken voll ist
      const step = perRound > 0 ? perRound : Math.max(1, perField);
      while (pressure < threshold) {
        await run.wait(1100);
        boardAudio.play('rumble', { volume: 0.5 + (pressure / threshold) * 0.5 });
        s.rig.shake(0.1 + (pressure / threshold) * 0.2, 1);
        setPressure(pressure + step, `+${step} ${perRound > 0 ? 'Rundenende' : 'Vulkanfeld'}`);
      }
      s.pieces.setMode(DEMO_B, 'shock');
      await run.wait(600);
    });
    await beat('ex_eruption', async () => {
      await run.wait(900);
      boardAudio.play('jingle-alarm');
      boardAudio.play('vulkan');
      boardAudio.play('rumble', { volume: 0.7, rate: 0.8 });
      s.volcano.erupt();
      s.rig.shake(0.6, 2);
      await run.wait(700);
      await s.pieces.fly(DEMO_B, victimTo, { height: 9, duration: 2.1, spin: Math.PI * 4 });
      run.check();
      boardAudio.play('land');
      s.pieces.setMode(DEMO_B, 'sad');
      setPressure(0, 'Druck wieder 0');
      await run.wait(900);
    });
  } else {
    section += 1;
    ui.setStep(section);
  }

  // 12) Schluss
  await goOverview();
  next({ icon: '🎉', title: 'Viel Spaß!' });
  s.effects.confettiBurst(0, 14, 0, ['#ffd23f', '#ff6fb5', '#5fe0d8', '#ffffff'], 260, 1.4);
  boardAudio.play('applaus', { volume: 0.7, delay: 5 });
  await beat('explain_11');
  await run.wait(1200);
}
