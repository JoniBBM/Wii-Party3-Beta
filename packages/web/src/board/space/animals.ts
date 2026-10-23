/**
 * Bewohner des Alien-Planeten: kleine Aliens (watscheln mit Stielaugen bzw. hüpfen als Zyklopen mit
 * Leuchtfühlern), Kristallkäfer mit leuchtendem Rücken, schwebende Roboter-Drohnen, rochenartige
 * Gleiter hoch über Land und Meer und Plasma-Quallen im Meer. Alles selbst gebaute Low-Poly-Geometrie,
 * je Wesen zu einem Netz zusammengefasst (Leuchtteile über ein eigenes Attribut, ein Zeichenaufruf).
 *
 * Ruhig wie die Inseltiere (siehe ../sight.ts): eigene Uhr mit begrenztem Zeitschritt, Drehung
 * begrenzt, Höhe weich nachgeführt, Wege nur über freies Gelände; ein festgefahrenes Wesen wird
 * nur dann nach Hause versetzt, wenn die Kamera weder die alte noch die neue Stelle sieht.
 * Flieger und Quallen folgen glatten Bahnen (Funktion der Uhr) – im Bild springt und ploppt nichts.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { VOLCANO } from '@insel/shared';
import type { AnimalWorld } from '../animals.ts';
import type { IslandLayout } from '../layout.ts';
import { rand } from '../noise.ts';
import { CameraSight } from '../sight.ts';
import type { Heightfield } from '../terrain.ts';
import { inCorridor, stuntCorridors } from '../views.ts';

export interface SpaceAnimalOptions {
  layout: IslandLayout;
  field: Heightfield;
  /** Bodenhöhe der Welt an (x, z) */
  groundAt: (x: number, z: number) => number;
  /** Hindernisse (Kristalle, Gebäude) als Kreise in der Ebene */
  blockers: { x: number; z: number; r: number; top: number }[];
  camera?: THREE.Camera;
}

// ---------------------------------------------------------------------------
// Bausteine: Teile mit Farbe (und Leuchten) zu einer Geometrie zusammenfassen
// ---------------------------------------------------------------------------
interface Part {
  g: THREE.BufferGeometry;
  c: THREE.ColorRepresentation;
  m?: THREE.Matrix4;
  /** Leuchten (0 = matt, ~2 = kräftig, wird vom Bloom aufgegriffen) */
  glow?: number;
}

const tq = new THREE.Quaternion();
const te = new THREE.Euler();
/** Lage eines Teils: Ort, Drehung (x, y, z), Größe */
function M(x: number, y: number, z: number, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx) {
  return new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), tq.setFromEuler(te.set(rx, ry, rz)), new THREE.Vector3(sx, sy, sz));
}

/** Stab von a nach b (Zylinder, Radius r0 bei a, r1 bei b) */
function rod(a: THREE.Vector3, b: THREE.Vector3, r0: number, r1: number, c: THREE.ColorRepresentation): Part {
  const d = b.clone().sub(a);
  const m = new THREE.Matrix4().compose(a.clone().lerp(b, 0.5), new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.clone().normalize()), new THREE.Vector3(1, 1, 1));
  return { g: new THREE.CylinderGeometry(r1, r0, d.length(), 5), c, m };
}

function bake(parts: Part[]): THREE.BufferGeometry {
  const list: THREE.BufferGeometry[] = [];
  const c = new THREE.Color();
  for (const p of parts) {
    const g = p.g.index ? p.g.toNonIndexed() : p.g.clone();
    p.g.dispose();
    for (const n of Object.keys(g.attributes)) if (n !== 'position' && n !== 'normal') g.deleteAttribute(n);
    if (p.m) g.applyMatrix4(p.m);
    const n = g.getAttribute('position').count;
    const col = new Float32Array(n * 3);
    const glow = new Float32Array(n).fill(p.glow ?? 0);
    c.set(p.c);
    for (let i = 0; i < n; i++) col.set([c.r, c.g, c.b], i * 3);
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setAttribute('aGlow', new THREE.BufferAttribute(glow, 1));
    list.push(g);
  }
  const out = mergeGeometries(list, false)!;
  for (const g of list) g.dispose();
  out.computeBoundingSphere();
  return out;
}

/** Bonbonfarbenes Material mit Leuchtteilen (Attribut aGlow → Eigenleuchten in der Teilfarbe) */
function creatureMaterial(opts: { transparent?: boolean; opacity?: number } = {}) {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.05, flatShading: true, transparent: !!opts.transparent, opacity: opts.opacity ?? 1 });
  if (opts.transparent) m.depthWrite = false;
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aGlow;\nvarying float vGlow;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGlow = aGlow;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vGlow;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * vGlow;');
  };
  m.customProgramCacheKey = () => 'space-creature';
  return m;
}

// ---------------------------------------------------------------------------
// Modelle
// ---------------------------------------------------------------------------
const ALIEN_COLORS = [
  { main: '#7be04a', belly: '#dcffa8', dark: '#3f8a25' },
  { main: '#ff6fb5', belly: '#ffd6ea', dark: '#b8346f' },
  { main: '#3fd9d0', belly: '#cbfff7', dark: '#1d8580' },
  { main: '#ffa53d', belly: '#ffe3b8', dark: '#bf6418' },
  { main: '#a77bff', belly: '#e8dcff', dark: '#5a3bb0' },
];
const INK = '#1c1430';

/** Kleines Alien (Fuß bei y = 0, schaut nach +z): Stielaugen oder Zyklop mit Leuchtfühlern */
function alienGeo(kind: 'stalk' | 'cyclops', col: (typeof ALIEN_COLORS)[number]) {
  const parts: Part[] = [
    { g: new THREE.SphereGeometry(0.27, 10, 8), c: col.main, m: M(0, 0.3, 0, 0, 0, 0, 1, 0.92, 0.95) },
    { g: new THREE.SphereGeometry(0.2, 8, 6), c: col.belly, m: M(0, 0.25, 0.115, 0, 0, 0, 0.9, 0.85, 0.55) },
  ];
  for (const s of [-1, 1]) {
    parts.push({ g: new THREE.SphereGeometry(0.09, 7, 5), c: col.dark, m: M(s * 0.12, 0.045, 0.05, 0, 0, 0, 1, 0.55, 1.4) });
    parts.push({ g: new THREE.SphereGeometry(0.07, 6, 5), c: col.main, m: M(s * 0.265, 0.27, 0.03, 0, 0, s * 0.5, 0.8, 1.25, 0.8) });
  }
  if (kind === 'stalk') {
    for (const s of [-1, 1]) {
      parts.push({ g: new THREE.CylinderGeometry(0.022, 0.03, 0.26, 6), c: col.main, m: M(s * 0.085, 0.63, 0, 0, 0, -s * 0.28) });
      parts.push({ g: new THREE.SphereGeometry(0.085, 9, 7), c: '#ffffff', m: M(s * 0.125, 0.775, 0.015) });
      parts.push({ g: new THREE.SphereGeometry(0.042, 7, 5), c: INK, m: M(s * 0.125, 0.78, 0.075, 0, 0, 0, 1, 1, 0.75) });
      parts.push({ g: new THREE.SphereGeometry(0.014, 5, 4), c: '#ffffff', m: M(s * 0.11, 0.8, 0.11), glow: 1 });
    }
    parts.push({ g: new THREE.TorusGeometry(0.06, 0.014, 4, 10, Math.PI), c: '#3a1030', m: M(0, 0.33, 0.252, 0, 0, Math.PI) });
  } else {
    parts.push({ g: new THREE.SphereGeometry(0.125, 11, 8), c: '#ffffff', m: M(0, 0.42, 0.16, 0, 0, 0, 1, 1, 0.62) });
    parts.push({ g: new THREE.SphereGeometry(0.058, 8, 6), c: INK, m: M(0, 0.43, 0.225, 0, 0, 0, 1, 1, 0.5) });
    parts.push({ g: new THREE.SphereGeometry(0.018, 5, 4), c: '#ffffff', m: M(-0.022, 0.455, 0.25), glow: 1 });
    parts.push({ g: new THREE.TorusGeometry(0.045, 0.012, 4, 10, Math.PI), c: '#3a1030', m: M(0, 0.255, 0.235, -0.25, 0, Math.PI) });
    for (const s of [-1, 1]) {
      parts.push({ g: new THREE.CylinderGeometry(0.012, 0.016, 0.24, 5), c: col.dark, m: M(s * 0.1, 0.63, -0.03, 0, 0, -s * 0.35) });
      parts.push({ g: new THREE.SphereGeometry(0.045, 7, 5), c: '#ffe95c', m: M(s * 0.142, 0.745, -0.03), glow: 2.4 });
    }
  }
  return bake(parts);
}

const BEETLE_GLOW = ['#5ff4ff', '#ff6ff0', '#ffd84a', '#8cff6a'];
/** Kristallkäfer (≈ 0,4 m lang): dunkler Panzer, Beinchen, leuchtende Kristalle auf dem Rücken */
function beetleGeo(glow: string) {
  const shell = '#3b2a63';
  const parts: Part[] = [
    { g: new THREE.SphereGeometry(0.16, 9, 6), c: shell, m: M(0, 0.12, -0.02, 0, 0, 0, 0.95, 0.6, 1.25) },
    { g: new THREE.SphereGeometry(0.08, 7, 5), c: '#4a3a7a', m: M(0, 0.1, 0.19, 0, 0, 0, 1, 0.8, 0.9) },
    { g: new THREE.SphereGeometry(0.03, 5, 4), c: '#ffffff', m: M(-0.045, 0.13, 0.25), glow: 0.6 },
    { g: new THREE.SphereGeometry(0.03, 5, 4), c: '#ffffff', m: M(0.045, 0.13, 0.25), glow: 0.6 },
  ];
  for (const s of [-1, 1])
    for (const k of [-1, 0, 1]) {
      parts.push({ g: new THREE.CylinderGeometry(0.012, 0.012, 0.17, 4), c: '#241a40', m: M(s * 0.15, 0.06, k * 0.09, k * 0.35, 0, s * 1.05) });
    }
  // Kristalle: schlanke Spitzen in Reihe auf dem Panzer
  for (const [x, z, h, rz, rx] of [
    [0, -0.02, 0.2, 0, -0.1],
    [-0.06, 0.06, 0.13, 0.35, 0.2],
    [0.06, -0.08, 0.14, -0.4, -0.25],
    [0.05, 0.07, 0.1, -0.35, 0.3],
  ] as const) {
    parts.push({ g: new THREE.OctahedronGeometry(1, 0), c: glow, m: M(x, 0.19 + h * 0.3, z, rx, 0.4, rz, 0.045, h * 0.6, 0.045), glow: 1.6 });
  }
  return bake(parts);
}

/** Roboter-Drohne (Mitte bei y = 0): runder Körper, Leuchtvisier, Antenne, Düsenring unten */
function droneGeo(accent: string) {
  const parts: Part[] = [
    { g: new THREE.SphereGeometry(0.27, 12, 9), c: '#eef2f8', m: M(0, 0, 0, 0, 0, 0, 1, 0.82, 1) },
    { g: new THREE.TorusGeometry(0.265, 0.045, 6, 18), c: accent, m: M(0, -0.03, 0, Math.PI / 2) },
    // Visier nach vorn (+z) mit zwei Leuchtaugen
    { g: new THREE.SphereGeometry(0.16, 12, 6, Math.PI / 2 - 0.85, 1.7, 1.05, 0.75), c: '#2fd8ee', m: M(0, 0.06, 0.125), glow: 1.4 },
    { g: new THREE.SphereGeometry(0.032, 6, 5), c: '#ffffff', m: M(-0.055, 0.075, 0.282, 0, 0, 0, 1, 1.3, 0.6), glow: 2.2 },
    { g: new THREE.SphereGeometry(0.032, 6, 5), c: '#ffffff', m: M(0.055, 0.075, 0.282, 0, 0, 0, 1, 1.3, 0.6), glow: 2.2 },
    { g: new THREE.CylinderGeometry(0.012, 0.012, 0.22, 4), c: '#5b6270', m: M(0.1, 0.3, -0.05, 0, 0, -0.25) },
    { g: new THREE.SphereGeometry(0.03, 6, 4), c: '#ff5a6a', m: M(0.128, 0.41, -0.05), glow: 2.4 },
    { g: new THREE.CylinderGeometry(0.03, 0.03, 0.08, 6), c: '#5b6270', m: M(0, 0.25, 0) },
    { g: new THREE.CylinderGeometry(0.12, 0.08, 0.06, 12), c: '#7d8594', m: M(0, -0.22, 0) },
    { g: new THREE.CircleGeometry(0.075, 12), c: '#7ffcff', m: M(0, -0.252, 0, Math.PI / 2), glow: 2.6 },
  ];
  for (const s of [-1, 1]) parts.push({ g: new THREE.BoxGeometry(0.1, 0.04, 0.16), c: accent, m: M(s * 0.28, 0.02, -0.02, 0, 0, s * 0.3) });
  return bake(parts);
}

function rotorGeo() {
  return bake([
    { g: new THREE.BoxGeometry(0.5, 0.012, 0.05), c: '#3a404c' },
    { g: new THREE.BoxGeometry(0.05, 0.012, 0.5), c: '#3a404c' },
    { g: new THREE.SphereGeometry(0.035, 6, 4), c: '#ffcf3a', glow: 0.8 },
  ]);
}

/** Rumpf des Gleiters (Spannweite gut 2 m mit den Flügeln), Kopf nach +z */
function gliderBodyGeo(skin: string, spot: string) {
  return bake([
    { g: new THREE.SphereGeometry(0.3, 10, 7), c: skin, m: M(0, 0, 0, 0, 0, 0, 1.1, 0.42, 1.9) },
    { g: new THREE.ConeGeometry(0.05, 1.1, 5), c: skin, m: M(0, 0, -0.95, -Math.PI / 2) },
    { g: new THREE.SphereGeometry(0.035, 6, 4), c: spot, m: M(0, 0.01, -1.48), glow: 2.2 },
    { g: new THREE.SphereGeometry(0.05, 6, 5), c: '#ffffff', m: M(-0.13, 0.06, 0.45), glow: 0.5 },
    { g: new THREE.SphereGeometry(0.05, 6, 5), c: '#ffffff', m: M(0.13, 0.06, 0.45), glow: 0.5 },
    { g: new THREE.SphereGeometry(0.025, 5, 4), c: INK, m: M(-0.14, 0.07, 0.49) },
    { g: new THREE.SphereGeometry(0.025, 5, 4), c: INK, m: M(0.14, 0.07, 0.49) },
    { g: new THREE.SphereGeometry(0.06, 6, 4), c: spot, m: M(0, 0.11, 0.05, 0, 0, 0, 1, 0.5, 1), glow: 1.8 },
    { g: new THREE.SphereGeometry(0.045, 6, 4), c: spot, m: M(0, 0.1, -0.22, 0, 0, 0, 1, 0.5, 1), glow: 1.8 },
  ]);
}

type V3 = [number, number, number];
/** Flügel (rechts, +x): flaches Dreieck mit Wölbung und Leuchtpunkten; Gelenk bei x = 0 */
function wingGeo(skin: string, edge: string, spot: string, side: 1 | -1) {
  const rf: V3 = [0, 0, 0.42];
  const rb: V3 = [0, 0, -0.4];
  const tip: V3 = [1.15 * side, 0.08, -0.25];
  const top: V3 = [0.42 * side, 0.07, 0.02];
  const bot: V3 = [0.42 * side, -0.035, 0.02];
  const tri = (a: number[], b: number[], c: number[]) => [...a, ...b, ...c];
  // Wicklung je Seite so, dass die Flächen nach außen zeigen
  const up = side === 1 ? [tri(rf, tip, top), tri(top, tip, rb), tri(rf, top, rb)] : [tri(rf, top, tip), tri(top, rb, tip), tri(rf, rb, top)];
  const dn = side === 1 ? [tri(rf, bot, tip), tri(bot, rb, tip), tri(rf, rb, bot)] : [tri(rf, tip, bot), tri(bot, tip, rb), tri(rf, bot, rb)];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([...up.flat(), ...dn.flat()], 3));
  g.computeVertexNormals();
  const parts: Part[] = [{ g, c: skin }];
  // Saum an der Vorderkante, Leuchtpunkte auf dem Flügel
  parts.push(rod(new THREE.Vector3(...rf).setY(0.02), new THREE.Vector3(...tip), 0.03, 0.012, edge));
  for (const [x, z, r] of [
    [0.35, 0.0, 0.05],
    [0.6, -0.08, 0.04],
    [0.82, -0.16, 0.03],
  ] as const)
    parts.push({ g: new THREE.SphereGeometry(r, 6, 4), c: spot, m: M(x * side, 0.07, z, 0, 0, 0, 1, 0.4, 1), glow: 2 });
  return bake(parts);
}

/** Plasma-Qualle (Mitte der Glocke bei y = 0): durchscheinende Glocke, leuchtender Kern, Fäden */
function jellyGeo(color: string, core: string) {
  const parts: Part[] = [
    { g: new THREE.SphereGeometry(0.42, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), c: color, m: M(0, 0, 0, 0, 0, 0, 1, 0.8, 1), glow: 0.5 },
    { g: new THREE.TorusGeometry(0.4, 0.05, 5, 16), c: color, m: M(0, 0.01, 0, Math.PI / 2), glow: 0.9 },
    { g: new THREE.SphereGeometry(0.17, 8, 6), c: core, m: M(0, 0.12, 0), glow: 2.4 },
  ];
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2;
    parts.push({ g: new THREE.ConeGeometry(0.035, 0.7, 4), c: core, m: M(Math.cos(a) * 0.24, -0.33, Math.sin(a) * 0.24, Math.PI + Math.sin(a) * 0.2, 0, Math.cos(a) * 0.2), glow: 1.4 });
  }
  return bake(parts);
}

// ---------------------------------------------------------------------------
// Verhalten
// ---------------------------------------------------------------------------
/** schnellste Drehung (rad/s) – weich, ohne Herumzucken */
const MAX_TURN = 3.2;
const turnTo = (from: number, to: number, rate: number, dt: number) => {
  const d = Math.atan2(Math.sin(to - from), Math.cos(to - from));
  const step = d * Math.min(1, rate * dt);
  return from + Math.max(-MAX_TURN * dt, Math.min(MAX_TURN * dt, step));
};
/** Wesen außer Sicht nur jedes 2. Bild bewegen (mit aufgelaufener Zeit) */
const SLOW_EVERY = 2;
const PROBE = 0.35;
const HOP_TIME = 0.42;
const HOP_H = 0.26;

interface Walker {
  kind: 'alien' | 'beetle';
  hop: boolean;
  o: THREE.Group;
  body: THREE.Object3D;
  home: THREE.Vector3;
  range: number;
  target: THREE.Vector3;
  speed: number;
  /** aktuelle Geschwindigkeit (läuft weich an und aus) */
  v: number;
  wait: number;
  phase: number;
  r: number;
  dist: number;
  amp: number;
  /** Hüpfer: Fortschritt des Sprungs (−1 = am Boden), Start/Ziel, Pause, Stauchung, Form */
  hopT: number;
  hopFrom: THREE.Vector3;
  hopTo: THREE.Vector3;
  rest: number;
  squash: number;
  form: number;
  look: number;
  fails: number;
  /** weich nachgeführte Bodenhöhe */
  y: number;
  acc: number;
  slot: number;
}

interface Drone {
  o: THREE.Group;
  body: THREE.Object3D;
  rotor: THREE.Object3D;
  home: THREE.Vector3;
  range: number;
  target: THREE.Vector3;
  vel: THREE.Vector3;
  hover: number;
  speed: number;
  wait: number;
  phase: number;
  acc: number;
  slot: number;
}

interface Glider {
  o: THREE.Group;
  body: THREE.Object3D;
  wings: [THREE.Object3D, THREE.Object3D];
  cx: number;
  cz: number;
  R: number;
  w: number;
  a0: number;
  alt: number;
  phase: number;
}

interface Jelly {
  o: THREE.Group;
  body: THREE.Object3D;
  hx: number;
  hz: number;
  R: number;
  w: number;
  phase: number;
}

export function buildSpaceAnimals(opts: SpaceAnimalOptions): AnimalWorld | null {
  const { layout, field, blockers } = opts;
  const ground = opts.groundAt;
  const group = new THREE.Group();
  group.name = 'space-animals';
  const rng = rand(5150);
  const R = () => rng();
  const mat = creatureMaterial();
  const jellyMat = creatureMaterial({ transparent: true, opacity: 0.82 });
  const V = VOLCANO;
  const corridors = stuntCorridors(layout, field);

  // Kulissen der Mutproben und Felder mit Auftritten frei halten
  const keep: { x: number; z: number; r: number }[] = [];
  const plan = layout.plan;
  for (const [i, r] of [
    [plan.vineField, 7],
    [plan.caveField, 6],
    [plan.caveExit, 6],
  ] as const) {
    const f = layout.fields[i];
    if (f) keep.push({ x: f.x, z: f.z, r });
  }
  const ff = layout.fordFields;
  for (let i = (ff[0] ?? 1) - 1; i <= (ff[ff.length - 1] ?? -1) + 1; i++) {
    const f = layout.fields[i];
    if (f) keep.push({ x: f.x, z: f.z, r: 6 });
  }

  /** Boden für Fußgänger: trocken, abseits von Weg, Plasma, Hindernissen und Kulissen */
  const land = (x: number, z: number, minPath = 2.6) => {
    if (Math.abs(x) > 60 || Math.abs(z) > 60) return false;
    const h = ground(x, z);
    if (h < 0.45 || h > 12) return false;
    if (field.pathDistance(x, z) < minPath || field.riverDistance(x, z) < 1.6 || field.creekDistance(x, z) < 1.3 || field.gorgeDistance(x, z) < 1.2) return false;
    if (field.slope(x, z) > 0.42) return false;
    if (Math.hypot(x - V.x, z - V.z) < V.craterRadius + 3) return false;
    for (const b of blockers) if ((b.x - x) ** 2 + (b.z - z) ** 2 < (b.r + 0.5) ** 2) return false;
    for (const k of keep) if ((k.x - x) ** 2 + (k.z - z) ** 2 < k.r * k.r) return false;
    return !inCorridor(corridors, x, z, h + 0.9, 0.9);
  };
  /** gerade Linie begehbar? */
  const clearLine = (x0: number, z0: number, x1: number, z1: number) => {
    const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, z1 - z0) / PROBE));
    for (let i = 1; i <= n; i++) if (!land(x0 + ((x1 - x0) * i) / n, z0 + ((z1 - z0) * i) / n)) return false;
    return true;
  };
  /** Bodenhöhe unter der Standfläche (höchster Punkt – nie im Hang versinken) */
  const groundUnder = (x: number, z: number, r: number) => Math.max(ground(x, z), ground(x + r, z), ground(x - r, z), ground(x, z + r), ground(x, z - r));

  const find = (test: (x: number, z: number) => boolean, tries = 600): THREE.Vector3 | null => {
    for (let i = 0; i < tries; i++) {
      const x = (R() - 0.5) * 110;
      const z = (R() - 0.5) * 100;
      if (test(x, z)) return new THREE.Vector3(x, ground(x, z), z);
    }
    return null;
  };

  const sight = new CameraSight();
  const look = new THREE.Vector3();
  const visibleAt = (p: THREE.Vector3, margin = 2.5, range = 120) => sight.sees(look.set(p.x, p.y + 0.5, p.z), 1, margin, range);

  // ---- Fußgänger -----------------------------------------------------------
  const walkers: Walker[] = [];
  const geoCache = new Map<string, THREE.BufferGeometry>();
  const cached = (key: string, make: () => THREE.BufferGeometry) => {
    let g = geoCache.get(key);
    if (!g) geoCache.set(key, (g = make()));
    return g;
  };
  const spawnWalker = (kind: Walker['kind'], at: THREE.Vector3, geo: THREE.BufferGeometry, opts2: { hop?: boolean; range: number; speed: number; r: number; shadow: boolean; scale?: number }) => {
    const o = new THREE.Group();
    o.name = kind;
    const body = new THREE.Group();
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = opts2.shadow;
    body.add(mesh);
    o.add(body);
    o.scale.setScalar(opts2.scale ?? 1);
    o.position.set(at.x, groundUnder(at.x, at.z, opts2.r), at.z);
    o.rotation.y = R() * Math.PI * 2;
    group.add(o);
    walkers.push({
      kind,
      hop: !!opts2.hop,
      o,
      body,
      home: at.clone(),
      range: opts2.range,
      target: at.clone(),
      speed: opts2.speed,
      v: 0,
      wait: R() * 3,
      phase: R() * 10,
      r: opts2.r,
      dist: 0,
      amp: 0,
      hopT: -1,
      hopFrom: new THREE.Vector3(),
      hopTo: new THREE.Vector3(),
      rest: 0,
      squash: 0,
      form: 0,
      look: 0,
      fails: 0,
      y: o.position.y,
      acc: 0,
      slot: walkers.length % SLOW_EVERY,
    });
  };

  // Aliens in kleinen Grüppchen, gut vom Weg aus zu sehen (aber nicht darauf)
  const nearPath = (x: number, z: number) => land(x, z, 3.2) && field.pathDistance(x, z) < 9;
  let colorIx = 0;
  for (let gIx = 0; gIx < 5; gIx++) {
    const c = find(nearPath);
    if (!c) continue;
    const n = gIx < 2 ? 3 : 2;
    for (let i = 0; i < n; i++) {
      let p: THREE.Vector3 | null = null;
      for (let k = 0; k < 20 && !p; k++) {
        const x = c.x + (R() - 0.5) * 3.5;
        const z = c.z + (R() - 0.5) * 3.5;
        if (land(x, z, 3.2) && !walkers.some((w) => w.home.distanceTo(new THREE.Vector3(x, w.home.y, z)) < 0.8)) p = new THREE.Vector3(x, ground(x, z), z);
      }
      if (!p) continue;
      const kind = (gIx + i) % 3 === 2 ? 'cyclops' : 'stalk';
      const col = ALIEN_COLORS[colorIx++ % ALIEN_COLORS.length]!;
      const geo = cached(`${kind}-${col.main}`, () => alienGeo(kind, col));
      spawnWalker('alien', p, geo, { hop: kind === 'cyclops', range: 3.6, speed: kind === 'cyclops' ? 1.1 : 0.6, r: 0.28, shadow: true, scale: 1.2 + R() * 0.2 });
    }
  }
  // Kristallkäfer krabbeln einzeln herum
  for (let i = 0; i < 8; i++) {
    const p = find((x, z) => land(x, z, 2.8) && field.pathDistance(x, z) < 10);
    if (!p) continue;
    const glow = BEETLE_GLOW[i % BEETLE_GLOW.length]!;
    spawnWalker('beetle', p, cached(`beetle-${glow}`, () => beetleGeo(glow)), { range: 2.4, speed: 0.36, r: 0.17, shadow: false, scale: 1.15 + R() * 0.25 });
  }

  // ---- Drohnen ----------------------------------------------------------------
  const drones: Drone[] = [];
  const rotor = rotorGeo();
  const ACCENTS = ['#ff8a3d', '#3dd6ff', '#ff5fa8', '#8cff5a', '#ffd23f'];
  /** Höhe, über der eine Drohne schweben muss (Boden, Plasma, hohe Hindernisse) */
  const floor = (x: number, z: number) => {
    let h = Math.max(0, ground(x, z));
    for (const b of blockers) if ((b.x - x) ** 2 + (b.z - z) ** 2 < (b.r + 0.8) ** 2) h = Math.max(h, b.top - 1);
    return h;
  };
  /** Ziel einer Drohne: nicht über dem Vulkan, nicht über den Kulissen der Mutproben (Kamerablicke) */
  const droneOk = (x: number, z: number) => {
    if (Math.abs(x) > 58 || Math.abs(z) > 58 || ground(x, z) < -3 || ground(x, z) > 9 || Math.hypot(x - V.x, z - V.z) < V.baseRadius * 0.55) return false;
    for (const k of keep) if ((k.x - x) ** 2 + (k.z - z) ** 2 < (k.r + 2) ** 2) return false;
    return true;
  };
  /** Flugstrecke frei von den Kulissen? */
  const droneLine = (x0: number, z0: number, x1: number, z1: number) => {
    for (let f = 0.25; f < 1; f += 0.25) if (!droneOk(x0 + (x1 - x0) * f, z0 + (z1 - z0) * f)) return false;
    return droneOk(x1, z1);
  };
  for (let i = 0; i < 5; i++) {
    const p = find((x, z) => droneOk(x, z) && ground(x, z) > 0.3 && field.pathDistance(x, z) > 2 && field.pathDistance(x, z) < 12);
    if (!p) continue;
    const o = new THREE.Group();
    o.name = 'drone';
    const body = new THREE.Group();
    const m = new THREE.Mesh(cached(`drone-${i}`, () => droneGeo(ACCENTS[i % ACCENTS.length]!)), mat);
    m.castShadow = true;
    const rot = new THREE.Mesh(rotor, mat);
    rot.position.y = 0.3;
    body.add(m, rot);
    o.add(body);
    const hover = 2.4 + R() * 1.3;
    o.position.set(p.x, floor(p.x, p.z) + hover, p.z);
    o.rotation.y = R() * Math.PI * 2;
    group.add(o);
    drones.push({ o, body, rotor: rot, home: p.clone(), range: 7, target: p.clone(), vel: new THREE.Vector3(), hover, speed: 1.1 + R() * 0.5, wait: R() * 2, phase: R() * 10, acc: 0, slot: i % SLOW_EVERY });
  }

  // ---- Gleiter ----------------------------------------------------------------
  const gliders: Glider[] = [];
  const SKINS = [
    { skin: '#6a5cff', edge: '#3a2fb8', spot: '#7ffcff' },
    { skin: '#ff7ab8', edge: '#c23c7c', spot: '#fff27a' },
    { skin: '#2fc7b5', edge: '#16766b', spot: '#ff8af0' },
    { skin: '#ff9a4a', edge: '#b85a1c', spot: '#9cff6a' },
  ];
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.6;
    const dist = i % 2 ? 38 : 30;
    const cx = Math.cos(a) * dist;
    const cz = Math.sin(a) * dist * 0.85;
    const Rr = 11 + R() * 6;
    // Flughöhe: gut über allem, was auf der Runde liegt
    let top = 0;
    for (let k = 0; k < 48; k++) {
      const b = (k / 48) * Math.PI * 2;
      top = Math.max(top, ground(cx + Math.cos(b) * Rr * 1.15, cz + Math.sin(b) * Rr * 0.92));
    }
    const s = SKINS[i]!;
    const o = new THREE.Group();
    o.name = 'glider';
    const body = new THREE.Group();
    body.add(new THREE.Mesh(gliderBodyGeo(s.skin, s.spot), mat));
    const wl = new THREE.Mesh(wingGeo(s.skin, s.edge, s.spot, -1), mat);
    const wr = new THREE.Mesh(wingGeo(s.skin, s.edge, s.spot, 1), mat);
    wl.position.x = -0.24;
    wr.position.x = 0.24;
    body.add(wl, wr);
    o.add(body);
    o.scale.setScalar(1.1);
    group.add(o);
    gliders.push({ o, body, wings: [wl, wr], cx, cz, R: Rr, w: (i % 2 ? -1 : 1) * (0.11 + R() * 0.04), a0: R() * Math.PI * 2, alt: Math.max(top + 6, 10 + R() * 3), phase: R() * 10 });
  }

  // ---- Plasma-Quallen ---------------------------------------------------------
  const jellies: Jelly[] = [];
  const JELLY = [
    ['#ff7ad9', '#fff0a8'],
    ['#6ae8ff', '#e0fff9'],
    ['#b48cff', '#ffd1f5'],
  ] as const;
  const deep = (x: number, z: number, r: number) => {
    for (let k = 0; k < 12; k++) {
      const b = (k / 12) * Math.PI * 2;
      const h = ground(x + Math.cos(b) * (r + 1), z + Math.sin(b) * (r + 1));
      if (h > -1.2 || h < -9) return false;
    }
    return Math.abs(x) < 62 && Math.abs(z) < 62;
  };
  for (let i = 0; i < 6; i++) {
    const Rr = 1.6 + R() * 1.4;
    const p = find((x, z) => deep(x, z, Rr) && !jellies.some((j) => Math.hypot(j.hx - x, j.hz - z) < 8), 800);
    if (!p) continue;
    const [c, core] = JELLY[i % JELLY.length]!;
    const o = new THREE.Group();
    o.name = 'jelly';
    const body = new THREE.Group();
    const m = new THREE.Mesh(cached(`jelly-${c}`, () => jellyGeo(c, core)), jellyMat);
    m.renderOrder = 2;
    body.add(m);
    o.add(body);
    o.scale.setScalar(0.9 + R() * 0.4);
    group.add(o);
    jellies.push({ o, body, hx: p.x, hz: p.z, R: Rr, w: (R() < 0.5 ? -1 : 1) * (0.08 + R() * 0.05), phase: R() * 10 });
  }

  // ---- Schritt je Fußgänger ---------------------------------------------------
  const tmp = new THREE.Vector3();
  const pickTarget = (w: Walker) => {
    const o = w.o.position;
    const homeward = w.fails >= 3;
    for (let i = 0; i < 12; i++) {
      const cx = homeward ? (w.home.x + o.x) / 2 : w.home.x;
      const cz = homeward ? (w.home.z + o.z) / 2 : w.home.z;
      const span = homeward ? Math.max(1, w.range * 0.5) : w.range;
      const x = cx + (Math.random() - 0.5) * 2 * span;
      const z = cz + (Math.random() - 0.5) * 2 * span;
      if (Math.hypot(x - o.x, z - o.z) < 0.8) continue;
      if (!land(x, z)) continue;
      if (walkers.some((v) => v !== w && (Math.hypot(v.target.x - x, v.target.z - z) < 0.9 || Math.hypot(v.o.position.x - x, v.o.position.z - z) < 0.9))) continue;
      if (!clearLine(o.x, o.z, x, z)) continue;
      w.target.set(x, 0, z);
      return true;
    }
    return false;
  };
  /** kommt dem Wesen beim Schritt nach (nx, nz) ein anderes zu nahe? (auseinander geht immer) */
  const bumps = (w: Walker, nx: number, nz: number) => {
    for (const v of walkers) {
      if (v === w) continue;
      const min = w.r + v.r + 0.1;
      const dx = v.o.position.x - nx;
      const dz = v.o.position.z - nz;
      if (dx * dx + dz * dz < min * min) {
        const ox = v.o.position.x - w.o.position.x;
        const oz = v.o.position.z - w.o.position.z;
        if (dx * dx + dz * dz < ox * ox + oz * oz) return true;
      }
    }
    return false;
  };
  /** gescheitert: kurz warten; hängt es fest, außer Sicht nach Hause versetzen */
  const blocked = (w: Walker) => {
    w.target.copy(w.o.position);
    w.wait = 0.6 + Math.random() * 1.2;
    w.v = 0;
    w.fails++;
    if (w.fails >= 6 && !visibleAt(w.o.position, 4, 400) && !visibleAt(w.home, 4, 400)) {
      w.o.position.set(w.home.x, groundUnder(w.home.x, w.home.z, w.r), w.home.z);
      w.y = w.o.position.y;
      w.target.copy(w.o.position);
      w.fails = 0;
    }
  };

  const stepWalker = (w: Walker, t: number, dt: number) => {
    const o = w.o.position;
    let moving = false;
    const inAir = w.hopT >= 0;
    if (w.wait > 0 && !inAir) {
      w.wait -= dt;
      w.v = 0;
      if (w.wait <= 0) {
        if (!pickTarget(w)) {
          w.wait = 0.8 + Math.random();
          w.fails++;
          if (w.fails >= 6) blocked(w);
        }
      } else if (Math.random() < dt * 0.3) w.look = (Math.random() - 0.5) * 1.3;
    } else {
      const d = tmp.set(w.target.x - o.x, 0, w.target.z - o.z);
      const dist = d.length();
      if (dist > 0.12 || inAir) {
        if (dist > 1e-4) d.divideScalar(dist);
        const want = Math.atan2(d.x, d.z);
        const diff = Math.atan2(Math.sin(want - w.o.rotation.y), Math.cos(want - w.o.rotation.y));
        if (!inAir && dist > 0.12) w.o.rotation.y = turnTo(w.o.rotation.y, want, 4, dt);
        if (!w.hop) {
          // weich anlaufen, erst richtig gehen, wenn ungefähr in Zielrichtung gedreht
          const go = Math.abs(diff) < 0.5 ? w.speed * Math.min(1, 0.3 + dist / 0.7) : 0;
          w.v += (go - w.v) * Math.min(1, dt * 4);
          const s = Math.min(w.v * dt, dist);
          if (s > 1e-5) {
            const nx = o.x + d.x * s;
            const nz = o.z + d.z * s;
            if (!land(nx, nz) || bumps(w, nx, nz)) blocked(w);
            else {
              o.x = nx;
              o.z = nz;
              w.dist += s;
              moving = true;
            }
          }
        } else {
          if (!inAir && Math.abs(diff) < 0.3 && w.rest <= 0 && dist > 0.12) {
            const len = Math.min(0.45, dist);
            const tx = o.x + d.x * len;
            const tz = o.z + d.z * len;
            if (!clearLine(o.x, o.z, tx, tz) || bumps(w, tx, tz)) blocked(w);
            else {
              w.hopT = 0;
              w.hopFrom.set(o.x, 0, o.z);
              w.hopTo.set(tx, 0, tz);
            }
          }
          if (w.hopT >= 0) {
            w.hopT = Math.min(1, w.hopT + dt / HOP_TIME);
            const p = w.hopT;
            const e = p * p * (3 - 2 * p);
            o.x = w.hopFrom.x + (w.hopTo.x - w.hopFrom.x) * e;
            o.z = w.hopFrom.z + (w.hopTo.z - w.hopFrom.z) * e;
            moving = true;
            if (p >= 1) {
              w.hopT = -1;
              w.squash = 1;
              w.rest = 0.25 + Math.random() * 0.35;
            }
          }
        }
        w.look = 0;
      } else {
        w.wait = (w.kind === 'beetle' ? 1 : 1.6) + Math.random() * 4;
        w.fails = 0;
        w.v = 0;
      }
    }
    if (w.hop) w.rest -= dt;
    // Höhe weich nachführen (Gelände ist glatt – kein Treppchen, kein Versinken)
    const g = groundUnder(o.x, o.z, w.r);
    w.y += (g - w.y) * Math.min(1, dt * 10);
    o.y = w.y;

    // Körper: watscheln, hüpfen, atmen, umschauen – alles weich
    const b = w.body;
    w.amp += ((moving ? 1 : 0) - w.amp) * Math.min(1, dt * 5);
    b.rotation.y += (w.look - b.rotation.y) * Math.min(1, dt * 2);
    if (w.kind === 'beetle') {
      b.position.y = Math.abs(Math.sin(w.dist * 28)) * 0.012 * w.amp;
      b.rotation.z = Math.sin(w.dist * 28) * 0.04 * w.amp;
      return;
    }
    if (!w.hop) {
      b.rotation.z = Math.sin(w.dist * 8.5) * 0.15 * w.amp;
      b.position.y = Math.abs(Math.sin(w.dist * 8.5)) * 0.035 * w.amp;
      const breathe = 1 + Math.sin(t * 2.1 + w.phase) * 0.018;
      b.scale.set(1, breathe, 1);
      return;
    }
    const p = w.hopT;
    b.position.y = p >= 0 ? Math.sin(p * Math.PI) * HOP_H : 0;
    w.squash = Math.max(0, w.squash - dt * 3.2);
    const crouch = p < 0 && w.wait <= 0 && w.rest > 0 && w.rest < 0.18 ? 1 : 0;
    const want = (p >= 0 ? Math.sin(p * Math.PI) * 0.12 : 0) - w.squash * 0.16 - crouch * 0.1 + Math.sin(t * 2.3 + w.phase) * 0.015;
    w.form += (want - w.form) * Math.min(1, dt * 14);
    b.scale.set(1 - w.form * 0.5, 1 + w.form, 1 - w.form * 0.5);
  };

  const stepDrone = (d: Drone, t: number, dt: number) => {
    const o = d.o.position;
    if (d.wait > 0) {
      d.wait -= dt;
      d.vel.multiplyScalar(Math.exp(-dt * 2));
      if (d.wait <= 0) {
        let ok = false;
        for (let i = 0; i < 10 && !ok; i++) {
          const x = d.home.x + (Math.random() - 0.5) * 2 * d.range;
          const z = d.home.z + (Math.random() - 0.5) * 2 * d.range;
          if (Math.hypot(x - o.x, z - o.z) < 2 || !droneLine(o.x, o.z, x, z)) continue;
          d.target.set(x, 0, z);
          ok = true;
        }
        if (!ok) d.wait = 1;
      }
    } else {
      const dx = d.target.x - o.x;
      const dz = d.target.z - o.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 0.35) d.wait = 1.2 + Math.random() * 3.5;
      else {
        const sp = d.speed * Math.min(1, dist / 2.5);
        d.vel.x += ((dx / dist) * sp - d.vel.x) * Math.min(1, dt * 1.4);
        d.vel.z += ((dz / dist) * sp - d.vel.z) * Math.min(1, dt * 1.4);
      }
    }
    o.x += d.vel.x * dt;
    o.z += d.vel.z * dt;
    const sp = Math.hypot(d.vel.x, d.vel.z);
    if (sp > 0.12) d.o.rotation.y = turnTo(d.o.rotation.y, Math.atan2(d.vel.x, d.vel.z), 2.2, dt);
    // Höhe: über Boden/Plasma (mit Blick voraus), sanft nachgeführt, sanftes Wippen
    const ahead = Math.max(floor(o.x, o.z), floor(o.x + d.vel.x * 1.5, o.z + d.vel.z * 1.5));
    const want = ahead + d.hover + Math.sin(t * 1.3 + d.phase) * 0.14;
    o.y += (want - o.y) * Math.min(1, dt * 1.3);
    o.y = Math.max(o.y, floor(o.x, o.z) + 1.1);
    // Neigung in Flugrichtung, Rotor dreht
    d.body.rotation.x += (Math.min(0.3, sp * 0.18) - d.body.rotation.x) * Math.min(1, dt * 3);
    d.body.rotation.z = Math.sin(t * 0.9 + d.phase) * 0.05;
    d.rotor.rotation.y += dt * 22;
  };

  const gp = new THREE.Vector3();
  const gq = new THREE.Vector3();
  const gliderAt = (g: Glider, t: number, out: THREE.Vector3) => {
    const a = g.a0 + g.w * t;
    const r = g.R * (1 + 0.15 * Math.sin(t * 0.13 + g.phase));
    return out.set(g.cx + Math.cos(a) * r, g.alt + Math.sin(t * 0.4 + g.phase) * 0.8, g.cz + Math.sin(a) * r * 0.8);
  };
  const poseGlider = (g: Glider, t: number) => {
    gliderAt(g, t, gp);
    gliderAt(g, t + 0.25, gq);
    g.o.position.copy(gp);
    g.o.rotation.y = Math.atan2(gq.x - gp.x, gq.z - gp.z);
    g.body.rotation.z = -Math.sign(g.w) * 0.22;
    g.body.rotation.x = -(gq.y - gp.y) * 0.5;
    const flap = Math.sin(t * 2.1 + g.phase) * 0.32 + 0.05;
    g.wings[0].rotation.z = -flap;
    g.wings[1].rotation.z = flap;
  };
  const poseJelly = (j: Jelly, t: number) => {
    const a = j.w * t + j.phase;
    j.o.position.set(j.hx + Math.cos(a) * j.R, 0.06 + Math.sin(t * 1.1 + j.phase) * 0.07, j.hz + Math.sin(a) * j.R);
    j.o.rotation.y = t * 0.15 + j.phase;
    const pulse = Math.sin(t * 2.2 + j.phase);
    j.body.scale.set(1 - pulse * 0.05, 1 + pulse * 0.09, 1 - pulse * 0.05);
  };
  // Anfangslage (vor dem ersten Bild)
  for (const g of gliders) poseGlider(g, 0);
  for (const j of jellies) poseJelly(j, 0);

  let frame = 0;
  /** eigene Uhr: läuft nur mit den (begrenzten) Bildschritten – nach einem Ruckler springt nichts */
  let clock = 0;
  return {
    group,
    update(_t, dt, camera) {
      frame++;
      const step = Math.min(0.1, Math.max(0, dt));
      clock += step;
      sight.update(camera);
      for (const w of walkers) {
        w.acc += step;
        if (!visibleAt(w.o.position, 1.5) && (frame + w.slot) % SLOW_EVERY !== 0) continue;
        stepWalker(w, clock, Math.min(0.1, w.acc));
        w.acc = 0;
      }
      for (const d of drones) {
        d.acc += step;
        if (!visibleAt(d.o.position, 2) && (frame + d.slot) % SLOW_EVERY !== 0) continue;
        stepDrone(d, clock, Math.min(0.1, d.acc));
        d.acc = 0;
      }
      for (const g of gliders) poseGlider(g, clock);
      for (const j of jellies) poseJelly(j, clock);
    },
    // Der Kommentator kennt (noch) keine Sprüche zu Weltall-Wesen
    inView: () => false,
  };
}
