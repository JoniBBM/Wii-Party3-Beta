/**
 * Bewuchs und Deko des Alien-Planeten (gleiche Lagen wie auf der Insel): Kristallgruppen und
 * Leuchtbäume an den rosa Stränden, Spiral- und Schwebebäume im türkisen Wald, Stachelbäume auf
 * den Hochebenen, leuchtende Pilze und Knollenpflanzen auf den Wiesen, Felsen, Meteoritenbrocken,
 * Leuchtscheiben auf dem Plasma – plus alle Wahrzeichen (landmarks.ts). Alles instanziert;
 * Sichtachsen der Mutproben-Kameras bleiben frei, Kamera-Hindernisse werden gemeldet.
 */
import * as THREE from 'three';
import { LAGOON, RIVER, RIVER_POOL } from '@insel/shared';
import { instanceModel, loadModels, type InstanceOptions, type Placement } from '../assets.ts';
import { blobMask, coastDistance, ISLETS, lavaFlowPoints } from '../ground.ts';
import type { KeepOut } from '../landmarks.ts';
import type { IslandLayout } from '../layout.ts';
import { rand } from '../noise.ts';
import type { Props } from '../props.ts';
import type { Heightfield } from '../terrain.ts';
import { inCorridor, stuntCorridors } from '../views.ts';
import { brighten, centerModels, crystalCluster, glowifyAll, instanceGlow, mushroomGeometry } from './kit.ts';
import { buildSpaceLandmarks, SPACE_LANDMARK_MODELS } from './landmarks.ts';
import { KIT_COLORS } from './palette.ts';

const PL = (n: string) => `space/plants/${n}`;
const RK = (n: string) => `space/rocks/${n}`;

const TREES_TALL = [PL('tree_spiral_a'), PL('tree_floating_a'), PL('tree_floating_b'), PL('tree_swirl_a'), PL('tree_swirl_b'), PL('tree_floating_a'), PL('tree_swirl_b')];
const TREES_ROUND = [PL('tree_blob_a'), PL('tree_blob_b'), PL('tree_light_a'), PL('tree_light_b'), PL('tree_lava_a'), PL('tree_lava_b'), PL('tree_lava_c')];
const TREES_LIGHT = [PL('tree_light_a'), PL('tree_light_b'), PL('tree_lava_a'), PL('tree_lava_c')];
const TREES_SPIKE = [PL('tree_spikes_a'), PL('tree_spikes_b')];
const BUSHES = [PL('bush_swirl'), PL('bush_wave_a'), PL('bush_wave_b'), PL('plant_bulbs'), PL('plant_twist'), PL('plant_curls')];
/** Dunkelrote Modelle (Spiral-, Stachelbäume, dunkles Gras): heller, damit sie nicht schwarz wirken */
const DARK = new Set([PL('tree_spiral_a'), PL('tree_spiral_b'), PL('tree_spiral_c'), PL('tree_spikes_a'), PL('tree_spikes_b'), PL('grass_dark')]);
const GRASSES = [PL('grass_orange'), PL('grass_dark'), PL('grass_cactus')];
const ROCKS_L = [RK('rock_largeA'), RK('rock_largeB'), RK('rock_large_a'), RK('rock_large_b'), RK('rock_large_c')];
const ROCKS_S = [RK('rock'), RK('rocks_smallA'), RK('rocks_smallB'), RK('rock_a'), RK('rock_b'), RK('rock_c'), RK('rock_d'), RK('meteor_half')];
const CRYSTAL_ROCKS = [RK('rock_crystals'), RK('rock_crystalsLargeA'), RK('rock_crystalsLargeB')];

export const SPACE_MODEL_LIST = [...new Set([...TREES_TALL, ...TREES_ROUND, ...TREES_SPIKE, ...BUSHES, ...GRASSES, ...ROCKS_L, ...ROCKS_S, ...CRYSTAL_ROCKS, RK('meteor_detailed'), RK('crater'), ...SPACE_LANDMARK_MODELS])];

/** Farben der Kristalle und Pilzhüte (je Exemplar) */
const CRYSTAL_COLORS = ['#6dffe0', '#7fd8ff', '#ff7ad8', '#b58cff', '#ffe27a'];
const CAP_COLORS = ['#ff6fd0', '#6dffe0', '#ffd25e', '#a98bff'];

interface Pt {
  x: number;
  z: number;
  y: number;
}

export async function buildSpaceProps(layout: IslandLayout, field: Heightfield, opts: { density: number }): Promise<Props> {
  const models = await loadModels(SPACE_MODEL_LIST);
  centerModels(models);
  const root = new THREE.Group();
  root.name = 'space-props';
  const R = rand(4242);
  const d = opts.density;
  const fr = layout.fieldRadius;
  const v = layout.volcano;

  const lm = buildSpaceLandmarks(models, field, layout);
  root.add(lm.group);
  const keepOut: KeepOut[] = [...lm.keepOut, ...lavaFlowPoints().map((p) => ({ x: p.x, z: p.z, r: p.w + 1.4 }))];
  const blocked = (x: number, z: number, extra = 0) => keepOut.some((k) => Math.hypot(x - k.x, z - k.z) < k.r + extra);
  // Sichtachsen der Kamera an Liane und Furt: dort nichts Hohes
  const views = stuntCorridors(layout, field);
  const inView = (x: number, z: number, h: number, tall: number) => inCorridor(views, x, z, h + tall, tall * 0.45 + 0.5);
  const occupied: Pt[] = [];
  const canopies: THREE.Vector3[] = [];
  const flowerSpots: THREE.Vector3[] = [];
  const extraBlockers: Props['blockers'] = [];

  const dv = (x: number, z: number) => Math.hypot(x - v.x, z - v.z);
  const scatter = (
    count: number,
    accept: (x: number, z: number, h: number, slope: number, cd: number) => boolean,
    o: { clear?: number; spacing?: number; area?: [number, number, number, number]; water?: boolean; cone?: boolean; tall?: number } = {},
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
      if (o.tall && inView(x, z, h, o.tall)) continue;
      if (sp > 0 && (pts.some((p) => Math.hypot(p.x - x, p.z - z) < sp) || occupied.some((p) => Math.hypot(p.x - x, p.z - z) < sp * 0.7))) continue;
      pts.push({ x, z, y: h });
    }
    return pts;
  };
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
  /** Punkte auf Modelle verteilen und instanzieren; `glow` lässt helle Stellen leuchten. */
  const plant = (names: string[], points: Pt[], size: [number, number], o: InstanceOptions & { sink?: number; tilt?: number; canopy?: number; glow?: number } = {}) => {
    const buckets = new Map<string, Placement[]>();
    for (const p of points) {
      const name = names[Math.floor(R() * names.length)]!;
      const arr = buckets.get(name) ?? [];
      const scale = size[0] + R() * (size[1] - size[0]);
      arr.push({ x: p.x, y: p.y - (o.sink ?? 0.05), z: p.z, rotY: R() * Math.PI * 2, scale, tilt: o.tilt ? (R() - 0.5) * o.tilt : 0, tiltZ: o.tilt ? (R() - 0.5) * o.tilt : 0 });
      buckets.set(name, arr);
      occupied.push(p);
      if (o.canopy) canopies.push(new THREE.Vector3(p.x, p.y + scale * o.canopy, p.z));
    }
    for (const [name, placements] of buckets) {
      const model = models.get(name);
      if (!model) continue;
      const g = instanceModel(model, placements, { targetHeight: 1, castShadow: o.castShadow ?? size[1] >= 1, wind: o.wind, tint: o.tint, colors: o.colors ?? KIT_COLORS, vary: o.vary });
      if (DARK.has(name)) brighten(g, 2.3);
      if (o.glow) glowifyAll(g, o.glow);
      root.add(g);
    }
  };

  // Eigene Geometrien: Kristallgruppen und Leuchtpilze (instanziert, Farbe je Exemplar leuchtet)
  const crystalMat = new THREE.MeshStandardMaterial({ roughness: 0.25, metalness: 0, flatShading: true });
  instanceGlow(crystalMat, 0.75, 0.25);
  const crystalGeos = [crystalCluster(1, 5), crystalCluster(2, 4), crystalCluster(3, 6)];
  const crystals = (points: Pt[], size: [number, number], o: { colors?: string[]; tall?: boolean } = {}) => {
    const per = crystalGeos.map(() => [] as { p: Pt; s: number; c: string }[]);
    for (const p of points) {
      per[Math.floor(R() * per.length)]!.push({ p, s: size[0] + R() * (size[1] - size[0]), c: (o.colors ?? CRYSTAL_COLORS)[Math.floor(R() * (o.colors ?? CRYSTAL_COLORS).length)]! });
      occupied.push(p);
      if (o.tall) extraBlockers.push({ x: p.x, z: p.z, r: 0.9, top: p.y + size[1] });
    }
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const col = new THREE.Color();
    per.forEach((list, k) => {
      if (!list.length) return;
      const inst = new THREE.InstancedMesh(crystalGeos[k]!, crystalMat, list.length);
      list.forEach(({ p, s, c }, i) => {
        e.set((R() - 0.5) * 0.2, R() * Math.PI * 2, (R() - 0.5) * 0.2);
        m.compose(new THREE.Vector3(p.x, p.y - 0.08, p.z), q.setFromEuler(e), new THREE.Vector3(s * (0.8 + R() * 0.3), s, s * (0.8 + R() * 0.3)));
        inst.setMatrixAt(i, m);
        inst.setColorAt(i, col.set(c));
      });
      inst.castShadow = size[1] > 1;
      inst.receiveShadow = true;
      inst.computeBoundingSphere();
      root.add(inst);
    });
  };
  const mushGeo = mushroomGeometry();
  const stemMat = new THREE.MeshStandardMaterial({ color: '#f2ecff', roughness: 0.8 });
  const capMat = new THREE.MeshStandardMaterial({ roughness: 0.5 });
  instanceGlow(capMat, 0.9, 0.35);
  const mushrooms = (points: Pt[], size: [number, number]) => {
    if (!points.length) return;
    const inst = new THREE.InstancedMesh(mushGeo, [stemMat, capMat], points.length);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const col = new THREE.Color();
    points.forEach((p, i) => {
      const s = size[0] + R() * (size[1] - size[0]);
      q.setFromEuler(new THREE.Euler((R() - 0.5) * 0.3, R() * 6.28, (R() - 0.5) * 0.3));
      m.compose(new THREE.Vector3(p.x, p.y - 0.03, p.z), q, new THREE.Vector3(s, s * (0.8 + R() * 0.5), s));
      inst.setMatrixAt(i, m);
      inst.setColorAt(i, col.set(CAP_COLORS[Math.floor(R() * CAP_COLORS.length)]!));
      occupied.push(p);
    });
    inst.castShadow = false;
    inst.receiveShadow = true;
    inst.computeBoundingSphere();
    root.add(inst);
  };

  const jungleK = (x: number, z: number) => Math.max(blobMask('jungle', x, z), x > 12 && z > -13 && z < 18 ? 0.6 : 0);
  const highland = (x: number, z: number, h: number) =>
    h > 4.2 && (blobMask('nwPlateau', x, z) > 0.4 || blobMask('saddle', x, z) > 0.4 || blobMask('westHigh', x, z) > 0.4 || z < -21 || (x > 22 && z < -9));
  const meadow = (x: number, z: number, h: number) => h > 1.3 && x > -20 && x < 16 && z > 5 && z < 27 && dv(x, z) > 17;
  const inLagoon = (x: number, z: number) => Math.hypot(x - LAGOON.x, z - LAGOON.z) < LAGOON.r + 0.8;

  // --- Strände: Kristallgruppen und Leuchtbäume (statt Palmen) ----------------------------
  const beach = scatter(Math.round(80 * d), (x, z, h, s, cd) => cd > 1.2 && cd < 11 && h > 0.45 && h < 3 && s < 0.4 && dv(x, z) > 18 && !inLagoon(x, z), { clear: fr * 1.5 + 1.2, spacing: 2.1, tall: 4.5 });
  const beachTrees = beach.filter((_, i) => i % 2 === 0);
  plant(TREES_LIGHT, beachTrees, [2.6, 4.4], { canopy: 0.8, vary: 0.12, glow: 0.55 });
  crystals(beach.filter((_, i) => i % 2 === 1), [0.9, 2.2], { tall: true });
  const isletPts: Pt[] = [];
  for (const is of ISLETS.filter((i) => !i.rocky))
    for (let k = 0; k < 4; k++) {
      const a = R() * Math.PI * 2;
      const r = R() * is.r * 0.55;
      const x = is.x + Math.cos(a) * r;
      const z = is.z + Math.sin(a) * r;
      isletPts.push({ x, z, y: field.height(x, z) });
    }
  plant(TREES_LIGHT, isletPts.filter((_, i) => i % 2 === 0), [2.8, 4.2], { glow: 0.55 });
  crystals(isletPts.filter((_, i) => i % 2 === 1), [1, 1.8]);

  // --- Türkiser Wald: Spiral-, Wirbel- und Schwebebäume, Unterholz, Pilze -------------------
  plant(
    [...TREES_TALL, ...TREES_ROUND.slice(0, 2)],
    scatter(Math.round(115 * d), (x, z, h, s) => jungleK(x, z) > 0.35 && h > 1.2 && h < 7 && s < 0.5, { clear: fr * 1.6 + 1.3, spacing: 2.0, tall: 5.2 }),
    [3.0, 5.2],
    { canopy: 0.82, vary: 0.16, glow: 0.45 },
  );
  const jungleFloor = scatter(Math.round(40 * d), (x, z, h, s) => jungleK(x, z) > 0.3 && h > 1.1 && s < 0.5, { spacing: 3 });
  plant(BUSHES, clusters(jungleFloor, 4, 2.4, (x, z, h) => jungleK(x, z) > 0.2 && !inView(x, z, h, 1.6)), [0.8, 1.6], { vary: 0.15, glow: 0.5 });
  mushrooms(clusters(jungleFloor, 4, 2.2, (x, z) => jungleK(x, z) > 0.2), [0.5, 1.1]);
  // am Fluss: Stachelbäume und Kaktusgras (statt Bambus)
  plant(
    [...TREES_SPIKE, PL('grass_cactus')],
    clusters(
      RIVER.slice(RIVER_POOL, RIVER_POOL + 7).map((p) => ({ x: p.x + p.w + 2.2, z: p.z + 1.5, y: 0 })),
      5,
      1.8,
      (x, z, h) => field.riverDistance(x, z) > 0.6 && !inView(x, z, h, 3.6),
    ),
    [1.6, 3.6],
    { glow: 0.4 },
  );

  // --- Wiesen und Hochebenen --------------------------------------------------------
  plant(
    TREES_ROUND,
    scatter(Math.round(26 * d), (x, z, h, s) => meadow(x, z, h) && s < 0.35, { clear: fr * 1.6 + 1.6, spacing: 3.5, tall: 4.2 }),
    [2.4, 4.2],
    { canopy: 0.8, vary: 0.16, glow: 0.5 },
  );
  plant(
    [...TREES_SPIKE, PL('tree_spiral_a'), PL('tree_swirl_a')],
    scatter(Math.round(66 * d), (x, z, h, s) => highland(x, z, h) && s < 0.4 && dv(x, z) > 15, { clear: fr * 1.6 + 1.2, spacing: 2.4, tall: 4.0 }),
    [2.2, 4.0],
    { canopy: 0.8, vary: 0.18, glow: 0.45 },
  );
  plant(
    BUSHES,
    scatter(Math.round(140 * d), (x, z, h, s) => h > 1.25 && s < 0.5 && (dv(x, z) > 15 || h < 9), { clear: fr * 1.45 + 0.4, spacing: 1.2, tall: 1.5 }),
    [0.7, 1.5],
    { vary: 0.2, glow: 0.5 },
  );
  // Leuchtpilz-Kreise und Knollenpflanzen an den Wegrändern (statt Blumenbeete)
  const beds = scatter(Math.round(50 * d), (x, z, h, s) => h > 1.4 && s < 0.32 && dv(x, z) > 16 && jungleK(x, z) < 0.5, { clear: fr * 1.45, spacing: 3 });
  const bedPts = clusters(beds, 8, 1.6, (x, z, h) => h > 1.3 && field.slope(x, z) < 0.4);
  mushrooms(bedPts.filter((_, i) => i % 3 !== 0), [0.35, 0.7]);
  plant([PL('plant_bulbs'), PL('plant_curls')], bedPts.filter((_, i) => i % 3 === 0), [0.5, 0.9], { castShadow: false, glow: 0.7 });
  for (const b of beds) flowerSpots.push(new THREE.Vector3(b.x, b.y + 0.5, b.z));
  plant(GRASSES, scatter(Math.round(70 * d), (x, z, h, s) => h > 1.2 && s < 0.45, { clear: fr * 1.3, spacing: 0.9, tall: 0.9 }), [0.45, 0.9], { castShadow: false, glow: 0.3 });

  // --- Felsen, Kristalle am Vulkan, Meteoritenbrocken ---------------------------------------
  crystals(
    scatter(Math.round(16 * d), (x, z, h, s) => dv(x, z) < 16 && dv(x, z) > 6.5 && h > 6 && s < 0.45, { clear: fr * 1.5 + 0.6, spacing: 3.2, cone: true }),
    [0.9, 1.7],
    { colors: ['#6dffe0', '#5ce6ff', '#86ffc0'], tall: true },
  );
  plant(
    ROCKS_L,
    scatter(Math.round(30 * d), (x, z, h, s) => s > 0.12 && s < 0.4 && h > 1.5 && dv(x, z) > 17 && field.riverDistance(x, z) > 2.5, { clear: fr * 1.5 + 0.8, spacing: 2.4, tall: 1.4 }),
    [0.7, 1.4],
    { sink: 0.35, tint: '#c9b8ff' },
  );
  plant(ROCKS_S, scatter(Math.round(100 * d), (_x, _z, h) => h > 0.3, { clear: fr * 1.35, spacing: 0.9 }), [0.3, 0.7], { sink: 0.08, castShadow: false, tint: '#c9b8ff' });
  plant(CRYSTAL_ROCKS, scatter(Math.round(40 * d), (_x, _z, h, s) => h > 0.6 && s < 0.45, { clear: fr * 1.4, spacing: 1.5 }), [0.4, 0.9], { sink: 0.06, castShadow: false });
  plant([RK('meteor_detailed'), RK('crater')], scatter(Math.round(12 * d), (_x, _z, h, s) => h > 1.5 && s < 0.2, { clear: fr * 1.6, spacing: 4 }), [0.5, 1.0], { sink: 0.15 });
  // Kristallspitzen im flachen Plasma, Kristallkranz am Plasmafall
  crystals(scatter(Math.round(26 * d), (_x, _z, h, _s, cd) => h < 0.15 && h > -1.6 && cd > -6, { water: true, spacing: 2.2 }), [1.2, 2.4]);
  const pool = RIVER[RIVER_POOL]!;
  const poolRing: Pt[] = [];
  for (let k = 0; k < 9; k++) {
    const a = 0.6 + (k / 9) * Math.PI * 1.6;
    const r = pool.w + 0.4 + R() * 0.6;
    const x = pool.x + Math.cos(a) * r;
    const z = pool.z + Math.sin(a) * r;
    poolRing.push({ x, z, y: Math.max(field.height(x, z), pool.y - 0.3) });
  }
  crystals(poolRing, [0.8, 1.5], { colors: ['#6dffe0', '#ff7ad8', '#b58cff'] });
  for (const is of ISLETS.filter((i) => i.rocky)) crystals([{ x: is.x, z: is.z, y: field.height(is.x, is.z) - 0.5 }], [2.6, 3.4]);

  // --- Am Plasma: Leuchtscheiben, Ufergras ---------------------------------------------
  const pads: Pt[] = [];
  for (let k = 0; k < Math.round(24 * d); k++) {
    const i = RIVER_POOL + Math.floor(R() * 6);
    const p = RIVER[i]!;
    const x = p.x + (R() - 0.5) * p.w * 1.4;
    const z = p.z + (R() - 0.5) * p.w * 1.4;
    if (field.pathDistance(x, z) < fr * 1.7) continue;
    if (Math.hypot(x - pool.x, z - pool.z) < 1.6) continue;
    pads.push({ x, z, y: p.y + 0.04 });
  }
  if (pads.length) {
    const padGeo = new THREE.CylinderGeometry(0.32, 0.36, 0.05, 6);
    const padMat = new THREE.MeshStandardMaterial({ roughness: 0.6, flatShading: true });
    instanceGlow(padMat, 0.6, 0.5);
    const inst = new THREE.InstancedMesh(padGeo, padMat, pads.length);
    const m = new THREE.Matrix4();
    const col = new THREE.Color();
    pads.forEach((p, i) => {
      const s = 0.6 + R() * 0.8;
      m.compose(new THREE.Vector3(p.x, p.y, p.z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), R() * 6), new THREE.Vector3(s, 1, s));
      inst.setMatrixAt(i, m);
      inst.setColorAt(i, col.set(R() < 0.5 ? '#ff8ade' : '#b9a0ff'));
    });
    inst.computeBoundingSphere();
    root.add(inst);
  }
  plant(
    [PL('grass_dark'), PL('grass_cactus')],
    scatter(Math.round(60 * d), (x, z, h) => {
      const rd = field.riverDistance(x, z);
      return rd > 0.1 && rd < 1.4 && h > 0.4;
    }, { clear: fr * 1.4, spacing: 0.7, tall: 1.2 }),
    [0.6, 1.2],
    { castShadow: false, glow: 0.35 },
  );

  // Kleine Kristallsplitter im Sand (statt Seesterne und Muscheln)
  const shards: Pt[] = [];
  for (let i = 0; i < 60 * 30 && shards.length < Math.round(55 * d); i++) {
    const x = (R() - 0.5) * 100;
    const z = (R() - 0.5) * 84;
    const h = field.height(x, z);
    const cd = coastDistance(x, z);
    if (h < 0.3 || h > 0.9 || cd < 0 || cd > 5) continue;
    if (field.pathDistance(x, z) < 1.6) continue;
    shards.push({ x, z, y: h });
  }
  crystals(shards, [0.18, 0.35]);

  return {
    group: root,
    update: lm.update,
    fires: lm.fires,
    smokes: lm.smokes,
    canopies,
    flowers: flowerSpots,
    perches: lm.perches,
    blockers: [...lm.blockers, ...canopies.map((c) => ({ x: c.x, z: c.z, r: 1.8, top: c.y + 1.4 })), ...extraBlockers],
  };
}
