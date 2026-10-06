/**
 * Entwickler-Vorschau für das Vulkan-Innere (inside-preview.html, nur im Dev-Server).
 * Gleicher Renderer und gleiche Nachbearbeitung wie der Beamer.
 *   ?shot=overview|plate3|portal|drop   Kameraeinstellung (plateN für ein beliebiges Feld)
 *   ?quality=eco|balanced|high|ultra
 *   ?length=9&shout=4                  Route
 *   ?figs=0                            ohne Figuren (Zeichenaufrufe der reinen Szene)
 *   ?fx=burst|warp                     Effekt alle 3 Sekunden auslösen
 *   ?hud=0                             ohne Messwerte
 * Messwerte stehen zusätzlich in window.__inside.
 */
import * as THREE from 'three';
import { BloomEffect, EffectComposer, EffectPass, RenderPass, SMAAEffect, ToneMappingEffect, ToneMappingMode, VignetteEffect } from 'postprocessing';
import { DEFAULT_FIGURE, type TeamColorKey } from '@insel/shared';
import { VolcanoInside, type InsideQuality } from '../board/inside.ts';
import { createFigure, type FigureMode, type FigureRig } from '../figure/figure3d.ts';

const params = new URLSearchParams(location.search);
const shot = params.get('shot') ?? 'overview';
const quality = (params.get('quality') ?? 'high') as InsideQuality;
const length = Number(params.get('length') ?? 9);
const shout = Number(params.get('shout') ?? 4);
const withFigs = params.get('figs') !== '0';
const fx = params.get('fx');
const hud = document.getElementById('hud')!;
if (params.get('hud') === '0') hud.style.display = 'none';

const PIXEL_RATIO: Record<InsideQuality, number> = { ultra: 2, high: 2, balanced: 1.25, eco: 1 };

const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', stencil: false, depth: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, PIXEL_RATIO[quality]));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.shadowMap.autoUpdate = false;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.NoToneMapping;
renderer.info.autoReset = false;
document.body.appendChild(renderer.domElement);

const camera = new THREE.PerspectiveCamera(42, 1, 0.5, 600);
const inside = new VolcanoInside({ length, shout, quality });

// ---- Figuren --------------------------------------------------------------
const rigs: FigureRig[] = [];
function addFigure(color: TeamColorKey, pos: THREE.Vector3, yaw: number, mode: FigureMode = 'idle') {
  const rig = createFigure(DEFAULT_FIGURE, color);
  rig.root.scale.setScalar(0.85);
  const holder = new THREE.Group();
  holder.add(rig.root);
  holder.position.copy(pos);
  holder.rotation.y = yaw;
  rig.setMode(mode);
  inside.scene.add(holder);
  rigs.push(rig);
  return holder;
}

const last = Math.max(3, Math.min(20, Math.round(length)));
let view = inside.overviewShot();
const plateMatch = /^plate(\d+)$/.exec(shot);
if (plateMatch) view = inside.plateShot(Number(plateMatch[1]));
else if (shot === 'portal') view = inside.portalShot();
else if (shot === 'drop') view = inside.dropShot();

if (withFigs) {
  const focus = plateMatch ? Math.min(last, Number(plateMatch[1])) : 3;
  addFigure('red', inside.spot(focus, 0, 2), inside.facing(focus));
  addFigure('blue', inside.spot(focus, 1, 2), inside.facing(focus), 'wave');
  addFigure('green', inside.spot(Math.min(last, focus + 2), 0, 1), inside.facing(Math.min(last, focus + 2)), 'cheer');
  if (shot === 'portal') addFigure('yellow', inside.spot(last, 0, 1), inside.facing(last), 'cheer');
  if (shot === 'drop') {
    // fällt gerade herein (kurz vor der Landung)
    const a = inside.dropPoint.clone();
    const b = inside.spot(0, 0, 1);
    addFigure('purple', a.lerp(b, 0.82), inside.facing(0), 'fly');
    addFigure('orange', inside.spot(0, 1, 2), inside.facing(0), 'shock');
  }
  inside.highlight(focus, '#e8423f');
}

camera.position.copy(view.position);
camera.lookAt(view.lookAt);

// ---- Nachbearbeitung wie im Beamer ----------------------------------------
const composer = new EffectComposer(renderer, { frameBufferType: THREE.HalfFloatType, multisampling: 0 });
composer.addPass(new RenderPass(inside.scene, camera));
const effects: ConstructorParameters<typeof EffectPass>[1][] = [];
if (quality !== 'eco') effects.push(new BloomEffect({ luminanceThreshold: 0.92, luminanceSmoothing: 0.2, intensity: 0.9, mipmapBlur: true, radius: 0.7 }));
effects.push(new VignetteEffect({ offset: 0.32, darkness: 0.38 }), new ToneMappingEffect({ mode: ToneMappingMode.ACES_FILMIC }));
composer.addPass(new EffectPass(camera, ...effects));
composer.addPass(new EffectPass(camera, new SMAAEffect()));

function resize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h, false);
  composer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  inside.setViewport(h * renderer.getPixelRatio());
}
window.addEventListener('resize', resize);
resize();

// ---- Schleife & Messwerte -------------------------------------------------
const stats = { calls: 0, triangles: 0, fps: 0, frames: 0, quality, shot };
(window as unknown as { __inside: unknown }).__inside = { stats, inside, renderer, camera };
const timer = new THREE.Timer();
timer.connect(document);
let fpsFrames = 0;
let fpsSince = performance.now();
let nextFx = 1.5;

function loop(now?: number) {
  requestAnimationFrame(loop);
  timer.update(now);
  const dt = Math.min(0.05, timer.getDelta());
  const t = timer.getElapsed();
  inside.update(t, dt, camera);
  for (const r of rigs) r.update(t, dt);
  if (fx && t > nextFx) {
    nextFx = t + 3;
    if (fx === 'burst') inside.lavaBurst(inside.spot(0));
    else if (fx === 'warp') inside.warpFlash(inside.portal);
  }
  renderer.shadowMap.needsUpdate = true;
  renderer.info.reset();
  composer.render(dt);
  stats.calls = renderer.info.render.calls;
  stats.triangles = renderer.info.render.triangles;
  stats.frames++;
  fpsFrames++;
  const ms = performance.now();
  if (ms - fpsSince >= 1000) {
    stats.fps = Math.round((fpsFrames * 1000) / (ms - fpsSince));
    fpsFrames = 0;
    fpsSince = ms;
    hud.textContent = `${shot} · ${quality} · ${stats.fps} fps · ${stats.calls} Zeichenaufrufe · ${(stats.triangles / 1000).toFixed(0)}k Dreiecke`;
    console.info('[inside]', JSON.stringify(stats));
  }
}
loop();
