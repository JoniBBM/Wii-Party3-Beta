/**
 * Bepflanzung und Deko der Insel: Palmenstrände, dichter Dschungel mit Monstera, Farnen und
 * Bambus, Blumenwiesen, Bäume auf den Hochebenen, Felsen, Treibholz, Seerosen, Schilf –
 * plus alle Wahrzeichen (landmarks.ts). Alles instanziert, Dichte je nach Qualitätsstufe.
 */
import * as THREE from 'three';
import { LAGOON, RIVER, RIVER_POOL } from '@insel/shared';
import type { Emitter } from './ambient.ts';
import { instanceModel, loadModels, type InstanceOptions, type Placement } from './assets.ts';
import { blobMask, coastDistance, ISLETS, lavaFlowPoints } from './ground.ts';
import { buildLandmarks, LANDMARK_MODELS, type KeepOut } from './landmarks.ts';
import type { IslandLayout } from './layout.ts';
import { rand } from './noise.ts';
import type { Heightfield } from './terrain.ts';

const N = (n: string) => `nature/${n}`;
const P = (n: string) => `pirate/${n}`;
const V = (n: string) => `veg/${n}`;

const PALMS = [V('palm1'), V('palm2'), V('palm3'), N('tree_palmTall'), N('tree_palmBend'), N('tree_palmDetailedTall'), P('palm-detailed-bend')];
const BROADLEAF = [N('tree_default'), N('tree_detailed'), N('tree_fat'), N('tree_oak')];
const HIGHLAND = [N('tree_plateau'), N('tree_simple'), N('tree_tall'), N('tree_thin'), N('tree_small')];
const BUSHES = [N('plant_bush'), N('plant_bushDetailed'), N('plant_bushLarge'), N('plant_bushSmall'), N('plant_bushLargeTriangle'), N('plant_bushTriangle')];
const JUNGLE_LOW = [V('monstera'), V('monstera_small'), V('plant_big'), V('plant'), V('fern')];
const FLOWERS = [N('flower_redA'), N('flower_redB'), N('flower_redC'), N('flower_yellowA'), N('flower_yellowB'), N('flower_yellowC'), N('flower_purpleA'), N('flower_purpleB'), N('flower_purpleC')];
const ROCKS_L = [N('stone_largeA'), N('stone_largeB'), N('stone_largeC'), N('stone_largeD'), N('stone_largeE'), N('stone_largeF')];
const ROCKS_S = [N('rock_smallA'), N('rock_smallB'), N('rock_smallC'), N('rock_smallD'), N('rock_smallE'), N('rock_smallF')];
const ROCKS_T = [N('rock_tallA'), N('rock_tallB'), N('rock_tallC'), N('rock_tallD'), N('rock_tallE'), N('rock_tallF'), N('rock_tallG'), N('rock_tallH')];

export const MODEL_LIST = [
  ...new Set([
    ...PALMS,
    ...BROADLEAF,
    ...HIGHLAND,
    ...BUSHES,
    ...JUNGLE_LOW,
    ...FLOWERS,
    ...ROCKS_L,
    ...ROCKS_S,
    ...ROCKS_T,
    V('bamboo'),
    N('grass_large'),
    N('grass_leafsLarge'),
    N('log'),
    N('stump_round'),
    N('stump_old'),
    N('mushroom_red'),
    N('mushroom_redGroup'),
    N('mushroom_tanGroup'),
    N('lily_large'),
    N('lily_small'),
    N('hanging_moss'),
    N('crops_bambooStageB'),
    P('rocks-sand-a'),
    P('rocks-sand-b'),
    P('rocks-sand-c'),
    P('patch-sand-foliage'),
    P('grass-plant'),
    ...LANDMARK_MODELS,
  ]),
];

export interface PropOptions {
  density: number;
}

export interface Props {
  group: THREE.Group;
  update: (t: number, dt: number) => void;
  fires: Emitter[];
  smokes: Emitter[];
  /** Baumkronen (für Affen, Papageien) */
  canopies: THREE.Vector3[];
  /** Blumen (für Schmetterlinge) */
  flowers: THREE.Vector3[];
  perches: THREE.Vector3[];
  /** Sichthindernisse für die Kamera */
  blockers: { x: number; z: number; r: number; top: number }[];
}

interface Pt {
  x: number;
  z: number;
  y: number;
}

export async function buildProps(layout: IslandLayout, field: Heightfield, opts: PropOptions): Promise<Props> {
  const models = await loadModels(MODEL_LIST);
  const root = new THREE.Group();
  root.name = 'props';
  const R = rand(4242);
  const d = opts.density;
  const fr = layout.fieldRadius;
  const v = layout.volcano;

  const lm = buildLandmarks(models, field, layout, { density: d });
  root.add(lm.group);
  const keepOut: KeepOut[] = [...lm.keepOut, ...lavaFlowPoints().map((p) => ({ x: p.x, z: p.z, r: p.w + 1.4 }))];
  const blocked = (x: number, z: number, extra = 0) => keepOut.some((k) => Math.hypot(x - k.x, z - k.z) < k.r + extra);
  const occupied: Pt[] = [];
  const canopies: THREE.Vector3[] = [];
  const flowerSpots: THREE.Vector3[] = [];

  const dv = (x: number, z: number) => Math.hypot(x - v.x, z - v.z);
  /** Zufällige Punkte, die eine Bedingung erfüllen. */
  const scatter = (
    count: number,
    accept: (x: number, z: number, h: number, slope: number, cd: number) => boolean,
    o: { clear?: number; spacing?: number; area?: [number, number, number, number]; water?: boolean; cone?: boolean } = {},
  ) => {
    const pts: Pt[] = [];
    const clear = o.clear ?? fr * 1.6 + 0.5;
    const sp = o.spacing ?? 1.1;
    const [ax0, ax1, az0, az1] = o.area ?? [-50, 50, -42, 40];
    const tries = Math.max(200, count * 60);
    for (let i = 0; i < tries && pts.length < count; i++) {
      const x = ax0 + R() * (ax1 - ax0);
      const z = az0 + R() * (az1 - az0);
      const h = field.height(x, z);
      if (!o.water && h < 0.2) continue;
      const slope = field.slope(x, z);
      const cd = coastDistance(x, z);
      if (!o.cone && dv(x, z) < 15 && h > 8.5) continue;
      if (!accept(x, z, h, slope, cd)) continue;
      if (field.pathDistance(x, z) < clear) continue;
      if (!o.water && field.riverDistance(x, z) < 0.6) continue;
      if (field.gorgeDistance(x, z) < 0.8) continue;
      if (blocked(x, z)) continue;
      if (sp > 0 && (pts.some((p) => Math.hypot(p.x - x, p.z - z) < sp) || occupied.some((p) => Math.hypot(p.x - x, p.z - z) < sp * 0.7))) continue;
      pts.push({ x, z, y: h });
    }
    return pts;
  };
  /** Punkte in Grüppchen (Blumenbeete, Farnhaine). */
  const clusters = (centers: Pt[], per: number, radius: number, accept: (x: number, z: number, h: number) => boolean) => {
    const pts: Pt[] = [];
    for (const c of centers)
      for (let i = 0; i < per; i++) {
        const a = R() * Math.PI * 2;
        const r = Math.sqrt(R()) * radius;
        const x = c.x + Math.cos(a) * r;
        const z = c.z + Math.sin(a) * r;
        const h = field.height(x, z);
        if (h < 0.3 || !accept(x, z, h) || field.pathDistance(x, z) < fr * 1.35 || field.riverDistance(x, z) < 0.3 || blocked(x, z)) continue;
        pts.push({ x, z, y: h });
      }
    return pts;
  };

  /** Punkte gleichmäßig auf mehrere Modelle verteilen und instanzieren. */
  const plant = (
    names: string[],
    points: Pt[],
    size: [number, number],
    o: InstanceOptions & { sink?: number; tilt?: number; canopy?: boolean } = {},
  ) => {
    const buckets = new Map<string, Placement[]>();
    for (const p of points) {
      const name = names[Math.floor(R() * names.length)]!;
      const arr = buckets.get(name) ?? [];
      const scale = size[0] + R() * (size[1] - size[0]);
      arr.push({ x: p.x, y: p.y - (o.sink ?? 0.05), z: p.z, rotY: R() * Math.PI * 2, scale, tilt: o.tilt ? (R() - 0.5) * o.tilt : 0, tiltZ: o.tilt ? (R() - 0.5) * o.tilt : 0 });
      buckets.set(name, arr);
      occupied.push(p);
      if (o.canopy) canopies.push(new THREE.Vector3(p.x, p.y + scale * 0.85, p.z));
    }
    for (const [name, placements] of buckets) {
      const model = models.get(name);
      if (!model) continue;
      root.add(instanceModel(model, placements, { targetHeight: 1, castShadow: o.castShadow ?? true, wind: o.wind, tint: o.tint, colors: o.colors, vary: o.vary }));
    }
  };

  const jungleK = (x: number, z: number) => Math.max(blobMask('jungle', x, z), x > 12 && z > -13 && z < 18 ? 0.6 : 0);
  const highland = (x: number, z: number, h: number) =>
    h > 4.2 && (blobMask('nwPlateau', x, z) > 0.4 || blobMask('saddle', x, z) > 0.4 || blobMask('westHigh', x, z) > 0.4 || z < -21 || (x > 22 && z < -9));
  const meadow = (x: number, z: number, h: number) => h > 1.3 && x > -20 && x < 16 && z > 5 && z < 27 && dv(x, z) > 17;
  const inLagoon = (x: number, z: number) => Math.hypot(x - LAGOON.x, z - LAGOON.z) < LAGOON.r + 0.8;

  // --- Palmen: Strände, Lagune, Dorf, Inselchen ---------------------------------
  plant(
    PALMS,
    scatter(Math.round(85 * d), (x, z, h, s, cd) => cd > 1.2 && cd < 11 && h > 0.45 && h < 3 && s < 0.4 && dv(x, z) > 18 && !inLagoon(x, z), { clear: fr * 1.5 + 1.2, spacing: 2.1 }),
    [3.4, 6.0],
    { wind: 0.045, tilt: 0.22, canopy: true, vary: 0.12 },
  );
  const isletPalms: Pt[] = [];
  for (const is of ISLETS.filter((i) => !i.rocky))
    for (let k = 0; k < 4; k++) {
      const a = R() * Math.PI * 2;
      const r = R() * is.r * 0.55;
      const x = is.x + Math.cos(a) * r;
      const z = is.z + Math.sin(a) * r;
      isletPalms.push({ x, z, y: field.height(x, z) });
    }
  plant(PALMS.slice(0, 3), isletPalms, [3.6, 5.4], { wind: 0.045, tilt: 0.35 });

  // --- Dschungel: Kronendach, Unterholz, Bambus am Fluss ---------------------------
  plant(
    [...BROADLEAF, V('palm1'), V('palm3')],
    scatter(Math.round(120 * d), (x, z, h, s) => jungleK(x, z) > 0.35 && h > 1.2 && h < 7 && s < 0.5, { clear: fr * 1.6 + 1.3, spacing: 2.0 }),
    [3.2, 5.4],
    { wind: 0.025, canopy: true, vary: 0.18 },
  );
  const jungleFloor = scatter(Math.round(40 * d), (x, z, h, s) => jungleK(x, z) > 0.3 && h > 1.1 && s < 0.5, { spacing: 3 });
  plant(JUNGLE_LOW, clusters(jungleFloor, 5, 2.4, (x, z) => jungleK(x, z) > 0.2), [0.9, 2.0], { wind: 0.06, vary: 0.15 });
  plant(
    [V('bamboo'), N('crops_bambooStageB')],
    clusters(
      RIVER.slice(RIVER_POOL, RIVER_POOL + 7).map((p) => ({ x: p.x + p.w + 2.2, z: p.z + 1.5, y: 0 })),
      6,
      1.8,
      (x, z) => field.riverDistance(x, z) > 0.6,
    ),
    [2.6, 4.2],
    { wind: 0.03 },
  );
  plant(
    [N('hanging_moss')],
    canopies.slice(0, Math.round(30 * d)).map((c) => ({ x: c.x + 0.4, z: c.z, y: c.y - 1.6 })),
    [0.9, 1.4],
    { castShadow: false, wind: 0.08 },
  );

  // --- Wiesen und Hochebenen ------------------------------------------------------
  plant(
    BROADLEAF,
    scatter(Math.round(26 * d), (x, z, h, s) => meadow(x, z, h) && s < 0.35, { clear: fr * 1.6 + 1.6, spacing: 3.5 }),
    [2.6, 4.4],
    { wind: 0.025, canopy: true, vary: 0.18 },
  );
  plant(
    HIGHLAND,
    scatter(Math.round(70 * d), (x, z, h, s) => highland(x, z, h) && s < 0.4 && dv(x, z) > 15, { clear: fr * 1.6 + 1.2, spacing: 2.4 }),
    [2.4, 4.2],
    { wind: 0.02, canopy: true, vary: 0.2 },
  );
  plant(
    BUSHES,
    scatter(Math.round(150 * d), (x, z, h, s) => h > 1.25 && s < 0.5 && (dv(x, z) > 15 || h < 9), { clear: fr * 1.45 + 0.4, spacing: 1.2 }),
    [0.8, 1.6],
    { wind: 0.06, vary: 0.2 },
  );
  // Blumenbeete (Kenney-Blumen) – gut sichtbar an den Wegrändern
  const beds = scatter(Math.round(55 * d), (x, z, h, s) => h > 1.4 && s < 0.32 && dv(x, z) > 16 && jungleK(x, z) < 0.5, { clear: fr * 1.45, spacing: 3 });
  const flowerPts = clusters(beds, 9, 1.6, (x, z, h) => h > 1.3 && field.slope(x, z) < 0.4);
  plant(FLOWERS, flowerPts, [0.42, 0.7], { wind: 0.12, castShadow: false });
  for (const b of beds) flowerSpots.push(new THREE.Vector3(b.x, b.y + 0.5, b.z));
  plant([N('grass_large'), N('grass_leafsLarge'), P('grass-plant')], scatter(Math.round(70 * d), (x, z, h, s) => h > 1.2 && s < 0.45, { clear: fr * 1.3, spacing: 0.9 }), [0.5, 0.9], {
    wind: 0.12,
    castShadow: false,
  });

  // --- Felsen ---------------------------------------------------------------------
  plant(
    ROCKS_T,
    scatter(Math.round(16 * d), (x, z, h, s) => dv(x, z) < 16 && dv(x, z) > 6.5 && h > 6 && s < 0.45, { clear: fr * 1.5 + 0.6, spacing: 3.2, cone: true }),
    [0.8, 1.6],
    { sink: 0.5, tint: '#7a706a' },
  );
  plant(
    ROCKS_L,
    scatter(Math.round(30 * d), (x, z, h, s) => s > 0.12 && s < 0.4 && h > 1.5 && dv(x, z) > 17 && field.riverDistance(x, z) > 2.5, { clear: fr * 1.5 + 0.8, spacing: 2.4 }),
    [0.7, 1.4],
    { sink: 0.35 },
  );
  plant(ROCKS_S, scatter(Math.round(110 * d), (_x, _z, h) => h > 0.3, { clear: fr * 1.35, spacing: 0.9 }), [0.3, 0.75], { sink: 0.08, castShadow: false });
  // Brandungsfelsen im flachen Wasser, Felsen am Wasserfall
  plant(
    [P('rocks-sand-a'), P('rocks-sand-b'), P('rocks-sand-c'), ...ROCKS_L.slice(0, 3)],
    scatter(Math.round(32 * d), (_x, _z, h, _s, cd) => h < 0.15 && h > -1.6 && cd > -6, { water: true, spacing: 2 }),
    [0.9, 1.9],
    { sink: 0.35 },
  );
  const pool = RIVER[RIVER_POOL]!;
  const poolRocks: Pt[] = [];
  for (let k = 0; k < 9; k++) {
    const a = 0.6 + (k / 9) * Math.PI * 1.6;
    const r = pool.w + 0.4 + R() * 0.6;
    const x = pool.x + Math.cos(a) * r;
    const z = pool.z + Math.sin(a) * r;
    poolRocks.push({ x, z, y: Math.max(field.height(x, z), pool.y - 0.3) });
  }
  plant(ROCKS_T, poolRocks, [0.8, 1.6], { sink: 0.35, tint: '#bdb5a8' });
  for (const is of ISLETS.filter((i) => i.rocky)) plant(ROCKS_T, [{ x: is.x, z: is.z, y: field.height(is.x, is.z) - 0.6 }], [2.4, 3.2], { sink: 0.3 });

  // --- Am Wasser: Seerosen, Schilf, Treibholz -------------------------------------
  const lilies: Pt[] = [];
  for (let k = 0; k < Math.round(24 * d); k++) {
    const i = RIVER_POOL + Math.floor(R() * 6);
    const p = RIVER[i]!;
    const x = p.x + (R() - 0.5) * p.w * 1.4;
    const z = p.z + (R() - 0.5) * p.w * 1.4;
    if (field.pathDistance(x, z) < fr * 1.7) continue;
    if (Math.hypot(x - pool.x, z - pool.z) < 1.6) continue;
    lilies.push({ x, z, y: p.y + 0.03 });
  }
  plant([N('lily_large'), N('lily_small')], lilies, [0.12, 0.2], { castShadow: false });
  plant(
    [N('grass_leafsLarge'), V('plant')],
    scatter(Math.round(70 * d), (x, z, h) => {
      const rd = field.riverDistance(x, z);
      return rd > 0.1 && rd < 1.4 && h > 0.4;
    }, { clear: fr * 1.4, spacing: 0.7 }),
    [0.7, 1.3],
    { wind: 0.1, castShadow: false },
  );
  plant([N('log'), N('stump_old')], scatter(Math.round(10 * d), (_x, _z, h, _s, cd) => cd > 0.5 && cd < 5 && h < 1.2, { spacing: 4 }), [0.5, 0.9], { tilt: 0.1 });
  plant([N('mushroom_redGroup'), N('mushroom_tanGroup'), N('stump_round')], scatter(Math.round(24 * d), (x, z, h, s) => jungleK(x, z) > 0.3 && h > 1.4 && s < 0.4, { spacing: 1.5 }), [0.4, 0.8]);

  // Seesterne und Muscheln am Strand
  root.add(buildBeachDecor(field, R, Math.round(60 * d)));

  return {
    group: root,
    update: lm.update,
    fires: lm.fires,
    smokes: lm.smokes,
    canopies,
    flowers: flowerSpots,
    perches: lm.perches,
    blockers: [...lm.blockers, ...canopies.map((c) => ({ x: c.x, z: c.z, r: 2.1, top: c.y + 1.6 }))],
  };
}

/** Kleine Seesterne und Muscheln im nassen Sand. */
function buildBeachDecor(field: Heightfield, R: () => number, count: number): THREE.Group {
  const g = new THREE.Group();
  const star = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    const r = i % 2 ? 0.07 : 0.17;
    if (i === 0) star.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    else star.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  const starGeo = new THREE.ExtrudeGeometry(star, { depth: 0.04, bevelEnabled: true, bevelSize: 0.02, bevelThickness: 0.02, bevelSegments: 1 });
  starGeo.rotateX(-Math.PI / 2);
  const shellGeo = new THREE.SphereGeometry(0.09, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2);
  shellGeo.scale(1, 0.5, 1.2);
  const pts: { x: number; y: number; z: number }[] = [];
  for (let i = 0; i < count * 30 && pts.length < count; i++) {
    const x = (R() - 0.5) * 100;
    const z = (R() - 0.5) * 84;
    const h = field.height(x, z);
    const cd = coastDistance(x, z);
    if (h < 0.3 || h > 0.9 || cd < 0 || cd > 5) continue;
    if (field.pathDistance(x, z) < 1.6) continue;
    pts.push({ x, y: h, z });
  }
  const colors = ['#f28a4b', '#e85f6d', '#f3b54a', '#c86cd6'];
  const stars = new THREE.InstancedMesh(starGeo, new THREE.MeshStandardMaterial({ roughness: 0.7 }), pts.length);
  const shells = new THREE.InstancedMesh(shellGeo, new THREE.MeshStandardMaterial({ color: '#f6e6d6', roughness: 0.5 }), pts.length);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const c = new THREE.Color();
  let ns = 0;
  let nh = 0;
  for (const p of pts) {
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), R() * 6.28);
    if (R() < 0.5) {
      m.compose(new THREE.Vector3(p.x, p.y + 0.01, p.z), q, new THREE.Vector3(1, 1, 1).multiplyScalar(0.8 + R() * 0.6));
      stars.setMatrixAt(ns, m);
      stars.setColorAt(ns, c.set(colors[Math.floor(R() * colors.length)]!));
      ns++;
    } else {
      m.compose(new THREE.Vector3(p.x, p.y, p.z), q, new THREE.Vector3(1, 1, 1).multiplyScalar(0.8 + R() * 0.7));
      shells.setMatrixAt(nh++, m);
    }
  }
  stars.count = ns;
  shells.count = nh;
  for (const im of [stars, shells]) {
    im.receiveShadow = true;
    im.computeBoundingSphere();
    g.add(im);
  }
  return g;
}
