/**
 * Spielerklärung auf dem Beamer: DiMario erklärt in gut zwei Minuten das Spiel, die Kamera
 * fährt zu den passenden Orten, Vorführ-Figuren zeigen Sprungfeder, Flugzeug, Käfig & Co.
 * Gestartet und gestoppt wird aus der Regie.
 */
import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import * as THREE from 'three';
import { DEFAULT_FIGURE, FIELD_INFO, islandLandmarks, type ExplainerState, type FieldType, type GameState } from '@insel/shared';
import type { BoardScene } from '../../board/scene.ts';
import { EXPLAINER_LINES, stripTags, voiceUrl } from '../../board/voice-lines.ts';
import { beamerReport } from '../../lib/live.ts';
import { boardAudio } from './BoardCanvas.tsx';

interface Card {
  icon: string;
  title: string;
  items?: { icon: string; text: string; color?: string }[];
  steps?: string[];
}

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
              {EXPLAINER_LINES.map((_, i) => (
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

function cleanup(scene: BoardScene, setCard: (c: Card | null) => void, setSubtitle: (s: string | null) => void) {
  setCard(null);
  setSubtitle(null);
  scene.pieces.removeDemo(DEMO_A);
  scene.pieces.removeDemo(DEMO_B);
  scene.stunts.stageOff();
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

/** Ablauf der Erklärung: je Abschnitt Kamera, Karte, Vorführung – und DiMario spricht. */
async function play(run: Run, s: BoardScene, getState: () => GameState | null, ui: Ui) {
  const rig = s.rig;
  rig.endManual();
  const goal = s.layout.fields.length - 1;
  const st = getState();
  const marks = islandLandmarks(goal);
  const springField = firstField(st, 'catapult_forward', 6);
  const planeField = firstField(st, 'catapult_backward', 14);
  const cageField = firstField(st, 'barrier', 10);
  const gameField = firstField(st, 'minigame', 18);
  const volcanoField = firstField(st, 'volcano', 30);
  const finalMin = st?.config.rules.winRule === 'final_roll' ? st.config.rules.finalRollMin : null;

  // Sprachdateien vorab laden (Dauer für den Fall ohne Ton)
  await Promise.all(EXPLAINER_LINES.map(([id]) => boardAudio.prepare(voiceUrl(id))));
  run.check();

  /** Abschnitt sprechen (ohne Ton: Untertitel so lange zeigen, wie das Vorlesen dauern würde). */
  const speak = async (i: number) => {
    const [id, text] = EXPLAINER_LINES[i]!;
    ui.setStep(i);
    ui.setSubtitle(stripTags(text));
    const spoken = await boardAudio.say(voiceUrl(id), { interrupt: true });
    run.check();
    if (!spoken) await run.wait(Math.max(4000, stripTags(text).length * 65));
    await run.wait(350);
  };
  const shot = (sh: { position: THREE.Vector3; lookAt: THREE.Vector3 }, stiff = 1) => rig.set({ kind: 'focus', position: sh.position, lookAt: sh.lookAt }, stiff);
  const follow = (id: string, distance = 9, height = 6) => rig.set({ kind: 'follow', target: () => s.pieces.worldPos(id), distance, height }, 1.6);
  const parallel = async (talk: Promise<void>, ...demos: Promise<unknown>[]) => {
    await Promise.all([talk, ...demos]);
  };

  // 1) Begrüßung über der Insel
  rig.set({ kind: 'overview' }, 0.9);
  ui.setCard({ icon: '🏝️', title: 'Insel der Abenteuer' });
  s.effects.confettiBurst(0, 12, 0, ['#ffd23f', '#ff6fb5', '#5fe0d8', '#ffffff'], 160, 1.2);
  await speak(0);

  // 2) Teams und Figuren – zwei Vorführ-Figuren am Start
  s.pieces.addDemo(DEMO_A, { ...DEFAULT_FIGURE, hairStyle: 'spiky' }, 'blue', 'Die Papageien', 1);
  s.pieces.addDemo(DEMO_B, { ...DEFAULT_FIGURE, hairStyle: 'long', hairColor: 3 }, 'orange', 'Die Kokosnüsse', 1);
  shot(rig.portraitShot(s.pieces.worldPos(DEMO_A) ?? new THREE.Vector3(), 6), 1.4);
  ui.setCard({
    icon: '👥',
    title: 'Teams',
    items: [
      { icon: '🎨', text: 'eigene Farbe', color: '#2f7de1' },
      { icon: '🧑‍🎤', text: 'eigene Figur', color: '#f5a623' },
      { icon: '✏️', text: 'eigener Name' },
      { icon: '📱', text: 'alles am Handy' },
    ],
  });
  s.pieces.setMode(DEMO_A, 'wave');
  s.pieces.setMode(DEMO_B, 'dance');
  await speak(1);
  s.pieces.setMode(DEMO_A, 'idle');
  s.pieces.setMode(DEMO_B, 'idle');

  // 3) Ziel: der Vulkangipfel
  shot(rig.volcanoShot(), 1);
  ui.setCard({
    icon: '🌋',
    title: 'Ziel: der Gipfel',
    items: [
      { icon: '⛰️', text: 'zuerst oben ankommen' },
      { icon: '🎲', text: finalMin ? `Siegeswurf: mind. ${finalMin}` : 'Ziel erreichen' },
    ],
  });
  await speak(2);

  // 4) Ablauf einer Runde
  rig.set({ kind: 'overview' }, 0.9);
  ui.setCard({ icon: '🔁', title: 'Jede Runde', steps: ['Minispiel oder Frage', 'Die Besten: Bonuswürfel', 'Alle würfeln und laufen'] });
  await speak(3);

  // 5) Fragen und Minispiele
  ui.setCard({
    icon: '🧠',
    title: 'Fragen & Minispiele',
    items: [
      { icon: '❓', text: 'Quizfragen' },
      { icon: '🎯', text: 'Schätzfragen' },
      { icon: '🔔', text: 'Buzzer-Runden' },
      { icon: '🎮', text: 'Minispiele' },
    ],
  });
  rig.set({ kind: 'overview', tour: true }, 0.9);
  await speak(4);

  // 6) Würfeln
  follow(DEMO_A, 8, 5);
  ui.setCard({ icon: '📱', title: 'Würfeln', items: [{ icon: '📳', text: 'Handy vibriert' }, { icon: '👆', text: 'tippen oder schütteln' }] });
  await parallel(
    speak(5),
    (async () => {
      await run.wait(2200);
      boardAudio.play('dice-shake', { volume: 0.8 });
      await s.dice.roll(4, 0, 0, () => boardAudio.play('dice-throw-1'));
      run.check();
      void s.dice.hide(0.6);
      await s.pieces.walk(DEMO_A, 1, 5);
    })(),
  );

  // 7) Sonderfelder: Feder, Flugzeug, UFO, Käfig
  ui.setCard({
    icon: '✨',
    title: 'Sonderfelder',
    items: (['catapult_forward', 'catapult_backward', 'swap', 'barrier'] as FieldType[]).map((t) => ({ icon: FIELD_INFO[t].icon, text: FIELD_INFO[t].short, color: FIELD_INFO[t].color })),
  });
  await parallel(
    speak(6),
    (async () => {
      // Sprungfeder
      await s.pieces.walk(DEMO_A, 5, springField);
      run.check();
      follow(DEMO_A, 13, 8);
      await s.stunts.spring(DEMO_A);
      run.check();
      await s.pieces.fly(DEMO_A, Math.min(goal - 2, springField + 6), { height: 6, duration: 1.7, spin: Math.PI * 2 });
      run.check();
      boardAudio.play('land');
      // Flugzeug holt Team Orange ab
      s.pieces.release(DEMO_B, planeField, 'idle', false);
      follow(DEMO_B, 14, 9);
      await run.wait(600);
      boardAudio.play('flugzeug', { volume: 0.7 });
      await s.stunts.plane(DEMO_B, Math.max(1, planeField - 5), '#f5a623');
      run.check();
      // Käfig
      s.pieces.release(DEMO_A, cageField, 'idle', false);
      shot(rig.fieldShot(cageField, 6, 3.5), 1.6);
      await run.wait(500);
      s.pieces.setMode(DEMO_A, 'stuck');
      await s.pieces.setCage(DEMO_A, true, () => boardAudio.play('kaefig'));
    })(),
  );
  await s.pieces.setCage(DEMO_A, false);
  s.pieces.setMode(DEMO_A, 'idle');

  // 8) Minispiel-Feld und Vulkanfeld
  s.pieces.release(DEMO_A, gameField, 'idle', false);
  shot(rig.fieldShot(gameField, 8, 5), 1.4);
  ui.setCard({
    icon: '🎮',
    title: 'Minispiel- & Vulkanfelder',
    items: [
      { icon: FIELD_INFO.minigame.icon, text: 'Extra-Minispiel', color: FIELD_INFO.minigame.color },
      { icon: FIELD_INFO.volcano.icon, text: 'Vulkan heizt auf', color: FIELD_INFO.volcano.color },
    ],
  });
  s.stunts.stageOn(gameField);
  boardAudio.play('pfiff', { volume: 0.7 });
  await parallel(
    speak(7),
    (async () => {
      await run.wait(5500);
      s.stunts.stageOff();
      shot(rig.fieldShot(volcanoField, 9, 6, true), 1.4);
      await run.wait(1400);
      s.stunts.geyser(volcanoField);
      boardAudio.play('lava');
    })(),
  );

  // 9) Besondere Orte: Liane, Fässer, Lavahöhle, Krater
  ui.setCard({
    icon: '🗺️',
    title: 'Besondere Orte',
    items: (['vine', 'river', 'cave', 'crater'] as FieldType[]).map((t) => ({ icon: FIELD_INFO[t].icon, text: FIELD_INFO[t].short, color: FIELD_INFO[t].color })),
  });
  await parallel(
    speak(8),
    (async () => {
      shot(s.stunts.vineShot(), 1.2);
      await run.wait(5200);
      shot(rig.fieldShot(marks.river[0] ?? 20, 7, 4.5), 1.2);
      await run.wait(5600);
      shot(rig.fieldShot(marks.cave[0] ?? 40, 9, 5, true), 1.2);
      await run.wait(4200);
      shot(rig.craterShot(), 1.2);
    })(),
  );

  // 10) Vulkanausbruch
  shot(rig.volcanoShot(), 1.1);
  ui.setCard({ icon: '🌋', title: 'Achtung, Vulkan!', items: [{ icon: '🌡️', text: 'Druck steigt jede Runde' }, { icon: '💥', text: 'Ausbruch: alle zurück!' }] });
  await parallel(
    speak(9),
    (async () => {
      await run.wait(5600);
      boardAudio.play('vulkan');
      s.volcano.erupt();
      s.rig.shake(0.6, 2);
    })(),
  );

  // 11) Schluss
  rig.set({ kind: 'overview' }, 0.9);
  ui.setCard({ icon: '🎉', title: 'Viel Spaß!' });
  s.effects.confettiBurst(0, 14, 0, ['#ffd23f', '#ff6fb5', '#5fe0d8', '#ffffff'], 260, 1.4);
  boardAudio.play('applaus', { volume: 0.7, delay: 5 });
  await speak(10);
  await run.wait(1200);
}
