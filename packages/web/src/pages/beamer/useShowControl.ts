/**
 * Fernsteuerung des Beamers durch die Regie (Beamer-Show): Grafikstufe (auch automatisch),
 * Ton und Musik, Kommentator, Kamera, Vollbild, Neu laden. Meldet Bildrate & Co. zurück.
 */
import { useEffect, useRef, useState } from 'react';
import { effectiveChatter, musicTracksFor, parseShow, type GameState, type MusicMood, type RenderQuality, type ShowSettings, type Theme } from '@insel/shared';
import type { MusicTrack } from '../../board/audio.ts';
import type { BoardScene } from '../../board/scene.ts';
import { beamerReport, onShowCommand, onShowTest, useLive } from '../../lib/live.ts';
import { boardAudio } from './BoardCanvas.tsx';
import { qualityOverride } from './prefs.ts';

const DOWN: Record<RenderQuality, RenderQuality | null> = { ultra: 'high', high: 'balanced', balanced: 'eco', eco: null };

/** Welche Stimmung zur Spielphase passt. */
function moodFor(state: GameState | null, explaining: boolean, insideView: boolean): MusicMood {
  if (explaining || !state || state.status === 'lobby') return 'lobby';
  if (state.status === 'finished') return 'finale';
  if (insideView) return 'vulkan';
  const p = state.phase;
  if (p.name === 'content' && p.content.stage !== 'revealed') return 'spannung';
  if (p.name === 'dice' && p.dice.fieldGame?.stage === 'running') return 'spannung';
  return 'insel';
}

/**
 * Musik-Wunsch aus Phase und Regie-Einstellung (festes Stück oder automatisch, rotierend).
 * Automatisch spielen nur Stücke der eigenen Welt (Blockwelt: eigene, sonst die der Insel).
 */
function musicFor(settings: ShowSettings, mood: MusicMood, world: Theme): { list: MusicTrack[]; loop: boolean; rotate: boolean; then?: MusicTrack } {
  const tracksOf = (m: MusicMood): MusicTrack[] => musicTracksFor(m, world);
  if (mood === 'finale') return { list: tracksOf('finale'), loop: false, rotate: true, then: tracksOf('lobby')[0] };
  if (settings.musicTrack !== 'auto') return { list: [settings.musicTrack], loop: true, rotate: false };
  return { list: tracksOf(mood), loop: true, rotate: settings.musicRotate };
}

export function startFullscreen() {
  if (document.fullscreenElement) return Promise.resolve(true);
  return (document.documentElement.requestFullscreen?.() ?? Promise.reject())
    .then(() => true)
    .catch(() => false);
}

export function useShowControl(scene: BoardScene | null, state: GameState | null) {
  const settings = useLive((s) => s.show.settings);
  const explainer = useLive((s) => s.show.explainer);
  const [audioReady, setAudioReady] = useState(false);
  const [fullscreen, setFullscreen] = useState(!!document.fullscreenElement);
  const [manual, setManual] = useState(false);
  const [insideView, setInsideView] = useState(false);
  const autoLevel = useRef<RenderQuality>('high');

  // Ton freischalten: im Kiosk-Modus sofort, sonst beim ersten Klick/Tastendruck.
  // Vollbild nur per Mausklick/Touch (nicht bei Tasten – die steuern die Kamera).
  useEffect(() => {
    const unlock = () => void boardAudio.unlock().then(() => setAudioReady(boardAudio.ready));
    const onPointer = () => {
      unlock();
      if (useLive.getState().show.settings.fullscreen) void startFullscreen();
    };
    unlock();
    window.addEventListener('pointerdown', onPointer);
    window.addEventListener('keydown', unlock);
    return () => {
      window.removeEventListener('pointerdown', onPointer);
      window.removeEventListener('keydown', unlock);
    };
  }, []);

  // Vollbild an/aus aus der Regie
  useEffect(() => {
    const onChange = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onChange);
    if (settings.fullscreen) void startFullscreen();
    else if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, [settings.fullscreen]);

  // Lautstärken, Kommentator, Namensschilder, Kamera-Stil, Reaktionen
  useEffect(() => boardAudio.setLevels(settings), [settings]);
  useEffect(() => {
    if (!scene) return;
    scene.commentator.level = settings.commentary;
    scene.commentator.chatter = effectiveChatter(settings);
    scene.setTagsVisible(settings.tags);
    scene.rig.style = settings.camera;
    scene.director.reactions = settings.reactions;
  }, [scene, settings.commentary, settings.crazyChatter, settings.tags, settings.camera, settings.reactions]);
  // Während der Spielerklärung: Kommentator still, Kamera gesperrt (Maus, Trackpad, Fernsteuerung)
  useEffect(() => {
    if (!scene) return;
    scene.commentator.paused = explainer.running;
    if (explainer.running) scene.rig.endManual();
    scene.rig.locked = explainer.running;
  }, [scene, explainer.running]);

  // Grafikstufe (fest oder automatisch)
  useEffect(() => {
    if (!scene) return;
    if (settings.quality === 'auto') autoLevel.current = 'high';
    scene.setQuality(qualityOverride() ?? (settings.quality === 'auto' ? autoLevel.current : settings.quality));
  }, [scene, settings.quality]);
  useEffect(() => scene?.setResolution(settings.resolution), [scene, settings.resolution]);
  useEffect(() => {
    // zum Ausprobieren: ?weather=snow&season=winter&festive=christmas
    const q = new URLSearchParams(window.location.search);
    const parsed = parseShow({ ...settings, weather: q.get('weather') ?? settings.weather, season: q.get('season') ?? settings.season, festive: q.get('festive') ?? settings.festive });
    scene?.setAtmosphereSettings(parsed);
  }, [scene, settings]);

  // Freie Kamera melden; Ansicht Vulkan-Inneres (für die Musik)
  useEffect(() => {
    if (!scene) return;
    scene.rig.onManualChange = (m) => setManual(m);
    scene.onViewChange = (v) => setInsideView(v === 'inside');
    return () => {
      scene.rig.onManualChange = null;
      scene.onViewChange = null;
    };
  }, [scene]);

  // Automatik herunterschalten + Rückmeldung an die Regie
  useEffect(() => {
    if (!scene) return;
    let low = 0;
    let cooldown = performance.now() + 7000;
    const id = window.setInterval(() => {
      const s = useLive.getState().show;
      if (s.settings.quality === 'auto' && !qualityOverride() && !document.hidden && performance.now() > cooldown) {
        low = scene.fps < 40 ? low + 1 : 0;
        const next = DOWN[scene.quality];
        if (low >= 2 && next) {
          autoLevel.current = next;
          scene.setQuality(next);
          cooldown = performance.now() + 9000;
          low = 0;
        }
      }
      beamerReport('beamer:stats', {
        fps: Math.round(scene.fps),
        quality: scene.quality,
        width: scene.renderSize.width,
        height: scene.renderSize.height,
        audio: boardAudio.ready,
        fullscreen: !!document.fullscreenElement,
        manual: !!scene.rig.manual,
        explaining: s.explainer.running,
        view: scene.view,
        busy: scene.director.busy,
      });
    }, 2000);
    return () => clearInterval(id);
  }, [scene]);

  // Musik passend zur Phase (oder fest gewählt), auf Wunsch rotierend
  const music = musicFor(settings, moodFor(state, explainer.running, insideView), state?.config.theme ?? 'island');
  const musicKey = `${music.list.join('|')}|${music.loop}|${music.rotate}`;
  useEffect(() => {
    // Finale: aus der Liste ein Stück zufällig, einmal
    const list = music.loop ? music.list : [music.list[Math.floor(Math.random() * music.list.length)]!];
    boardAudio.setMusic(list, { loop: music.loop, rotate: music.rotate, then: music.then });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [musicKey]);

  // Kommentator: Spielstart und Begrüßung in der Lobby
  const status = state?.status ?? null;
  const prevStatus = useRef(status);
  useEffect(() => {
    if (!scene || !audioReady) return;
    if (prevStatus.current === 'lobby' && status === 'running') scene.commentator.comment('start', { force: true });
    prevStatus.current = status;
    if (status !== 'lobby' && status !== null) return;
    scene.commentator.comment('lobby', { delay: 1500 });
    const id = window.setInterval(() => scene.commentator.comment('lobby'), 4 * 60_000);
    return () => clearInterval(id);
  }, [scene, status, audioReady]);

  // Testtöne und Fernbefehle
  useEffect(
    () =>
      onShowTest((what) => {
        if (what === 'sound') boardAudio.play('zauber');
        else if (what === 'voice') scene?.commentator.comment('happy', { force: true });
        else boardAudio.play('jingle-good');
      }),
    [scene],
  );
  useEffect(
    () =>
      onShowCommand((cmd) => {
        if (cmd.type === 'reload') {
          window.location.reload();
          return;
        }
        if (cmd.type === 'speak') {
          // Frage nochmal vorlesen (nur mit Sprachaufnahme)
          const st = useLive.getState().state;
          const url = st?.phase.name === 'content' ? st.phase.content.item.audioUrl : null;
          if (url) void boardAudio.say(url, { interrupt: true });
          return;
        }
        if (!scene) return;
        const rig = scene.rig;
        const HOLD = 60;
        switch (cmd.action) {
          case 'auto':
            rig.endManual();
            break;
          case 'overview':
            rig.manualShot(rig.hero(), HOLD);
            break;
          case 'volcano':
            rig.manualShot(rig.volcanoShot(), HOLD);
            break;
          case 'start':
            rig.manualShot(rig.fieldShot(0, 12, 8), HOLD);
            break;
          case 'goal':
            rig.manualShot(rig.fieldShot(scene.layout.fields.length - 1, 12, 7, true), HOLD);
            break;
          case 'team': {
            const pos = cmd.teamId ? scene.pieces.worldPos(cmd.teamId) : null;
            if (pos) rig.manualShot(rig.portraitShot(pos, 7), HOLD);
            break;
          }
          case 'nudge':
            rig.nudge({ yaw: cmd.yaw, pitch: cmd.pitch, zoom: cmd.zoom, panX: cmd.panX, panZ: cmd.panZ }, HOLD);
            break;
          case 'inside':
          case 'island':
            void scene.visit(cmd.action);
            break;
        }
      }),
    [scene],
  );

  return { audioReady, fullscreen, manual, settings, explainer };
}
