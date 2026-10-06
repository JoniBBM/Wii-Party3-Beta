/**
 * Das Innere des Vulkans – eine eigene Szene: riesige Basalthöhle mit glühendem Lavasee,
 * Basaltsäulen mit Spielfeld-Scheiben (Strafrunde), Lavafall an der Rückwand, Tageslicht-Schacht
 * aus der Deckenöffnung (dort fallen die Teams herein) und grünem Warp-Portal als Ausgang.
 *
 * Feld 0 ist das Landefeld direkt unter der Öffnung, danach folgen 1 … length. Das Ausgangsfeld
 * (shout) leuchtet grün-golden: Wer genau dort landet, darf sofort raus.
 * Alles prozedural (Geometrie, Canvas- und Shader-Texturen), wenige Zeichenaufrufe.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { fbm, lerp, noise2, rand, smoothstep } from './noise.ts';
import { ParticleSystem } from './particles.ts';
import { GLSL_NOISE } from './worldfx.ts';

export interface InsideShot {
  position: THREE.Vector3;
  lookAt: THREE.Vector3;
}
export type InsideQuality = 'ultra' | 'high' | 'balanced' | 'eco';

// ---------------------------------------------------------------------------
// Maße
// ---------------------------------------------------------------------------
/** Höhle: Halbachsen der Grundellipse, Deckenhöhe in der Mitte, Oberkante der Wände */
const CAVE = { rx: 70, rz: 54, ceil: 40, wallTop: 54 };
/** Mitte der Route (z) – davor bleibt Platz für die Kamera, dahinter liegt der Lavafall */
const ROUTE_Z = -12;
const PLATE_R = 1.25;
const PLATE_H = 0.24;
/** Landefeld etwas größer (dort landen oft mehrere Teams) */
const LANDING_SCALE = 1.25;
const PILLAR_TOP = 1.12;
const PILLAR_BASE = 1.3;
const PORTAL_R = 1.9;
const MAX_STEPS = 20;
const MAX_PLATES = MAX_STEPS + 1;
/** Säulen-Kragen im Lavasee (Route + Portal + Reserve) */
const MAX_COLLARS = 24;
/** Halber vertikaler Öffnungswinkel der Beamer-Kamera (fov 42) und Bildformat */
const HALF_FOV = THREE.MathUtils.degToRad(21);
const ASPECT = 16 / 9;
/** Lavafall-Hauptstrom an der Rückwand */
const FALL = { angle: -Math.PI / 2, top: 33, w0: 8, w1: 12.5 };
const FALL2 = { angle: -Math.PI / 2 + 0.78, top: 24, w0: 2.6, w1: 4.2 };

interface QualityPreset {
  embers: number;
  /** 0 = keine Schatten */
  shadow: number;
  lavaLights: number;
  /** grünes Licht am Portal */
  portalLight: boolean;
  /** grünes Licht am Ausgangsfeld, zweites Lavafall-Licht */
  extraLights: boolean;
  /** Rauchsäulen über dem See */
  smoke: boolean;
  /** Blubbern und kleine Fontänen im See */
  pops: boolean;
  /** Dampf am Fuß des Lavafalls (Partikel pro Sekunde) */
  steam: number;
  /** Lavasee mit zweiter Schollen-Ebene */
  lavaDetail: boolean;
}

const QUALITY: Record<InsideQuality, QualityPreset> = {
  eco: { embers: 260, shadow: 0, lavaLights: 1, portalLight: false, extraLights: false, smoke: false, pops: false, steam: 3, lavaDetail: false },
  balanced: { embers: 600, shadow: 1024, lavaLights: 2, portalLight: true, extraLights: false, smoke: false, pops: true, steam: 6, lavaDetail: true },
  high: { embers: 1000, shadow: 2048, lavaLights: 3, portalLight: true, extraLights: true, smoke: false, pops: true, steam: 8, lavaDetail: true },
  ultra: { embers: 1800, shadow: 4096, lavaLights: 4, portalLight: true, extraLights: true, smoke: true, pops: true, steam: 12, lavaDetail: true },
};
const MAX_EMBERS = 1800;

const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

// ---------------------------------------------------------------------------
// Form der Höhle
// ---------------------------------------------------------------------------
/** Radius-Faktor der Wand bei Winkel a und Höhe y (1 = Grundellipse) */
function wallScale(a: number, y: number) {
  // nach oben überhängend, unten leicht in den See auslaufend
  const prof = 1 - 0.17 * smoothstep(4, CAVE.wallTop, y) + 0.05 * smoothstep(3, -3, y);
  // periodisches Rauschen (Winkel über cos/sin, damit die Naht verschwindet)
  const c = Math.cos(a);
  const s = Math.sin(a);
  const n = fbm(c * 2.2 + y * 0.045 + 3.1, s * 2.2 - y * 0.035 + 1.7, 4) * 0.14 + noise2(c * 9 + y * 0.18, s * 9 - y * 0.11) * 0.025;
  // Basalt-Orgelpfeifen: senkrechte Rippen im unteren Teil
  const rib = Math.abs(Math.sin(a * 46)) * 0.011 * (1 - smoothstep(18, 40, y));
  // Nische für den Lavafall
  const da = a - FALL.angle;
  const niche = Math.exp(-(da * da) / (0.11 * 0.11)) * 0.07 * smoothstep(-2, 8, y);
  return prof * (1 + n + rib + niche);
}

function wallPoint(a: number, y: number, inset = 0) {
  const s = wallScale(a, y);
  const x = Math.cos(a) * CAVE.rx * s;
  const z = Math.sin(a) * CAVE.rz * s;
  const l = Math.hypot(x, z) || 1;
  return new THREE.Vector3(x - (x / l) * inset, y, z - (z / l) * inset);
}

/** Deckenhöhe (ohne Öffnung) */
function ceilY(x: number, z: number) {
  const e2 = (x / CAVE.rx) ** 2 + (z / CAVE.rz) ** 2;
  return Math.max(30, CAVE.ceil - 6 * e2 + fbm(x * 0.04 + 7, z * 0.04 - 3, 4) * 5);
}

/** Elliptischer Abstand von der Mitte (1 = Wandfuß) */
const ell = (x: number, z: number) => Math.hypot(x / CAVE.rx, z / CAVE.rz);

/** Vertex-Farben für Basalt: dunkel, leicht rötlich, unten verkohlt/glutrot. */
function basaltColor(x: number, y: number, z: number, out: THREE.Color) {
  const n = noise2(x * 0.11 + y * 0.07, z * 0.11 - y * 0.05) * 0.5 + 0.5;
  const fine = noise2(x * 0.7 + 13, z * 0.7 + y * 0.6) * 0.5 + 0.5;
  const v = 0.6 + n * 0.55 + fine * 0.25;
  out.setRGB(0.07 * v, 0.054 * v, 0.048 * v);
  const low = smoothstep(5, 0, y);
  out.r += low * 0.06;
  out.g += low * 0.012;
  return out;
}

function colorize(geo: THREE.BufferGeometry, tint = 1, offset = new THREE.Vector3()) {
  const pos = geo.getAttribute('position');
  const cols = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    basaltColor(pos.getX(i) + offset.x, pos.getY(i) + offset.y, pos.getZ(i) + offset.z, c);
    cols[i * 3] = c.r * tint;
    cols[i * 3 + 1] = c.g * tint;
    cols[i * 3 + 2] = c.b * tint;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  return geo;
}

/** Nur Position/Normale/Farbe, nicht indiziert – damit sich alles zusammenfassen lässt. */
function prep(geo: THREE.BufferGeometry) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  if (g !== geo) geo.dispose();
  for (const name of Object.keys(g.attributes)) if (!['position', 'normal', 'color'].includes(name)) g.deleteAttribute(name);
  g.computeVertexNormals();
  return g;
}

/** Felsbrocken: verbeulter Ikosaeder */
function rockGeo(seed: number, detail = 1) {
  const g = new THREE.IcosahedronGeometry(1, detail);
  const p = g.getAttribute('position');
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    const z = p.getZ(i);
    const k = 1 + noise2(x * 1.7 + seed, z * 1.7 + y * 1.3) * 0.28;
    p.setXYZ(i, x * k, y * k, z * k);
  }
  return g;
}

/** Basaltsäule (Sechs-/Siebenkant, leicht verbeult), Fuß bei y = 0, Kopf bei y = h */
function columnGeo(rTop: number, rBase: number, h: number, sides: number, seed: number) {
  const g = new THREE.CylinderGeometry(rTop, rBase, h, sides, Math.max(2, Math.round(h / 1.6)), false);
  g.translate(0, h / 2, 0);
  const p = g.getAttribute('position');
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    const z = p.getZ(i);
    const top = y > h - 0.01;
    const k = top ? 1 : 1 + noise2(x * 1.3 + seed, y * 0.55 + z * 0.9) * 0.13;
    p.setXYZ(i, x * k, top ? y : y + noise2(x * 3 + seed, z * 3) * 0.08, z * k);
  }
  return g;
}

// ---------------------------------------------------------------------------
// Shader
// ---------------------------------------------------------------------------
const LAVA_VERT = /* glsl */ `
  uniform float uTime;
  varying vec3 vW;
  #include <fog_pars_vertex>
  ${GLSL_NOISE}
  void main() {
    vec4 w = modelMatrix * vec4(position, 1.0);
    w.y += (fxNoise(w.xz * 0.16 + uTime * 0.22) - 0.5) * 0.22 + (fxNoise(w.xz * 0.5 - uTime * 0.4) - 0.5) * 0.06;
    vW = w.xyz;
    vec4 mvPosition = viewMatrix * w;
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;

const LAVA_FRAG = /* glsl */ `
  uniform float uTime;
  uniform vec4 uCollars[${MAX_COLLARS}];
  uniform int uCollarCount;
  uniform vec4 uFall;
  uniform vec4 uFall2;
  uniform vec4 uBurst;
  varying vec3 vW;
  #include <common>
  #include <fog_pars_fragment>
  ${GLSL_NOISE}
  vec2 lvHash2(vec2 p) {
    p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
    return fract(sin(p) * 43758.5453);
  }
  // x: Abstand zur nächsten Schollengrenze (Voronoi F2 - F1), y: Zufallswert der Scholle
  vec2 lvCell(vec2 p, float t) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    float d1 = 8.0;
    float d2 = 8.0;
    float id = 0.0;
    for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
      vec2 g = vec2(float(x), float(y));
      vec2 o = lvHash2(i + g);
      vec2 oo = 0.5 + 0.46 * sin(t * (0.5 + o.y) + 6.2831 * o);
      float d = length(g + oo - f);
      if (d < d1) { d2 = d1; d1 = d; id = o.x; } else if (d < d2) { d2 = d; }
    }
    return vec2(d2 - d1, id);
  }
  void main() {
    vec2 p = vW.xz;
    // langsames Fließen vom Lavafall weg nach vorne, verwirbelt
    vec2 warp = vec2(fxNoise(p * 0.03 + 1.3), fxNoise(p * 0.03 + 7.9)) - 0.5;
    vec2 q = p + warp * 12.0 - vec2(0.0, uTime * 0.3);

    // offene Lavabecken und -flüsse zwischen der Kruste
    float pool = smoothstep(0.5, 0.66, fxFbm(q * 0.035 + 3.1));
    float collar = 0.0;
    for (int k = 0; k < ${MAX_COLLARS}; k++) {
      if (k >= uCollarCount) break;
      vec4 c = uCollars[k];
      float d = length(p - c.xy) - c.z;
      collar = max(collar, exp(-max(d, 0.0) * 1.6) * c.w);
    }
    vec2 fd = (p - uFall.xy) / vec2(uFall.z, uFall.z * 0.7);
    float fall = exp(-dot(fd, fd)) * uFall.w;
    vec2 fd2 = (p - uFall2.xy) / vec2(uFall2.z, uFall2.z * 0.7);
    fall = max(fall, exp(-dot(fd2, fd2)) * uFall2.w);
    float burst = 0.0;
    float bt = uTime - uBurst.z;
    if (bt > 0.0 && bt < 2.4) {
      float r = length(p - uBurst.xy);
      burst = exp(-pow((r - bt * 5.0) * 1.3, 2.0)) * (1.0 - bt / 2.4) * uBurst.w + exp(-r * 0.8) * max(0.0, 1.0 - bt * 1.5) * uBurst.w;
    }
    float hot = clamp(pool + collar + fall + burst, 0.0, 1.0);

    // Krustenschollen mit glühenden Fugen
    vec2 qw = q + (vec2(fxNoise(q * 0.11 + 2.0), fxNoise(q * 0.11 + 9.0)) - 0.5) * 7.0;
    vec2 c1 = lvCell(qw * vec2(0.17, 0.21), uTime * 0.1);
    float e = c1.x;
    float aa = fwidth(e) + 0.003;
    float gap = 0.035 + c1.y * 0.03 + hot * 0.55;
    float crust = smoothstep(gap - aa, gap + aa, e);
    float flick = fxNoise(q * 0.35 + uTime * 0.45);
    vec3 molten = mix(vec3(1.35, 0.17, 0.015), vec3(2.1, 0.42, 0.05), clamp(flick * 0.55 + hot * 0.6, 0.0, 1.0));
    // Kruste: dunkel, manche Schollen glimmen noch, Ränder heiß
    float cellHeat = smoothstep(0.7, 1.0, c1.y);
    vec3 crustCol = mix(vec3(0.05, 0.013, 0.007), vec3(0.11, 0.03, 0.012), fxNoise(q * 1.2)) ;
    crustCol += vec3(0.55, 0.06, 0.0) * (cellHeat * 0.35 + exp(-e * 10.0) * 0.5 + hot * 0.35);
    vec3 col = mix(molten, crustCol, crust);
    // heller Kern in den Fugen
    col += vec3(1.6, 0.4, 0.05) * (1.0 - crust) * smoothstep(gap, 0.0, e) * (1.0 - pool * 0.6);
    #ifdef LAVA_DETAIL
      vec2 c2 = lvCell(qw * 0.62 + 7.0, uTime * 0.2);
      float aa2 = fwidth(c2.x) + 0.003;
      float fine = 1.0 - smoothstep(0.018 - aa2, 0.035 + aa2, c2.x);
      // feine Haarrisse nur in Teilen der Kruste, in der Ferne ausblenden (sonst Flimmern)
      fine *= crust * smoothstep(0.45, 0.7, fxNoise(q * 0.07 + 5.0)) * (1.0 - smoothstep(0.05, 0.2, aa2));
      col += vec3(1.1, 0.16, 0.01) * fine;
    #endif
    // Weißglut direkt am Lavafall und bei Einschlägen
    col += vec3(1.6, 0.6, 0.12) * (fall * fall * 1.6 + burst * 1.4);
    col *= 0.93 + 0.07 * sin(uTime * 1.7 + p.x * 0.2 + p.y * 0.13);
    #ifdef USE_FOG
      #ifdef FOG_EXP2
        float fogF = 1.0 - exp(-fogDensity * fogDensity * vFogDepth * vFogDepth);
      #else
        float fogF = smoothstep(fogNear, fogFar, vFogDepth);
      #endif
      col = mix(col, fogColor, fogF * 0.6);
    #endif
    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
  }
`;

const FALL_VERT = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vW;
  #include <fog_pars_vertex>
  void main() {
    vUv = uv;
    vec4 w = modelMatrix * vec4(position, 1.0);
    vW = w.xyz;
    vec4 mvPosition = viewMatrix * w;
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;

const FALL_FRAG = /* glsl */ `
  uniform float uTime;
  varying vec2 vUv;
  varying vec3 vW;
  #include <common>
  #include <fog_pars_fragment>
  ${GLSL_NOISE}
  void main() {
    // uv.x: quer (0…1), uv.y: Meter ab Abbruchkante
    float m = vUv.y;
    float speed = 6.0 + m * 0.45;
    vec2 sp = vec2(vUv.x * 7.0, m * 0.32 - uTime * speed * 0.32);
    float streak = fxNoise(vec2(sp.x * 1.6, sp.y * 0.6)) * 0.6 + fxNoise(vec2(sp.x * 4.1, sp.y * 1.4 + 3.0)) * 0.4;
    float crustL = smoothstep(0.58, 0.8, fxFbm(vec2(sp.x * 0.9, sp.y * 0.5) + 4.0));
    float edge = abs(vUv.x - 0.5) * 2.0;
    float ragged = edge + (fxNoise(vec2(sp.y * 1.3, vUv.x * 5.0)) - 0.5) * 0.4;
    // oben quillt die Lava zerfranst aus dem Spalt
    ragged = max(ragged, 1.0 - m * 0.55 + (fxNoise(vec2(vUv.x * 9.0, uTime * 0.6)) - 0.5) * 0.9);
    if (ragged > 0.97) discard;
    float core = 1.0 - smoothstep(0.15, 0.95, ragged);
    vec3 col = mix(vec3(1.4, 0.16, 0.015), vec3(2.6, 0.62, 0.08), core * streak);
    col *= (0.75 + core * 0.55 + streak * 0.3) * (1.0 - crustL * 0.7);
    // Austritt oben: aus dem Fels quellend (dunkler), unten: Gischt und Weißglut
    col *= smoothstep(0.0, 2.5, m) * 0.7 + 0.3;
    col += vec3(1.5, 0.55, 0.12) * smoothstep(4.0, 0.0, vW.y);
    #ifdef USE_FOG
      #ifdef FOG_EXP2
        float fogF = 1.0 - exp(-fogDensity * fogDensity * vFogDepth * vFogDepth);
      #else
        float fogF = smoothstep(fogNear, fogFar, vFogDepth);
      #endif
      col = mix(col, fogColor, fogF * 0.5);
    #endif
    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
  }
`;

/** Lichtkegel/Leuchtsäule: additiv, weiche Ränder, wandernde Staubschlieren */
const BEAM_VERT = /* glsl */ `
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

const BEAM_FRAG = /* glsl */ `
  uniform vec3 uColor;
  uniform float uTime;
  uniform float uOpacity;
  uniform float uUp;
  uniform float uStreaks;
  varying vec2 vUv;
  varying vec3 vN;
  varying vec3 vV;
  ${GLSL_NOISE}
  void main() {
    float facing = pow(abs(dot(normalize(vN), normalize(vV))), 1.5);
    // uUp = 1: unten hell, nach oben verblassend; uUp = 0: oben hell, nach unten verblassend
    float g = mix(vUv.y, 1.0 - vUv.y, uUp);
    float grad = pow(g, 1.4) * smoothstep(0.0, 0.06, 1.0 - g);
    grad = mix(grad, smoothstep(0.0, 0.07, g) * (0.45 + 0.55 * g), 1.0 - uUp);
    float s = fxNoise(vec2(vUv.x * 18.0 + uTime * 0.15, vUv.y * 3.0 - uTime * 0.35 * uStreaks));
    float s2 = fxNoise(vec2(vUv.x * 41.0 - uTime * 0.1, vUv.y * 9.0 + uTime * 0.2));
    float streak = 0.55 + 0.45 * s * (0.6 + 0.4 * s2);
    gl_FragColor = vec4(uColor * facing * grad * streak * uOpacity, 1.0);
    #include <colorspace_fragment>
  }
`;

/** Warp-Strudel (Scheibe) */
const VORTEX_FRAG = /* glsl */ `
  uniform float uTime;
  uniform float uFlash;
  varying vec2 vUv;
  void main() {
    vec2 p = vUv * 2.0 - 1.0;
    float r = length(p);
    if (r > 1.0) discard;
    float a = atan(p.y, p.x);
    float spiral = sin(a * 3.0 + log(r + 0.04) * 5.5 + uTime * 4.2);
    float spiral2 = sin(a * 5.0 + log(r + 0.04) * 9.0 + uTime * 6.5 + 1.3);
    float arms = smoothstep(-0.1, 0.9, spiral) * 0.75 + smoothstep(0.4, 1.0, spiral2) * 0.35;
    vec3 deep = vec3(0.0, 0.05, 0.02);
    vec3 green = vec3(0.04, 0.85, 0.16);
    vec3 col = mix(deep, green * (1.0 + uFlash * 2.0), arms * (1.0 - r * 0.4));
    col += vec3(0.5, 1.6, 0.6) * exp(-r * 5.5) * (1.6 + uFlash * 4.0);
    float rim = smoothstep(0.82, 0.95, r) * (1.0 - smoothstep(0.95, 1.0, r));
    col += vec3(0.15, 1.2, 0.3) * rim * 1.4;
    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
  }
`;

/** Warp-Trichter (offener Zylinder, additiv) */
const FUNNEL_FRAG = /* glsl */ `
  uniform float uTime;
  uniform float uFlash;
  varying vec2 vUv;
  varying vec3 vN;
  varying vec3 vV;
  void main() {
    float facing = 0.4 + 0.6 * abs(dot(normalize(vN), normalize(vV)));
    float s = sin(vUv.x * 6.2831 * 3.0 + vUv.y * 6.0 - uTime * 5.0);
    float s2 = sin(vUv.x * 6.2831 * 5.0 - vUv.y * 9.0 - uTime * 7.0);
    float bands = smoothstep(0.55, 1.0, s) + smoothstep(0.75, 1.0, s2) * 0.5;
    float fade = pow(1.0 - vUv.y, 1.5) * smoothstep(0.0, 0.1, vUv.y);
    vec3 col = vec3(0.05, 0.9, 0.22) * (0.06 + bands * 0.9) * fade * facing * (1.0 + uFlash * 2.5);
    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
  }
`;

/** Aufsteigende Glutfunken – komplett auf der Grafikkarte animiert */
const EMBER_VERT = /* glsl */ `
  attribute vec4 aSeed;
  uniform float uTime;
  uniform float uScale;
  uniform float uHeight;
  uniform float uSize;
  uniform vec3 uColA;
  uniform vec3 uColB;
  varying vec3 vCol;
  varying float vAlpha;
  void main() {
    float life = fract(uTime * aSeed.w + aSeed.z);
    float h = uHeight * (0.45 + fract(aSeed.z * 7.13) * 0.55);
    vec3 pos = vec3(
      aSeed.x + sin(uTime * 0.7 + aSeed.z * 40.0) * 1.1 * life + life * 2.5 * (fract(aSeed.z * 3.7) - 0.5),
      0.15 + life * h,
      aSeed.y + cos(uTime * 0.55 + aSeed.z * 31.0) * 1.1 * life
    );
    vec4 mv = modelViewMatrix * vec4(pos, 1.0);
    float size = uSize * mix(1.0, 0.35, life) * (0.6 + fract(aSeed.z * 13.7) * 0.8);
    gl_PointSize = max(1.5, size * uScale / max(0.1, -mv.z));
    gl_Position = projectionMatrix * mv;
    vCol = mix(uColA, uColB, life);
    vAlpha = smoothstep(0.0, 0.05, life) * (1.0 - life) * (0.65 + 0.35 * sin(uTime * 11.0 + aSeed.z * 90.0));
  }
`;

const EMBER_FRAG = /* glsl */ `
  varying vec3 vCol;
  varying float vAlpha;
  void main() {
    float r = length(gl_PointCoord - 0.5);
    float a = smoothstep(0.5, 0.0, r);
    a *= a;
    if (a * vAlpha < 0.004) discard;
    gl_FragColor = vec4(vCol * a * vAlpha, 1.0);
    #include <colorspace_fragment>
  }
`;

// ---------------------------------------------------------------------------
// Texturen
// ---------------------------------------------------------------------------
/** Umgebung für Spiegelungen: oben dunkler Fels, unten glühende Lava, Lichtfleck der Öffnung. */
function envTexture() {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 256;
  const g = c.getContext('2d')!;
  const grd = g.createLinearGradient(0, 0, 0, 256);
  grd.addColorStop(0, '#120705');
  grd.addColorStop(0.42, '#2a0f08');
  grd.addColorStop(0.52, '#6a1e08');
  grd.addColorStop(0.62, '#e0520f');
  grd.addColorStop(1, '#ffb050');
  g.fillStyle = grd;
  g.fillRect(0, 0, 512, 256);
  // Lavafall (hinten) als heller Streifen
  const fall = g.createLinearGradient(0, 40, 0, 140);
  fall.addColorStop(0, 'rgba(255,140,40,0)');
  fall.addColorStop(1, 'rgba(255,170,60,0.9)');
  g.fillStyle = fall;
  g.fillRect(372, 40, 24, 100);
  // Tageslicht von oben
  const sky = g.createRadialGradient(256, 8, 2, 256, 8, 60);
  sky.addColorStop(0, 'rgba(255,250,235,1)');
  sky.addColorStop(1, 'rgba(255,240,220,0)');
  g.fillStyle = sky;
  g.fillRect(180, 0, 152, 70);
  const t = new THREE.CanvasTexture(c);
  t.mapping = THREE.EquirectangularReflectionMapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Weicher, runder Lichtfleck (für Halo und Glühen) */
function glowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.35, 'rgba(255,255,255,0.45)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const ATLAS_COLS = 8;
const ATLAS_ROWS = 3;
const CELL = 256;

/** Pfeil nach oben (zur Zellenoberkante = Laufrichtung) */
function drawArrow(g: CanvasRenderingContext2D, s: number, fill: string) {
  g.save();
  g.shadowColor = 'rgba(0,0,0,0.55)';
  g.shadowBlur = s * 0.04;
  g.shadowOffsetY = s * 0.012;
  g.fillStyle = fill;
  g.strokeStyle = 'rgba(20,30,60,0.55)';
  g.lineWidth = s * 0.018;
  g.lineJoin = 'round';
  g.beginPath();
  g.moveTo(s * 0.5, s * 0.06);
  g.lineTo(s * 0.77, s * 0.33);
  g.lineTo(s * 0.61, s * 0.33);
  g.lineTo(s * 0.61, s * 0.43);
  g.lineTo(s * 0.39, s * 0.43);
  g.lineTo(s * 0.39, s * 0.33);
  g.lineTo(s * 0.23, s * 0.33);
  g.closePath();
  g.fill();
  g.shadowColor = 'transparent';
  g.stroke();
  g.restore();
}

function drawStar(g: CanvasRenderingContext2D, cx: number, cy: number, r: number, fill: string) {
  g.save();
  g.shadowColor = 'rgba(0,0,0,0.5)';
  g.shadowBlur = r * 0.15;
  g.fillStyle = fill;
  g.beginPath();
  for (let i = 0; i < 10; i++) {
    const rr = i % 2 === 0 ? r : r * 0.48;
    const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
    if (i === 0) g.moveTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
    else g.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
  }
  g.closePath();
  g.fill();
  g.restore();
}

/** Aufkleber einer Feldscheibe: Pfeil, Nummer, Landeziel bzw. Stern fürs Ausgangsfeld */
function drawDecal(g: CanvasRenderingContext2D, step: number, kind: 'landing' | 'normal' | 'shout') {
  const s = CELL;
  if (kind === 'landing') {
    // Zielscheibe
    const rings = ['rgba(225,50,40,0.9)', 'rgba(255,255,255,0.9)', 'rgba(225,50,40,0.9)', 'rgba(255,255,255,0.95)'];
    rings.forEach((col, i) => {
      g.fillStyle = col;
      g.beginPath();
      g.arc(s * 0.5, s * 0.5, s * (0.46 - i * 0.1), 0, Math.PI * 2);
      g.fill();
    });
    drawArrow(g, s, '#ffffff');
    return;
  }
  drawArrow(g, s, kind === 'shout' ? '#ffe680' : '#ffffff');
  if (kind === 'shout') drawStar(g, s * 0.5, s * 0.74, s * 0.21, '#ffd23f');
  g.save();
  g.font = `900 ${Math.round(s * (kind === 'shout' ? 0.17 : 0.24))}px "Fredoka", "Nunito", system-ui, sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineJoin = 'round';
  g.lineWidth = s * 0.035;
  g.strokeStyle = kind === 'shout' ? 'rgba(120,70,0,0.9)' : 'rgba(18,40,80,0.75)';
  g.fillStyle = kind === 'shout' ? '#5a2e00' : '#ffffff';
  const y = s * (kind === 'shout' ? 0.76 : 0.74);
  if (kind !== 'shout') g.strokeText(String(step), s * 0.5, y);
  g.fillText(String(step), s * 0.5, y);
  g.restore();
}

// ---------------------------------------------------------------------------
// Szene
// ---------------------------------------------------------------------------
interface PlateSpot {
  /** Oberseite der Scheibe (dort stehen die Figuren) */
  top: THREE.Vector3;
  radius: number;
}

interface Obstacle {
  x: number;
  z: number;
  r: number;
  top: number;
}

interface DecoCandidate {
  x: number;
  z: number;
  r: number;
  h: number;
  rot: number;
  tall?: boolean;
}

export class VolcanoInside {
  readonly scene = new THREE.Scene();
  /** Einstiegspunkt der Fallenden (knapp unter der Deckenöffnung, hoch über Feld 0) – wird bei setPath aktualisiert */
  readonly dropPoint = new THREE.Vector3();
  /** Mitte des grünen Ausgangsportals (Oberfläche des Strudels) – wird bei setPath aktualisiert */
  readonly portal = new THREE.Vector3();

  private quality: InsideQuality;
  private length = 9;
  private shout = 4;
  private plates: PlateSpot[] = [];
  private obstacles: Obstacle[] = [];
  private opening = new THREE.Vector3();
  private time = { value: 0 };
  private viewportScale = 810;
  private viewportH = 0;
  private tmpV2 = new THREE.Vector2();
  private own = new Set<THREE.Object3D>();
  private textures: THREE.Texture[] = [];

  // gemeinsame Materialien
  private rockMat: THREE.MeshStandardMaterial;
  private hotSpots: THREE.Vector4[] = [new THREE.Vector4(), new THREE.Vector4(), new THREE.Vector4()];

  // Höhle
  private lavaMat: THREE.ShaderMaterial;
  private fallMat: THREE.ShaderMaterial;
  private ceiling: THREE.Mesh;
  private stalactites: THREE.InstancedMesh;
  private columns: THREE.InstancedMesh;
  private boulders: THREE.InstancedMesh;
  private stalCand: DecoCandidate[] = [];
  private colCand: DecoCandidate[] = [];
  private boulderCand: DecoCandidate[] = [];

  // Route
  private pillars: THREE.Mesh;
  private plateBodies: THREE.InstancedMesh;
  private plateCaps: THREE.InstancedMesh;
  private plateRims: THREE.InstancedMesh;
  private decals: THREE.InstancedMesh;
  private atlasCanvas: HTMLCanvasElement;
  private atlas: THREE.CanvasTexture;

  // Deckenöffnung
  private skyDisc: THREE.Mesh;
  private skyHalo: THREE.Mesh;
  private shaft: THREE.Mesh;
  private shaftMat: THREE.ShaderMaterial;
  private motes: THREE.Points;
  private moteMat: THREE.ShaderMaterial;

  // Ausgangsfeld
  private shoutGroup = new THREE.Group();
  private shoutRing: THREE.Mesh;
  private shoutRingMat: THREE.MeshBasicMaterial;
  private shoutBeamMat: THREE.ShaderMaterial;

  // Markierung des Teams am Zug
  private hlGroup = new THREE.Group();
  private hlRing: THREE.Mesh;
  private hlRingMat: THREE.MeshBasicMaterial;
  private hlBeamMat: THREE.ShaderMaterial;
  private hlBase = 1;

  // Portal
  private portalGroup = new THREE.Group();
  private vortexMat: THREE.ShaderMaterial;
  private funnel: THREE.Mesh;
  private funnelMat: THREE.ShaderMaterial;
  private runes: THREE.InstancedMesh;
  private warp = 0;

  // Licht
  private hemi: THREE.HemisphereLight;
  private key: THREE.SpotLight;
  private fallLight: THREE.PointLight;
  private fall2Light: THREE.PointLight;
  private lavaLights: THREE.PointLight[] = [];
  private portalLight: THREE.PointLight;
  private shoutLight: THREE.PointLight;

  // Partikel
  private embers: THREE.Points;
  private emberMat: THREE.ShaderMaterial;
  private glow = new ParticleSystem(900, 'soft', { additive: true });
  private smoke = new ParticleSystem(420, 'soft');
  private stars = new ParticleSystem(320, 'star', { additive: true });
  private steamAcc = 0;
  private smokeAcc = 0;
  private popAcc = 0;
  private fountainAt = 4;
  private sparkleAcc = 0;
  private fallBase = new THREE.Vector3();
  private fall2Base = new THREE.Vector3();
  private smokeSpots: THREE.Vector3[] = [];
  private tmpM = new THREE.Matrix4();
  private tmpA = new THREE.Vector3();
  private tmpB = new THREE.Vector3();

  constructor(opts: { length: number; shout: number; quality: InsideQuality }) {
    this.quality = opts.quality;
    const scene = this.scene;
    scene.name = 'vulkan-inneres';
    const bg = new THREE.Color('#1c0905');
    scene.background = bg;
    scene.fog = new THREE.Fog('#2a0d06', 55, 190);
    const env = envTexture();
    this.textures.push(env);
    scene.environment = env;
    scene.environmentIntensity = 0.3;

    // ---- Licht -------------------------------------------------------------
    this.hemi = new THREE.HemisphereLight('#3c2620', '#ff4e12', 0.55);
    scene.add(this.hemi);
    // Tageslicht aus der Deckenöffnung (einzige Schattenquelle)
    this.key = new THREE.SpotLight('#ffe2bd', 3.0, 0, 0.7, 0.55, 0);
    this.key.shadow.bias = -0.0004;
    this.key.shadow.normalBias = 0.03;
    this.key.shadow.radius = 3;
    scene.add(this.key, this.key.target);
    this.fallLight = new THREE.PointLight('#ff5a14', 520, 75, 1.6);
    this.fall2Light = new THREE.PointLight('#ff5010', 160, 40, 1.6);
    scene.add(this.fallLight, this.fall2Light);
    for (let k = 0; k < 4; k++) {
      const l = new THREE.PointLight('#ff4e14', 36, 22, 1.5);
      this.lavaLights.push(l);
      scene.add(l);
    }
    this.portalLight = new THREE.PointLight('#38ff6a', 40, 14, 1.6);
    this.shoutLight = new THREE.PointLight('#5dff7a', 22, 9, 1.6);
    scene.add(this.portalLight, this.shoutLight);

    // ---- Materialien -------------------------------------------------------
    this.rockMat = this.basaltMaterial();

    // ---- Lavasee -----------------------------------------------------------
    const lakeGeo = new THREE.PlaneGeometry(CAVE.rx * 2 + 30, CAVE.rz * 2 + 30, 150, 116);
    lakeGeo.rotateX(-Math.PI / 2);
    this.lavaMat = new THREE.ShaderMaterial({
      uniforms: {
        ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
        uTime: this.time,
        uCollars: { value: Array.from({ length: MAX_COLLARS }, () => new THREE.Vector4()) },
        uCollarCount: { value: 0 },
        uFall: { value: new THREE.Vector4() },
        uFall2: { value: new THREE.Vector4() },
        uBurst: { value: new THREE.Vector4(0, 0, -99, 0) },
      },
      vertexShader: LAVA_VERT,
      fragmentShader: LAVA_FRAG,
      fog: true,
    });
    const lake = new THREE.Mesh(lakeGeo, this.lavaMat);
    lake.name = 'lavasee';
    scene.add(lake);

    // ---- Wände & Decke -----------------------------------------------------
    const walls = new THREE.Mesh(this.buildWalls(), this.rockMat);
    walls.name = 'waende';
    scene.add(walls);
    this.ceiling = new THREE.Mesh(new THREE.BufferGeometry(), this.rockMat);
    this.ceiling.name = 'decke';
    scene.add(this.ceiling);

    // Tropfsteine (oben hängend, unten aus der Lava ragend) – ein instanziertes Mesh
    const coneGeo = new THREE.ConeGeometry(1, 1, 6, 3);
    coneGeo.translate(0, 0.5, 0);
    {
      const p = coneGeo.getAttribute('position');
      for (let i = 0; i < p.count; i++) {
        const y = p.getY(i);
        const k = 1 + noise2(p.getX(i) * 2.1, y * 3 + p.getZ(i) * 2.1) * 0.22;
        p.setXYZ(i, p.getX(i) * k, y, p.getZ(i) * k);
      }
    }
    const stalGeo = colorize(prep(coneGeo), 1.1);
    this.stalactites = new THREE.InstancedMesh(stalGeo, this.rockMat, 160);
    this.stalactites.frustumCulled = false;
    this.stalactites.name = 'tropfsteine';
    scene.add(this.stalactites);

    // Basaltsäulen am Rand (Orgelpfeifen), Riesensäulen bis zur Decke
    const colGeo = colorize(prep(columnGeo(1, 1, 1, 6, 3.3)), 1);
    this.columns = new THREE.InstancedMesh(colGeo, this.rockMat, 110);
    this.columns.frustumCulled = false;
    this.columns.castShadow = true;
    this.columns.receiveShadow = true;
    this.columns.name = 'basaltsaeulen';
    scene.add(this.columns);

    const boulderGeo = colorize(prep(rockGeo(5.1, 1)), 1.15);
    this.boulders = new THREE.InstancedMesh(boulderGeo, this.rockMat, 70);
    this.boulders.frustumCulled = false;
    this.boulders.receiveShadow = true;
    this.boulders.name = 'felsbrocken';
    scene.add(this.boulders);
    this.makeDecoCandidates();

    // ---- Lavafälle ---------------------------------------------------------
    this.fallMat = new THREE.ShaderMaterial({
      uniforms: { ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog), uTime: this.time },
      vertexShader: FALL_VERT,
      fragmentShader: FALL_FRAG,
      side: THREE.DoubleSide,
      fog: true,
    });
    const f1 = this.fallRibbon(FALL.angle, FALL.top, FALL.w0, FALL.w1, this.fallBase);
    const f2 = this.fallRibbon(FALL2.angle, FALL2.top, FALL2.w0, FALL2.w1, this.fall2Base);
    const fallGeo = mergeGeometries([f1, f2], false)!;
    f1.dispose();
    f2.dispose();
    const falls = new THREE.Mesh(fallGeo, this.fallMat);
    falls.name = 'lavafall';
    scene.add(falls);
    (this.lavaMat.uniforms.uFall!.value as THREE.Vector4).set(this.fallBase.x, this.fallBase.z + 1.5, 7.5, 1);
    (this.lavaMat.uniforms.uFall2!.value as THREE.Vector4).set(this.fall2Base.x, this.fall2Base.z, 3.2, 0.8);
    const top1 = wallPoint(FALL.angle, FALL.top, 1);
    const top2 = wallPoint(FALL2.angle, FALL2.top, 1);
    this.hotSpots[0]!.set(top1.x, top1.y, top1.z, 7);
    this.hotSpots[1]!.set(this.fallBase.x, 1, this.fallBase.z - 3, 12);
    this.hotSpots[2]!.set(top2.x, top2.y, top2.z, 4);
    this.fallLight.position.set(this.fallBase.x, 5, this.fallBase.z + 5);
    this.fall2Light.position.set(this.fall2Base.x, 4, this.fall2Base.z + 2);
    // Felsnasen über den Austrittsspalten (verdecken die Oberkante der Lavabänder)
    const ledges: THREE.BufferGeometry[] = [];
    for (const [fall, k] of [
      [FALL, 1],
      [FALL2, 0.45],
    ] as const) {
      const lip = wallPoint(fall.angle, fall.top + 0.6, 0);
      const out = new THREE.Vector3(-lip.x, 0, -lip.z).normalize();
      const across = new THREE.Vector3(-out.z, 0, out.x);
      for (let i = -2; i <= 2; i++) {
        const g = rockGeo(11 + i * 3 + k * 7, 1);
        const r = (2.4 - Math.abs(i) * 0.35) * k + 0.6;
        g.scale(r * 1.3, r * 0.7, r);
        g.rotateY(i * 0.7);
        const p = lip.clone().addScaledVector(across, i * fall.w0 * 0.32).addScaledVector(out, 0.8 + (2 - Math.abs(i)) * 0.5 * k);
        g.translate(p.x, p.y + Math.abs(i) * 0.6 + r * 0.25, p.z);
        ledges.push(colorize(prep(g), 1.2));
      }
    }
    const ledgeGeo = mergeGeometries(ledges, false)!;
    for (const g of ledges) g.dispose();
    const ledgeMesh = new THREE.Mesh(ledgeGeo, this.rockMat);
    ledgeMesh.name = 'felsnasen';
    scene.add(ledgeMesh);
    // Glühen hinter der Abbruchkante
    const glowTex = glowTexture();
    this.textures.push(glowTex);
    const haloMat = new THREE.MeshBasicMaterial({ map: glowTex, color: new THREE.Color(1.6, 0.5, 0.12), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
    for (const [p, s] of [
      [top1, 16],
      [top2, 8],
    ] as const) {
      const halo = new THREE.Mesh(new THREE.PlaneGeometry(s, s), haloMat);
      halo.position.copy(p).add(new THREE.Vector3(0, -1, 0));
      halo.lookAt(0, p.y - 1, 0);
      halo.position.addScaledVector(halo.getWorldDirection(new THREE.Vector3()), 1.5);
      halo.renderOrder = 4;
      scene.add(halo);
    }
    // Rauch-/Hitzesäulen (nur „ultra“)
    for (const [x, z] of [
      [-38, -30],
      [34, -36],
      [-48, 8],
      [46, 2],
    ] as const)
      this.smokeSpots.push(new THREE.Vector3(x, 0.2, z));

    // ---- Route: Säulen, Scheiben, Aufkleber -------------------------------
    this.pillars = new THREE.Mesh(new THREE.BufferGeometry(), this.rockMat);
    this.pillars.castShadow = true;
    this.pillars.receiveShadow = true;
    this.pillars.name = 'routen-saeulen';
    scene.add(this.pillars);

    const r = PLATE_R;
    const bodyGeo = new THREE.CylinderGeometry(r, r * 1.08, PLATE_H, 40, 1);
    const capGeo = new THREE.SphereGeometry(r * 0.94, 40, 8, 0, Math.PI * 2, 0, Math.PI * 0.16);
    const rimGeo = new THREE.TorusGeometry(r * 0.97, 0.07, 10, 48);
    rimGeo.rotateX(Math.PI / 2);
    const bodyMat = new THREE.MeshPhysicalMaterial({ roughness: 0.32, clearcoat: 0.7, clearcoatRoughness: 0.25 });
    const capMat = new THREE.MeshPhysicalMaterial({ roughness: 0.26, clearcoat: 0.85, clearcoatRoughness: 0.18 });
    const rimMat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.35 });
    this.plateBodies = new THREE.InstancedMesh(bodyGeo, bodyMat, MAX_PLATES);
    this.plateCaps = new THREE.InstancedMesh(capGeo, capMat, MAX_PLATES);
    this.plateRims = new THREE.InstancedMesh(rimGeo, rimMat, MAX_PLATES);
    const white = new THREE.Color('#ffffff');
    for (const im of [this.plateBodies, this.plateCaps, this.plateRims]) {
      im.castShadow = true;
      im.receiveShadow = true;
      im.frustumCulled = false;
      for (let i = 0; i < MAX_PLATES; i++) im.setColorAt(i, white);
      scene.add(im);
    }

    this.atlasCanvas = document.createElement('canvas');
    this.atlasCanvas.width = ATLAS_COLS * CELL;
    this.atlasCanvas.height = ATLAS_ROWS * CELL;
    this.atlas = new THREE.CanvasTexture(this.atlasCanvas);
    this.atlas.colorSpace = THREE.SRGBColorSpace;
    this.atlas.anisotropy = 8;
    this.atlas.repeat.set(1 / ATLAS_COLS, 1 / ATLAS_ROWS);
    this.textures.push(this.atlas);
    const decalGeo = new THREE.PlaneGeometry(1, 1);
    decalGeo.rotateX(-Math.PI / 2);
    decalGeo.setAttribute('aCell', new THREE.InstancedBufferAttribute(new Float32Array(MAX_PLATES * 2), 2));
    const decalMat = new THREE.MeshBasicMaterial({ map: this.atlas, transparent: true, depthWrite: false });
    decalMat.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nattribute vec2 aCell;')
        .replace('#include <uv_vertex>', '#include <uv_vertex>\n#ifdef USE_MAP\n  vMapUv += aCell;\n#endif');
    };
    decalMat.customProgramCacheKey = () => 'insel-inside-decal';
    this.decals = new THREE.InstancedMesh(decalGeo, decalMat, MAX_PLATES);
    this.decals.frustumCulled = false;
    this.decals.renderOrder = 3;
    this.decals.name = 'feld-pfeile';
    scene.add(this.decals);

    // ---- Deckenöffnung: Himmel, Halo, Lichtschacht, Staub ------------------
    this.skyDisc = new THREE.Mesh(new THREE.CircleGeometry(1, 40), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.3, 2.45, 2.6), fog: false }));
    this.skyDisc.rotation.x = Math.PI / 2;
    scene.add(this.skyDisc);
    this.skyHalo = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ map: glowTex, color: new THREE.Color(1.3, 1.15, 0.9), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }),
    );
    this.skyHalo.rotation.x = Math.PI / 2;
    this.skyHalo.renderOrder = 4;
    scene.add(this.skyHalo);
    this.shaftMat = this.beamMaterial(new THREE.Color(1.0, 0.84, 0.6), 0.5, 0, 1);
    this.shaft = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 40, 1, true), this.shaftMat);
    this.shaft.renderOrder = 6;
    scene.add(this.shaft);
    this.moteMat = this.emberMaterial(new THREE.Color(1.6, 1.45, 1.2), new THREE.Color(0.9, 0.75, 0.5), 0.07, 30);
    this.motes = new THREE.Points(this.seedGeometry(140, () => {
      const a = Math.random() * Math.PI * 2;
      const rr = Math.sqrt(Math.random()) * 3.6;
      return [Math.cos(a) * rr, Math.sin(a) * rr, Math.random(), rnd(0.008, 0.02)];
    }), this.moteMat);
    this.motes.frustumCulled = false;
    this.motes.renderOrder = 6;
    scene.add(this.motes);

    // ---- Ausgangsfeld ------------------------------------------------------
    const ringGeo = new THREE.RingGeometry(1.42, 1.9, 56);
    ringGeo.rotateX(-Math.PI / 2);
    this.shoutRingMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.25, 1.5, 0.35), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    this.shoutRing = new THREE.Mesh(ringGeo, this.shoutRingMat);
    this.shoutRing.renderOrder = 5;
    this.shoutBeamMat = this.beamMaterial(new THREE.Color(0.15, 1.1, 0.3), 0.5, 1, 1);
    const shoutBeam = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 1.15, 5, 32, 1, true), this.shoutBeamMat);
    shoutBeam.position.y = 2.5;
    shoutBeam.renderOrder = 6;
    this.shoutGroup.add(this.shoutRing, shoutBeam);
    this.shoutGroup.name = 'ausgangsfeld';
    scene.add(this.shoutGroup);

    // ---- Markierung (Team am Zug) -----------------------------------------
    this.hlRingMat = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    const hlGeo = new THREE.RingGeometry(1.36, 1.7, 56);
    hlGeo.rotateX(-Math.PI / 2);
    this.hlRing = new THREE.Mesh(hlGeo, this.hlRingMat);
    this.hlRing.renderOrder = 5;
    this.hlBeamMat = this.beamMaterial(new THREE.Color('#ffffff'), 0.55, 1, 0.3);
    const hlBeam = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.45, 1.8, 40, 1, true), this.hlBeamMat);
    hlBeam.position.y = 0.9;
    hlBeam.renderOrder = 6;
    this.hlGroup.add(this.hlRing, hlBeam);
    this.hlGroup.visible = false;
    scene.add(this.hlGroup);

    // ---- Portal ------------------------------------------------------------
    this.vortexMat = new THREE.ShaderMaterial({
      uniforms: { uTime: this.time, uFlash: { value: 0 } },
      vertexShader: BEAM_VERT,
      fragmentShader: VORTEX_FRAG,
    });
    const vortex = new THREE.Mesh(new THREE.CircleGeometry(PORTAL_R - 0.22, 56), this.vortexMat);
    vortex.rotation.x = -Math.PI / 2;
    vortex.position.y = 0.02;
    const portalRim = new THREE.Mesh(new THREE.TorusGeometry(PORTAL_R - 0.12, 0.11, 8, 56), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.2, 1.7, 0.4) }));
    portalRim.rotation.x = Math.PI / 2;
    portalRim.position.y = 0.04;
    this.funnelMat = new THREE.ShaderMaterial({
      uniforms: { uTime: this.time, uFlash: { value: 0 } },
      vertexShader: BEAM_VERT,
      fragmentShader: FUNNEL_FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    this.funnel = new THREE.Mesh(new THREE.CylinderGeometry(2.2, PORTAL_R - 0.3, 3.0, 40, 1, true), this.funnelMat);
    this.funnel.position.y = 1.5;
    this.funnel.renderOrder = 6;
    const runeMat = new THREE.MeshStandardMaterial({ color: '#1d3a24', emissive: new THREE.Color(0.12, 1.3, 0.3), roughness: 0.4, flatShading: true });
    this.runes = new THREE.InstancedMesh(new THREE.OctahedronGeometry(0.24, 0), runeMat, 6);
    this.runes.frustumCulled = false;
    this.portalGroup.add(vortex, portalRim, this.funnel, this.runes);
    this.portalGroup.name = 'portal';
    scene.add(this.portalGroup);

    // ---- Funken & Partikel -------------------------------------------------
    this.emberMat = this.emberMaterial(new THREE.Color(3.0, 1.0, 0.2), new THREE.Color(1.5, 0.2, 0.02), 0.22, 30);
    this.embers = new THREE.Points(this.seedGeometry(MAX_EMBERS, (i) => {
      // ein Viertel der Funken steigt am Lavafall auf, der Rest über dem ganzen See
      if (i % 4 === 0) return [this.fallBase.x + rnd(-8, 8), this.fallBase.z + rnd(-2, 8), Math.random(), rnd(0.05, 0.1)];
      let x = 0;
      let z = 0;
      do {
        x = rnd(-CAVE.rx, CAVE.rx) * 0.88;
        z = rnd(-CAVE.rz, CAVE.rz) * 0.85;
      } while (ell(x, z) > 0.86);
      return [x, z, Math.random(), rnd(0.035, 0.08)];
    }), this.emberMat);
    this.embers.frustumCulled = false;
    this.embers.renderOrder = 7;
    scene.add(this.embers);
    // Partikelgröße folgt automatisch der tatsächlichen Renderhöhe (inkl. Pixelverhältnis)
    for (const pts of [this.embers, this.motes, this.glow.points, this.smoke.points, this.stars.points])
      pts.onBeforeRender = (renderer) => {
        const rt = renderer.getRenderTarget();
        const h = rt ? rt.height : renderer.getDrawingBufferSize(this.tmpV2).y;
        if (h > 0 && h !== this.viewportH) this.setViewport(h);
      };
    for (const ps of [this.glow, this.smoke, this.stars]) scene.add(ps.points);
    this.setViewport(1080);

    this.setPath(opts.length, opts.shout);
    // eigene Objekte merken: Figuren, die von außen in die Szene gesetzt werden, gibt dispose() nicht frei
    scene.traverse((o) => this.own.add(o));
  }

  // =========================================================================
  // Bausteine
  // =========================================================================
  private basaltMaterial() {
    const m = new THREE.MeshStandardMaterial({ color: '#ffffff', vertexColors: true, roughness: 0.88, metalness: 0, flatShading: true, side: THREE.DoubleSide });
    m.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = this.time;
      sh.uniforms.uHot = { value: this.hotSpots };
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vRockW;').replace(
        '#include <project_vertex>',
        `#include <project_vertex>
        {
          vec4 rw = vec4(transformed, 1.0);
          #ifdef USE_INSTANCING
            rw = instanceMatrix * rw;
          #endif
          vRockW = (modelMatrix * rw).xyz;
        }`,
      );
      sh.fragmentShader = sh.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>
          uniform float uTime;
          uniform vec4 uHot[3];
          varying vec3 vRockW;
          ${GLSL_NOISE}
          vec2 rkHash2(vec2 p) {
            p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
            return fract(sin(p) * 43758.5453);
          }
          // Abstand zur nächsten Fuge (Voronoi F2 - F1)
          float rkEdge(vec2 p) {
            vec2 i = floor(p);
            vec2 f = fract(p);
            float d1 = 8.0;
            float d2 = 8.0;
            for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
              vec2 g = vec2(float(x), float(y));
              float d = length(g + rkHash2(i + g) * 0.9 + 0.05 - f);
              if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) { d2 = d; }
            }
            return d2 - d1;
          }
          float rkJoint;
          float rkMask;`,
        )
        .replace(
          '#include <color_fragment>',
          `#include <color_fragment>
          {
            // Basaltfugen auf der Hauptebene der Fläche (Wände senkrecht, Decke/Kuppen waagrecht)
            vec3 rn = abs(normalize(cross(dFdx(vRockW), dFdy(vRockW))));
            vec2 uvp = rn.y > max(rn.x, rn.z) ? vRockW.xz : (rn.x > rn.z ? vRockW.zy * vec2(1.0, 0.55) : vRockW.xy * vec2(1.0, 0.55));
            vec2 jp = uvp * 0.42 + (vec2(fxNoise(uvp * 0.3), fxNoise(uvp * 0.3 + 5.0)) - 0.5) * 0.8;
            float e = rkEdge(jp);
            float aa = fwidth(e) + 0.004;
            rkJoint = 1.0 - smoothstep(0.035 - aa, 0.06 + aa, e);
            rkMask = smoothstep(0.42, 0.6, fxNoise(vRockW.xz * 0.05 + vRockW.y * 0.045 + 3.0));
            // Fugen dunkeln den Fels ab (Struktur), Flächen leicht fleckig
            diffuseColor.rgb *= (1.0 - rkJoint * 0.55) * (0.8 + fxNoise(uvp * 1.3) * 0.4);
          }`,
        )
        .replace(
          '#include <emissivemap_fragment>',
          `#include <emissivemap_fragment>
          {
            float crack = rkJoint * rkMask;
            float heat = pow(smoothstep(7.0, 0.0, vRockW.y), 2.0);
            float spot = 0.0;
            for (int k = 0; k < 3; k++) {
              float d = length(vRockW - uHot[k].xyz) / max(0.01, uHot[k].w);
              spot = max(spot, exp(-d * d * 1.5));
            }
            heat = max(heat, spot);
            float pulse = 0.78 + 0.22 * sin(uTime * 1.6 + vRockW.x * 0.4 + vRockW.z * 0.3);
            totalEmissiveRadiance += vec3(2.6, 0.42, 0.04) * crack * (0.025 + heat * 1.1) * pulse;
            // Glutsaum an der Lavakante und hinter dem Lavafall
            float rim = smoothstep(1.6, -0.2, vRockW.y);
            totalEmissiveRadiance += vec3(0.9, 0.12, 0.01) * (rim * rim * 0.7 + spot * spot * 0.25);
          }`,
        );
    };
    m.customProgramCacheKey = () => 'insel-inside-basalt';
    return m;
  }

  private beamMaterial(color: THREE.Color, opacity: number, up: number, streaks: number) {
    return new THREE.ShaderMaterial({
      uniforms: { uColor: { value: color.clone() }, uTime: this.time, uOpacity: { value: opacity }, uUp: { value: up }, uStreaks: { value: streaks } },
      vertexShader: BEAM_VERT,
      fragmentShader: BEAM_FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
  }

  private emberMaterial(a: THREE.Color, b: THREE.Color, size: number, height: number) {
    return new THREE.ShaderMaterial({
      uniforms: { uTime: this.time, uScale: { value: 810 }, uHeight: { value: height }, uSize: { value: size }, uColA: { value: a }, uColB: { value: b } },
      vertexShader: EMBER_VERT,
      fragmentShader: EMBER_FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
  }

  private seedGeometry(n: number, fn: (i: number) => [number, number, number, number]) {
    const seeds = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) seeds.set(fn(i), i * 4);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    g.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 4));
    return g;
  }

  private buildWalls() {
    const NA = 144;
    const NY = 30;
    const y0 = -4;
    const y1 = CAVE.wallTop;
    const pos: number[] = [];
    const idx: number[] = [];
    for (let j = 0; j <= NY; j++) {
      const y = y0 + ((y1 - y0) * j) / NY;
      for (let i = 0; i <= NA; i++) {
        const a = (i / NA) * Math.PI * 2;
        const p = wallPoint(a, y + (j > 0 && j < NY ? noise2(Math.cos(a) * 5, Math.sin(a) * 5 + j) * 0.7 : 0));
        pos.push(p.x, p.y, p.z);
      }
    }
    for (let j = 0; j < NY; j++)
      for (let i = 0; i < NA; i++) {
        const a = j * (NA + 1) + i;
        const b = a + 1;
        const c = a + NA + 1;
        const d = c + 1;
        idx.push(a, c, b, b, c, d);
      }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    return colorize(prep(g), 1);
  }

  /** Decke als Ring um die Öffnung (mit kurzem Schlot nach oben) */
  private buildCeiling(o: THREE.Vector3, r0: number) {
    const rings = [0, 0.7, 1.6, 2.8, 4.2, 6, 8.5, 11.5, 15.5, 20.5, 27, 35, 45, 58, 75, 96, 125];
    const NA = 72;
    const pos: number[] = [];
    const idx: number[] = [];
    for (let k = 0; k < rings.length; k++) {
      const d = rings[k]!;
      for (let i = 0; i <= NA; i++) {
        const a = (i / NA) * Math.PI * 2;
        const jag = r0 * (1 + noise2(Math.cos(a) * 1.8 + 3, Math.sin(a) * 1.8 - 2) * 0.32);
        const r = jag + d;
        const x = o.x + Math.cos(a) * r;
        const z = o.z + Math.sin(a) * r;
        const chimney = d < 6 ? 10 * (1 - d / 6) ** 2 : 0;
        pos.push(x, ceilY(x, z) + chimney + (k > 0 ? noise2(x * 0.3, z * 0.3) * 0.8 : 0), z);
      }
    }
    for (let k = 0; k < rings.length - 1; k++)
      for (let i = 0; i < NA; i++) {
        const a = k * (NA + 1) + i;
        const b = a + 1;
        const c = a + NA + 1;
        const d = c + 1;
        idx.push(a, b, c, b, d, c);
      }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    return colorize(prep(g), 0.8);
  }

  /** Lavafall als gebogenes Band vor der Wand; base = Auftreffpunkt im See */
  private fallRibbon(angle: number, top: number, w0: number, w1: number, base: THREE.Vector3) {
    const NV = 48;
    const NU = 14;
    // Austritt gut 2 m tief im Fels: die Oberkante steckt verdeckt in der Wand
    const lip = wallPoint(angle, top, 2.2);
    const out = new THREE.Vector3(-lip.x, 0, -lip.z).normalize();
    const across = new THREE.Vector3(-out.z, 0, out.x);
    /** Wie weit die Wandoberfläche (quer s, Höhe y) vor der Austrittslinie liegt */
    const wallAhead = (s: number, y: number) => {
      const px = lip.x + across.x * s;
      const pz = lip.z + across.z * s;
      const w = wallPoint(Math.atan2(pz / CAVE.rz, px / CAVE.rx), y, 0);
      return (w.x - px) * out.x + (w.z - pz) * out.z;
    };
    const pos: number[] = [];
    const uv: number[] = [];
    const idx: number[] = [];
    let reach = 0;
    for (let j = 0; j <= NV; j++) {
      const v = j / NV;
      const y = lerp(top + 0.4, -0.6, v);
      const dm = top + 0.4 - y;
      const w = lerp(w0, w1, Math.pow(v, 0.8));
      // nie in die (unten überhängende) Wand stechen; oben quillt die Lava aus dem Spalt
      let clear = 0;
      for (let k = 0; k <= 4; k++) clear = Math.max(clear, wallAhead((k / 4 - 0.5) * w, y) + 1.1);
      reach = Math.max(reach, clear * smoothstep(0, 3, dm));
      const fwd = reach + v * v * 2.2;
      for (let i = 0; i <= NU; i++) {
        const u = i / NU;
        const s = (u - 0.5) * w;
        const bulge = (1 - (2 * u - 1) ** 2) * 0.5;
        pos.push(lip.x + out.x * (fwd + bulge) + across.x * s, y, lip.z + out.z * (fwd + bulge) + across.z * s);
        uv.push(u, dm);
      }
    }
    for (let j = 0; j < NV; j++)
      for (let i = 0; i < NU; i++) {
        const a = j * (NU + 1) + i;
        const b = a + 1;
        const c = a + NU + 1;
        const d = c + 1;
        idx.push(a, c, b, b, c, d);
      }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    const fwdEnd = reach + 2.2;
    base.set(lip.x + out.x * fwdEnd, 0, lip.z + out.z * fwdEnd);
    return g;
  }

  /** Feste Kandidaten für Deko; setPath blendet aus, was der Route im Weg steht. */
  private makeDecoCandidates() {
    const rng = rand(77);
    // Tropfsteine an der Decke
    for (let i = 0; i < 160; i++) {
      let x = 0;
      let z = 0;
      do {
        x = (rng() * 2 - 1) * CAVE.rx;
        z = (rng() * 2 - 1) * CAVE.rz;
      } while (ell(x, z) > 0.86);
      this.stalCand.push({ x, z, r: 0.5 + rng() * 1.6, h: 2 + rng() * 7 * (0.5 + ell(x, z)), rot: rng() * 6 });
    }
    // Orgelpfeifen-Gruppen am Rand
    for (let c = 0; c < 16; c++) {
      const a = (c / 16) * Math.PI * 2 + rng() * 0.3;
      const e = 0.72 + rng() * 0.16;
      const cx = Math.cos(a) * CAVE.rx * e;
      const cz = Math.sin(a) * CAVE.rz * e;
      const n = 3 + Math.floor(rng() * 4);
      for (let k = 0; k < n; k++) {
        const r = 0.8 + rng() * 0.9;
        this.colCand.push({ x: cx + (rng() - 0.5) * 6, z: cz + (rng() - 0.5) * 6, r, h: 2.5 + rng() * 12 * (0.6 + e - 0.72), rot: rng() * 6 });
      }
    }
    // Riesensäulen bis zur Decke (hinten und an den Seiten)
    for (const [x, z, r] of [
      [-30, -38, 3.2],
      [24, -40, 2.8],
      [-52, -18, 3.6],
      [54, -16, 3.0],
      [-12, -44, 2.2],
    ] as const)
      this.colCand.push({ x, z, r, h: ceilY(x, z) + 3, rot: x, tall: true });
    // Felsbrocken / Krustenschollen
    for (let i = 0; i < 70; i++) {
      const a = rng() * Math.PI * 2;
      const e = 0.25 + rng() * 0.68;
      this.boulderCand.push({ x: Math.cos(a) * CAVE.rx * e, z: Math.sin(a) * CAVE.rz * e, r: 0.7 + rng() * 2.2, h: 0.3 + rng() * 0.6, rot: rng() * 6 });
    }
  }

  // =========================================================================
  // Route
  // =========================================================================
  setPath(length: number, shout: number) {
    this.length = clamp(Math.round(length) || 9, 3, MAX_STEPS);
    this.shout = Math.round(shout) >= 1 && Math.round(shout) <= this.length ? Math.round(shout) : 0;
    const L = this.length;

    // S-Bogen: Laufrichtung pendelt sinusförmig; deterministisch (gleiche Route bei gleicher Länge)
    const rng = rand(9137);
    const pts: THREE.Vector3[] = [];
    let x = 0;
    let z = 0;
    let s = 0;
    for (let i = 0; i <= L + 1; i++) {
      const y = clamp(2.75 + Math.sin(i * 0.9 + 0.3) * 0.95 + (rng() - 0.5) * 0.5, 1.5, 4);
      pts.push(new THREE.Vector3(x, y, z));
      const step = i === L ? 3.7 : 3.0 + rng() * 0.4;
      const h = 0.85 * Math.sin(((s + step / 2) / 30) * Math.PI * 2);
      x += Math.cos(h) * step;
      z += Math.sin(h) * step;
      s += step;
    }
    // Sehne (Landefeld → Portal) auf die x-Achse drehen, Route mittig in die Höhle legen
    const first = pts[0]!.clone();
    const last = pts[pts.length - 1]!;
    const ang = Math.atan2(last.z - first.z, last.x - first.x);
    const box = new THREE.Box3();
    for (const p of pts) {
      const dx = p.x - first.x;
      const dz = p.z - first.z;
      p.x = dx * Math.cos(-ang) - dz * Math.sin(-ang);
      p.z = dx * Math.sin(-ang) + dz * Math.cos(-ang);
      box.expandByPoint(p);
    }
    const cx = (box.min.x + box.max.x) / 2;
    const cz = (box.min.z + box.max.z) / 2;
    for (const p of pts) {
      p.x -= cx;
      p.z += ROUTE_Z - cz;
    }
    const portalPt = pts.pop()!;
    portalPt.y = pts[L]!.y + 0.15;
    this.plates = pts.map((p, i) => ({ top: p, radius: PLATE_R * (i === 0 ? LANDING_SCALE : 1) }));
    this.portal.set(portalPt.x, portalPt.y + 0.04, portalPt.z);

    this.buildPlates();
    this.buildPortal(portalPt);
    this.buildOpening();
    this.placeDeco();
    this.updateCollars();
    this.applyQuality();
  }

  private buildPlates() {
    const L = this.length;
    // Säulen (und Portal-Sockel) zu einem Mesh zusammenfassen
    const geos: THREE.BufferGeometry[] = [];
    const base = -3;
    const add = (g: THREE.BufferGeometry, x: number, y: number, z: number, rot = 0) => {
      g.rotateY(rot);
      g.translate(x, y, z);
      geos.push(colorize(prep(g), 1));
    };
    this.plates.forEach((pl, i) => {
      const k = pl.radius / PLATE_R;
      const bodyBottom = pl.top.y - PLATE_H - 0.04;
      add(columnGeo(PILLAR_TOP * k, PILLAR_BASE * k, bodyBottom - base + 0.02, 7, i * 1.7), pl.top.x, base, pl.top.z, i * 0.9);
      // Brocken am Säulenfuß
      for (let b = 0; b < 2; b++) {
        const a = i * 2.3 + b * 2.6;
        const r = 0.45 + ((i * 7 + b * 3) % 5) * 0.1;
        const g = rockGeo(i + b * 3, 0);
        g.scale(r, r * 0.8, r);
        add(g, pl.top.x + Math.cos(a) * PILLAR_BASE * k * 1.05, 0.05, pl.top.z + Math.sin(a) * PILLAR_BASE * k * 1.05);
      }
    });
    // Portal-Sockel: breite Steinplatte auf kräftiger Säule
    const pt = this.portal;
    add(columnGeo(PORTAL_R * 0.78, PORTAL_R * 0.95, pt.y - 0.38 - base, 8, 9.1), pt.x, base, pt.z);
    add(columnGeo(PORTAL_R, PORTAL_R * 1.04, 0.36, 16, 2.2), pt.x, pt.y - 0.4, pt.z);
    const old = this.pillars.geometry;
    this.pillars.geometry = mergeGeometries(geos, false) ?? new THREE.BufferGeometry();
    for (const g of geos) g.dispose();
    old.dispose();

    // Scheiben
    const m = new THREE.Matrix4();
    const c = new THREE.Color();
    const blue = new THREE.Color('#58b4ff');
    const landing = new THREE.Color('#f3efe8');
    const green = new THREE.Color('#3fd46a');
    const gold = new THREE.Color('#ffcc33');
    const white = new THREE.Color('#ffffff');
    const cells = this.decals.geometry.getAttribute('aCell') as THREE.InstancedBufferAttribute;
    const g = this.atlasCanvas.getContext('2d')!;
    g.clearRect(0, 0, this.atlasCanvas.width, this.atlasCanvas.height);
    for (let i = 0; i <= L; i++) {
      const pl = this.plates[i]!;
      const k = pl.radius / PLATE_R;
      const y = pl.top.y - PLATE_H - 0.04;
      m.makeScale(k, 1, k).setPosition(pl.top.x, y + PLATE_H / 2, pl.top.z);
      this.plateBodies.setMatrixAt(i, m);
      const capY = 0.5;
      m.makeScale(k, capY, k).setPosition(pl.top.x, y + PLATE_H - PLATE_R * 0.94 * Math.cos(Math.PI * 0.16) * capY, pl.top.z);
      this.plateCaps.setMatrixAt(i, m);
      m.makeScale(k, 1, k).setPosition(pl.top.x, y + PLATE_H, pl.top.z);
      this.plateRims.setMatrixAt(i, m);
      const kind = i === 0 ? 'landing' : i === this.shout ? 'shout' : 'normal';
      c.copy(kind === 'landing' ? landing : kind === 'shout' ? green : blue);
      this.plateCaps.setColorAt(i, c);
      this.plateBodies.setColorAt(i, c.multiplyScalar(0.8));
      this.plateRims.setColorAt(i, kind === 'shout' ? gold : white);
      // Aufkleber zum nächsten Feld drehen
      const d = this.dir(i);
      const size = pl.radius * 1.75;
      m.makeRotationY(Math.atan2(-d.x, -d.z)).scale(new THREE.Vector3(size, 1, size)).setPosition(pl.top.x, pl.top.y + 0.035, pl.top.z);
      this.decals.setMatrixAt(i, m);
      const col = i % ATLAS_COLS;
      const row = Math.floor(i / ATLAS_COLS);
      cells.setXY(i, col / ATLAS_COLS, (ATLAS_ROWS - 1 - row) / ATLAS_ROWS);
      g.save();
      g.translate(col * CELL, row * CELL);
      g.beginPath();
      g.rect(0, 0, CELL, CELL);
      g.clip();
      drawDecal(g, i, kind);
      g.restore();
    }
    cells.needsUpdate = true;
    this.atlas.needsUpdate = true;
    for (const im of [this.plateBodies, this.plateCaps, this.plateRims, this.decals]) {
      im.count = L + 1;
      im.instanceMatrix.needsUpdate = true;
      if (im.instanceColor) im.instanceColor.needsUpdate = true;
    }

    // Ausgangsfeld
    this.shoutGroup.visible = this.shout > 0;
    if (this.shout > 0) {
      const sp = this.plates[this.shout]!.top;
      this.shoutGroup.position.set(sp.x, sp.y + 0.02, sp.z);
      this.shoutLight.position.set(sp.x, sp.y + 2.2, sp.z);
    }

    // Hindernisse für die Kamera
    this.obstacles = this.plates.map((p) => ({ x: p.top.x, z: p.top.z, r: p.radius * 1.08, top: p.top.y }));
    this.obstacles.push({ x: this.portal.x, z: this.portal.z, r: PORTAL_R * 1.05, top: this.portal.y });
  }

  private buildPortal(p: THREE.Vector3) {
    this.portalGroup.position.set(p.x, p.y, p.z);
    this.portalLight.position.set(p.x, p.y + 1.6, p.z);
  }

  private buildOpening() {
    const p0 = this.plates[0]!.top;
    const r0 = 3.6;
    const old = this.ceiling.geometry;
    this.ceiling.geometry = this.buildCeiling(p0, r0);
    old.dispose();
    const cy = ceilY(p0.x, p0.z);
    this.opening.set(p0.x, cy + 8.6, p0.z);
    this.skyDisc.position.copy(this.opening);
    this.skyDisc.scale.setScalar(r0 * 1.6);
    this.skyHalo.position.set(p0.x, cy + 6.5, p0.z);
    this.skyHalo.scale.setScalar(r0 * 4.2);
    this.dropPoint.set(p0.x, cy - 2.5, p0.z);
    // Lichtschacht von der Öffnung bis aufs Landefeld
    const top = this.opening.y;
    const bottom = p0.y + 0.05;
    const h = top - bottom;
    const geo = new THREE.CylinderGeometry(r0 * 0.8, r0 * 1.0, h, 40, 1, true);
    this.shaft.geometry.dispose();
    this.shaft.geometry = geo;
    this.shaft.position.set(p0.x, bottom + h / 2, p0.z);
    this.motes.position.set(p0.x, bottom, p0.z);
    this.moteMat.uniforms.uHeight!.value = h * 0.8;

    // Tageslicht: Spot aus der Öffnung, deckt die ganze Route ab
    const centre = new THREE.Vector3();
    for (const pl of this.plates) centre.add(pl.top);
    centre.add(this.portal).divideScalar(this.plates.length + 1);
    this.key.position.set(p0.x, cy + 4, p0.z);
    this.key.target.position.copy(centre);
    this.key.target.updateMatrixWorld();
    const axis = centre.clone().sub(this.key.position).normalize();
    let maxA = 0.2;
    let maxD = 10;
    for (const q of [...this.plates.map((pl) => pl.top), this.portal]) {
      const v = q.clone().sub(this.key.position);
      maxD = Math.max(maxD, v.length());
      maxA = Math.max(maxA, v.normalize().angleTo(axis));
    }
    this.key.angle = Math.min(1.25, maxA + 0.16);
    const sc = this.key.shadow.camera;
    sc.near = 6;
    sc.far = maxD + 12;
    sc.updateProjectionMatrix();
  }

  private placeDeco() {
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const sv = new THREE.Vector3();
    const pv = new THREE.Vector3();
    const flip = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI);
    const yAxis = new THREE.Vector3(0, 1, 0);
    const near = (x: number, z: number, r: number) => {
      for (const p of this.plates) if (Math.hypot(p.top.x - x, p.top.z - z) < r + p.radius + 3.2) return true;
      return Math.hypot(this.portal.x - x, this.portal.z - z) < r + PORTAL_R + 3.5;
    };
    // vor der Route (Richtung Kamera) nur flache Deko, damit die Übersicht frei bleibt
    let routeFront = -Infinity;
    for (const p of this.plates) routeFront = Math.max(routeFront, p.top.z);
    const frontLimit = routeFront + 4;
    const extraObstacles: Obstacle[] = [];

    let n = 0;
    const o = this.opening;
    for (const c of this.stalCand) {
      if (Math.hypot(c.x - o.x, c.z - o.z) < 9) continue;
      const y = ceilY(c.x, c.z) + 0.6;
      q.setFromAxisAngle(yAxis, c.rot).multiply(flip);
      m.compose(pv.set(c.x, y, c.z), q, sv.set(c.r, c.h, c.r));
      this.stalactites.setMatrixAt(n++, m);
    }
    // Stalagmiten aus der Lava (nur an den Rändern)
    for (const c of this.stalCand) {
      if (n >= this.stalactites.instanceMatrix.count) break;
      if (ell(c.x, c.z) < 0.6 || near(c.x, c.z, c.r) || c.z > frontLimit) continue;
      q.setFromAxisAngle(yAxis, c.rot);
      m.compose(pv.set(c.x * 1.02, -0.5, c.z * 1.02), q, sv.set(c.r * 1.7, c.h * 0.55, c.r * 1.7));
      this.stalactites.setMatrixAt(n++, m);
      extraObstacles.push({ x: c.x, z: c.z, r: c.r * 1.7, top: c.h * 0.55 - 0.5 });
    }
    this.stalactites.count = n;
    this.stalactites.instanceMatrix.needsUpdate = true;

    n = 0;
    for (const c of this.colCand) {
      if (near(c.x, c.z, c.r)) continue;
      const h = c.tall ? c.h : c.z > frontLimit ? Math.min(c.h, 1.6) : c.h;
      q.setFromAxisAngle(yAxis, c.rot);
      m.compose(pv.set(c.x, -1.5, c.z), q, sv.set(c.r, h + 1.5, c.r));
      this.columns.setMatrixAt(n++, m);
      extraObstacles.push({ x: c.x, z: c.z, r: c.r * 1.1, top: h });
    }
    this.columns.count = n;
    this.columns.instanceMatrix.needsUpdate = true;

    n = 0;
    for (const c of this.boulderCand) {
      if (near(c.x, c.z, c.r)) continue;
      q.setFromAxisAngle(yAxis, c.rot);
      m.compose(pv.set(c.x, 0.05, c.z), q, sv.set(c.r, c.r * c.h, c.r * 0.8));
      this.boulders.setMatrixAt(n++, m);
      extraObstacles.push({ x: c.x, z: c.z, r: c.r, top: c.r * c.h });
    }
    this.boulders.count = n;
    this.boulders.instanceMatrix.needsUpdate = true;
    this.obstacles.push(...extraObstacles);
  }

  private updateCollars() {
    const arr = this.lavaMat.uniforms.uCollars!.value as THREE.Vector4[];
    let n = 0;
    for (const p of this.plates) arr[n++]!.set(p.top.x, p.top.z, PILLAR_BASE * (p.radius / PLATE_R) + 0.25, 0.75);
    arr[n++]!.set(this.portal.x, this.portal.z, PORTAL_R + 0.2, 0.6);
    this.lavaMat.uniforms.uCollarCount!.value = n;
  }

  // =========================================================================
  // Abfragen für Figuren und Kamera
  // =========================================================================
  /** Laufrichtung (x/z, normiert) von Feld step zum nächsten bzw. zum Portal */
  private dir(step: number) {
    const i = clamp(Math.round(step), 0, this.length);
    const a = this.plates[i]!.top;
    const b = i >= this.length ? this.portal : this.plates[i + 1]!.top;
    const d = new THREE.Vector3(b.x - a.x, 0, b.z - a.z);
    return d.lengthSq() > 1e-6 ? d.normalize() : new THREE.Vector3(1, 0, 0);
  }

  /** Querrichtung zur Laufrichtung, immer zur Kamera-Seite (+z) */
  private side(step: number) {
    const d = this.dir(step);
    const s = new THREE.Vector3(-d.z, 0, d.x);
    return s.z < 0 ? s.negate() : s;
  }

  spot(step: number, slot = 0, count = 1, gap = 0): THREE.Vector3 {
    const i = clamp(Math.round(step), 0, this.length);
    const pl = this.plates[i]!;
    const R = pl.radius;
    const k = Math.max(1, count);
    let ox = 0;
    let oz = 0;
    if (k === 2) ox = (slot === 0 ? -1 : 1) * Math.max(R * 0.38, gap * 0.55);
    else if (k > 2) {
      // so weit auseinander, dass sich Nachbarn nicht berühren (höchstens bis an den Plattenrand)
      const ring = Math.min(R * 0.86, Math.max(Math.min(R * 0.6, 0.32 + k * 0.09), gap / (2 * Math.sin(Math.PI / k))));
      const a = (slot / k) * Math.PI * 2 + Math.PI / 2;
      ox = Math.cos(a) * ring;
      oz = Math.sin(a) * ring;
    }
    const d = this.dir(i);
    const sx = -d.z;
    const sz = d.x;
    return new THREE.Vector3(pl.top.x + sx * ox + d.x * oz, pl.top.y + 0.045, pl.top.z + sz * ox + d.z * oz);
  }

  facing(step: number): number {
    const d = this.dir(step);
    return Math.atan2(d.x, d.z);
  }

  heightAt(x: number, z: number): number {
    let h = 0;
    for (const o of this.obstacles) if (o.top > h && (o.x - x) ** 2 + (o.z - z) ** 2 < o.r * o.r) h = o.top;
    return h;
  }

  overviewShot(): InsideShot {
    const box = new THREE.Box3();
    for (const p of this.plates) box.expandByPoint(p.top);
    box.expandByPoint(this.portal);
    const c = box.getCenter(new THREE.Vector3());
    const w = box.max.x - box.min.x + 9;
    const depth = box.max.z - box.min.z;
    let d = Math.max(22, w / 2 / (Math.tan(HALF_FOV) * ASPECT) + depth * 0.5);
    const yaw = -0.2;
    let pitch = 0.5;
    // nicht aus der Höhle hinaus: notfalls steiler von oben
    const maxH = CAVE.rz * 0.78 - c.z;
    if (d * Math.cos(pitch) > maxH) pitch = Math.acos(clamp(maxH / d, 0.3, 1));
    const maxY = 30;
    if (c.y + d * Math.sin(pitch) > maxY) d = (maxY - c.y) / Math.sin(pitch);
    const position = new THREE.Vector3(c.x + Math.sin(yaw) * Math.cos(pitch) * d, c.y + Math.sin(pitch) * d, c.z + Math.cos(yaw) * Math.cos(pitch) * d);
    const lookAt = new THREE.Vector3(c.x, c.y + 1, c.z - 1.5);
    return { position, lookAt };
  }

  plateShot(step: number): InsideShot {
    const i = clamp(Math.round(step), 0, this.length);
    const p = this.plates[i]!.top;
    const d = this.dir(i);
    const s = this.side(i);
    const position = p.clone().addScaledVector(d, -5).addScaledVector(s, 5.6);
    position.y = p.y + 4.6;
    const lookAt = p.clone().addScaledVector(d, 2.4);
    lookAt.y = p.y + 0.8;
    return { position, lookAt };
  }

  portalShot(): InsideShot {
    const p = this.portal;
    const d = this.dir(this.length);
    const s = this.side(this.length);
    const position = p.clone().addScaledVector(d, 3.5).addScaledVector(s, 7.5);
    position.y = p.y + 4.4;
    const lookAt = p.clone().addScaledVector(d, -1.6);
    lookAt.y = p.y + 0.9;
    return { position, lookAt };
  }

  dropShot(): InsideShot {
    const p = this.plates[0]!.top;
    const d = this.dir(0);
    const s = this.side(0);
    const position = p.clone().addScaledVector(s, 11).addScaledVector(d, 3);
    position.y = p.y + 1.6;
    const lookAt = p.clone().addScaledVector(d, 0.5);
    lookAt.y = p.y + 3.4;
    return { position, lookAt };
  }

  // =========================================================================
  // Markierung & Effekte
  // =========================================================================
  highlight(step: number | null, color?: string) {
    if (step === null || step < 0) {
      this.hlGroup.visible = false;
      return;
    }
    const i = clamp(Math.round(step), 0, this.length);
    const pl = this.plates[i]!;
    this.hlBase = pl.radius / PLATE_R;
    this.hlGroup.visible = true;
    this.hlGroup.position.set(pl.top.x, pl.top.y + 0.03, pl.top.z);
    this.hlGroup.scale.setScalar(this.hlBase);
    if (color) {
      const c = new THREE.Color(color);
      this.hlRingMat.color.copy(c).multiplyScalar(2.2);
      (this.hlBeamMat.uniforms.uColor!.value as THREE.Color).copy(c).multiplyScalar(1.4);
    }
  }

  lavaBurst(at: THREE.Vector3) {
    const { x, y, z } = at;
    this.glow.emit(90, (p) => {
      const a = Math.random() * Math.PI * 2;
      const s = rnd(1, 4.5);
      Object.assign(p, { x: x + rnd(-0.3, 0.3), y: y + 0.2, z: z + rnd(-0.3, 0.3), vx: Math.cos(a) * s, vy: rnd(4, 11), vz: Math.sin(a) * s, maxLife: rnd(0.9, 1.7), size: rnd(0.35, 0.75), sizeEnd: 0.12, r: 2.2, g: rnd(0.6, 1.3), b: 0.12, alpha: 1, gravity: 13, drag: 0.4 });
    });
    this.smoke.emit(16, (p) => {
      const a = Math.random() * Math.PI * 2;
      const s = rnd(0.4, 1.6);
      Object.assign(p, { x, y: y + 0.3, z, vx: Math.cos(a) * s, vy: rnd(1.2, 3), vz: Math.sin(a) * s, maxLife: rnd(1.6, 2.6), size: rnd(1.2, 1.8), sizeEnd: rnd(3.5, 5), r: 0.22, g: 0.13, b: 0.1, alpha: 0.55, drag: 1.2 });
    });
    (this.lavaMat.uniforms.uBurst!.value as THREE.Vector4).set(x, z, this.time.value, 1);
  }

  warpFlash(at: THREE.Vector3) {
    const { x, y, z } = at;
    this.stars.emit(60, (p) => {
      const a = Math.random() * Math.PI * 2;
      const r = rnd(0.2, 1.4);
      Object.assign(p, { x: x + Math.cos(a) * r, y: y + rnd(0, 0.8), z: z + Math.sin(a) * r, vx: -Math.sin(a) * 3, vy: rnd(3, 9), vz: Math.cos(a) * 3, maxLife: rnd(0.9, 1.6), size: rnd(0.5, 0.9), sizeEnd: 0.1, r: 0.7, g: 2.2, b: 0.9, alpha: 1, drag: 1.4, spin: rnd(-6, 6) });
    });
    this.glow.emit(110, (p) => {
      const a = Math.random() * Math.PI * 2;
      const s = rnd(3, 7);
      Object.assign(p, { x, y: y + 0.4, z, vx: Math.cos(a) * s, vy: rnd(0.5, 4), vz: Math.sin(a) * s, maxLife: rnd(0.6, 1.1), size: rnd(0.4, 0.8), sizeEnd: 0.05, r: 0.5, g: 2.4, b: 0.8, alpha: 1, drag: 2.2 });
    });
    this.warp = 1;
  }

  // =========================================================================
  // Qualität, Größe, Animation
  // =========================================================================
  setQuality(q: InsideQuality) {
    if (q === this.quality) return;
    this.quality = q;
    this.applyQuality();
  }

  private applyQuality() {
    const p = QUALITY[this.quality];
    this.embers.geometry.setDrawRange(0, p.embers);
    this.key.castShadow = p.shadow > 0;
    if (p.shadow > 0 && this.key.shadow.mapSize.x !== p.shadow) {
      this.key.shadow.mapSize.set(p.shadow, p.shadow);
      this.key.shadow.map?.dispose();
      this.key.shadow.map = null;
    }
    this.lavaLights.forEach((l, k) => (l.visible = k < p.lavaLights));
    // weniger Glutlichter → jedes etwas kräftiger
    for (const l of this.lavaLights) l.userData.base = 36 * (4 / Math.max(2, p.lavaLights)) ** 0.5;
    this.placeLightsForCount(p.lavaLights);
    this.portalLight.visible = p.portalLight;
    this.shoutLight.visible = p.extraLights && this.shout > 0;
    this.fall2Light.visible = p.extraLights;
    const detail = p.lavaDetail;
    if (!!this.lavaMat.defines.LAVA_DETAIL !== detail) {
      if (detail) this.lavaMat.defines.LAVA_DETAIL = '';
      else delete this.lavaMat.defines.LAVA_DETAIL;
      this.lavaMat.needsUpdate = true;
    }
  }

  private placeLightsForCount(n: number) {
    const L = this.length;
    for (let k = 0; k < n; k++) {
      const f = (k + 0.5) / n;
      const i = Math.min(L, Math.floor(f * L + 0.5));
      const p = this.plates[i]!.top;
      this.lavaLights[k]!.position.set(p.x + 1.5, 0.8, p.z + 3.6);
    }
  }

  /** Bildhöhe in Pixeln (inkl. Pixelverhältnis) für die Größe von Funken und Partikeln.
   *  Optional – wird beim Zeichnen automatisch aus dem Renderziel übernommen. */
  setViewport(heightPx: number) {
    this.viewportH = heightPx;
    this.viewportScale = heightPx * 0.75;
    this.emberMat.uniforms.uScale!.value = this.viewportScale;
    this.moteMat.uniforms.uScale!.value = this.viewportScale;
    for (const ps of [this.glow, this.smoke, this.stars]) ps.setScale(heightPx);
  }

  update(t: number, dt: number, camera: THREE.Camera) {
    this.time.value = t;
    const p = QUALITY[this.quality];
    // Licht flackert mit der Lava
    this.fallLight.intensity = 520 * (0.88 + Math.sin(t * 2.1) * 0.07 + Math.sin(t * 5.3 + 1) * 0.05);
    this.fall2Light.intensity = 160 * (0.85 + Math.sin(t * 2.7 + 2) * 0.1);
    this.lavaLights.forEach((l, k) => {
      const b = (l.userData.base as number) ?? 36;
      l.intensity = b * (0.85 + Math.sin(t * 1.9 + k * 2.1) * 0.09 + Math.sin(t * 6.1 + k) * 0.06);
    });

    // Ausgangsfeld pulsiert
    if (this.shoutGroup.visible) {
      const k = 1 + Math.sin(t * 3.2) * 0.07;
      this.shoutRing.scale.set(k, 1, k);
      this.shoutRingMat.opacity = 0.6 + Math.sin(t * 3.2) * 0.3;
      this.shoutBeamMat.uniforms.uOpacity!.value = 0.45 + Math.sin(t * 3.2) * 0.12;
      this.shoutLight.intensity = 22 + Math.sin(t * 3.2) * 8;
      this.sparkleAcc += dt * (p.pops ? 5 : 2);
      const sp = this.shoutGroup.position;
      while (this.sparkleAcc > 1) {
        this.sparkleAcc -= 1;
        this.stars.emit(1, (q) => {
          const a = Math.random() * Math.PI * 2;
          Object.assign(q, { x: sp.x + Math.cos(a) * 1.2, y: sp.y + 0.2, z: sp.z + Math.sin(a) * 1.2, vy: rnd(1.2, 2.4), maxLife: rnd(1.2, 2), size: rnd(0.25, 0.45), sizeEnd: 0.05, r: 0.8, g: 2, b: 0.6, alpha: 1, spin: rnd(-3, 3) });
        });
      }
    }
    // Markierung pulsiert
    if (this.hlGroup.visible) {
      const k = this.hlBase * (1 + Math.sin(t * 4) * 0.05);
      this.hlGroup.scale.set(k, this.hlBase, k);
      this.hlRingMat.opacity = 0.6 + Math.sin(t * 4) * 0.3;
    }

    // Portal: Runensteine kreisen, Blitz klingt ab
    this.warp = Math.max(0, this.warp - dt * 1.4);
    this.vortexMat.uniforms.uFlash!.value = this.warp;
    this.funnelMat.uniforms.uFlash!.value = this.warp;
    const fs = 1 + this.warp * 0.6;
    this.funnel.scale.set(fs, 1 + this.warp * 1.5, fs);
    this.funnel.position.y = 1.5 * (1 + this.warp * 1.5);
    const m = this.tmpM;
    for (let k = 0; k < 6; k++) {
      const a = t * 0.9 + (k / 6) * Math.PI * 2;
      const r = PORTAL_R + 0.25 + Math.sin(t * 1.3 + k) * 0.1;
      m.makeRotationY(t * 2 + k).setPosition(Math.cos(a) * r, 1.0 + Math.sin(t * 1.7 + k * 1.3) * 0.35, Math.sin(a) * r);
      this.runes.setMatrixAt(k, m);
    }
    this.runes.instanceMatrix.needsUpdate = true;
    this.portalLight.intensity = 40 * (0.9 + Math.sin(t * 4) * 0.1) + this.warp * 120;
    if (Math.random() < dt * 6) {
      const pp = this.portal;
      this.stars.emit(1, (q) => {
        const a = Math.random() * Math.PI * 2;
        const r = rnd(0.3, 1.5);
        Object.assign(q, { x: pp.x + Math.cos(a) * r, y: pp.y + 0.1, z: pp.z + Math.sin(a) * r, vx: -Math.sin(a) * 1.2, vy: rnd(1.5, 3.2), vz: Math.cos(a) * 1.2, maxLife: rnd(1, 1.6), size: rnd(0.25, 0.45), sizeEnd: 0.05, r: 0.6, g: 2.2, b: 0.8, alpha: 1, drag: 0.6, spin: rnd(-4, 4) });
      });
    }

    // Dampf am Fuß des Lavafalls
    this.steamAcc += dt * p.steam;
    while (this.steamAcc > 1) {
      this.steamAcc -= 1;
      const b = Math.random() < 0.75 ? this.fallBase : this.fall2Base;
      this.smoke.emit(1, (q) => {
        Object.assign(q, { x: b.x + rnd(-5, 5), y: 0.5, z: b.z + rnd(-1, 3), vx: rnd(-0.4, 0.4), vy: rnd(2, 4), vz: rnd(0.2, 1), maxLife: rnd(3, 5), size: rnd(2.5, 4), sizeEnd: rnd(8, 12), r: 0.55, g: 0.3, b: 0.2, alpha: 0.22, drag: 0.3 });
      });
      if (Math.random() < 0.5)
        this.glow.emit(2, (q) => {
          Object.assign(q, { x: b.x + rnd(-4, 4), y: 0.4, z: b.z + rnd(-0.5, 2), vx: rnd(-2, 2), vy: rnd(5, 9), vz: rnd(0, 2.5), maxLife: rnd(0.8, 1.4), size: rnd(0.3, 0.55), sizeEnd: 0.08, r: 2, g: rnd(0.6, 1.1), b: 0.1, alpha: 1, gravity: 9 });
        });
    }
    // Rauchsäulen (ultra)
    if (p.smoke) {
      this.smokeAcc += dt * 5;
      while (this.smokeAcc > 1) {
        this.smokeAcc -= 1;
        const s = this.smokeSpots[Math.floor(Math.random() * this.smokeSpots.length)]!;
        this.smoke.emit(1, (q) => {
          Object.assign(q, { x: s.x + rnd(-1.2, 1.2), y: s.y, z: s.z + rnd(-1.2, 1.2), vx: rnd(0.1, 0.5), vy: rnd(1.6, 2.6), vz: rnd(-0.2, 0.2), maxLife: rnd(5, 7.5), size: rnd(2, 3), sizeEnd: rnd(7, 11), r: 0.2, g: 0.11, b: 0.08, alpha: 0.4, drag: 0.15 });
        });
      }
    }
    // Blubbern und gelegentliche Fontänen in Sichtweite
    if (p.pops) {
      this.popAcc += dt * 3;
      const look = camera.getWorldDirection(this.tmpA);
      const cp = camera.getWorldPosition(this.tmpB);
      while (this.popAcc > 1) {
        this.popAcc -= 1;
        const dist = rnd(8, 40);
        const x = cp.x + look.x * dist + rnd(-12, 12);
        const z = cp.z + look.z * dist + rnd(-8, 8);
        if (this.heightAt(x, z) > 0.5 || ell(x, z) > 0.9) continue;
        this.glow.emit(6, (q) => {
          const a = Math.random() * Math.PI * 2;
          const sp = rnd(0.4, 1.4);
          Object.assign(q, { x, y: 0.1, z, vx: Math.cos(a) * sp, vy: rnd(2, 4), vz: Math.sin(a) * sp, maxLife: rnd(0.5, 0.9), size: rnd(0.2, 0.35), sizeEnd: 0.05, r: 2, g: rnd(0.5, 0.9), b: 0.08, alpha: 1, gravity: 12 });
        });
      }
      this.fountainAt -= dt;
      if (this.fountainAt <= 0) {
        this.fountainAt = rnd(5, 9);
        for (let k = 0; k < 6; k++) {
          const x = rnd(-CAVE.rx, CAVE.rx) * 0.7;
          const z = rnd(-CAVE.rz, CAVE.rz) * 0.7;
          if (this.heightAt(x, z) > 0.5 || ell(x, z) > 0.8) continue;
          this.glow.emit(40, (q) => {
            const a = Math.random() * Math.PI * 2;
            const sp = rnd(0.5, 2);
            Object.assign(q, { x, y: 0.2, z, vx: Math.cos(a) * sp, vy: rnd(6, 11), vz: Math.sin(a) * sp, maxLife: rnd(1.1, 1.8), size: rnd(0.35, 0.6), sizeEnd: 0.1, r: 2.2, g: rnd(0.55, 1.0), b: 0.1, alpha: 1, gravity: 11 });
          });
          break;
        }
      }
    }
    this.glow.update(dt);
    this.smoke.update(dt);
    this.stars.update(dt);
  }

  dispose() {
    // nur Eigenes freigeben – von außen hinzugefügte Figuren teilen Geometrien/Materialien mit der Insel
    const mats = new Set<THREE.Material>();
    for (const o of this.own) {
      const m = o as THREE.Mesh;
      m.geometry?.dispose();
      const list = Array.isArray(m.material) ? m.material : m.material ? [m.material] : [];
      for (const x of list) mats.add(x);
      if ((o as THREE.SpotLight).isSpotLight) (o as THREE.SpotLight).shadow.map?.dispose();
    }
    for (const m of mats) m.dispose();
    for (const t of this.textures) t.dispose();
    this.glow.dispose();
    this.smoke.dispose();
    this.stars.dispose();
    this.own.clear();
    this.scene.environment = null;
    this.scene.clear();
  }
}
