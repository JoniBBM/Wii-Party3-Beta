/**
 * Dekoration der Insel: Palmen am Strand, Dschungel im Osten, Felsen am Vulkan,
 * Hafen mit Steg und Booten, Piratenschiff, Brücke, Lager auf der Hochebene,
 * Steinköpfe an den Klippen, Schatzkiste am Gipfel.
 */
import * as THREE from 'three';
import { instanceModel, loadModels, placeModel, type Placement } from './assets.ts';
import type { IslandLayout } from './layout.ts';
import { rand } from './noise.ts';
import type { Heightfield } from './terrain.ts';
import { riverLevel } from './terrain.ts';

const N = (n: string) => `nature/${n}`;
const P = (n: string) => `pirate/${n}`;

export const MODEL_LIST = [
  ...['tree_palm', 'tree_palmBend', 'tree_palmDetailedShort', 'tree_palmDetailedTall', 'tree_palmShort', 'tree_palmTall'].map(N),
  ...['tree_default', 'tree_detailed', 'tree_fat', 'tree_oak', 'tree_plateau', 'tree_simple'].map(N),
  ...['plant_bush', 'plant_bushDetailed', 'plant_bushLarge', 'plant_bushSmall', 'plant_flatShort', 'plant_flatTall'].map(N),
  ...['grass', 'grass_large', 'grass_leafs', 'grass_leafsLarge'].map(N),
  ...['flower_redA', 'flower_redB', 'flower_yellowA', 'flower_yellowB', 'flower_purpleA', 'flower_purpleB'].map(N),
  ...['rock_largeA', 'rock_largeB', 'rock_largeC', 'rock_largeD', 'rock_largeE', 'rock_largeF'].map(N),
  ...['rock_smallA', 'rock_smallB', 'rock_smallC', 'rock_smallD', 'rock_smallE', 'rock_smallF'].map(N),
  ...['rock_tallA', 'rock_tallB', 'rock_tallC', 'rock_tallD', 'rock_tallE', 'stone_tallA', 'stone_tallB', 'stone_tallC'].map(N),
  ...['log', 'log_large', 'stump_round', 'mushroom_red', 'mushroom_redGroup', 'campfire_stones', 'tent_detailedOpen', 'canoe', 'lily_large', 'lily_small', 'statue_head', 'sign'].map(N),
  ...['structure-platform-dock', 'structure-platform-dock-small', 'boat-row-small', 'boat-row-large', 'ship-pirate-large', 'ship-wreck', 'barrel', 'crate', 'chest', 'flag-pirate-high', 'tower-watch', 'rocks-sand-a', 'rocks-sand-b', 'rocks-sand-c', 'palm-detailed-bend', 'palm-detailed-straight'].map(P),
];

export interface PropOptions {
  density: number;
}

export async function buildProps(layout: IslandLayout, field: Heightfield, opts: PropOptions): Promise<THREE.Group> {
  const models = await loadModels(MODEL_LIST);
  const root = new THREE.Group();
  root.name = 'props';
  const R = rand(4242);
  const pathClear = layout.fieldRadius * 1.6 + 0.6;
  const v = layout.volcano;

  /** Zufällige Punkte, die eine Bedingung erfüllen. */
  const scatter = (count: number, accept: (x: number, z: number, h: number, slope: number) => boolean, tries = count * 40, clear = pathClear) => {
    const pts: { x: number; z: number; y: number }[] = [];
    for (let i = 0; i < tries && pts.length < count; i++) {
      const x = (R() - 0.5) * 64;
      const z = (R() - 0.5) * 64;
      const h = field.height(x, z);
      const slope = field.slope(x, z);
      if (!accept(x, z, h, slope)) continue;
      if (field.pathDistance(x, z) < clear) continue;
      if (pts.some((p) => Math.hypot(p.x - x, p.z - z) < 1.1)) continue;
      pts.push({ x, z, y: h });
    }
    return pts;
  };

  /** Punkte gleichmäßig auf mehrere Modelle verteilen und instanzieren. */
  const plant = (
    names: string[],
    points: { x: number; z: number; y: number }[],
    size: [number, number],
    o: { wind?: number; castShadow?: boolean; sink?: number; tilt?: number; tint?: string } = {},
  ) => {
    const buckets = new Map<string, Placement[]>();
    for (const p of points) {
      const name = names[Math.floor(R() * names.length)]!;
      const arr = buckets.get(name) ?? [];
      arr.push({
        x: p.x,
        y: p.y - (o.sink ?? 0.05),
        z: p.z,
        rotY: R() * Math.PI * 2,
        scale: size[0] + R() * (size[1] - size[0]),
        tilt: o.tilt ? (R() - 0.5) * o.tilt : 0,
      });
      buckets.set(name, arr);
    }
    for (const [name, placements] of buckets) {
      const model = models.get(name);
      if (!model) continue;
      const inst = instanceModel(model, placements, { targetHeight: 1, castShadow: o.castShadow ?? true, wind: o.wind });
      if (o.tint) {
        const tint = new THREE.Color(o.tint);
        inst.traverse((x) => {
          const mesh = x as THREE.Mesh;
          if (!mesh.isMesh) return;
          for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) (m as THREE.MeshStandardMaterial).color?.multiply(tint);
        });
      }
      root.add(inst);
    }
  };

  const d = opts.density;
  const distVolcano = (x: number, z: number) => Math.hypot(x - v.x, z - v.z);
  const nearHarbor = (x: number, z: number) => Math.hypot(x - layout.harbor.x, z - layout.harbor.z) < 6;

  // Palmen am Strand
  plant(
    [N('tree_palm'), N('tree_palmBend'), N('tree_palmDetailedTall'), N('tree_palmTall'), N('tree_palmDetailedShort'), P('palm-detailed-bend'), P('palm-detailed-straight')],
    scatter(Math.round(46 * d), (x, z, h, s) => h > 0.55 && h < 2.6 && s < 0.4 && !nearHarbor(x, z) && distVolcano(x, z) > v.baseRadius * 0.7, 46 * d * 40, pathClear + 1.2),
    [2.8, 4.2],
    { wind: 0.05 },
  );

  // Dschungel im Osten + Laubbäume im Inland
  const jungle = (x: number, z: number) => x > 6 && z > -14 && z < 20;
  plant(
    [N('tree_default'), N('tree_detailed'), N('tree_fat'), N('tree_oak')],
    scatter(Math.round(48 * d), (x, z, h, s) => h > 1.6 && s < 0.45 && distVolcano(x, z) > v.baseRadius * 0.75 && (jungle(x, z) || R() < 0.25), 48 * d * 40, pathClear + 1.6),
    [2.2, 3.6],
    { wind: 0.025 },
  );
  // Hochebene im Westen: schlanke Bäume
  plant(
    [N('tree_plateau'), N('tree_simple')],
    scatter(Math.round(20 * d), (x, z, h, s) => x < -8 && z < 10 && h > 2.5 && s < 0.45 && distVolcano(x, z) > v.baseRadius * 0.75, 20 * d * 40, pathClear + 1.4),
    [2.4, 3.6],
    { wind: 0.02 },
  );
  // Büsche
  plant(
    [N('plant_bush'), N('plant_bushDetailed'), N('plant_bushLarge'), N('plant_bushSmall'), N('plant_flatShort'), N('plant_flatTall')],
    scatter(Math.round(90 * d), (x, z, h, s) => h > 1.2 && s < 0.5 && distVolcano(x, z) > v.baseRadius * 0.55),
    [0.7, 1.4],
    { wind: 0.06 },
  );
  // Gras und Blumen (klein, viele, ohne Schatten)
  plant(
    [N('grass'), N('grass_large'), N('grass_leafs'), N('grass_leafsLarge')],
    scatter(Math.round(260 * d), (x, z, h, s) => h > 1.4 && s < 0.5 && distVolcano(x, z) > v.baseRadius * 0.6, 260 * d * 30),
    [0.35, 0.7],
    { wind: 0.12, castShadow: false },
  );
  plant(
    [N('flower_redA'), N('flower_redB'), N('flower_yellowA'), N('flower_yellowB'), N('flower_purpleA'), N('flower_purpleB')],
    scatter(Math.round(110 * d), (x, z, h, s) => h > 1.5 && s < 0.4 && distVolcano(x, z) > v.baseRadius * 0.65, 110 * d * 30),
    [0.35, 0.6],
    { wind: 0.12, castShadow: false },
  );
  // Felsen am Vulkan und an den Klippen
  plant(
    [N('rock_tallA'), N('rock_tallB'), N('rock_tallC'), N('rock_tallD'), N('rock_tallE'), N('stone_tallA'), N('stone_tallB'), N('stone_tallC')],
    scatter(Math.round(18 * d), (x, z, h) => {
      const dv = distVolcano(x, z);
      return dv < v.baseRadius * 0.95 && dv > v.craterRadius + 3 && h > 3;
    }),
    [1.0, 2.2],
    { sink: 0.3, tint: '#6f625c' },
  );
  plant(
    [N('rock_largeA'), N('rock_largeB'), N('rock_largeC'), N('rock_largeD'), N('rock_largeE'), N('rock_largeF')],
    scatter(Math.round(14 * d), (x, z, h) => z < -17 && h > 2 && distVolcano(x, z) > v.baseRadius * 0.9),
    [0.7, 1.3],
    { sink: 0.2 },
  );
  plant(
    [N('rock_smallA'), N('rock_smallB'), N('rock_smallC'), N('rock_smallD'), N('rock_smallE'), N('rock_smallF')],
    scatter(Math.round(60 * d), (x, z, h) => h > 0.4),
    [0.35, 0.8],
    { sink: 0.08, castShadow: false },
  );
  // Strandfelsen im flachen Wasser
  plant([P('rocks-sand-a'), P('rocks-sand-b'), P('rocks-sand-c')], scatter(Math.round(16 * d), (x, z, h) => h < 0.2 && h > -1.2), [0.8, 1.6], { sink: 0.2 });
  // Pilze und Baumstümpfe im Dschungel
  plant([N('mushroom_red'), N('mushroom_redGroup'), N('stump_round'), N('log')], scatter(Math.round(18 * d), (x, z, h, s) => jungle(x, z) && h > 1.8 && s < 0.4), [0.5, 1], {});

  // --- Wahrzeichen -----------------------------------------------------------
  const add = (name: string, p: Placement, height?: number) => {
    const m = models.get(name);
    if (m) root.add(placeModel(m, p, height));
  };
  const at = (x: number, z: number, lift = 0) => ({ x, z, y: field.height(x, z) + lift });

  // Hafen: Steg ins Wasser, Ruderboote, Fässer & Kisten
  const hb = layout.harbor;
  const start = layout.fields[0]!;
  const dockDir = Math.atan2(hb.z - start.z, hb.x - start.x);
  add(P('structure-platform-dock'), { x: hb.x, y: -0.9, z: hb.z, rotY: -dockDir + Math.PI / 2, scale: 1.05 });
  add(P('structure-platform-dock-small'), { x: hb.x + Math.cos(dockDir) * 2.6, y: -0.9, z: hb.z + Math.sin(dockDir) * 2.6, rotY: -dockDir + Math.PI / 2, scale: 1.05 });
  add(P('boat-row-small'), { x: hb.x + 2.4, y: 0.05, z: hb.z + 2.6, rotY: 0.6, scale: 1 }, 0.9);
  add(P('boat-row-large'), { x: hb.x - 2.8, y: 0.05, z: hb.z + 1.6, rotY: -0.4, scale: 1 }, 1.1);
  for (const [dx, dz, name] of [
    [1.6, -1.2, 'barrel'],
    [2.2, -0.8, 'barrel'],
    [1.2, -2.0, 'crate'],
  ] as const) {
    const p = at(start.x + dx, start.z + dz);
    add(P(name), { ...p, rotY: R() * 3, scale: 1 }, 0.7);
  }
  // Schild am Start
  { const p = at(start.x - 2.2, start.z - 0.6); add(N('sign'), { ...p, rotY: 0.6, scale: 1 }, 1.2); }

  // Piratenschiff vor der Küste und Wrack im Nordwesten
  add(P('ship-pirate-large'), { x: 31, y: -0.35, z: 26, rotY: -2.3, scale: 1 }, 9);
  add(P('ship-wreck'), { x: -31, y: -0.6, z: -17, rotY: 0.8, scale: 1 }, 4);

  // Brücke über den Fluss (selbst gebaut, damit sie exakt auf dem Weg liegt)
  root.add(buildBridge(layout));
  // Seerosen & Kanu am Fluss
  layout.river.slice(3).forEach((p, i) => {
    if (i % 2 === 0) add(N(i % 4 === 0 ? 'lily_large' : 'lily_small'), { x: p.x + 0.6, y: riverLevel(0.55 + i * 0.1) + 0.02, z: p.z - 0.4, rotY: i, scale: 1 }, 0.12);
  });
  { const p = layout.river[5]!; add(N('canoe'), { x: p.x - 1.4, y: 0.05, z: p.z + 2.2, rotY: 1.2, scale: 1 }, 0.5); }

  // Wachturm an den Klippen
  { const p = at(-6, -24.5); add(P('tower-watch'), { ...p, rotY: 0.3, scale: 1 }, 4); }
  // Steinköpfe auf der Hochebene
  for (const [x, z, r] of [
    [-26, -6, 1.2],
    [-27.5, -2.5, 1.5],
    [-26.5, 1.2, 1.8],
  ] as const) {
    const p = at(x, z);
    add(N('statue_head'), { ...p, y: p.y - 0.2, rotY: r, scale: 1 }, 2.6);
  }
  // Lager auf der Hochebene
  { const p = at(-14, -20); add(N('tent_detailedOpen'), { ...p, rotY: 0.9, scale: 1 }, 1.8); }
  { const p = at(-12, -18.2); add(N('campfire_stones'), { ...p, rotY: 0, scale: 1 }, 0.5); }
  { const p = at(-12.8, -16.8); add(N('log_large'), { ...p, rotY: 1.4, scale: 1 }, 0.5); }

  // Gipfel: Schatzkiste und Piratenflagge
  const goal = layout.fields[layout.fields.length - 1]!;
  const out = Math.atan2(goal.z - v.z, goal.x - v.x);
  add(P('chest'), { x: goal.x + Math.cos(out) * 1.4, y: goal.y, z: goal.z + Math.sin(out) * 1.4, rotY: -out + Math.PI / 2, scale: 1 }, 0.9);
  add(P('flag-pirate-high'), { x: goal.x + Math.cos(out + 0.9) * 1.6, y: goal.y, z: goal.z + Math.sin(out + 0.9) * 1.6, rotY: 0, scale: 1 }, 3.4);

  return root;
}

/** Hängebrücke aus Planken, Pfosten und Seilen entlang des Weges. */
function buildBridge(layout: IslandLayout): THREE.Group {
  const g = new THREE.Group();
  const br = layout.bridge;
  const plankMat = new THREE.MeshStandardMaterial({ color: '#a8754a', roughness: 0.9 });
  const darkMat = new THREE.MeshStandardMaterial({ color: '#6b4630', roughness: 0.9 });
  const ropeMat = new THREE.MeshStandardMaterial({ color: '#d9c39a', roughness: 1 });
  // Wegpunkte im Bereich der Brücke
  const pts = layout.path.filter((p) => Math.hypot(p.x - br.x, p.z - br.z) < br.length / 2);
  if (pts.length < 2) return g;
  const width = layout.fieldRadius * 2.6;
  const plankGeo = new THREE.BoxGeometry(width, 0.12, 0.34);
  const step = Math.max(1, Math.floor(pts.length / 14));
  const sides: THREE.Vector3[][] = [[], []];
  for (let i = 0; i < pts.length - 1; i += step) {
    const a = pts[i]!;
    const b = pts[Math.min(pts.length - 1, i + 1)]!;
    const heading = Math.atan2(b.z - a.z, b.x - a.x);
    const plank = new THREE.Mesh(plankGeo, i % (step * 3) === 0 ? darkMat : plankMat);
    plank.position.set(a.x, a.y - 0.04, a.z);
    plank.rotation.y = -heading + Math.PI / 2;
    plank.castShadow = plank.receiveShadow = true;
    g.add(plank);
    const nx = Math.cos(heading + Math.PI / 2) * width * 0.5;
    const nz = Math.sin(heading + Math.PI / 2) * width * 0.5;
    sides[0]!.push(new THREE.Vector3(a.x + nx, a.y + 0.7, a.z + nz));
    sides[1]!.push(new THREE.Vector3(a.x - nx, a.y + 0.7, a.z - nz));
  }
  const postGeo = new THREE.CylinderGeometry(0.09, 0.11, 1.4, 8);
  for (const side of sides) {
    for (const p of [side[0], side[side.length - 1]]) {
      if (!p) continue;
      const post = new THREE.Mesh(postGeo, darkMat);
      post.position.set(p.x, p.y - 0.25, p.z);
      post.castShadow = true;
      g.add(post);
    }
    if (side.length > 1) {
      const curve = new THREE.CatmullRomCurve3(side.map((p, i, arr) => p.clone().setY(p.y - Math.sin((i / (arr.length - 1)) * Math.PI) * 0.25)));
      const rope = new THREE.Mesh(new THREE.TubeGeometry(curve, 24, 0.04, 6, false), ropeMat);
      rope.castShadow = true;
      g.add(rope);
    }
  }
  return g;
}
