/**
 * Spielfigur im Weltall: Astronautenanzug in Teamfarbe mit Glashelm – Gesicht, Frisur und
 * Hautfarbe aus dem Figuren-Editor sind durch den Helm zu sehen. Gleiche Schnittstelle (FigureRig),
 * gleiche Gelenke, Proportionen und Posen (poseFigure) wie die Insel-Figur.
 *
 * Aufbau:
 * - Anzug (Rumpf, Arme, Beine, Rucksack, Stiefel, Handschuhe) aus Grundkörpern; je Gelenkgruppe und
 *   Material zu einem Mesh zusammengefasst. Die Geometrien hängen nur von der Körperform ab und
 *   werden einmal je Seite zwischengespeichert – jede Figur hat so nur wenige Draw-Calls.
 * - Gesicht (Augen, Mund, Frisur, Brille …) wie bei der Insel-Figur, etwas verkleinert im Helm.
 * - Helm: Glaskugel (Transparenz + Glanz + Fresnel-Rand, kein teures Transmission-Material) mit
 *   Glanzlicht-Streifen; Hüte (Krone, Partyhut, Zylinder) sitzen obendrauf.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { FIGURE_HAIR_COLORS, FIGURE_SKINS, teamColor, type FigureConfig, type TeamColorKey } from '@insel/shared';
import { buildAccessory, buildEye, buildHair, buildMouth, G, mat, poseFigure, type FigureRig } from './figure3d.ts';

type V3 = [number, number, number];

/** Kopf wie bei der Insel-Figur (gleiche Augen-/Mund-Positionen) … */
const HEAD_R = 0.34;
/** … im Helm aber etwas kleiner, damit auch Irokese, Dutt und Locken hineinpassen */
const FACE = 0.86;
/** Helmradius (Mitte = Kopfmitte) */
const HELMET_R = 0.45;
/** Unterkante des Helms: Öffnung mit diesem Radius sitzt auf dem Halsring */
const COLLAR_R = 0.27;
const HELMET_THETA = Math.PI - Math.asin(COLLAR_R / HELMET_R);
const COLLAR_Y = Math.cos(HELMET_THETA) * HELMET_R;
/** Hüte sitzen außen auf dem Helm, alles andere trägt die Figur im Helm */
const HATS = new Set<FigureConfig['accessory']>(['crown', 'party', 'tophat']);

// ---------------------------------------------------------------------------
// Geteilte Geometrien und Materialien (einmal pro Seite)
// ---------------------------------------------------------------------------
const SG = {
  helmet: new THREE.SphereGeometry(1, 36, 22, 0, Math.PI * 2, 0, HELMET_THETA),
  /** Glanzlicht wie im Comic: Bogen entlang des Helmrands vorne links oben, ein Punkt, unten rechts ein kurzer Bogen */
  gleam: (() => {
    // Kreisbogen auf der Einheitskugel im Winkel `cone` zur Blickachse (+z), ab Winkel `from` über `len` (in der xy-Ebene)
    const arc = (cone: number, from: number, len: number, tube: number) => {
      const g = new THREE.TorusGeometry(Math.sin(cone) * 1.01, tube, 5, 18, len);
      g.rotateZ(from);
      g.translate(0, 0, Math.cos(cone) * 1.01);
      return g;
    };
    const dot = new THREE.SphereGeometry(0.042, 10, 8);
    dot.translate(Math.cos(2.9) * Math.sin(0.98), Math.sin(2.9) * Math.sin(0.98), Math.cos(0.98));
    return mergeGeometries([arc(1.0, 1.75, 0.95, 0.03), dot, arc(1.08, -1.05, 0.5, 0.02)]);
  })(),
  collar: new THREE.TorusGeometry(1, 0.16, 10, 36),
};

let glassMat: THREE.MeshStandardMaterial | null = null;
/** Helmglas: fast klar in der Mitte, zum Rand hin dichter und heller (Fresnel), Spiegelungen deckend. */
function helmetGlass() {
  if (glassMat) return glassMat;
  const m = new THREE.MeshStandardMaterial({
    color: '#d8efff',
    roughness: 0.07,
    metalness: 0.05,
    transparent: true,
    opacity: 0.1,
    depthWrite: false,
    envMapIntensity: 1.4,
  });
  m.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace(
      '#include <opaque_fragment>',
      `{
        float fres = pow(1.0 - abs(dot(normalize(normal), normalize(vViewPosition))), 2.4);
        float spec = dot(totalSpecular, vec3(0.3, 0.59, 0.11));
        diffuseColor.a = clamp(max(diffuseColor.a + fres * 0.55, spec * 1.6), 0.0, 0.9);
        outgoingLight += vec3(0.62, 0.84, 1.0) * fres * 0.45;
      }
      #include <opaque_fragment>`,
    );
  };
  m.customProgramCacheKey = () => 'astro-helmet-glass';
  glassMat = m;
  return m;
}

const skinCache = new Map<string, THREE.MeshStandardMaterial>();
/** Haut im Helm: leicht von innen beleuchtet (Helmlampe) – Gesichter bleiben auch auf dunklen Planeten gut zu sehen */
function helmetSkin(color: string) {
  let m = skinCache.get(color);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, roughness: 0.62, emissive: color, emissiveIntensity: 0.16 });
    skinCache.set(color, m);
  }
  return m;
}

const basicCache = new Map<string, THREE.MeshBasicMaterial>();
/** Selbstleuchtende Kleinteile (Lämpchen, Anzeige) – unbeleuchtet, auch im Dunkeln hell */
function glow(color: string, opacity = 1) {
  const key = `${color}|${opacity}`;
  let m = basicCache.get(key);
  if (!m) {
    m = new THREE.MeshBasicMaterial({ color, transparent: opacity < 1, opacity, depthWrite: opacity >= 1 });
    basicCache.set(key, m);
  }
  return m;
}

// ---------------------------------------------------------------------------
// Anzug: Teile je Material-Fach sammeln und zu einer Geometrie verschmelzen
// ---------------------------------------------------------------------------
/**
 * Fächer: Teamfarben und Haut je Figur; Ausrüstung (Weiß/Grau/Metall/Sohlen) und Lämpchen über
 * Vertex-Farben mit je einem Material für alle Figuren – so bleibt es bei wenigen Draw-Calls.
 */
type Slot = 'suit' | 'suitDark' | 'gear' | 'lights' | 'skin' | 'blush' | 'brow';
/** [Fach, Geometrie, Größe, Position, Drehung?, Vertex-Farbe (nur Ausrüstung/Lämpchen)?] */
type Part = [Slot, THREE.BufferGeometry, V3, V3, V3?, string?];
type Baked = Map<Slot, THREE.BufferGeometry>;

const WHITE = '#f3f6fa';
const TRIM = '#c9d2de';
const METAL = '#a3adbb';
const SOLE = '#2b2f3a';

/** Kleinteile werfen keinen Schatten (wie bei der Insel-Figur) */
const NO_SHADOW = new Set<Slot>(['blush', 'brow', 'lights']);

let gearMat: THREE.MeshStandardMaterial | null = null;
let lightsMat: THREE.MeshBasicMaterial | null = null;

const tmpM = new THREE.Matrix4();
const tmpQ = new THREE.Quaternion();
const tmpE = new THREE.Euler();
const tmpP = new THREE.Vector3();
const tmpS = new THREE.Vector3();
const tmpC = new THREE.Color();

function bake(parts: Part[]): Baked {
  const by = new Map<Slot, THREE.BufferGeometry[]>();
  for (const [slot, geo, s, p, r, color] of parts) {
    const g = geo.clone();
    tmpM.compose(tmpP.set(...p), tmpQ.setFromEuler(tmpE.set(...(r ?? [0, 0, 0]))), tmpS.set(...s));
    g.applyMatrix4(tmpM);
    if (color) {
      tmpC.set(color);
      const n = g.getAttribute('position').count;
      const c = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) c.set([tmpC.r, tmpC.g, tmpC.b], i * 3);
      g.setAttribute('color', new THREE.BufferAttribute(c, 3));
    }
    const list = by.get(slot) ?? [];
    list.push(g);
    by.set(slot, list);
  }
  const out: Baked = new Map();
  for (const [slot, list] of by) {
    const merged = list.length > 1 ? mergeGeometries(list, false) : list[0]!;
    if (list.length > 1) for (const g of list) g.dispose();
    out.set(slot, merged);
  }
  return out;
}

interface Blueprint {
  body: Baked;
  armL: Baked;
  armR: Baked;
  leg: Baked;
  head: Baked;
  hipY: number;
  shoulderY: number;
  headY: number;
  armX: number;
  legX: number;
  /** Rücklicht am Rucksack (blinkt) */
  lamp: V3;
}

const blueprints = new Map<FigureConfig['body'], Blueprint>();

function blueprint(kind: FigureConfig['body']): Blueprint {
  const hit = blueprints.get(kind);
  if (hit) return hit;
  const w = kind === 'round' ? 1.25 : 1;
  const tall = kind === 'tall' ? 1.18 : 1;
  // Gleiche Gelenkhöhen wie die Insel-Figur (figure3d.ts)
  const legLen = 0.32 * tall;
  const hipY = 0.12 + legLen;
  const torsoH = 0.34 * tall;
  const torsoY = hipY + torsoH * 0.5 + 0.02;
  const shoulderY = torsoY + torsoH * 0.38;
  const headY = shoulderY + 0.06 + HEAD_R;
  const front = 0.19 * w;

  // --- Rumpf, Gürtel, Brustteil, Halsring, Rucksack ---
  const packZ = -(front + 0.03);
  const packTop = Math.min(headY + COLLAR_Y + 0.02, torsoY + 0.2);
  const packBottom = hipY + 0.04;
  const packH = packTop - packBottom;
  const packY = (packTop + packBottom) / 2;
  const packD = 0.13;
  const backZ = packZ - packD / 2;
  const body: Part[] = [
    ['suit', G.capsule, [0.225 * w, torsoH * 0.5, front], [0, torsoY, 0]],
    ['suitDark', G.sphereLow, [0.215 * w, 0.1, 0.18 * w], [0, hipY + 0.02, 0]],
    // Gürtel mit Schnalle
    ['gear', G.torus, [0.222 * w, 0.188 * w, 0.4], [0, hipY + 0.075, 0], [Math.PI / 2, 0, 0], TRIM],
    ['gear', G.box, [0.075, 0.05, 0.025], [0, hipY + 0.075, 0.19 * w + 0.012], undefined, METAL],
    // Brustteil: Anzeige und drei Knöpfe
    ['gear', G.box, [0.17 * w, 0.115, 0.035], [0, torsoY + 0.055, front + 0.004], undefined, WHITE],
    ['lights', G.box, [0.12 * w, 0.026, 0.01], [0, torsoY + 0.083, front + 0.024], undefined, '#7ff6ff'],
    ['lights', G.sphereLow, [0.017, 0.017, 0.012], [-0.045 * w, torsoY + 0.035, front + 0.022], undefined, '#ff4d4d'],
    ['lights', G.sphereLow, [0.017, 0.017, 0.012], [0, torsoY + 0.035, front + 0.022], undefined, '#ffd23f'],
    ['lights', G.sphereLow, [0.017, 0.017, 0.012], [0.045 * w, torsoY + 0.035, front + 0.022], undefined, '#3ddc84'],
    // Halsring, auf dem der Helm sitzt
    ['gear', G.cylinder, [COLLAR_R - 0.005, 0.07, COLLAR_R - 0.005], [0, headY + COLLAR_Y - 0.03, 0], undefined, METAL],
    ['gear', SG.collar, [COLLAR_R, COLLAR_R, COLLAR_R], [0, headY + COLLAR_Y + 0.004, 0], [Math.PI / 2, 0, 0], TRIM],
    // Rucksack (Lebenserhaltung) mit zwei Tanks
    ['gear', G.box, [0.33 * w, packH, packD], [0, packY, packZ], undefined, WHITE],
    ['gear', G.box, [0.34 * w, 0.03, packD + 0.01], [0, packY - packH * 0.18, packZ], undefined, TRIM],
    ['gear', G.cylinder, [0.05, packH * 0.86, 0.05], [0.1 * w, packY, backZ - 0.035], undefined, WHITE],
    ['gear', G.cylinder, [0.05, packH * 0.86, 0.05], [-0.1 * w, packY, backZ - 0.035], undefined, WHITE],
    ['gear', G.sphereLow, [0.05, 0.03, 0.05], [0.1 * w, packY + packH * 0.43, backZ - 0.035], undefined, METAL],
    ['gear', G.sphereLow, [0.05, 0.03, 0.05], [-0.1 * w, packY + packH * 0.43, backZ - 0.035], undefined, METAL],
    ['gear', G.sphereLow, [0.05, 0.03, 0.05], [0.1 * w, packY - packH * 0.43, backZ - 0.035], undefined, METAL],
    ['gear', G.sphereLow, [0.05, 0.03, 0.05], [-0.1 * w, packY - packH * 0.43, backZ - 0.035], undefined, METAL],
    // Lämpchen hinten zwischen den Tanks (das rote oben blinkt, eigenes Mesh)
    ['lights', G.sphereLow, [0.022, 0.022, 0.012], [0, packY + 0.02, backZ - 0.004], undefined, '#5dff9a'],
    ['lights', G.box, [0.05, 0.02, 0.01], [0, packY - 0.05, backZ - 0.004], undefined, '#ffb43a'],
    // seitliche Lämpchen am Rucksack (auch von vorn/seitlich zu sehen)
    ['lights', G.sphereLow, [0.012, 0.018, 0.018], [0.165 * w + 0.004, packY + packH * 0.25, packZ + 0.02], undefined, '#5dff9a'],
    ['lights', G.sphereLow, [0.012, 0.018, 0.018], [-0.165 * w - 0.004, packY + packH * 0.25, packZ + 0.02], undefined, '#ffb43a'],
  ];

  // --- Arme (Drehpunkt Schulter) ---
  const arm = (side: 1 | -1): Part[] => [
    ['suit', G.sphereLow, [0.09, 0.09, 0.09], [0, -0.015, 0]],
    ['suit', G.capsule, [0.073, 0.075, 0.073], [0, -0.1, 0]],
    ['suit', G.capsule, [0.068, 0.07, 0.068], [0, -0.215, 0]],
    // Abzeichen am Oberarm
    ['gear', G.disc, [0.036, 0.036, 1], [side * 0.077, -0.09, 0], [0, (side * Math.PI) / 2, 0], WHITE],
    ['gear', G.disc, [0.022, 0.022, 1], [side * 0.079, -0.09, 0], [0, (side * Math.PI) / 2, 0], METAL],
    // Manschette und Handschuh mit Daumen
    ['gear', G.cylinder, [0.077, 0.045, 0.077], [0, -0.29, 0], undefined, TRIM],
    ['gear', G.sphere, [0.08, 0.084, 0.076], [0, -0.345, 0], undefined, WHITE],
    ['gear', G.sphereLow, [0.03, 0.042, 0.03], [-side * 0.055, -0.325, 0.04], [0.3, 0, side * 0.5], WHITE],
  ];

  // --- Beine (Drehpunkt Hüfte) mit Stiefeln ---
  const leg: Part[] = [
    ['suit', G.capsule, [0.095, legLen * 0.5, 0.095], [0, -legLen * 0.45, 0]],
    ['gear', G.sphereLow, [0.062, 0.06, 0.04], [0, -legLen * 0.52, 0.078], undefined, TRIM],
    ['gear', G.cylinder, [0.102, 0.11, 0.102], [0, -legLen + 0.03, 0], undefined, WHITE],
    ['gear', G.torus, [0.104, 0.104, 0.5], [0, -legLen + 0.085, 0], [Math.PI / 2, 0, 0], TRIM],
    ['gear', G.sphere, [0.112, 0.078, 0.165], [0, -legLen - 0.02, 0.04], undefined, WHITE],
    ['gear', G.cylinder, [0.108, 0.026, 0.158], [0, -legLen - 0.072, 0.04], undefined, SOLE],
  ];

  // --- Kopf (Haut, Ohren, Nase, Wangen, Brauen) – wie die Insel-Figur ---
  const r = HEAD_R;
  const head: Part[] = [
    ['skin', G.sphere, [r, r * 1.04, r * 0.96], [0, 0, 0]],
    ['skin', G.sphereLow, [0.06, 0.09, 0.05], [r * 0.97, 0, 0]],
    ['skin', G.sphereLow, [0.06, 0.09, 0.05], [-r * 0.97, 0, 0]],
    ['skin', G.sphereLow, [0.045, 0.04, 0.05], [0, -0.02, r * 0.95]],
    ['blush', G.disc, [0.06, 0.04, 1], [0.17, -0.07, r * 0.9], [0, 0.45, 0]],
    ['blush', G.disc, [0.06, 0.04, 1], [-0.17, -0.07, r * 0.9], [0, -0.45, 0]],
    ['brow', G.capsule, [0.016, 0.035, 0.016], [0.12, 0.17, r * 0.9], [0, 0.3, Math.PI / 2 + 0.15]],
    ['brow', G.capsule, [0.016, 0.035, 0.016], [-0.12, 0.17, r * 0.9], [0, -0.3, Math.PI / 2 - 0.15]],
  ];

  const bp: Blueprint = {
    body: bake(body),
    armL: bake(arm(1)),
    armR: bake(arm(-1)),
    leg: bake(leg),
    head: bake(head),
    hipY,
    shoulderY,
    headY,
    armX: 0.27 * w,
    legX: 0.1 * w,
    lamp: [0, packY + 0.075, backZ - 0.006],
  };
  blueprints.set(kind, bp);
  return bp;
}

/** Zwischengespeicherte Geometrien als Meshes mit den Materialien dieser Figur. */
function instantiate(baked: Baked, mats: Record<Slot, THREE.Material>, into: THREE.Object3D) {
  for (const [slot, geo] of baked) {
    const m = new THREE.Mesh(geo, mats[slot]);
    m.castShadow = !NO_SHADOW.has(slot);
    into.add(m);
  }
}

/**
 * Teile einer frisch gebauten Gruppe (Frisur, Zubehör) je Material zu einem Mesh verschmelzen –
 * z. B. 26 Locken → ein Draw-Call. Die neuen Geometrien gehören der Figur (`owned`, beim Abbau frei).
 */
function mergeByMaterial(src: THREE.Object3D, owned: THREE.BufferGeometry[]): THREE.Group {
  src.updateMatrixWorld(true);
  const inv = src.matrixWorld.clone().invert();
  const buckets = new Map<THREE.Material, { geos: THREE.BufferGeometry[]; cast: boolean }>();
  src.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || Array.isArray(m.material)) return;
    const g = m.geometry.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, m.matrixWorld));
    let b = buckets.get(m.material);
    if (!b) buckets.set(m.material, (b = { geos: [], cast: false }));
    b.geos.push(g);
    b.cast ||= m.castShadow;
  });
  const out = new THREE.Group();
  for (const [material, b] of buckets) {
    const mixed = b.geos.some((g) => !g.index) && b.geos.some((g) => g.index);
    const list = mixed ? b.geos.map((g) => (g.index ? g.toNonIndexed() : g)) : b.geos;
    const merged = list.length > 1 ? mergeGeometries(list, false) : list[0]!;
    // nicht verschmelzbar (unterschiedliche Attribute) → Teile einzeln behalten
    const geos = merged ? [merged] : list;
    for (const g of [...b.geos, ...list]) if (!geos.includes(g)) g.dispose();
    for (const geo of geos) {
      owned.push(geo);
      const mesh = new THREE.Mesh(geo, material);
      mesh.castShadow = b.cast;
      out.add(mesh);
    }
  }
  return out;
}

/** Hut auf der Helmkuppel: Krempe bzw. Rand ruht auf dem Glas. */
function hatOnHelmet(kind: FigureConfig['accessory'], team: string, owned: THREE.BufferGeometry[]): THREE.Object3D {
  const hat = mergeByMaterial(buildAccessory(kind, team, HEAD_R), owned);
  // Unterkante des Huts im Insel-Maßstab liegt bei ≈ headR·0.95; so weit anheben, dass sie auf dem Helm sitzt
  const lift = kind === 'crown' ? 0.08 : kind === 'party' ? 0.085 : 0.045;
  const s = kind === 'tophat' ? 0.82 : 0.88;
  hat.scale.setScalar(s);
  hat.position.y = lift + HEAD_R * 0.95 * (1 - s);
  if (kind === 'party') hat.rotation.z = -0.08;
  return hat;
}

export function createSpaceFigure(figure: FigureConfig, color: TeamColorKey, opts: { base?: boolean } = {}): FigureRig {
  const team = teamColor(color);
  const skin = FIGURE_SKINS[figure.skin] ?? FIGURE_SKINS[1];
  const hair = FIGURE_HAIR_COLORS[figure.hairColor] ?? FIGURE_HAIR_COLORS[1];
  const bp = blueprint(figure.body);
  const owned: THREE.BufferGeometry[] = [];

  gearMat ??= new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.46, metalness: 0.12 });
  lightsMat ??= new THREE.MeshBasicMaterial({ vertexColors: true });
  const mats: Record<Slot, THREE.Material> = {
    suit: mat(team.hex, { rough: 0.72 }),
    suitDark: mat(team.dark, { rough: 0.7 }),
    gear: gearMat,
    lights: lightsMat,
    skin: helmetSkin(skin),
    blush: mat('#ff8a9a', { rough: 0.9, transparent: 0.35 }),
    brow: mat(hair, { rough: 0.6 }),
  };

  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  instantiate(bp.body, mats, body);

  const mkLimb = (baked: Baked, x: number, y: number, rotZ = 0) => {
    const g = new THREE.Group();
    g.position.set(x, y, 0);
    g.rotation.z = rotZ;
    instantiate(baked, mats, g);
    body.add(g);
    return g;
  };
  const legL = mkLimb(bp.leg, bp.legX, bp.hipY);
  const legR = mkLimb(bp.leg, -bp.legX, bp.hipY);
  const armL = mkLimb(bp.armL, bp.armX, bp.shoulderY, 0.32);
  const armR = mkLimb(bp.armR, -bp.armX, bp.shoulderY, -0.32);

  // Blinkendes Rücklicht am Rucksack
  const lamp = new THREE.Mesh(G.sphereLow, glow('#ff4040'));
  lamp.scale.set(0.024, 0.024, 0.014);
  lamp.position.set(...bp.lamp);
  body.add(lamp);

  // Kopf (dreht/neigt sich im Helm – poseFigure bewegt ihn wie bei der Insel-Figur)
  const head = new THREE.Group();
  head.position.set(0, bp.headY, 0);
  head.scale.setScalar(FACE);
  body.add(head);
  instantiate(bp.head, mats, head);
  const eyes: THREE.Object3D[] = [];
  for (const side of [1, -1] as const) {
    const eye = buildEye(figure.eyes, side, figure.eyes === 'wink' && side === -1);
    eye.position.set(side * 0.12, 0.06, HEAD_R * 0.92);
    eye.rotation.y = side * 0.32;
    head.add(eye);
    eyes.push(eye);
  }
  const mouth = buildMouth(figure.mouth);
  mouth.position.set(0, -0.13, HEAD_R * 0.93);
  head.add(mouth);
  if (figure.hairStyle !== 'bald') head.add(mergeByMaterial(buildHair(figure.hairStyle, hair, HEAD_R), owned));
  if (figure.accessory !== 'none' && !HATS.has(figure.accessory)) head.add(mergeByMaterial(buildAccessory(figure.accessory, team.hex, HEAD_R), owned));

  // Helm (folgt den Kopfbewegungen nur ein wenig – der Halsring bleibt am Anzug)
  const helmet = new THREE.Group();
  helmet.position.copy(head.position);
  body.add(helmet);
  const glass = new THREE.Mesh(SG.helmet, helmetGlass());
  glass.scale.setScalar(HELMET_R);
  glass.renderOrder = 1;
  helmet.add(glass);
  const gleam = new THREE.Mesh(SG.gleam, glow('#ffffff', 0.55));
  gleam.scale.setScalar(HELMET_R);
  gleam.renderOrder = 2;
  helmet.add(gleam);
  if (HATS.has(figure.accessory)) helmet.add(hatOnHelmet(figure.accessory, team.hex, owned));

  // Teamfarbener Leuchtring am Boden (wie die Insel-Figur)
  const base = new THREE.Mesh(G.ring, new THREE.MeshBasicMaterial({ color: team.hex, transparent: true, opacity: 0.9, depthWrite: false }));
  base.rotation.x = -Math.PI / 2;
  base.scale.setScalar(0.42);
  base.position.y = 0.012;
  base.renderOrder = 2;
  base.visible = opts.base ?? true;
  root.add(base);

  const seed = Math.random() * 100;
  /** Arme über Kopf leicht nach außen (V statt senkrecht) – sonst stecken die Hände im Helm */
  const spread = (z: number) => {
    const a = Math.abs(z);
    return a > 1.6 ? Math.sign(z) * (1.6 + (a - 1.6) * 0.62) : z;
  };

  const rig: FigureRig = {
    root,
    body,
    head,
    armL,
    armR,
    legL,
    legR,
    eyes,
    base,
    mode: 'idle',
    seed,
    height: bp.headY + HELMET_R,
    setMode(mode) {
      rig.mode = mode;
    },
    update(t) {
      const tt = t + seed;
      const m = rig.mode;
      // Blinzeln und Stimmung wie bei der Insel-Figur
      const blink = tt % 4.3 < 0.12 ? 0.1 : 1;
      for (const e of eyes) e.scale.y = m === 'stuck' || m === 'angry' ? 0.6 : m === 'shock' ? 1.35 : blink;

      poseFigure(rig, m, tt);
      armL.rotation.z = spread(armL.rotation.z);
      armR.rotation.z = spread(armR.rotation.z);
      // Klettern: Hände seitlich am Helm vorbei
      if (m === 'climb') {
        armL.rotation.z += 0.5;
        armR.rotation.z -= 0.5;
      }
      helmet.rotation.set(head.rotation.x * 0.3, head.rotation.y * 0.45, head.rotation.z * 0.4);
      lamp.visible = (tt * 1.4) % 1 < 0.45;
      if (base.visible) (base.material as THREE.MeshBasicMaterial).opacity = 0.65 + Math.sin(tt * 3) * 0.2;
    },
    dispose() {
      (base.material as THREE.Material).dispose();
      for (const g of owned) g.dispose();
      owned.length = 0;
    },
  };
  rig.update(0, 0);
  return rig;
}
