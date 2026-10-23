/**
 * Sonderfelder und Mutproben im Weltall: gleiche Abläufe wie auf der Insel (Stunts: Kamera, Timing,
 * Rückgängig), eigene Optik – Jetpack (Katapult vor), Schwarzes Loch saugt ein und spuckt weiter hinten
 * aus (zurück), Teleporter mit Lichtkugel (Platztausch), Greifhaken am Kran über den Plasma-Bach,
 * Kapseln oder Kisten im Plasma (eine Seite versinkt, die Figur treibt in einer Schutzblase hinüber),
 * Kristallhöhle mit Kristallfaltern, Wurmloch (ins Innere), Teleporterstrahl zurück, Holo-Bühne fürs
 * Minispiel und Plasma-Fontäne. Den Energiekäfig baut die Figur selbst (space/cage.ts).
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { VOLCANO, type RiverChoice } from '@insel/shared';
import { ease } from '../tweens.ts';
import { Stunts, mat, mesh, type LaneItem } from '../stunts.ts';
import { fordLanes, vineTree } from '../views.ts';

/** Farben des Planeten: helle Raumfahrt-Teile, kräftige Leuchtfarben */
const C = {
  hull: '#eef2f7',
  panel: '#c9d2de',
  dark: '#3b4356',
  steel: '#8d97a8',
  orange: '#ff9a2e',
  cyan: '#3ee8ff',
  magenta: '#ff4fd8',
  lime: '#a6ff4d',
  violet: '#8a5cff',
  rock: '#5d5470',
};
/** Kristalle: Grundfarbe und Leuchten */
const CRYSTALS: [string, string][] = [
  ['#5ef2ff', '#139fbe'],
  ['#ff6ae0', '#b8259e'],
  ['#a07bff', '#5a33d0'],
  ['#b6ff5c', '#4f9f14'],
];

const rnd = (a: number, b: number) => a + Math.random() * (b - a);
/** gemeinsame Uhr der Shader (eine Szene zur Zeit) */
const clock = { value: 0 };

// ---------------------------------------------------------------------------------------
// Bausteine
// ---------------------------------------------------------------------------------------
/** Sechskant-Kristall mit Spitze, Fuß bei y = 0 */
function crystalGeo(r: number, h: number, sides = 6) {
  return new THREE.LatheGeometry([new THREE.Vector2(0, 0), new THREE.Vector2(r * 0.85, 0), new THREE.Vector2(r, h * 0.12), new THREE.Vector2(r * 0.9, h * 0.7), new THREE.Vector2(0, h)], sides);
}

function crystalMat(k: number) {
  const [c, e] = CRYSTALS[((k % CRYSTALS.length) + CRYSTALS.length) % CRYSTALS.length]!;
  return mat(c, { rough: 0.25, metal: 0.1, emissive: e, flat: true });
}

/** Stange zwischen zwei Punkten */
function strut(a: THREE.Vector3, b: THREE.Vector3, r: number, sides = 4) {
  const g = new THREE.CylinderGeometry(r, r, a.distanceTo(b), sides);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
  g.applyMatrix4(new THREE.Matrix4().compose(a.clone().lerp(b, 0.5), q, new THREE.Vector3(1, 1, 1)));
  return g;
}

/** Statische Teile je Material zu wenigen Meshes zusammenfassen */
class Batch {
  private parts = new Map<THREE.Material, THREE.BufferGeometry[]>();
  add(geo: THREE.BufferGeometry, m: THREE.Material, matrix?: THREE.Matrix4) {
    if (matrix) geo.applyMatrix4(matrix);
    const g = geo.index ? geo.toNonIndexed() : geo;
    if (g !== geo) geo.dispose();
    for (const n of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(n)) g.deleteAttribute(n);
    if (!g.getAttribute('uv')) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array((g.getAttribute('position').count) * 2), 2));
    let list = this.parts.get(m);
    if (!list) this.parts.set(m, (list = []));
    list.push(g);
  }
  at(geo: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number, rot?: THREE.Euler, scale?: THREE.Vector3) {
    this.add(geo, m, new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(rot ?? new THREE.Euler()), scale ?? new THREE.Vector3(1, 1, 1)));
  }
  build(into: THREE.Object3D, shadow = true) {
    for (const [m, list] of this.parts) {
      const g = mergeGeometries(list, false);
      for (const x of list) x.dispose();
      if (!g) continue;
      const me = new THREE.Mesh(g, m);
      me.castShadow = shadow;
      me.receiveShadow = true;
      into.add(me);
    }
    this.parts.clear();
  }
}

/** Leuchtfarbe (über 1, für das Leuchten in der Nachbearbeitung) */
function glow(color: string, k = 2, o: Partial<THREE.MeshBasicMaterialParameters> = {}) {
  return new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(k), toneMapped: false, ...o });
}

const glowCache = new Map<string, THREE.MeshBasicMaterial>();
/** Leuchtfarbe für feste Kulissen (zwischengespeichert – nie für vorübergehende Objekte verwenden) */
function staticGlow(color: string, k = 2) {
  const key = `${color}|${k}`;
  let m = glowCache.get(key);
  if (!m) glowCache.set(key, (m = glow(color, k)));
  return m;
}

/** Weicher Lichtfleck (bzw. Ring) als Textur */
function glowTexture(ring = 0) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  if (ring > 0) {
    grd.addColorStop(0, 'rgba(255,255,255,0)');
    grd.addColorStop(Math.max(0, ring - 0.12), 'rgba(255,255,255,0.05)');
    grd.addColorStop(ring, 'rgba(255,255,255,1)');
    grd.addColorStop(Math.min(1, ring + 0.18), 'rgba(255,255,255,0.25)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
  } else {
    grd.addColorStop(0, 'rgba(255,255,255,1)');
    grd.addColorStop(0.3, 'rgba(255,255,255,0.5)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
  }
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function glowSprite(color: string, size: number, ring = 0, k = 1.6) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(ring), color: new THREE.Color(color).multiplyScalar(k), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, toneMapped: false }));
  s.scale.setScalar(size);
  return s;
}

/** Holo-Schild: dunkle Tafel mit Neonrand und leuchtender Schrift */
function holoTexture(text: string, ink = '#7ff6ff', edge = '#3ee8ff', w = 512, h = 128) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;
  const grd = g.createLinearGradient(0, 0, 0, h);
  grd.addColorStop(0, 'rgba(18,22,58,0.95)');
  grd.addColorStop(1, 'rgba(40,16,72,0.95)');
  g.fillStyle = grd;
  g.beginPath();
  g.roundRect(4, 4, w - 8, h - 8, h * 0.18);
  g.fill();
  g.lineWidth = Math.max(4, h * 0.05);
  g.strokeStyle = edge;
  g.shadowColor = edge;
  g.shadowBlur = 14;
  g.stroke();
  // feine Rasterzeilen
  g.shadowBlur = 0;
  g.fillStyle = 'rgba(120,240,255,0.06)';
  for (let y = 8; y < h - 8; y += 6) g.fillRect(10, y, w - 20, 2);
  g.font = `600 ${Math.round(h * 0.5)}px Fredoka, Nunito, sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.shadowColor = ink;
  g.shadowBlur = 16;
  g.fillStyle = ink;
  g.fillText(text, w / 2, h * 0.54, w - 30);
  g.shadowBlur = 0;
  g.fillStyle = '#ffffff';
  g.globalAlpha = 0.55;
  g.fillText(text, w / 2, h * 0.54, w - 30);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

// ---------------------------------------------------------------------------------------
// Shader: Wirbelscheibe (Wurmloch, Teleporter, Schwarzes Loch), Lichtsäule, Schutzblase
// ---------------------------------------------------------------------------------------
const FX_VERT = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vN;
  varying vec3 vV;
  void main() {
    vUv = uv;
    vN = normalize(normalMatrix * normal);
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vV = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
  }
`;

const DISC_FRAG = /* glsl */ `
  uniform float uTime;
  uniform vec3 uA;
  uniform vec3 uB;
  uniform float uInner;
  uniform float uSpin;
  uniform float uOpacity;
  uniform float uHole;
  varying vec2 vUv;
  void main() {
    vec2 p = vUv * 2.0 - 1.0;
    float r = length(p);
    if (r > 1.0 || r < uInner) discard;
    float a = atan(p.y, p.x);
    float s1 = sin(a * 3.0 + log(r + 0.05) * 6.5 - uTime * uSpin);
    float s2 = sin(a * 5.0 + log(r + 0.05) * 10.0 - uTime * uSpin * 1.5 + 1.3);
    float arms = smoothstep(-0.15, 0.95, s1) * 0.7 + smoothstep(0.45, 1.0, s2) * 0.45;
    vec3 col = mix(uA, uB, clamp(arms * 0.75 + r * 0.35, 0.0, 1.0)) * (0.25 + arms * 1.1);
    float rim = smoothstep(0.78, 0.94, r) * (1.0 - smoothstep(0.94, 1.0, r));
    col += uB * rim * 1.3;
    float edge = 1.0 - smoothstep(0.9, 1.0, r);
    float inner = smoothstep(uInner, uInner + 0.1, r);
    if (uHole > 0.5) {
      // Wurmloch: die Mitte führt tief hinab ins Dunkle
      col = mix(vec3(0.01, 0.0, 0.035), col, smoothstep(0.05, 0.75, r));
      gl_FragColor = vec4(col, edge * uOpacity);
    } else {
      gl_FragColor = vec4(col * edge * inner * uOpacity, 1.0);
    }
    #include <colorspace_fragment>
  }
`;

const BEAM_FRAG = /* glsl */ `
  uniform float uTime;
  uniform vec3 uColor;
  uniform float uOpacity;
  varying vec2 vUv;
  varying vec3 vN;
  varying vec3 vV;
  void main() {
    float facing = pow(abs(dot(normalize(vN), normalize(vV))), 1.3);
    float bands = 0.6 + 0.4 * sin(vUv.y * 36.0 - uTime * 10.0);
    float fade = pow(1.0 - vUv.y, 1.2) * smoothstep(0.0, 0.04, vUv.y);
    float sweep = 0.7 + 0.3 * sin(vUv.x * 6.2831 * 3.0 + uTime * 4.0);
    gl_FragColor = vec4(uColor * facing * bands * fade * sweep * uOpacity, 1.0);
    #include <colorspace_fragment>
  }
`;

const BUBBLE_FRAG = /* glsl */ `
  uniform float uTime;
  uniform vec3 uColor;
  uniform float uOpacity;
  varying vec2 vUv;
  varying vec3 vN;
  varying vec3 vV;
  void main() {
    float f = 1.0 - abs(dot(normalize(vN), normalize(vV)));
    float rim = pow(f, 2.2);
    float shimmer = 0.75 + 0.25 * sin(vUv.y * 22.0 + uTime * 3.0 + vUv.x * 14.0);
    gl_FragColor = vec4(uColor * (0.16 + rim * 2.2) * shimmer * uOpacity, 1.0);
    #include <colorspace_fragment>
  }
`;

function discMaterial(a: string, b: string, o: { inner?: number; spin?: number; hole?: boolean; opacity?: number } = {}) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: clock,
      uA: { value: new THREE.Color(a) },
      uB: { value: new THREE.Color(b) },
      uInner: { value: o.inner ?? 0 },
      uSpin: { value: o.spin ?? 3 },
      uOpacity: { value: o.opacity ?? 1 },
      uHole: { value: o.hole ? 1 : 0 },
    },
    vertexShader: FX_VERT,
    fragmentShader: DISC_FRAG,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: o.hole ? THREE.NormalBlending : THREE.AdditiveBlending,
  });
}

function beamMaterial(color: THREE.Color, opacity = 0) {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: clock, uColor: { value: color }, uOpacity: { value: opacity } },
    vertexShader: FX_VERT,
    fragmentShader: BEAM_FRAG,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
  });
}

/** Teleporter-Feld: Metallring mit leuchtender Wirbelscheibe, drei Strahlern und Lichtsäule */
function buildTelePad(beamH: number, r = 0.95) {
  const root = new THREE.Group();
  const base = mesh(new THREE.CylinderGeometry(r * 1.06, r * 1.14, 0.1, 32), mat(C.dark, { rough: 0.45, metal: 0.5 }), 0, 0.05, 0, false);
  const ring = mesh(new THREE.TorusGeometry(r, 0.06, 8, 48).rotateX(Math.PI / 2), glow(C.cyan, 2.2), 0, 0.11, 0, false);
  const discMat = discMaterial('#2a5cff', '#3ee8ff', { spin: 4, opacity: 0.9 });
  const disc = new THREE.Mesh(new THREE.CircleGeometry(r * 0.92, 40).rotateX(-Math.PI / 2), discMat);
  disc.position.y = 0.115;
  disc.renderOrder = 5;
  root.add(base, ring, disc);
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2 + 0.5;
    const post = mesh(new THREE.BoxGeometry(0.12, 0.36, 0.12), mat(C.hull, { rough: 0.4, metal: 0.2 }), Math.cos(a) * r * 1.12, 0.22, Math.sin(a) * r * 1.12, false);
    post.add(mesh(new THREE.SphereGeometry(0.075, 10, 8), glow(C.magenta, 2.4), 0, 0.22, 0, false));
    root.add(post);
  }
  const beamMat = beamMaterial(new THREE.Color(C.cyan).multiplyScalar(1.5));
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.88, r * 0.92, beamH, 32, 1, true), beamMat);
  beam.position.y = beamH / 2 + 0.1;
  beam.renderOrder = 6;
  root.add(beam);
  return { root, beamMat, discMat, ring };
}

// ---------------------------------------------------------------------------------------
export class SpaceStunts extends Stunts {
  /**
   * Dauerhafte Animationen der Kulissen (Blinklichter, Kristalle). `declare`: die Bau-Methoden laufen
   * schon im Konstruktor von Stunts – ein Feld mit Vorgabe würde danach wieder überschrieben.
   */
  declare private anims: ((t: number, dt: number) => void)[] | undefined;

  private animate(fn: (t: number, dt: number) => void) {
    (this.anims ??= []).push(fn);
  }

  // =========================================================================
  // Greifhaken am Kran über dem Plasma-Bach (statt Liane am Riesenbaum)
  // =========================================================================
  protected override buildVineTree() {
    const { dir } = this.vineFrame();
    const { sx, tx, tz, pivot } = vineTree(this.layout, this.field);
    this.treeSide = sx;
    const ty = this.field.height(tx, tz);
    // Rahmen des Krans: x zeigt vom Mast zur Aufhängung, y nach oben
    const ex = new THREE.Vector3(pivot.x - tx, 0, pivot.z - tz);
    const D = ex.length();
    ex.normalize();
    const ez = new THREE.Vector3(-ex.z, 0, ex.x);
    const UP = new THREE.Vector3(0, 1, 0);
    const L = (x: number, y: number, z: number) => new THREE.Vector3(tx, ty, tz).addScaledVector(ex, x).addScaledVector(UP, y).addScaledVector(ez, z);
    const frame = new THREE.Matrix4().makeBasis(ex, UP, ez).setPosition(tx, ty, tz);
    const yaw = new THREE.Euler().setFromRotationMatrix(frame);

    const b = new Batch();
    const orange = mat(C.orange, { rough: 0.5, metal: 0.25, flat: true });
    const white = mat(C.hull, { rough: 0.4, metal: 0.2 });
    const dark = mat(C.dark, { rough: 0.5, metal: 0.4 });
    const yellow = mat('#ffd23f', { rough: 0.5 });
    // Ausleger liegt knapp über der Aufhängung
    const H = pivot.y + 0.4 - ty;
    // Fundament mit vier Füßen
    b.add(new THREE.CylinderGeometry(1.25, 1.45, 0.45, 8), white, new THREE.Matrix4().makeTranslation(tx, ty + 0.1, tz));
    for (const [fx, fz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]] as const) b.add(new THREE.BoxGeometry(0.4, 0.3, 0.4), dark, new THREE.Matrix4().makeRotationFromEuler(yaw).setPosition(L(fx * 0.95, 0.05, fz * 0.95)));
    // Gittermast
    const w = 0.9;
    const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const;
    for (const [cx, cz] of corners) b.add(strut(L((cx * w) / 2, 0.3, (cz * w) / 2), L((cx * w) / 2, H, (cz * w) / 2), 0.075, 6), orange);
    const seg = 1.05;
    for (let y0 = 0.3, n = 0; y0 + 0.1 < H; y0 += seg, n++) {
      const y1 = Math.min(H, y0 + seg);
      for (let k = 0; k < 4; k++) {
        const [ax, az] = corners[k]!;
        const [bx, bz] = corners[(k + 1) % 4]!;
        const flip = (n + k) % 2 === 0;
        b.add(strut(L((ax * w) / 2, flip ? y0 : y1, (az * w) / 2), L((bx * w) / 2, flip ? y1 : y0, (bz * w) / 2), 0.035), orange);
        b.add(strut(L((ax * w) / 2, y1, (az * w) / 2), L((bx * w) / 2, y1, (bz * w) / 2), 0.035), orange);
      }
    }
    // Drehkranz und Führerhaus seitlich unter dem Ausleger
    b.add(new THREE.CylinderGeometry(0.75, 0.75, 0.25, 16), dark, new THREE.Matrix4().makeTranslation(...L(0, H - 0.05, 0).toArray()));
    const cab = L(0.15, H - 0.75, w / 2 + 0.5);
    b.add(new THREE.BoxGeometry(1.15, 0.95, 0.85), white, new THREE.Matrix4().makeRotationFromEuler(yaw).setPosition(cab));
    // Ausleger (Dreiecksgitter) bis über die Aufhängung, Gegenausleger mit Gewicht
    const x0 = -w / 2 - 2.8;
    const x1 = D + 1.1;
    const bot = H + 0.12;
    const top = H + 0.75;
    for (const z of [-0.3, 0.3]) b.add(strut(L(x0, bot, z), L(x1, bot, z), 0.05, 6), orange);
    b.add(strut(L(x0 + 0.4, top, 0), L(x1 - 0.5, top - 0.25, 0), 0.05, 6), orange);
    for (let x = x0 + 0.4; x < x1 - 0.5; x += 0.75) {
      const xn = Math.min(x1 - 0.5, x + 0.75);
      const yt = (q: number) => top - ((q - x0 - 0.4) / (x1 - 0.9 - x0)) * 0.25;
      for (const z of [-0.3, 0.3]) b.add(strut(L(x, bot, z), L(xn, yt(xn), 0), 0.028), orange);
      b.add(strut(L(x, bot, -0.3), L(x, bot, 0.3), 0.025), orange);
    }
    b.add(strut(L(x1, bot, -0.3), L(x1 - 0.5, top - 0.25, 0), 0.03), orange);
    b.add(strut(L(x1, bot, 0.3), L(x1 - 0.5, top - 0.25, 0), 0.03), orange);
    // Spitze des Mastes und Abspannung
    b.add(strut(L(0, H, 0), L(0, H + 1.7, 0), 0.07, 6), orange);
    b.add(strut(L(0, H + 1.7, 0), L(x1 - 0.6, top - 0.2, 0), 0.02), dark);
    b.add(strut(L(0, H + 1.7, 0), L(x0 + 0.5, top - 0.1, 0), 0.02), dark);
    // Gegengewicht mit Warnstreifen
    const cw = L(x0 + 0.75, H - 0.35, 0);
    b.add(new THREE.BoxGeometry(1.2, 0.9, 0.9), dark, new THREE.Matrix4().makeRotationFromEuler(yaw).setPosition(cw));
    for (const dy of [-0.2, 0.2]) b.add(new THREE.BoxGeometry(1.22, 0.12, 0.92), yellow, new THREE.Matrix4().makeRotationFromEuler(yaw).setPosition(cw.clone().add(new THREE.Vector3(0, dy, 0))));
    // Laufkatze über der Aufhängung
    b.add(new THREE.BoxGeometry(0.75, 0.32, 0.8), white, new THREE.Matrix4().makeRotationFromEuler(yaw).setPosition(L(D, bot - 0.2, 0)));
    for (const z of [-0.3, 0.3]) b.add(new THREE.CylinderGeometry(0.09, 0.09, 0.06, 10).rotateX(Math.PI / 2), dark, new THREE.Matrix4().makeRotationFromEuler(yaw).setPosition(L(D, bot - 0.02, z)));
    const crane = new THREE.Group();
    crane.name = 'kran';
    b.build(crane);
    // Fenster des Führerhauses leuchtet, Blinklichter an Mastspitze und Ausleger
    const win = mesh(new THREE.BoxGeometry(0.06, 0.45, 0.6), glow(C.cyan, 1.4), 0, 0, 0, false);
    win.position.copy(L(0.15 + 0.58, H - 0.65, w / 2 + 0.5));
    win.rotation.copy(yaw);
    crane.add(win);
    const lamps = [
      { o: mesh(new THREE.SphereGeometry(0.11, 10, 8), glow('#ff3b5c', 3), 0, 0, 0, false), ph: 0 },
      { o: mesh(new THREE.SphereGeometry(0.1, 10, 8), glow('#ff3b5c', 3), 0, 0, 0, false), ph: 0.5 },
      { o: mesh(new THREE.SphereGeometry(0.08, 10, 8), glow(C.cyan, 3), 0, 0, 0, false), ph: 0.25 },
    ];
    lamps[0]!.o.position.copy(L(0, H + 1.82, 0));
    lamps[1]!.o.position.copy(L(x1, bot + 0.1, 0));
    lamps[2]!.o.position.copy(L(D, bot - 0.42, 0));
    for (const l of lamps) crane.add(l.o);
    this.animate((t) => {
      for (const l of lamps) l.o.visible = (t * 0.8 + l.ph) % 1 < 0.55;
    });

    // Greifhaken: Stahlseil, Hakenkopf mit drei Krallen, Griffring unten (dreht sich um die Aufhängung)
    const hook = new THREE.Group();
    hook.position.copy(pivot);
    const steel = mat(C.steel, { rough: 0.35, metal: 0.7 });
    hook.add(mesh(new THREE.CylinderGeometry(0.03, 0.03, this.lianaLen - 0.35, 6), mat('#2b2f3a', { rough: 0.6, metal: 0.5 }), 0, -(this.lianaLen - 0.35) / 2, 0));
    const head = new THREE.Group();
    head.position.y = -this.lianaLen + 0.32;
    head.add(mesh(new THREE.CylinderGeometry(0.13, 0.16, 0.3, 10), mat('#ffd23f', { rough: 0.45 }), 0, 0, 0));
    head.add(mesh(new THREE.CylinderGeometry(0.165, 0.165, 0.07, 10), mat(C.dark, { rough: 0.5, metal: 0.4 }), 0, -0.04, 0));
    head.add(mesh(new THREE.SphereGeometry(0.05, 8, 6), glow(C.cyan, 2.5), 0, 0.06, 0.14, false));
    for (let k = 0; k < 3; k++) {
      const claw = mesh(new THREE.TorusGeometry(0.16, 0.03, 5, 10, Math.PI * 0.75), steel, 0, 0, 0, false);
      const a = (k / 3) * Math.PI * 2;
      claw.position.set(Math.cos(a) * 0.13, -0.14, Math.sin(a) * 0.13);
      claw.rotation.set(0, -a, -Math.PI / 2 - 0.3);
      head.add(claw);
    }
    hook.add(head);
    hook.add(mesh(new THREE.TorusGeometry(0.16, 0.045, 6, 14), steel, 0, -this.lianaLen - 0.08, 0));
    this.lianaAxis.set(dir.z, 0, -dir.x).normalize();
    this.group.add(crane, hook);
    this.liana = hook;
    // für die Kamera: Mastspitze und Ausleger wie Baumkronen meiden, Mast als Hindernis
    this.crowns.push(L(0, H + 0.9, 0), L(D * 0.5, H + 0.5, 0));
    this.blockers.push({ x: tx, z: tz, r: 1.5, top: ty + H + 1.8 });
  }

  // =========================================================================
  // Plasma-Bach: Kristallquelle, Leuchtstängel und kleine Kristalle am Ufer
  // =========================================================================
  protected override buildCreekDeco() {
    const creek = this.layout.creek;
    if (creek.length < 3) return;
    const b = new Batch();
    const src = creek[0]!;
    const next = creek[2]!;
    const back = new THREE.Vector3(src.x - next.x, 0, src.z - next.z).normalize();
    // Quelle: Kristallgruppe, aus der das Plasma quillt
    for (let k = 0; k < 7; k++) {
      const a = (k / 7) * Math.PI * 1.5 - 0.75 + Math.atan2(back.z, back.x);
      const r = 0.55 + (k % 2) * 0.35;
      const x = src.x + back.x * 0.6 + Math.cos(a) * r;
      const z = src.z + back.z * 0.6 + Math.sin(a) * r;
      const h = 0.7 + ((k * 7) % 5) * 0.22;
      // nach außen geneigt
      const tilt = new THREE.Euler(Math.sin(a) * 0.45, 0, -Math.cos(a) * 0.45);
      b.at(crystalGeo(0.14 + (k % 3) * 0.04, h), crystalMat(k), x, this.field.height(x, z) - 0.05, z, tilt);
    }
    for (let k = 0; k < 3; k++) {
      const a = Math.atan2(back.z, back.x) + (k - 1) * 0.9;
      const x = src.x + back.x * 1.2 + Math.cos(a) * 0.9;
      const z = src.z + back.z * 1.2 + Math.sin(a) * 0.9;
      const g = new THREE.DodecahedronGeometry(0.32 + k * 0.08, 0);
      g.scale(1, 0.7, 1);
      b.at(g, mat(C.rock, { flat: true }), x, this.field.height(x, z) + 0.1, z, new THREE.Euler(k, k * 1.7, k * 0.5));
    }
    // Ufer: Leuchtstängel und kleine Kristalle (nicht direkt am Weg)
    const stalk = mat('#2f6f7a', { rough: 0.8, flat: true });
    const bulbs = [mat('#7af7ff', { emissive: '#1fb8d6' }), mat('#ff8ae8', { emissive: '#c22aa2' }), mat('#c7ff7a', { emissive: '#5aa01a' })];
    for (let i = 4; i < creek.length - 2; i += 3) {
      const p = creek[i]!;
      const q = creek[i + 1]!;
      const dx = q.x - p.x;
      const dz = q.z - p.z;
      const l = Math.hypot(dx, dz) || 1;
      const sx = -dz / l;
      const sz = dx / l;
      if (this.field.pathDistance(p.x, p.z) < this.layout.fieldRadius * 1.6) continue;
      const side = i % 2 ? 1 : -1;
      const x = p.x + sx * side * (p.w + 0.35);
      const z = p.z + sz * side * (p.w + 0.35);
      const y = this.field.height(x, z);
      if (i % 6 === 1) b.at(crystalGeo(0.08 + (i % 3) * 0.03, 0.4 + (i % 4) * 0.1), crystalMat(i), x, y - 0.03, z, new THREE.Euler(0.2 * side, i, 0.15));
      else
        for (let k = 0; k < 3; k++) {
          const h = 0.55 + k * 0.18;
          const ox = (k - 1) * 0.1;
          const oz = (k % 2) * 0.09;
          const lean = (k - 1) * 0.16;
          const tip = new THREE.Vector3(x + ox + Math.sin(lean) * h, y + Math.cos(lean) * h, z + oz);
          b.add(strut(new THREE.Vector3(x + ox, y - 0.05, z + oz), tip, 0.022, 4), stalk);
          b.at(new THREE.SphereGeometry(0.065, 8, 6), bulbs[(i + k) % 3]!, tip.x, tip.y, tip.z);
        }
    }
    b.build(this.group, false);
  }

  // =========================================================================
  // Kapseln oder Kisten: zwei schwebende Wege über das Plasma
  // =========================================================================
  /** Schwebekapsel (Weg der „Fässer“): Oberseite bei y = 0, Höhe h – je Material ein Mesh */
  private capsule(r: number, h: number, k: number) {
    const g = new THREE.Group();
    const b = new Batch();
    const body = mat(C.hull, { rough: 0.35, metal: 0.25 });
    const band = staticGlow(k % 2 ? C.cyan : C.magenta, 1.6);
    b.at(new THREE.CylinderGeometry(r, r * 0.92, h - 0.3, 24), body, 0, -h / 2 - 0.1, 0);
    b.at(new THREE.SphereGeometry(r * 0.92, 24, 10, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), body, 0, -h + 0.2, 0);
    // Leuchtband knapp über dem Plasma (die Oberseite liegt gut 0,4 m über der Oberfläche)
    b.at(new THREE.CylinderGeometry(r * 1.02, r * 1.02, 0.08, 24), band, 0, -0.3, 0);
    // Landeplatte oben mit Leuchtring, Positionslichter
    b.at(new THREE.CylinderGeometry(r * 0.98, r, 0.2, 24), mat(C.dark, { rough: 0.5, metal: 0.4 }), 0, -0.1, 0);
    b.add(new THREE.TorusGeometry(r * 0.82, 0.04, 6, 32).rotateX(Math.PI / 2), band, new THREE.Matrix4().makeTranslation(0, 0.005, 0));
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + 0.4;
      b.at(new THREE.SphereGeometry(0.055, 8, 6), staticGlow(C.lime, 2), Math.cos(a) * r, -0.2, Math.sin(a) * r);
    }
    b.build(g);
    return g;
  }

  /** Frachtkiste (Weg der „Kisten“): Rahmen, farbige Felder, Leuchtstreifen; Oberseite bei y = 0 */
  private cargo(s: number, h: number) {
    const g = new THREE.Group();
    const b = new Batch();
    const frame = mat(C.dark, { rough: 0.5, metal: 0.45 });
    b.at(new THREE.BoxGeometry(s * 0.96, h * 0.96, s * 0.96), mat(C.orange, { rough: 0.55, flat: true }), 0, -h / 2, 0);
    const t = 0.09;
    for (const [x, z] of [[1, 1], [1, -1], [-1, 1], [-1, -1]] as const) b.at(new THREE.BoxGeometry(t, h, t), frame, (x * s) / 2, -h / 2, (z * s) / 2);
    for (const y of [-t / 2, -h + t / 2])
      for (const sgn of [-1, 1]) {
        b.at(new THREE.BoxGeometry(s + t, t, t), frame, 0, y, (sgn * s) / 2);
        b.at(new THREE.BoxGeometry(t, t, s + t), frame, (sgn * s) / 2, y, 0);
      }
    // Deckel (darauf steht die Figur) und Leuchtstreifen an allen Seiten (über dem Plasma)
    b.at(new THREE.BoxGeometry(s * 0.9, 0.06, s * 0.9), mat(C.panel, { rough: 0.5, metal: 0.3 }), 0, -0.03, 0);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      b.at(new THREE.BoxGeometry(s * 0.7, 0.07, 0.02), staticGlow(C.cyan, 1.8), Math.sin(a) * (s * 0.485), -0.2, Math.cos(a) * (s * 0.485), new THREE.Euler(0, a, 0));
    }
    b.build(g);
    return g;
  }

  protected override buildFord() {
    const ff = this.layout.fordFields;
    if (!ff.length) return;
    const fr = this.layout.fieldRadius;
    const top = this.layout.ford.raftY - 0.08;
    const { flow, up, gap } = fordLanes(this.layout);
    // Halter steht an der Stelle des Teils (Höhe 0): das Schaukeln der Grundklasse dreht dann um einen
    // Punkt knapp darunter statt um die Inselmitte – sonst hebt und senkt sich das Teil um bis zu 1 m
    ff.forEach((i, k) => {
      const f = this.layout.fields[i]!;
      const pod = this.capsule(fr, 1.7, k);
      pod.position.set(0, top, 0);
      pod.rotation.y = k * 1.3;
      const bHolder = new THREE.Group();
      bHolder.position.set(f.x, 0, f.z);
      bHolder.add(pod);
      this.group.add(bHolder);
      this.lanes.barrels.push({ o: bHolder, top: new THREE.Vector3(f.x, top, f.z), ph: k * 1.7, hidden: 0, rise: 0 });
      const cx = f.x + up.x * gap;
      const cz = f.z + up.z * gap;
      const box = this.cargo(fr * 1.75, 1.7);
      box.position.set(0, top + 0.02, 0);
      box.rotation.y = Math.atan2(flow.x, flow.z) + 0.08 * (k % 2 ? 1 : -1);
      const cHolder = new THREE.Group();
      cHolder.position.set(cx, 0, cz);
      cHolder.add(box);
      this.group.add(cHolder);
      this.lanes.crates.push({ o: cHolder, top: new THREE.Vector3(cx, top + 0.02, cz), ph: k * 2.3 + 1, hidden: 0, rise: 0 });
    });
    // Leitpfosten mit Lampen an beiden Ufern, dazwischen leuchtende Energieleinen
    const span = this.fordSpan();
    const bank = this.layout.fields[span.bank]!;
    const exit = this.layout.fields[span.exit]!;
    const lineMat = glow(C.cyan, 1.3);
    for (const off of [fr * 1.45, -(gap + fr * 1.35)]) {
      const pa = new THREE.Vector3(bank.x + flow.x * off, bank.y + 1.0, bank.z + flow.z * off);
      const pb = new THREE.Vector3(exit.x + flow.x * off, exit.y + 1.0, exit.z + flow.z * off);
      for (const q of [pa, pb]) {
        this.group.add(mesh(new THREE.CylinderGeometry(0.06, 0.08, 1.5, 8), mat(C.hull, { rough: 0.4, metal: 0.3 }), q.x, q.y - 0.7, q.z));
        this.group.add(mesh(new THREE.SphereGeometry(0.1, 10, 8), glow(C.cyan, 2.4), q.x, q.y + 0.08, q.z, false));
      }
      const mid = pa.clone().lerp(pb, 0.5);
      mid.y -= 0.45;
      this.group.add(mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([pa, mid, pb]), 20, 0.025, 5, false), lineMat, 0, 0, 0, false));
    }
    // Holo-Wegweiser am Ufer: Kapseln (Weg auf den Feldern) und Kisten (flussaufwärts)
    const dir = new THREE.Vector3(Math.cos(bank.heading), 0, Math.sin(bank.heading));
    const px = bank.x - dir.x * 0.4 + flow.x * (fr + 0.7);
    const pz = bank.z - dir.z * 0.4 + flow.z * (fr + 0.7);
    const py = this.field.height(px, pz);
    const post = new THREE.Group();
    post.position.set(px, py, pz);
    post.add(mesh(new THREE.CylinderGeometry(0.06, 0.09, 2.15, 8), mat(C.hull, { rough: 0.4, metal: 0.3 }), 0, 1.05, 0));
    post.add(mesh(new THREE.SphereGeometry(0.09, 10, 8), glow(C.magenta, 2.4), 0, 2.2, 0, false));
    const board = (text: string, ink: string, edge: string, toward: THREE.Vector3, y: number) => {
      const tex = holoTexture(text, ink, edge);
      const face = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false });
      const sign = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.38, 0.05), [mat(C.dark), mat(C.dark), mat(C.dark), mat(C.dark), face, face]);
      sign.castShadow = true;
      const yaw = Math.atan2(toward.x, toward.z);
      sign.position.set(toward.x * 0.55, y, toward.z * 0.55);
      sign.rotation.y = yaw - Math.PI / 2;
      post.add(sign);
    };
    const toPods = dir.clone().multiplyScalar(0.6).addScaledVector(up, 0.15).normalize();
    const toCargo = dir.clone().multiplyScalar(0.4).addScaledVector(up, 0.9).normalize();
    board('💊 Kapseln', '#ffb0f2', C.magenta, toPods, 1.75);
    board('📦 Kisten', '#9ff7ff', C.cyan, toCargo, 1.3);
    this.group.add(post);
    this.blockers.push({ x: px, z: pz, r: 0.5, top: py + 2.3 });
  }

  /** Die gewählte Seite trägt nicht: Kapsel bzw. Kiste kippt, flackert und versinkt im Plasma. */
  protected override burst(item: LaneItem, _choice: RiverChoice) {
    // solange `hidden` läuft, lässt die Grundklasse das Teil in Ruhe; danach taucht es wieder auf
    item.hidden = 4.3;
    const o = item.o;
    // gekippt wird das Teil selbst (um seine Oberseite), versenkt der Halter
    const body = o.children[0]!;
    const at = item.top;
    const y0 = o.position.y;
    const tilt = (Math.random() < 0.5 ? -1 : 1) * 0.45;
    const plasma = this.layout.ford.y;
    this.audio.play('blase', { volume: 0.7, rate: 0.8 });
    this.plasmaSplash(at.x, plasma, at.z, 30);
    let life = 0;
    let bubble = 0;
    const upd = (_t: number, dt: number) => {
      life += dt;
      const k = Math.min(1, life / 1.4);
      o.position.y = y0 - ease.in(k) * 2.8;
      body.rotation.x = tilt * ease.inOut(Math.min(1, life / 0.9));
      bubble += dt * 18;
      while (bubble > 1) {
        bubble -= 1;
        const a = Math.random() * Math.PI * 2;
        this.effects.glow.emit(1, (p) => Object.assign(p, { x: at.x + Math.cos(a) * 0.7, y: plasma + 0.05, z: at.z + Math.sin(a) * 0.7, vx: Math.cos(a) * 0.4, vy: rnd(1.2, 2.6), vz: Math.sin(a) * 0.4, maxLife: rnd(0.4, 0.8), size: rnd(0.18, 0.32), sizeEnd: 0.05, r: 0.5, g: 1.9, b: 1.5, alpha: 1, gravity: 3, drag: 0.8 }));
      }
      if (k >= 1) {
        o.visible = false;
        o.position.y = y0;
        body.rotation.x = 0;
        this.updaters.delete(upd);
      }
    };
    this.updaters.add(upd);
  }

  /** Nach Rückgängig: auch gekippte Kapseln und Kisten wieder gerade stellen */
  override abortAll() {
    super.abortAll();
    for (const lane of [this.lanes.barrels, this.lanes.crates]) for (const it of lane) if (it.o.children[0]) it.o.children[0].rotation.x = 0;
  }

  /** Figur fällt ins Plasma: leuchtendes Spritzen statt Wasser */
  protected override plunge(x: number, y: number, z: number) {
    this.audio.play('platsch', { volume: 0.8, rate: 1.1 });
    this.plasmaSplash(x, y, z, 50);
  }

  /** Im Plasma: Schutzblase um die Figur, am Ufer zerplatzt sie */
  protected override swimming(holder: THREE.Group, on: boolean) {
    const old = holder.getObjectByName('schutzblase');
    if (on) {
      if (old) return;
      const m = new THREE.ShaderMaterial({
        uniforms: { uTime: clock, uColor: { value: new THREE.Color(0.45, 1.25, 1.6) }, uOpacity: { value: 1 } },
        vertexShader: FX_VERT,
        fragmentShader: BUBBLE_FRAG,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      const bubble = this.temp(new THREE.Mesh(new THREE.SphereGeometry(0.78, 28, 18), m));
      bubble.name = 'schutzblase';
      holder.add(bubble);
      bubble.position.set(0, 0.62, 0);
      bubble.scale.setScalar(0.05);
      this.audio.play('blase', { volume: 0.6 });
      void this.tweens.run(0.45, (t) => bubble.scale.setScalar(Math.max(0.05, t)), ease.outBack);
      const wob = (t: number) => {
        if (!bubble.parent) return void this.updaters.delete(wob);
        if (bubble.scale.x >= 0.99) bubble.scale.set(1 + Math.sin(t * 5) * 0.04, 1 - Math.sin(t * 5) * 0.04, 1 + Math.cos(t * 4) * 0.04);
      };
      this.updaters.add(wob);
      return;
    }
    if (!old) return;
    const p = old.getWorldPosition(new THREE.Vector3());
    this.audio.play('pop', { volume: 0.7, rate: 1.2 });
    this.effects.sparkle(p.x, p.y - 0.4, p.z, new THREE.Color(C.cyan), 26, 0.9);
    this.drop(old);
  }

  /** Leuchtendes Plasma spritzt */
  private plasmaSplash(x: number, y: number, z: number, n = 40) {
    this.effects.glow.emit(n, (p, i) => {
      const a = Math.random() * Math.PI * 2;
      const s = rnd(0.6, 2.4);
      // meist Minz-Türkis wie das Plasma, dazwischen Magenta
      const pink = i % 3 === 0;
      Object.assign(p, { x, y: y + 0.1, z, vx: Math.cos(a) * s, vy: rnd(3, 7), vz: Math.sin(a) * s, maxLife: rnd(0.6, 1.1), size: rnd(0.25, 0.5), sizeEnd: 0.05, r: pink ? 2 : 0.45, g: pink ? 0.45 : 1.9, b: pink ? 1.8 : 1.45, alpha: 1, gravity: 9, drag: 0.6 });
    });
    this.effects.smoke.emit(Math.round(n / 3), (p) => {
      const a = Math.random() * Math.PI * 2;
      const s = rnd(0.3, 1.2);
      Object.assign(p, { x, y: y + 0.2, z, vx: Math.cos(a) * s, vy: rnd(1.5, 3), vz: Math.sin(a) * s, maxLife: rnd(1, 1.8), size: rnd(0.6, 1), sizeEnd: rnd(1.8, 2.6), r: 0.6, g: 0.95, b: 0.9, alpha: 0.4, drag: 1 });
    });
  }

  // =========================================================================
  // Kristallhöhle: Eingang und Ausgang mit großen Kristallen, Kristallfalter statt Fledermäusen
  // =========================================================================
  protected override buildCave() {
    const V = new THREE.Vector3(VOLCANO.x, 0, VOLCANO.z);
    const fr = this.layout.fieldRadius;
    const place = (index: number, off: number) => {
      const f = this.layout.fields[index]!;
      const inward = new THREE.Vector3(V.x - f.x, 0, V.z - f.z).normalize();
      const x = f.x + inward.x * off;
      const z = f.z + inward.z * off;
      return { f, inward, x, z, y: this.field.height(x, z) };
    };
    const rock = mat(C.rock, { flat: true });
    /** Felsbogen mit Kristallkranz; `inner` = Bild in der Öffnung */
    const gateway = (r: number, inner: THREE.Material, seed: number) => {
      const g = new THREE.Group();
      const arch = new THREE.Mesh(new THREE.TorusGeometry(r, r * 0.4, 7, 16, Math.PI), rock);
      arch.castShadow = arch.receiveShadow = true;
      g.add(arch);
      const hole = new THREE.Mesh(new THREE.CircleGeometry(r, 24, 0, Math.PI), inner);
      hole.position.z = -0.35;
      g.add(hole);
      const b = new Batch();
      for (let k = 0; k < 7; k++) {
        const rr = mesh(new THREE.DodecahedronGeometry(0.42 + (k % 3) * 0.14, 0), rock, (k - 3) * 0.55, 1.6 + Math.sin(k * 1.7) * 0.35, -0.45);
        rr.rotation.set(k, k * 2, k);
        g.add(rr);
      }
      // Kristalle wachsen strahlenförmig aus dem Bogen
      for (let k = 0; k < 9; k++) {
        const a = 0.12 + (k / 8) * (Math.PI - 0.24);
        const len = 0.5 + ((k * 5 + seed) % 4) * 0.22;
        const x = Math.cos(a) * (r + r * 0.25);
        const y = Math.sin(a) * (r + r * 0.25);
        const rot = new THREE.Euler(((k % 3) - 1) * 0.25, 0, a - Math.PI / 2);
        b.at(crystalGeo(0.11 + (k % 2) * 0.05, len), crystalMat(k + seed), x, y, -0.1 + (k % 2) * 0.15, rot);
      }
      // große Kristalle am Fuß
      for (const [x, h, k] of [[-r - 0.55, 1.5, 0], [-r - 0.95, 0.9, 1], [r + 0.6, 1.25, 2], [r + 1.0, 0.75, 3]] as const) b.at(crystalGeo(0.22, h), crystalMat(k + seed), x, -0.05, 0.1, new THREE.Euler(0, k, (x < 0 ? 1 : -1) * 0.25));
      b.build(g);
      return g;
    };
    // Einstieg: Kristallhöhle neben dem Feld, innen violett-türkises Leuchten
    const glowTex = (() => {
      const c = document.createElement('canvas');
      c.width = c.height = 128;
      const g = c.getContext('2d')!;
      const grd = g.createRadialGradient(64, 110, 4, 64, 100, 90);
      grd.addColorStop(0, '#b6fbff');
      grd.addColorStop(0.25, '#3ee8ff');
      grd.addColorStop(0.55, '#5a1fa8');
      grd.addColorStop(1, '#0b0716');
      g.fillStyle = grd;
      g.fillRect(0, 0, 128, 128);
      const t = new THREE.CanvasTexture(c);
      t.colorSpace = THREE.SRGBColorSpace;
      return t;
    })();
    const h = place(this.layout.plan.caveField, fr + 1.5);
    const entry = gateway(1.35, new THREE.MeshBasicMaterial({ map: glowTex, toneMapped: false }), 0);
    entry.position.set(h.x, h.f.y - 0.12, h.z);
    entry.rotation.y = Math.atan2(-h.inward.x, -h.inward.z);
    // Holo-Warnschild
    const sign = new THREE.Group();
    sign.position.set(1.9, 0, 0.7);
    sign.add(mesh(new THREE.CylinderGeometry(0.04, 0.05, 1.3, 6), mat(C.hull, { rough: 0.4, metal: 0.3 }), 0, 0.62, 0));
    const warn = new THREE.Mesh(new THREE.PlaneGeometry(0.95, 0.42), new THREE.MeshBasicMaterial({ map: holoTexture('⚠ Kristalle', '#ffe36e', '#ffb02e', 384, 168), transparent: true, side: THREE.DoubleSide, toneMapped: false }));
    warn.position.y = 1.32;
    sign.add(warn);
    sign.rotation.y = -0.4;
    entry.add(sign);
    const light = new THREE.PointLight('#7a6bff', 7, 6, 2);
    light.position.set(0, 0.7, 0.4);
    entry.add(light);
    this.group.add(entry);
    entry.updateMatrixWorld(true);
    this.hole = new THREE.Vector3(0, 0.1, -0.6).applyMatrix4(entry.matrixWorld);
    this.holeFront = new THREE.Vector3(0, 0.05, 0.9).applyMatrix4(entry.matrixWorld);
    this.blockers.push({ x: h.x, z: h.z, r: 1.6, top: h.f.y + 2.5 });
    // sanftes Pulsieren des Höhlenlichts
    this.animate((t) => (light.intensity = 7 + Math.sin(t * 2.1) * 1.5));

    // Ausgang: kleineres Tor am Vulkanfuß, dunkel mit schwachem Schimmer
    const m = place(this.layout.plan.caveExit, fr + 1.7);
    const gate = gateway(1.15, new THREE.MeshBasicMaterial({ color: '#100a22' }), 2);
    gate.position.set(m.x, m.y - 0.15, m.z);
    gate.rotation.y = Math.atan2(-m.inward.x, -m.inward.z);
    const shimmer = new THREE.Mesh(new THREE.CircleGeometry(0.7, 16, 0, Math.PI), new THREE.MeshBasicMaterial({ color: '#7a5cff', transparent: true, opacity: 0.35, toneMapped: false }));
    shimmer.position.z = -0.3;
    gate.add(shimmer);
    this.group.add(gate);
    const inner = new THREE.Vector3(0, 0.35, -0.15).applyMatrix4(gate.matrixWorld.compose(gate.position, gate.quaternion, gate.scale));
    this.mouth = { pos: new THREE.Vector3(m.x, m.y, m.z), inner };
  }

  /** Kristallfalter flattern leuchtend aus der Höhle bzw. dem Wurmloch */
  protected override bats(at: THREE.Vector3) {
    const wing = new THREE.BufferGeometry();
    // je Flügel eine Raute
    wing.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0.12, 0, 0.16, 0.34, 0.03, 0.02, 0, 0, 0, 0.34, 0.03, 0.02, 0.14, 0, -0.14, 0, 0, 0, -0.34, 0.03, 0.02, -0.12, 0, 0.16, 0, 0, 0, -0.14, 0, -0.14, -0.34, 0.03, 0.02], 3));
    wing.computeVertexNormals();
    const flock: { o: THREE.Mesh; v: THREE.Vector3; ph: number }[] = [];
    for (let k = 0; k < 9; k++) {
      const [c] = CRYSTALS[k % CRYSTALS.length]!;
      const o = this.temp(new THREE.Mesh(k ? wing.clone() : wing, glow(c, 1.8, { side: THREE.DoubleSide, transparent: true, opacity: 0.92 })));
      o.position.copy(at).add(new THREE.Vector3((Math.random() - 0.5) * 0.6, 0.3, (Math.random() - 0.5) * 0.6));
      const a = Math.random() * Math.PI * 2;
      flock.push({ o, v: new THREE.Vector3(Math.cos(a) * 2.2, 2.6 + Math.random() * 1.8, Math.sin(a) * 2.2), ph: Math.random() * 6 });
    }
    let life = 0;
    const upd = (_t: number, dt: number) => {
      life += dt;
      for (const b of flock) {
        b.o.position.addScaledVector(b.v, dt);
        b.v.x += Math.sin(life * 3 + b.ph) * dt * 3;
        b.v.z += Math.cos(life * 2.3 + b.ph) * dt * 3;
        b.o.scale.set(1.3 * (0.25 + Math.abs(Math.sin(life * 14 + b.ph))), 1.3, 1.3);
        b.o.rotation.y = Math.atan2(b.v.x, b.v.z);
      }
      // weiterflattern, bis sie aus dem Bild sind – erst dann verschwinden
      this.flyOff(flock, life, upd);
    };
    this.updaters.add(upd);
  }

  // =========================================================================
  // Wurmloch: Wirbel öffnet sich unter der Figur und zieht sie hinab ins Innere
  // =========================================================================
  override trapdoor(teamId: string, field: number) {
    return this.run(async (epoch) => {
      const g = this.pieces.grab(teamId);
      const f = this.layout.fields[field];
      if (!g || !f) return;
      const at = g.holder.position.clone();
      const root = this.temp(new THREE.Group());
      root.position.set(at.x, at.y + 0.03, at.z);
      const disc = new THREE.Mesh(new THREE.CircleGeometry(1.05, 48).rotateX(-Math.PI / 2), discMaterial('#7a2cff', '#3ee8ff', { hole: true, spin: 3.5 }));
      disc.renderOrder = 4;
      const rim = mesh(new THREE.TorusGeometry(1.05, 0.05, 6, 48).rotateX(Math.PI / 2), glow(C.violet, 2.4), 0, 0.02, 0, false);
      root.add(disc, rim);
      root.scale.setScalar(0.01);
      let suck = 0;
      const spin = (_t: number, dt: number) => {
        disc.rotation.y -= dt * 1.5;
        // Funken wirbeln hinein
        suck += dt * 30;
        while (suck > 1) {
          suck -= 1;
          const a = Math.random() * Math.PI * 2;
          const r = 1.3 * root.scale.x;
          this.effects.stars.emit(1, (p) => Object.assign(p, { x: at.x + Math.cos(a) * r, y: at.y + 0.1, z: at.z + Math.sin(a) * r, vx: -Math.cos(a) * 1.4 - Math.sin(a) * 1.6, vy: rnd(-0.1, 0.3), vz: -Math.sin(a) * 1.4 + Math.cos(a) * 1.6, maxLife: 0.6, size: rnd(0.2, 0.35), sizeEnd: 0.02, r: 0.9, g: 0.6, b: 2.2, alpha: 1, drag: 0.5, spin: rnd(-4, 4) }));
        }
      };
      this.updaters.add(spin);
      this.audio.play('warp', { rate: 0.7, volume: 0.9 });
      g.rig.setMode('shock');
      await this.tweens.run(0.5, (t) => root.scale.setScalar(Math.max(0.01, ease.outBack(t))), ease.linear);
      this.guard(epoch);
      await this.tweens.wait(300);
      this.guard(epoch);
      this.audio.play('whoosh-down');
      g.rig.setMode('fly');
      await this.tweens.run(0.85, (t) => {
        const k = t * t;
        g.holder.position.set(at.x, at.y + Math.sin(t * Math.PI) * 0.25 - k * 1.8, at.z);
        g.holder.rotation.y += 0.2 + t * 0.5;
        const s = Math.max(0.05, 1 - k * 0.85);
        g.holder.scale.set(s * (1 - k * 0.3), s * (1 + k * 0.5), s * (1 - k * 0.3));
      }, ease.in);
      this.guard(epoch);
      g.holder.visible = false;
      g.holder.scale.setScalar(1);
      this.effects.sparkle(at.x, at.y + 0.2, at.z, new THREE.Color(C.violet), 30, 1.1);
      this.bats(at.clone().setY(at.y + 0.5));
      await this.tweens.run(0.55, (t) => root.scale.setScalar(Math.max(0.01, 1 - t)), ease.in);
      this.updaters.delete(spin);
      this.drop(root);
    });
  }

  /** Aus der Alien-Höhle zurück: Teleporterstrahl am Feld, die Figur setzt sich aus Licht zusammen */
  override warpOut(teamId: string, field: number) {
    return this.run(async (epoch) => {
      const g = this.pieces.grab(teamId);
      if (!g) return;
      const at = this.pieces.slotOn(teamId, field);
      const pad = buildTelePad(7, 0.85);
      const root = this.temp(pad.root);
      root.position.set(at.x, at.y - 0.06, at.z);
      root.scale.setScalar(0.01);
      this.audio.play('warp');
      await this.tweens.run(0.35, (t) => {
        root.scale.setScalar(Math.max(0.01, ease.outBack(t)));
        pad.beamMat.uniforms.uOpacity!.value = t;
      }, ease.linear);
      this.guard(epoch);
      g.holder.visible = true;
      g.holder.position.copy(at).setY(at.y + 2.2);
      g.holder.scale.set(0.05, 1.4, 0.05);
      g.rig.setMode('fly');
      this.effects.sparkle(at.x, at.y + 0.6, at.z, new THREE.Color(C.cyan), 40, 1.2);
      await this.tweens.run(0.9, (t) => {
        g.holder.position.y = at.y + 2.2 * (1 - ease.out(t));
        const k = ease.out(t);
        g.holder.scale.set(0.05 + k * 0.95, 1.4 - k * 0.4, 0.05 + k * 0.95);
        g.holder.rotation.y += 0.25 * (1 - t);
      }, ease.linear);
      this.guard(epoch);
      g.holder.scale.setScalar(1);
      this.audio.play('land');
      this.effects.dust(at.x, at.y, at.z, new THREE.Color('#b9a8ff'), 12);
      this.pieces.release(teamId, field, 'cheer');
      await this.tweens.run(0.6, (t) => {
        pad.beamMat.uniforms.uOpacity!.value = 1 - t;
        root.scale.setScalar(Math.max(0.01, 1 - ease.in(t)));
      });
      this.drop(root);
    });
  }

  // =========================================================================
  // Jetpack (Katapult vorwärts): erscheint auf dem Rücken, zündet, die Figur hebt ab –
  // nach der Landung fliegt das Jetpack allein davon
  // =========================================================================
  private buildJetpack() {
    const root = new THREE.Group();
    const white = mat(C.hull, { rough: 0.35, metal: 0.25 });
    const red = mat('#ff5b3d', { rough: 0.4, metal: 0.2 });
    const dark = mat(C.dark, { rough: 0.5, metal: 0.5 });
    root.add(mesh(new THREE.BoxGeometry(0.42, 0.44, 0.1), white, 0, 0, 0.02, false));
    root.add(mesh(new THREE.SphereGeometry(0.05, 8, 6), glow(C.cyan, 2.5), 0, 0.12, -0.04, false));
    const flames: THREE.Mesh[] = [];
    const nozzles: THREE.Object3D[] = [];
    for (const x of [-0.13, 0.13]) {
      root.add(mesh(new THREE.CapsuleGeometry(0.1, 0.28, 4, 12), red, x, 0, -0.1, false));
      root.add(mesh(new THREE.CylinderGeometry(0.105, 0.105, 0.05, 12), white, x, 0.06, -0.1, false));
      const fin = mesh(new THREE.BoxGeometry(0.03, 0.16, 0.12), glow(C.cyan, 1.4), x * 1.75, -0.12, -0.1, false);
      root.add(fin);
      const nozzle = mesh(new THREE.CylinderGeometry(0.06, 0.085, 0.1, 12), dark, x, -0.27, -0.1, false);
      root.add(nozzle);
      nozzles.push(nozzle);
      // Flamme: Fuß an der Düse, Spitze nach unten
      const outer = new THREE.Mesh(new THREE.ConeGeometry(0.075, 0.55, 10, 1, true).rotateX(Math.PI).translate(0, -0.275, 0), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 1.1, 0.35), transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
      const inner = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.3, 8, 1, true).rotateX(Math.PI).translate(0, -0.15, 0), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.4, 2.0, 2.6), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
      outer.position.set(x, -0.32, -0.1);
      inner.position.set(x, -0.32, -0.1);
      outer.scale.y = inner.scale.y = 0.01;
      root.add(outer, inner);
      flames.push(outer, inner);
    }
    return { root, flames, nozzles };
  }

  override spring(teamId: string) {
    return this.run(async (epoch) => {
      const g = this.pieces.grab(teamId);
      if (!g) return;
      const base = g.holder.position.clone();
      // Figurhöhe in der Welt (Figuren sind auf 0,85 verkleinert)
      const H = g.rig.height * 0.85;
      const jet = this.buildJetpack();
      const pack = this.temp(jet.root);
      g.holder.add(pack);
      pack.position.set(0, H * 0.52, -H * 0.2);
      pack.scale.setScalar(0.01);
      const size = H * 1.15;
      let flame = 0;
      const setFlame = (f: number, t = 0) => {
        flame = f;
        jet.flames.forEach((m, i) => (m.scale.y = Math.max(0.01, f * (0.85 + Math.sin(t * 40 + i * 2) * 0.15))));
      };
      this.audio.play('zauber', { volume: 0.5, rate: 1.3 });
      this.effects.sparkle(base.x, base.y + H * 0.3, base.z, new THREE.Color(C.cyan), 18, 0.6);
      await this.tweens.run(0.4, (t) => pack.scale.setScalar(Math.max(0.01, ease.outBack(t) * size)), ease.linear);
      this.guard(epoch);
      // Zünden: Flammen wachsen, Figur geht in die Hocke, der Boden staubt
      g.rig.setMode('stuck');
      this.audio.play('swoosh', { volume: 0.7, rate: 0.6 });
      this.effects.dust(base.x, base.y, base.z, new THREE.Color('#c9b8ff'), 12);
      await this.tweens.run(0.55, (t) => {
        setFlame(0.25 + t * 0.6, t * 3);
        g.holder.position.y = base.y + Math.sin(t * 60) * 0.015 * t;
      }, ease.in);
      this.guard(epoch);
      // Abheben
      this.audio.play('whoosh-up', { rate: 0.9 });
      g.rig.setMode('jump');
      this.effects.dust(base.x, base.y, base.z, new THREE.Color('#ffd0a0'), 16);
      await this.tweens.run(0.32, (t) => {
        setFlame(1, t * 2);
        g.holder.position.y = base.y + ease.out(t) * 0.9;
      }, ease.linear);
      this.guard(epoch);
      g.rig.setMode('fly');
      // während des Flugs (pieces.fly) brennen die Düsen weiter; nach der Landung fliegt das
      // Jetpack allein davon und verschwindet erst, wenn es aus dem Bild ist
      let life = 0;
      let away = -1;
      let speed = 0;
      let trail = 0;
      const tmp = new THREE.Vector3();
      const upd = (t: number, dt: number) => {
        life += dt;
        const p = this.pieces.get(teamId);
        if (away < 0) {
          setFlame(Math.max(0.55, flame), t);
          if (life > 0.4 && (!p || !p.busy || p.holder !== pack.parent)) {
            // gelandet: abkoppeln (Weltlage behalten) und los
            away = 0;
            this.group.attach(pack);
            this.audio.play('whoosh-up', { volume: 0.5, rate: 1.3 });
          } else if (life > 9) away = 0;
        } else {
          away += dt;
          speed += dt * 9;
          pack.position.y += speed * dt;
          pack.rotation.z += dt * 0.6;
          setFlame(1, t);
          if ((away > 0.8 && !this.seen(pack.position, 0.6, 0.5)) || away > 4) {
            this.updaters.delete(upd);
            this.drop(pack);
            return;
          }
        }
        trail += dt * 40;
        while (trail > 1) {
          trail -= 1;
          const n = jet.nozzles[Math.floor(Math.random() * 2)]!;
          n.getWorldPosition(tmp);
          this.effects.glow.emit(1, (q) => Object.assign(q, { x: tmp.x + rnd(-0.03, 0.03), y: tmp.y - 0.1, z: tmp.z + rnd(-0.03, 0.03), vx: rnd(-0.4, 0.4), vy: rnd(-2.4, -1.2), vz: rnd(-0.4, 0.4), maxLife: rnd(0.25, 0.45), size: rnd(0.22, 0.36), sizeEnd: 0.04, r: 2, g: rnd(0.8, 1.3), b: 0.4, alpha: 1, drag: 2 }));
        }
      };
      this.updaters.add(upd);
    });
  }

  // =========================================================================
  // Schwarzes Loch (Katapult rückwärts): saugt die Figur ein und spuckt sie weiter hinten aus
  // =========================================================================
  private buildBlackHole() {
    const root = new THREE.Group();
    const halo = glowSprite('#c9a6ff', 3.4, 0.36, 2.2);
    halo.renderOrder = 3;
    const core = new THREE.Mesh(new THREE.SphereGeometry(0.55, 28, 18), new THREE.MeshBasicMaterial({ color: '#000000', fog: false }));
    core.renderOrder = 4;
    const discMat = discMaterial('#ff7a2f', '#ff3cc8', { inner: 0.34, spin: 3 });
    const disc = new THREE.Mesh(new THREE.CircleGeometry(2.0, 64), discMat);
    disc.rotation.x = -Math.PI / 2 + 0.42;
    disc.renderOrder = 5;
    const glowBall = glowSprite('#ff6ad5', 6, 0, 0.5);
    root.add(glowBall, halo, core, disc);
    return { root, disc, halo };
  }

  override plane(teamId: string, to: number, color = '#ff6fb5') {
    return this.run(async (epoch) => {
      const g = this.pieces.grab(teamId);
      if (!g) return;
      const start = g.holder.position.clone();
      const target = this.pieces.slotOn(teamId, to);
      const bh = this.buildBlackHole();
      const hole = this.temp(bh.root);
      const at = start.clone().add(new THREE.Vector3(0, 2.9, 0));
      hole.position.copy(at);
      hole.scale.setScalar(0.01);
      let drawIn = 1;
      let acc = 0;
      const spin = (t: number, dt: number) => {
        bh.disc.rotation.z += dt * 1.2;
        bh.halo.material.rotation = t * 0.3;
        // Staub und Funken wirbeln hinein
        acc += dt * 26 * drawIn;
        while (acc > 1) {
          acc -= 1;
          const a = Math.random() * Math.PI * 2;
          const r = rnd(1.8, 2.6) * hole.scale.x;
          const y = rnd(-0.6, 0.6);
          this.effects.stars.emit(1, (p) => Object.assign(p, { x: at.x + Math.cos(a) * r, y: at.y + y, z: at.z + Math.sin(a) * r, vx: -Math.cos(a) * r * 1.6 - Math.sin(a) * 1.8, vy: -y * 1.6, vz: -Math.sin(a) * r * 1.6 + Math.cos(a) * 1.8, maxLife: 0.55, size: rnd(0.2, 0.36), sizeEnd: 0.02, r: 1.8, g: 0.7, b: 2.0, alpha: 1, drag: 0.2, spin: rnd(-4, 4) }));
        }
      };
      this.updaters.add(spin);
      // Erscheinen: aus einem Punkt wächst das Loch
      this.audio.play('warp', { rate: 0.55, volume: 0.9 });
      this.audio.play('rumble', { volume: 0.5 });
      g.rig.setMode('shock');
      g.holder.rotation.y = Math.atan2(target.x - start.x, target.z - start.z) + Math.PI;
      await this.tweens.run(0.8, (t) => hole.scale.setScalar(Math.max(0.01, ease.outBack(t))), ease.linear);
      this.guard(epoch);
      await this.tweens.wait(250);
      this.guard(epoch);
      // Ansaugen: die Figur wird gestreckt, dreht sich und verschwindet im Loch
      this.audio.play('whoosh-up', { rate: 0.7 });
      g.rig.setMode('fly');
      await this.tweens.run(1.1, (t) => {
        const k = ease.in(t);
        g.holder.position.lerpVectors(start, at, k);
        g.holder.position.x += Math.sin(t * Math.PI * 3) * 0.3 * (1 - t);
        g.holder.position.z += Math.cos(t * Math.PI * 3) * 0.3 * (1 - t);
        g.holder.rotation.y += 0.12 + t * 0.6;
        const s = Math.max(0.05, 1 - k * 0.95);
        g.holder.scale.set(s * (1 - k * 0.4), s * (1 + k * 1.2), s * (1 - k * 0.4));
      }, ease.linear);
      this.guard(epoch);
      g.holder.visible = false;
      drawIn = 0;
      // Schluckauf …
      this.audio.play('blase', { rate: 0.55, volume: 0.8 });
      await this.tweens.run(0.6, (t) => hole.scale.setScalar(1 + Math.sin(t * Math.PI * 3) * 0.16 * (1 - t)), ease.linear);
      this.guard(epoch);
      // … und ausspucken: im hohen Bogen rückwärts, Funkenspur in Teamfarbe
      this.audio.play('swoosh', { rate: 1.1 });
      this.effects.sparkle(at.x, at.y - 0.8, at.z, new THREE.Color('#ffffff'), 30, 1.4);
      g.holder.visible = true;
      g.holder.scale.setScalar(0.2);
      void this.tweens.run(0.7, (t) => hole.scale.setScalar(Math.max(0.01, 1 - t)), ease.in).then(() => {
        this.updaters.delete(spin);
        this.drop(hole);
      });
      const top = Math.max(at.y, target.y) + 2.5 + start.distanceTo(target) * 0.2;
      const curve = new THREE.QuadraticBezierCurve3(at.clone(), at.clone().lerp(target, 0.5).setY(top), target.clone());
      const tc = new THREE.Color(color);
      let trail = 0;
      await this.tweens.run(1.7, (t) => {
        g.holder.position.copy(curve.getPoint(t));
        g.holder.scale.setScalar(Math.min(1, 0.2 + t * 3));
        g.holder.rotation.x = t * Math.PI * 2;
        trail += 1;
        if (trail % 2 === 0) this.effects.stars.emit(1, (p) => Object.assign(p, { x: g.holder.position.x, y: g.holder.position.y + 0.5, z: g.holder.position.z, maxLife: 0.7, size: rnd(0.3, 0.5), sizeEnd: 0.05, r: tc.r * 1.6, g: tc.g * 1.6, b: tc.b * 1.6, alpha: 1, spin: rnd(-3, 3) }));
      }, ease.inOut);
      this.guard(epoch);
      g.holder.rotation.x = 0;
      this.audio.play('land');
      this.effects.dust(target.x, target.y, target.z, new THREE.Color('#c9b8ff'), 14);
      this.pieces.release(teamId, to, 'sad');
    });
  }

  // =========================================================================
  // Teleporter (Platztausch): Felder unter beiden Figuren, eine Lichtkugel trägt sie hin und her
  // =========================================================================
  override ufoSwap(aId: string, bId: string, posA: number, posB: number) {
    return this.run(async (epoch) => {
      const ga = this.pieces.grab(aId);
      const gb = this.pieces.grab(bId);
      if (!ga || !gb) return;
      const pa = ga.holder.position.clone();
      const pb = gb.holder.position.clone();
      const hover = 3;
      const padA = buildTelePad(hover);
      const padB = buildTelePad(hover);
      const rootA = this.temp(padA.root);
      const rootB = this.temp(padB.root);
      rootA.position.copy(pa).setY(pa.y - 0.06);
      rootB.position.copy(pb).setY(pb.y - 0.06);
      rootA.scale.setScalar(0.01);
      rootB.scale.setScalar(0.01);
      // Lichtkugel (die Kamera fährt mit ihr)
      const orb = this.temp(new THREE.Group());
      orb.add(new THREE.Mesh(new THREE.SphereGeometry(0.3, 20, 14), glow('#bff8ff', 2.6)));
      orb.add(glowSprite(C.cyan, 2.4, 0, 1.5));
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.03, 6, 40), glow(C.magenta, 2.2));
      orb.add(ring);
      orb.scale.setScalar(0.01);
      const overA = pa.clone().setY(pa.y + hover);
      const overB = pb.clone().setY(pb.y + hover);
      orb.position.copy(overA);
      this.ufoTarget = orb.position;
      let trail = 0;
      const spin = (t: number, dt: number) => {
        ring.rotation.x = t * 2.3;
        ring.rotation.y = t * 1.7;
        padA.ring.rotation.z = padB.ring.rotation.z = t;
        trail += dt * 20;
        while (trail > 1) {
          trail -= 1;
          if (orb.scale.x > 0.3) this.effects.stars.emit(1, (p) => Object.assign(p, { x: orb.position.x + rnd(-0.2, 0.2), y: orb.position.y + rnd(-0.2, 0.2), z: orb.position.z + rnd(-0.2, 0.2), maxLife: 0.6, size: rnd(0.25, 0.4), sizeEnd: 0.03, r: 0.6, g: 1.8, b: 2.2, alpha: 1, spin: rnd(-3, 3) }));
        }
      };
      this.updaters.add(spin);
      const beam = (pad: typeof padA, v: number) => (pad.beamMat.uniforms.uOpacity!.value = v);
      /** Figur löst sich im Strahl auf und steigt als Licht in die Kugel */
      const vanish = async (g: typeof ga, from: THREE.Vector3) => {
        g.rig.setMode('fly');
        await this.tweens.run(0.9, (t) => {
          const k = ease.in(t);
          g.holder.position.set(from.x, from.y + k * (hover - 0.4), from.z);
          g.holder.scale.set(Math.max(0.03, 1 - k), 1 + k * 0.6, Math.max(0.03, 1 - k));
          g.holder.rotation.y += 0.2;
        }, ease.linear);
        g.holder.visible = false;
        g.holder.scale.setScalar(1);
      };
      /** Figur kommt als Licht aus der Kugel und setzt sich auf dem Feld zusammen */
      const appear = async (g: typeof ga, to: THREE.Vector3) => {
        g.holder.visible = true;
        g.rig.setMode('fly');
        await this.tweens.run(0.9, (t) => {
          const k = ease.out(t);
          g.holder.position.set(to.x, to.y + (1 - k) * (hover - 0.4), to.z);
          g.holder.scale.set(Math.max(0.03, k), 1.6 - k * 0.6, Math.max(0.03, k));
          g.holder.rotation.y += 0.2 * (1 - t);
        }, ease.linear);
        g.holder.scale.setScalar(1);
      };
      const arc = (from: THREE.Vector3, to: THREE.Vector3) => (t: number) => {
        orb.position.lerpVectors(from, to, t);
        orb.position.y += Math.sin(t * Math.PI) * (2.5 + from.distanceTo(to) * 0.1);
      };
      const legTime = Math.min(4.2, Math.max(2, 0.6 + pa.distanceTo(pb) / 9));
      // 1) Teleporter erscheinen, Strahl über A, A wird zu Licht
      this.audio.play('zauber', { volume: 0.8 });
      await this.tweens.run(0.45, (t) => {
        rootA.scale.setScalar(Math.max(0.01, ease.outBack(t)));
        rootB.scale.setScalar(Math.max(0.01, ease.outBack(t)));
        orb.scale.setScalar(Math.max(0.01, t * 0.5));
      }, ease.linear);
      this.guard(epoch);
      this.audio.play('warp', { volume: 0.8, rate: 1.1 });
      await this.tweens.run(0.3, (t) => beam(padA, t), ease.linear);
      this.guard(epoch);
      this.effects.sparkle(pa.x, pa.y + 0.4, pa.z, new THREE.Color(C.cyan), 30, 1);
      await Promise.all([vanish(ga, pa), this.tweens.run(0.9, (t) => orb.scale.setScalar(0.5 + t * 0.5), ease.linear)]);
      this.guard(epoch);
      beam(padA, 0);
      // 2) Lichtkugel fliegt zu B
      await this.tweens.run(legTime, arc(overA, overB), ease.inOut);
      this.guard(epoch);
      // 3) A erscheint auf B, B wird zu Licht
      this.audio.play('warp', { volume: 0.8, rate: 0.95 });
      await this.tweens.run(0.3, (t) => beam(padB, t), ease.linear);
      this.guard(epoch);
      const slotA = this.pieces.slotOn(aId, posB);
      await Promise.all([appear(ga, slotA), vanish(gb, pb)]);
      this.guard(epoch);
      this.pieces.release(aId, posB, 'idle');
      beam(padB, 0);
      // 4) zurück zu A, B absetzen
      await this.tweens.run(legTime, arc(overB, overA), ease.inOut);
      this.guard(epoch);
      this.audio.play('warp', { volume: 0.8, rate: 1.05 });
      await this.tweens.run(0.3, (t) => beam(padA, t), ease.linear);
      this.guard(epoch);
      const slotB = this.pieces.slotOn(bId, posA);
      await Promise.all([appear(gb, slotB), this.tweens.run(0.9, (t) => orb.scale.setScalar(Math.max(0.01, 1 - t)), ease.in)]);
      this.guard(epoch);
      this.pieces.release(bId, posA, 'idle');
      this.effects.sparkle(slotB.x, slotB.y + 0.4, slotB.z, new THREE.Color(C.cyan), 24, 1);
      // 5) Teleporter verlöschen
      this.ufoTarget = null;
      void this.tweens.run(0.5, (t) => {
        beam(padA, 1 - t);
        rootA.scale.setScalar(Math.max(0.01, 1 - ease.in(t)));
        rootB.scale.setScalar(Math.max(0.01, 1 - ease.in(t)));
      }).then(() => {
        this.updaters.delete(spin);
        this.drop(rootA);
        this.drop(rootB);
        this.drop(orb);
      });
    });
  }

  // =========================================================================
  // Minispiel: Holo-Bühne mit Projektorring, Leuchtschirm und Neon-Scheinwerfern
  // =========================================================================
  override stageOn(index: number) {
    this.stageOff(true);
    const f = this.layout.fields[index];
    if (!f) return;
    const g = new THREE.Group();
    g.position.set(f.x, f.y, f.z);
    // Projektorring um das Feld
    const ring = new THREE.Group();
    ring.add(mesh(new THREE.TorusGeometry(1.55, 0.09, 8, 48).rotateX(Math.PI / 2), mat(C.dark, { rough: 0.45, metal: 0.5 }), 0, 0.08, 0, false));
    const lights: THREE.Mesh[] = [];
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      const l = mesh(new THREE.SphereGeometry(0.075, 8, 6), glow([C.cyan, C.magenta, C.lime][k % 3]!, 2.6), Math.cos(a) * 1.55, 0.16, Math.sin(a) * 1.55, false);
      ring.add(l);
      lights.push(l);
    }
    g.add(ring);
    // Leuchtschirm schwebt über dem Feld und dreht sich zur Kamera
    const c = document.createElement('canvas');
    c.width = 512;
    c.height = 256;
    const ctx = c.getContext('2d')!;
    const grd = ctx.createLinearGradient(0, 0, 0, 256);
    grd.addColorStop(0, 'rgba(30,24,90,0.92)');
    grd.addColorStop(1, 'rgba(90,20,110,0.92)');
    ctx.fillStyle = grd;
    ctx.beginPath();
    ctx.roundRect(10, 10, 492, 236, 36);
    ctx.fill();
    ctx.lineWidth = 10;
    ctx.strokeStyle = '#3ee8ff';
    ctx.shadowColor = '#3ee8ff';
    ctx.shadowBlur = 20;
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(160,240,255,0.07)';
    for (let y = 18; y < 240; y += 7) ctx.fillRect(18, y, 476, 2);
    ctx.font = 'bold 92px Fredoka, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = '#ff4fd8';
    ctx.shadowBlur = 24;
    ctx.fillStyle = '#ffffff';
    ctx.fillText('🎮 Minispiel!', 256, 132);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const screenMat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide, depthTest: false, toneMapped: false });
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 1.3), screenMat);
    screen.position.y = 3.6;
    screen.renderOrder = 9;
    g.add(screen);
    // Projektionsstrahl vom Ring zum Schirm
    const projMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.3, 0.9, 1.2), transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const proj = new THREE.Mesh(new THREE.CylinderGeometry(1.25, 1.5, 2.9, 32, 1, true), projMat);
    proj.position.y = 1.55;
    g.add(proj);
    // Neon-Scheinwerfer von oben
    const beams: THREE.Mesh[] = [];
    ['#ff4fd8', '#3ee8ff', '#a6ff4d'].forEach((col, k) => {
      const m = new THREE.MeshBasicMaterial({ color: new THREE.Color(col), transparent: true, opacity: 0.14, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
      const cone = new THREE.Mesh(new THREE.ConeGeometry(1.1, 6, 18, 1, true).translate(0, -3, 0), m);
      const a = (k / 3) * Math.PI * 2;
      cone.position.set(Math.cos(a) * 1.4, 6.2, Math.sin(a) * 1.4);
      g.add(cone);
      beams.push(cone);
    });
    g.scale.setScalar(0.01);
    this.group.add(g);
    this.stage = g;
    void this.tweens.run(0.5, (t) => g.scale.setScalar(Math.max(0.01, t)), ease.outBack);
    const upd = (t: number) => {
      beams.forEach((b, i) => {
        b.rotation.z = Math.sin(t * 1.6 + i * 2) * 0.25;
        b.rotation.x = Math.cos(t * 1.3 + i) * 0.25;
      });
      ring.rotation.y = t * 0.8;
      lights.forEach((l, i) => (l.visible = Math.sin(t * 6 - i * 0.8) > -0.3));
      screen.position.y = 3.6 + Math.sin(t * 3) * 0.08;
      // Holo-Flackern
      screenMat.opacity = Math.sin(t * 23) > 0.96 ? 0.65 : 1;
      projMat.opacity = 0.1 + Math.sin(t * 4) * 0.03;
      if (this.camPos) screen.lookAt(this.camPos);
    };
    g.userData.upd = upd;
    this.updaters.add(upd);
    this.effects.confettiBurst(f.x, f.y + 3.6, f.z, ['#ff4fd8', '#3ee8ff', '#a6ff4d', '#ffffff'], 90, 0.7);
  }

  /** Vulkanfeld: Plasma-Fontäne statt Dampf */
  override geyser(index: number) {
    const f = this.layout.fields[index];
    if (!f) return;
    for (const ms of [0, 380, 760]) void this.tweens.wait(ms).then(() => this.plasmaFountain(f.x, f.y + 0.2, f.z));
  }

  private plasmaFountain(x: number, y: number, z: number) {
    this.effects.glow.emit(45, (p, i) => {
      const a = Math.random() * Math.PI * 2;
      const s = rnd(0.3, 1.6);
      const pink = i % 2 === 0;
      Object.assign(p, { x: x + rnd(-0.2, 0.2), y, z: z + rnd(-0.2, 0.2), vx: Math.cos(a) * s, vy: rnd(6, 12), vz: Math.sin(a) * s, maxLife: rnd(0.9, 1.6), size: rnd(0.3, 0.55), sizeEnd: 0.06, r: pink ? 2.1 : 0.5, g: pink ? 0.5 : 1.6, b: 2.1, alpha: 1, gravity: 9 });
    });
    this.effects.smoke.emit(40, (p) => {
      const a = Math.random() * Math.PI * 2;
      const s = rnd(0.1, 0.6);
      Object.assign(p, { x: x + rnd(-0.3, 0.3), y: y + rnd(0, 0.6), z: z + rnd(-0.3, 0.3), vx: Math.cos(a) * s, vy: rnd(5, 10), vz: Math.sin(a) * s, maxLife: rnd(1.4, 2.4), size: rnd(0.6, 1.1), sizeEnd: rnd(2.6, 4.5), r: 0.7, g: 0.5, b: 1, alpha: 0.55, drag: 0.8, gravity: -0.3 });
    });
    this.effects.sparkle(x, y + 1.2, z, new THREE.Color(C.cyan), 10, 0.8);
  }

  override update(t: number, dt: number, camera?: THREE.Camera) {
    clock.value = t;
    super.update(t, dt, camera);
    if (this.anims) for (const a of this.anims) a(t, dt);
  }
}
