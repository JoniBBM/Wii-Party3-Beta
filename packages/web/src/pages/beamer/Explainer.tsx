/**
 * Spielerklärung auf dem Beamer: DiMario erklärt in gut drei Minuten das Spiel, die Kamera
 * fährt zu den passenden Orten, Vorführ-Figuren zeigen Sprungfeder, Flugzeug, UFO, Käfig,
 * Liane, Fässer oder Kisten, Lavahöhle, Vulkan-Inneres & Co. Jeder Satz ist eine eigene
 * Sprachdatei – die Vorführung startet genau mit dem Satz, der sie ankündigt.
 * Gestartet und gestoppt wird aus der Regie.
 */
import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import * as THREE from 'three';
import { DEFAULT_FIGURE, FIELD_INFO, islandLandmarks, type ExplainerState, type FieldType, type GameState } from '@insel/shared';
import type { BoardScene } from '../../board/scene.ts';
import { EXPLAINER_LINES, stripTags, voiceUrl, type ExplainerLineId } from '../../board/voice-lines.ts';
import { beamerReport } from '../../lib/live.ts';
import { boardAudio } from './BoardCanvas.tsx';

interface Card {
  icon: string;
  title: string;
  items?: { icon: string; text: string; color?: string }[];
  steps?: string[];
  /** Vorführung: Antwort per Doppeltipp */
  tap?: boolean;
}

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
    void play(run, scene, () => stateRef.current, { setCard, setSubtitle, setStep })
      .then(() => beamerReport('beamer:explained', explainer.id))
      .catch((e: unknown) => {
        if (!(e instanceof Aborted)) console.warn('Erklärung abgebrochen', e);
      })
      .finally(() => cleanup(scene, setCard, setSubtitle));
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
              <div className="mt-5 grid grid-cols-2 gap-3">
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
          animate={o.k === 'B' ? { scale: [1, 0.9, 1, 0.9, 1.06, 1], opacity: 1 } : { scale: 1, opacity: 1 }}
          transition={o.k === 'B' ? { delay: 3.2, duration: 1.1, times: [0, 0.15, 0.3, 0.45, 0.7, 1] } : { delay: 0.3, type: 'spring', stiffness: 300, damping: 18 }}
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

function cleanup(scene: BoardScene, setCard: (c: Card | null) => void, setSubtitle: (s: string | null) => void) {
  setCard(null);
  setSubtitle(null);
  scene.stunts.syncVine(null);
  scene.pieces.removeDemo(DEMO_A);
  scene.pieces.removeDemo(DEMO_B);
  scene.stunts.stageOff();
  scene.inside?.highlight(null);
  scene.setView('island');
  scene.rig.endManual();
  scene.rig.set({ kind: 'overview', tour: true }, 0.8);
  // Figuren wieder an ihre Plätze
  const st = scene.state;
  if (st) scene.setState(st);
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

  // Sprachdateien vorab laden (Dauer für den Fall ohne Ton)
  await Promise.all(EXPLAINER_LINES.map(([id]) => boardAudio.prepare(voiceUrl(id))));
  run.check();

  let section = -1;
  /** Satz sprechen (ohne Ton: Untertitel so lange zeigen, wie das Vorlesen dauern würde). */
  const speak = async (id: ExplainerLineId) => {
    const text = EXPLAINER_LINES.find(([k]) => k === id)?.[1] ?? '';
    ui.setSubtitle(stripTags(text));
    const spoken = await boardAudio.say(voiceUrl(id), { interrupt: true });
    run.check();
    if (!spoken) await run.wait(Math.max(2500, stripTags(text).length * 62));
    await run.wait(250);
  };
  /** Ein Satz samt Vorführung: beide starten zugleich, weiter geht es, wenn beides fertig ist. */
  const beat = async (id: ExplainerLineId, demo?: () => Promise<unknown>) => {
    await Promise.all([speak(id), demo ? demo() : Promise.resolve()]);
    run.check();
  };
  const next = (c: Card | null) => {
    section += 1;
    ui.setStep(section);
    ui.setCard(c);
  };
  const shot = (sh: { position: THREE.Vector3; lookAt: THREE.Vector3 }, stiff = 1) => rig.set({ kind: 'focus', position: sh.position, lookAt: sh.lookAt }, stiff);
  const follow = (id: string, distance = 9, height = 6) => rig.set({ kind: 'follow', target: () => s.pieces.worldPos(id), distance, height }, 1.6);
  const place = (id: string, field: number, mode: Parameters<typeof s.pieces.setMode>[1] = 'idle') => {
    s.pieces.setInside(id, null);
    s.pieces.release(id, field, mode, false);
    const p = s.pieces.get(id);
    if (p) p.holder.visible = true;
  };

  // 1) Begrüßung über der Insel
  rig.set({ kind: 'overview' }, 0.9);
  next({ icon: '🏝️', title: 'Insel der Abenteuer' });
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
  s.pieces.addDemo(DEMO_A, { ...DEFAULT_FIGURE, hairStyle: 'spiky' }, 'blue', 'Die Papageien', 1);
  s.pieces.addDemo(DEMO_B, { ...DEFAULT_FIGURE, hairStyle: 'long', hairColor: 3 }, 'orange', 'Die Kokosnüsse', 1);
  shot(rig.portraitShot(s.pieces.worldPos(DEMO_A) ?? new THREE.Vector3(), 6), 1.4);
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
  shot(rig.volcanoShot(), 1);
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
  rig.set({ kind: 'overview' }, 0.9);
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
  ui.setCard({ icon: '👆', title: 'Doppelt tippen = eingeloggt', tap: true });
  await beat('ex_doubletap');
  ui.setCard({ icon: '🎮', title: 'Minispiele', items: [{ icon: '🎲', text: 'Spieler werden gezogen' }, { icon: '🙋', text: 'immer bereit sein!' }] });
  await beat('ex_minigames');

  // 7) Würfeln
  follow(DEMO_A, 8, 5);
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
    items: (['catapult_forward', 'catapult_backward', 'swap', 'barrier'] as FieldType[]).map((t) => ({ icon: FIELD_INFO[t].icon, text: FIELD_INFO[t].short, color: FIELD_INFO[t].color })),
  });
  // „Unterwegs warten Sonderfelder. Die Sprungfeder …“
  place(DEMO_A, Math.max(1, springField - 1));
  follow(DEMO_A, 12, 7);
  await beat('ex_spring', async () => {
    await s.pieces.walk(DEMO_A, Math.max(1, springField - 1), springField);
    run.check();
    await run.wait(700);
    follow(DEMO_A, 14, 8);
    await s.stunts.spring(DEMO_A);
    run.check();
    await s.pieces.fly(DEMO_A, Math.min(goal - 2, springField + 6), { height: 6, duration: 1.7, spin: Math.PI * 2 });
    run.check();
    boardAudio.play('land');
  });
  // „Das Flugzeug bringt euch leider wieder zurück.“
  place(DEMO_B, planeField);
  follow(DEMO_B, 14, 9);
  await beat('ex_plane', async () => {
    boardAudio.play('flugzeug', { volume: 0.7 });
    await s.stunts.plane(DEMO_B, Math.max(1, planeField - 5), '#f5a623');
  });
  // „Das UFO tauscht euren Platz …“
  place(DEMO_A, swapField);
  const posB = s.pieces.positionOf(DEMO_B);
  rig.set({ kind: 'follow', target: () => s.stunts.ufoTarget?.clone().setY(s.stunts.ufoTarget.y - 3) ?? s.pieces.worldPos(DEMO_A), distance: 15, height: 9 }, 2.8);
  await beat('ex_ufo', async () => {
    await s.stunts.ufoSwap(DEMO_A, DEMO_B, swapField, posB);
  });
  // „Und im Käfig sitzt ihr fest …“
  place(DEMO_A, cageField);
  shot(rig.fieldShot(cageField, 6, 3.5), 1.8);
  await beat('ex_cage', async () => {
    await run.wait(600);
    s.pieces.setMode(DEMO_A, 'stuck');
    await s.pieces.setCage(DEMO_A, true, () => boardAudio.play('kaefig'));
  });
  await s.pieces.setCage(DEMO_A, false);
  s.pieces.setMode(DEMO_A, 'idle');

  // 9) Minispiel-Feld und Vulkanfeld
  place(DEMO_A, gameField);
  shot(rig.fieldShot(gameField, 8, 5), 1.4);
  next({
    icon: '🎮',
    title: 'Minispiel- & Vulkanfelder',
    items: [
      { icon: FIELD_INFO.minigame.icon, text: 'Extra-Minispiel', color: FIELD_INFO.minigame.color },
      { icon: FIELD_INFO.volcano.icon, text: 'Vulkan heizt auf', color: FIELD_INFO.volcano.color },
    ],
  });
  s.stunts.stageOn(gameField);
  boardAudio.play('pfiff', { volume: 0.7 });
  await beat('ex_gamefield');
  s.stunts.stageOff();
  shot(rig.fieldShot(volcanoField, 9, 6, true), 1.6);
  await beat('ex_volcanofield', async () => {
    await run.wait(1700);
    s.stunts.geyser(volcanoField);
    boardAudio.play('lava');
  });

  // 10) Mutproben: Liane, Fässer oder Kisten, Lavahöhle, Totenkopf + Vulkan-Inneres, Krater
  next({
    icon: '💪',
    title: 'Mutproben',
    items: (['vine', 'river', 'cave', 'skull', 'crater'] as FieldType[]).map((t) => ({ icon: FIELD_INFO[t].icon, text: FIELD_INFO[t].label, color: FIELD_INFO[t].color })),
  });
  place(DEMO_A, vineField);
  shot(s.stunts.vineShot(), 1.4);
  // „An der Liane kommt keiner vorbei: Ihr schwingt über den Bach …“
  await beat('ex_vine', async () => {
    await run.wait(1600);
    boardAudio.play('liane');
    await s.stunts.vineGrab(DEMO_A);
    run.check();
    await run.wait(2200);
    const to = Math.min(goal - 1, vineField + 3);
    shot(s.stunts.swingShot(s.pieces.slotOn(DEMO_A, to)), 1.6);
    await s.stunts.vineSwing(DEMO_A, to);
  });
  // „Fässer oder Kisten? Eins davon hält, das andere bricht. Wer reinfällt, schwimmt rüber …“
  place(DEMO_B, riverBank);
  shot(s.stunts.riverShot(), 1.4);
  await beat('ex_river', async () => {
    await run.wait(900);
    await s.stunts.riverPonder(DEMO_B);
    run.check();
    await run.wait(600);
    await s.stunts.riverCross(DEMO_B, 'crates', 'fall', riverExit);
  });
  // „Vor der Lavahöhle braucht ihr eine Drei oder mehr. Sonst geht’s ab ins Innere …“
  place(DEMO_A, caveField);
  shot(rig.clearShot(s.pieces.slotOn(DEMO_A, caveField), 8, 5), 1.4);
  ui.setCard({ icon: '🦇', title: 'Lavahöhle', items: [{ icon: '🎲', text: `mind. ${caveNeed} würfeln` }, { icon: '🌋', text: 'sonst: ab ins Innere' }] });
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
  // „Genau wie auf den Totenkopf-Feldern. Da drin lauft ihr ein paar Straffelder …“
  ui.setCard({ icon: '💀', title: 'Vulkan-Inneres', items: [{ icon: '💀', text: 'Totenkopf-Feld' }, { icon: '🔥', text: 'Strafweg über Lava' }, { icon: '✨', text: `genau aufs Feld ${shout}: sofort raus` }, { icon: '🏝️', text: 'zurück, wo man fiel' }] });
  await beat('ex_skull', async () => {
    place(DEMO_B, skullField);
    shot(rig.clearShot(s.pieces.slotOn(DEMO_B, skullField), 7, 4.5), 2);
    await run.wait(900);
    await s.stunts.trapdoor(DEMO_B, skullField);
    run.check();
    if (!ins) {
      await s.stunts.warpOut(DEMO_B, skullField);
      return;
    }
    s.setView('inside');
    shot(ins.dropShot(), 3);
    rig.jump();
    await s.pieces.insideDrop(DEMO_B, ins.dropPoint);
    run.check();
    boardAudio.play('lavaplatsch');
    ins.lavaBurst(s.pieces.worldPos(DEMO_B) ?? ins.dropPoint);
    follow(DEMO_B, 9, 6);
    if (shout > 0) ins.highlight(shout, '#7dffa0');
    await s.pieces.insideWalk(DEMO_B, 0, Math.max(1, shout || 3), () => boardAudio.step(false));
    run.check();
    boardAudio.play('warp');
    ins.warpFlash(s.pieces.worldPos(DEMO_B) ?? ins.portal);
    await s.pieces.insideVanish(DEMO_B);
    run.check();
    ins.highlight(null);
    s.pieces.setInside(DEMO_B, null);
    s.setView('island');
    shot(rig.clearShot(s.pieces.slotOn(DEMO_B, skullField), 8, 5), 3);
    rig.jump();
    await s.stunts.warpOut(DEMO_B, skullField);
  });
  // „Und wer am Kraterloch zu kurz würfelt, rutscht hinein …“
  place(DEMO_A, s.layout.craterField);
  shot(rig.craterShot(), 1.4);
  ui.setCard({ icon: FIELD_INFO.crater.icon, title: 'Kraterloch', items: [{ icon: '🕳️', text: 'hineinrutschen' }, { icon: '🧗', text: 'Augen sammeln, rausklettern' }] });
  await beat('ex_crater', async () => {
    await run.wait(2200);
    boardAudio.play('fallen');
    await s.pieces.fallIntoCrater(DEMO_A);
    run.check();
    await run.wait(500);
    await s.pieces.climb(DEMO_A, 0.5);
  });

  // 11) Vulkanausbruch
  shot(rig.volcanoShot(), 1.1);
  next({ icon: '🌋', title: 'Achtung, Vulkan!', items: [{ icon: '🌡️', text: 'Druck steigt jede Runde' }, { icon: '💥', text: 'Ausbruch: alle zurück!' }] });
  await beat('ex_pressure', async () => {
    await run.wait(1500);
    boardAudio.play('rumble', { volume: 0.7 });
    s.rig.shake(0.2, 1.2);
  });
  await beat('ex_eruption', async () => {
    await run.wait(1200);
    boardAudio.play('vulkan');
    s.volcano.erupt();
    s.rig.shake(0.6, 2);
  });

  // 12) Schluss
  rig.set({ kind: 'overview' }, 0.9);
  next({ icon: '🎉', title: 'Viel Spaß!' });
  s.effects.confettiBurst(0, 14, 0, ['#ffd23f', '#ff6fb5', '#5fe0d8', '#ffffff'], 260, 1.4);
  boardAudio.play('applaus', { volume: 0.7, delay: 5 });
  await beat('explain_11');
  await run.wait(1200);
}
