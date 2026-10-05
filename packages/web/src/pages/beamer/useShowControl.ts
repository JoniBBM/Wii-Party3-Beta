/**
 * Fernsteuerung des Beamers durch die Regie (Beamer-Show): Grafikstufe (auch automatisch),
 * Ton und Musik, Kommentator, Kamera, Vollbild, Neu laden. Meldet Bildrate & Co. zurück.
 */
import { useEffect, useRef, useState } from 'react';
import type { GameState, RenderQuality } from '@insel/shared';
import type { MusicTrack } from '../../board/audio.ts';
import type { BoardScene } from '../../board/scene.ts';
import { beamerReport, onShowCommand, onShowTest, useLive } from '../../lib/live.ts';
import { boardAudio } from './BoardCanvas.tsx';
import { qualityOverride } from './prefs.ts';

const DOWN: Record<RenderQuality, RenderQuality | null> = { high: 'balanced', balanced: 'eco', eco: null };

/** Welche Musik zur Spielphase passt. */
function trackFor(state: GameState | null, explaining: boolean): { track: MusicTrack; loop?: boolean; then?: MusicTrack } {
  if (explaining || !state || state.status === 'lobby') return { track: 'lobby' };
  if (state.status === 'finished') return { track: 'finale', loop: false, then: 'lobby' };
  const p = state.phase;
  if (p.name === 'content' && p.content.stage !== 'revealed') return { track: 'spannung' };
  if (p.name === 'dice' && p.dice.fieldGame?.stage === 'running') return { track: 'spannung' };
  return { track: 'insel' };
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
  const autoLevel = useRef<RenderQuality>('high');

  // Ton freischalten: im Kiosk-Modus sofort, sonst beim ersten Klick/Tastendruck
  useEffect(() => {
    const tryUnlock = () =>
      void boardAudio.unlock().then(() => {
        setAudioReady(boardAudio.ready);
        if (useLive.getState().show.settings.fullscreen) void startFullscreen();
      });
    tryUnlock();
    window.addEventListener('pointerdown', tryUnlock);
    window.addEventListener('keydown', tryUnlock);
    return () => {
      window.removeEventListener('pointerdown', tryUnlock);
      window.removeEventListener('keydown', tryUnlock);
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
    scene.setTagsVisible(settings.tags);
    scene.rig.style = settings.camera;
    scene.director.reactions = settings.reactions;
  }, [scene, settings.commentary, settings.tags, settings.camera, settings.reactions]);

  // Grafikstufe (fest oder automatisch)
  useEffect(() => {
    if (!scene) return;
    if (settings.quality === 'auto') autoLevel.current = 'high';
    scene.setQuality(qualityOverride() ?? (settings.quality === 'auto' ? autoLevel.current : settings.quality));
  }, [scene, settings.quality]);

  // Freie Kamera melden
  useEffect(() => {
    if (!scene) return;
    scene.rig.onManualChange = (m) => setManual(m);
    return () => {
      scene.rig.onManualChange = null;
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
        width: Math.round(window.innerWidth * devicePixelRatio),
        height: Math.round(window.innerHeight * devicePixelRatio),
        audio: boardAudio.ready,
        fullscreen: !!document.fullscreenElement,
        manual: !!scene.rig.manual,
        explaining: s.explainer.running,
      });
    }, 2000);
    return () => clearInterval(id);
  }, [scene]);

  // Musik passend zur Phase
  const music = trackFor(state, explainer.running);
  useEffect(() => {
    boardAudio.setMusic(music.track, { loop: music.loop, then: music.then });
  }, [music.track, music.loop, music.then]);

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
        }
      }),
    [scene],
  );

  return { audioReady, fullscreen, manual, settings, explainer };
}
