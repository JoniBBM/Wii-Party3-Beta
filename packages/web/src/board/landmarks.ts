/**
 * Wahrzeichen der Insel: Hafendorf mit Steg und Pfahlhütten, Stufenpyramide und Säulenallee,
 * Tempelruine und Steinköpfe auf der Hochebene, Leuchtturm mit drehendem Lichtkegel,
 * Hängebrücke über die Schlucht, Fass-Flöße in der Furt, Seil-Geländer an den Klippen,
 * Strickleiter am Kraterloch, Schatzkiste am Gipfel, Felsbogen, Wrack, segelnde Schiffe,
 * Regenbogen am Wasserfall, Lagerfeuer, Fackeln und Dampf.
 */
import * as THREE from 'three';
import { RIVER, RIVER_POOL, VOLCANO } from '@insel/shared';
import type { Emitter } from './ambient.ts';
import { placeModel, worldMaterial, type Placement } from './assets.ts';
import { mergeStatic } from './merge.ts';
import { CRATER } from './ground.ts';
import type { IslandLayout } from './layout.ts';
import { noise2, rand } from './noise.ts';
import type { Heightfield } from './terrain.ts';

const N = (n: string) => `nature/${n}`;
const P = (n: string) => `pirate/${n}`;

export const LANDMARK_MODELS = [
  ...['statue_head', 'statue_column', 'statue_columnDamaged', 'statue_block', 'statue_ring', 'statue_obelisk', 'campfire_stones', 'campfire_logs', 'log_large', 'log_stack', 'tent_detailedOpen', 'canoe', 'sign', 'pot_large', 'stump_old'].map(N),
  ...['structure-platform', 'structure-roof', 'boat-row-small', 'boat-row-large', 'ship-pirate-large', 'ship-small', 'ship-medium', 'ship-wreck', 'barrel', 'crate', 'crate-bottles', 'chest', 'flag-pirate-high', 'flag-high-pennant', 'cannon', 'mast-ropes'].map(P),
];

/** Bereiche, in denen keine Bäume/Büsche wachsen sollen. */
export interface KeepOut {
  x: number;
  z: number;
  r: number;
}

export interface LandmarkResult {
  group: THREE.Group;
  keepOut: KeepOut[];
  /** Sichthindernisse für die Kamera (x, z, Radius, Oberkante) */
  blockers: { x: number; z: number; r: number; top: number }[];
  fires: Emitter[];
  smokes: Emitter[];
  /** Plätze für Tiere: Dächer, Säulen, Mast … */
  perches: THREE.Vector3[];
  update: (t: number, dt: number) => void;
}

const matCache = new Map<string, THREE.MeshStandardMaterial>();
function mat(color: string, o: { rough?: number; emissive?: string; flat?: boolean } = {}): THREE.MeshStandardMaterial {
  const key = `${color}|${o.rough ?? 0.85}|${o.emissive ?? ''}|${o.flat ? 1 : 0}`;
  let m = matCache.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, roughness: o.rough ?? 0.85, flatShading: o.flat ?? false });
    if (o.emissive) {
      m.emissive.set(o.emissive);
      m.emissiveIntensity = 1.6;
    }
    worldMaterial(m);
    matCache.set(key, m);
  }
  return m;
}

const WOOD = '#9a6a43';
const WOOD_DARK = '#6b4630';
const ROPE = '#d8c39a';
const SANDSTONE = '#d2b98d';
const SANDSTONE_DARK = '#b39770';
const MOSS = '#7f9a4e';

function mesh(geo: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  const me = new THREE.Mesh(geo, m);
  me.position.set(x, y, z);
  me.castShadow = true;
  me.receiveShadow = true;
  return me;
}

/** Seil als dünne Röhre entlang von Punkten. */
function rope(points: THREE.Vector3[], radius = 0.035, color = ROPE): THREE.Mesh {
  const curve = new THREE.CatmullRomCurve3(points);
  return mesh(new THREE.TubeGeometry(curve, Math.max(8, points.length * 6), radius, 5, false), mat(color, { rough: 1 }));
}

export function buildLandmarks(models: Map<string, THREE.Group>, field: Heightfield, layout: IslandLayout, _quality: { density: number }): LandmarkResult {
  const root = new THREE.Group();
  root.name = 'landmarks';
  const R = rand(5150);
  const keepOut: KeepOut[] = [];
  const fires: Emitter[] = [];
  const smokes: Emitter[] = [];
  const perches: THREE.Vector3[] = [];
  const updaters: ((t: number, dt: number) => void)[] = [];
  const H = (x: number, z: number) => field.height(x, z);

  const add = (name: string, p: Placement, height?: number, colors?: Record<string, string>) => {
    const m = models.get(name);
    if (!m) return null;
    const o = placeModel(m, p, height, { colors });
    root.add(o);
    return o;
  };
  const ground = (x: number, z: number, lift = 0) => ({ x, z, y: H(x, z) + lift });
  /** tiefster Punkt unter einer Grundfläche (damit nichts schwebt) */
  const footY = (x: number, z: number, r: number) => {
    let y = Infinity;
    for (let a = 0; a < 8; a++) y = Math.min(y, H(x + Math.cos(a) * r, z + Math.sin(a) * r));
    return Math.min(y, H(x, z));
  };
  const torch = (x: number, z: number, h = 1.7) => {
    const y = H(x, z);
    root.add(mesh(new THREE.CylinderGeometry(0.06, 0.09, h, 7), mat(WOOD_DARK), x, y + h / 2, z));
    const bowl = mesh(new THREE.CylinderGeometry(0.2, 0.12, 0.22, 8), mat('#5a4636'), x, y + h + 0.05, z);
    root.add(bowl);
    fires.push({ x, y: y + h + 0.12, z, count: 14, size: 0.55, rise: 0.75, spread: 0.08, life: 0.75 });
  };
  const campfire = (x: number, z: number) => {
    const p = ground(x, z);
    add(N('campfire_stones'), { ...p, rotY: R() * 3, scale: 1 }, 0.35);
    add(N('campfire_logs'), { ...p, y: p.y + 0.05, rotY: R() * 3, scale: 1 }, 0.3);
    fires.push({ x, y: p.y + 0.2, z, count: 26, size: 0.9, rise: 1.0, spread: 0.18, life: 0.9 });
    smokes.push({ x, y: p.y + 0.9, z, count: 18, size: 1.4, rise: 5, spread: 0.6, life: 6 });
    keepOut.push({ x, z, r: 2.2 });
  };

  // =========================================================================
  // Hafendorf (Südwestbucht)
  // =========================================================================
  {
    const pierZ = 20.3;
    const x0 = -23.4;
    const x1 = -30.6;
    const deckY = 0.95;
    // Steg aus Bohlen auf Pfählen
    const plankGeo = new THREE.BoxGeometry(0.34, 0.1, 1.9);
    const postGeo = new THREE.CylinderGeometry(0.09, 0.1, 2.6, 7);
    for (let x = x0; x >= x1; x -= 0.38) {
      const pl = mesh(plankGeo, mat(R() < 0.2 ? WOOD_DARK : WOOD), x, deckY + (R() - 0.5) * 0.02, pierZ);
      pl.rotation.y = (R() - 0.5) * 0.04;
      root.add(pl);
    }
    for (let x = x0 - 0.3; x >= x1; x -= 1.8) for (const dz of [-0.95, 0.95]) root.add(mesh(postGeo, mat(WOOD_DARK), x, deckY - 1.0, pierZ + dz));
    // Pfahlhütten am Ende des Stegs und an der Nordseite der Bucht
    const hut = (x: number, z: number, rot: number, onWater: boolean) => {
      const base = onWater ? -0.45 : footY(x, z, 1.6) - 0.1;
      add(P('structure-platform'), { x, y: base, z, rotY: rot, scale: 1 }, onWater ? 1.45 : 0.9);
      const top = base + (onWater ? 1.45 : 0.9);
      add(P('structure-roof'), { x, y: top - 0.04, z, rotY: rot, scale: 1 }, 3.2);
      perches.push(new THREE.Vector3(x, top + 3.0, z));
      keepOut.push({ x, z, r: 2.6 });
    };
    hut(-31.9, pierZ, 0.2, true);
    hut(-28.6, 17.3, -0.4, true);
    hut(-33.5, 23.6, 0.7, true);
    hut(-19.8, 14.6, 0.3, false);
    hut(-23.6, 13.4, -0.2, false);
    hut(-14.6, 17.4, 0.8, false);
    // Boote und Fracht
    add(P('boat-row-small'), { x: -26.2, y: 0.02, z: pierZ + 1.6, rotY: 1.5, scale: 1 }, 0.9);
    add(P('boat-row-large'), { x: -28.8, y: 0.02, z: pierZ - 1.7, rotY: 1.7, scale: 1 }, 1.1);
    add(P('ship-small'), { x: -30.2, y: -0.25, z: 25.8, rotY: 2.4, scale: 1 }, 5.2);
    for (const [dx, name, s] of [
      [0.2, 'barrel', 0.75],
      [-0.6, 'barrel', 0.75],
      [-2.4, 'crate', 0.7],
      [-4.2, 'crate-bottles', 0.75],
      [-5.6, 'barrel', 0.75],
    ] as const)
      add(P(name), { x: x0 + dx, y: deckY + 0.05, z: pierZ + (R() < 0.5 ? -0.55 : 0.55), rotY: R() * 3, scale: 1 }, s);
    const start = layout.fields[0]!;
    add(N('sign'), { ...ground(start.x - 2.6, start.z + 2.4), rotY: 0.9, scale: 1 }, 1.3);
    add(P('flag-high-pennant'), { ...ground(start.x + 2.4, start.z - 2.0), rotY: 0, scale: 1 }, 4.2);
    campfire(-18.6, 11.6);
    torch(start.x - 2.6, start.z - 1.4);
    torch(start.x + 1.0, start.z + 2.9);
    add(N('pot_large'), { ...ground(-21.3, 13.2), rotY: 1, scale: 1 }, 0.5);
    add(N('log_stack'), { ...ground(-17.0, 13.6), rotY: 0.4, scale: 1 }, 0.7);
    // Ausguck mit Flagge oben auf der Klippe über dem Dorf
    add(P('mast-ropes'), { ...ground(-32.4, 9.8, -0.1), rotY: -0.6, scale: 1 }, 4.4);
    keepOut.push({ x: -32.4, z: 9.8, r: 1.6 });
  }

  // =========================================================================
  // Stufenpyramide und Säulenallee (Inselmitte)
  // =========================================================================
  {
    const px = -3.4;
    const pz = 15.6;
    const size = 7.6;
    const levels = 5;
    const lvlH = 0.92;
    const base = footY(px, pz, size * 0.6) - 0.25;
    const g = new THREE.Group();
    g.position.set(px, base, pz);
    g.rotation.y = 0.32;
    for (let i = 0; i < levels; i++) {
      const s = size * (1 - i * 0.165);
      const b = mesh(new THREE.BoxGeometry(s, lvlH, s), mat(i % 2 ? SANDSTONE_DARK : SANDSTONE, { flat: true }), 0, i * lvlH + lvlH / 2, 0);
      g.add(b);
      // Moos an den Kanten
      for (let k = 0; k < 4; k++) {
        if (R() < 0.45) continue;
        const ang = (k * Math.PI) / 2;
        const moss = mesh(new THREE.BoxGeometry(s * (0.25 + R() * 0.3), 0.08, 0.5), mat(MOSS), Math.sin(ang) * (s / 2 - 0.2), (i + 1) * lvlH + 0.02, Math.cos(ang) * (s / 2 - 0.2));
        moss.rotation.y = ang;
        g.add(moss);
      }
    }
    // Treppe an der Vorderseite (+z)
    const steps = levels * 3;
    const stepH = (levels * lvlH) / steps;
    for (let k = 0; k < steps; k++) {
      const depth = size * 0.5 - (k / steps) * size * 0.5 * 0.82;
      g.add(mesh(new THREE.BoxGeometry(1.7, stepH, 0.5), mat(k % 2 ? SANDSTONE : '#e0c9a0', { flat: true }), 0, k * stepH + stepH / 2, depth));
    }
    // Tempel oben
    const topY = levels * lvlH;
    g.add(mesh(new THREE.BoxGeometry(2.4, 1.5, 2.2), mat(SANDSTONE, { flat: true }), 0, topY + 0.75, -0.2));
    g.add(mesh(new THREE.BoxGeometry(2.9, 0.3, 2.7), mat(SANDSTONE_DARK, { flat: true }), 0, topY + 1.65, -0.2));
    g.add(mesh(new THREE.BoxGeometry(0.8, 1.0, 0.1), mat('#2a1d14'), 0, topY + 0.55, 0.92));
    root.add(g);
    perches.push(new THREE.Vector3(px, base + topY + 1.85, pz));
    keepOut.push({ x: px, z: pz, r: size * 0.78 });
    // Fackeln am Treppenfuß
    const fx = Math.sin(0.32);
    const fz = Math.cos(0.32);
    torch(px + fz * 1.4 + fx * (size / 2 + 0.6), pz - fx * 1.4 + fz * (size / 2 + 0.6));
    torch(px - fz * 1.4 + fx * (size / 2 + 0.6), pz + fx * 1.4 + fz * (size / 2 + 0.6));

    // Säulenallee entlang des Weges im Ruinenbereich
    const ruins = layout.path.filter((p) => p.zone === 'ruins');
    for (let i = 4; i < ruins.length - 4; i += 9) {
      const a = ruins[i]!;
      const b = ruins[i + 1]!;
      const hd = Math.atan2(b.z - a.z, b.x - a.x);
      for (const side of [-1, 1]) {
        const off = layout.fieldRadius * 1.6 + 0.8;
        const x = a.x + Math.cos(hd + Math.PI / 2) * off * side;
        const z = a.z + Math.sin(hd + Math.PI / 2) * off * side;
        if (Math.hypot(x - px, z - pz) < size * 0.8) continue;
        const broken = R() < 0.4;
        add(N(broken ? 'statue_columnDamaged' : 'statue_column'), { ...ground(x, z, -0.1), rotY: R() * 0.3, scale: 1 }, broken ? 1.7 : 2.4, { stone: SANDSTONE, stoneDark: SANDSTONE_DARK });
        perches.push(new THREE.Vector3(x, H(x, z) + (broken ? 1.6 : 2.3), z));
      }
    }
    add(N('statue_obelisk'), { ...ground(4.6, 14.6), rotY: 0.4, scale: 1 }, 3.4, { stone: SANDSTONE, stoneDark: SANDSTONE_DARK });
    add(N('statue_ring'), { ...ground(9.6, 16.2), rotY: -0.5, scale: 1 }, 2.4, { stone: SANDSTONE, stoneDark: SANDSTONE_DARK });
    add(N('statue_head'), { ...ground(-8.6, 20.6, -0.15), rotY: 0.9, scale: 1 }, 2.1, { stone: SANDSTONE, stoneDark: SANDSTONE_DARK });
    add(N('statue_block'), { ...ground(-0.4, 21.6, -0.1), rotY: 0.2, scale: 1 }, 0.7, { stone: SANDSTONE, stoneDark: SANDSTONE_DARK });
    keepOut.push({ x: 4.6, z: 14.6, r: 1.2 }, { x: 9.6, z: 16.2, r: 1.8 }, { x: -8.6, z: 20.6, r: 1.6 });
  }

  // =========================================================================
  // Lagune: Pfahlhütte mit Kanu
  // =========================================================================
  add(P('structure-platform'), { x: 31.2, y: -0.55, z: 24.6, rotY: 0.4, scale: 1 }, 1.4);
  add(P('structure-roof'), { x: 31.2, y: 0.82, z: 24.6, rotY: 0.4, scale: 1 }, 3.0);
  add(N('canoe'), { x: 29.0, y: 0.02, z: 25.8, rotY: 1.1, scale: 1 }, 0.45);
  perches.push(new THREE.Vector3(31.2, 3.7, 24.6));

  // =========================================================================
  // Leuchtturm auf dem Nordost-Kap
  // =========================================================================
  {
    const lx = 41.6;
    const lz = -13.4;
    const by = footY(lx, lz, 1.8);
    const g = new THREE.Group();
    g.position.set(lx, by, lz);
    g.add(mesh(new THREE.CylinderGeometry(1.9, 2.1, 0.8, 16), mat('#9d958a', { flat: true }), 0, 0.4, 0));
    const towerH = 7.4;
    const tower = new THREE.CylinderGeometry(0.95, 1.4, towerH, 28, 8);
    const tp = tower.attributes.position as THREE.BufferAttribute;
    const tc = new Float32Array(tp.count * 3);
    const red = new THREE.Color('#d33a2c');
    const white = new THREE.Color('#f5f2ea');
    for (let i = 0; i < tp.count; i++) {
      const y = tp.getY(i) + towerH / 2;
      const c = Math.floor(y / (towerH / 4)) % 2 === 0 ? white : red;
      tc.set([c.r, c.g, c.b], i * 3);
    }
    tower.setAttribute('color', new THREE.BufferAttribute(tc, 3));
    const towerMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6 });
    worldMaterial(towerMat);
    g.add(mesh(tower, towerMat, 0, 0.8 + towerH / 2, 0));
    const topY = 0.8 + towerH;
    g.add(mesh(new THREE.CylinderGeometry(1.35, 1.35, 0.18, 20), mat('#2f2f33'), 0, topY + 0.09, 0));
    g.add(mesh(new THREE.TorusGeometry(1.25, 0.03, 6, 28).rotateX(Math.PI / 2), mat('#2f2f33'), 0, topY + 0.6, 0));
    const lantern = new THREE.Mesh(new THREE.CylinderGeometry(0.72, 0.72, 1.0, 16), new THREE.MeshStandardMaterial({ color: '#fff3c4', emissive: '#ffd36b', emissiveIntensity: 2.2, roughness: 0.2 }));
    lantern.position.y = topY + 0.68;
    g.add(lantern);
    g.add(mesh(new THREE.ConeGeometry(0.95, 0.9, 16), mat('#c9352a'), 0, topY + 1.63, 0));
    g.add(mesh(new THREE.SphereGeometry(0.14, 10, 8), mat('#2f2f33'), 0, topY + 2.12, 0));
    g.add(mesh(new THREE.BoxGeometry(0.55, 1.0, 0.1), mat('#3a2a1e'), 0, 1.3, 1.36));
    for (const y of [3.3, 5.6]) g.add(mesh(new THREE.BoxGeometry(0.3, 0.45, 0.08), mat('#2b3a4a'), 0, y, 1.2 - (y / towerH) * 0.38));
    // drehender Lichtkegel
    const beamGeo = new THREE.ConeGeometry(1.4, 16, 20, 1, true);
    beamGeo.translate(0, -8, 0);
    beamGeo.rotateZ(Math.PI / 2);
    const beamMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      uniforms: {},
      vertexShader: `varying float vX; void main(){ vX = position.x; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `varying float vX; void main(){ float a = smoothstep(16.0, 0.0, vX) * 0.16; gl_FragColor = vec4(vec3(1.0,0.93,0.7) * a, a); }`,
    });
    const beam = new THREE.Group();
    beam.userData.dynamic = true;
    beam.position.y = topY + 0.68;
    for (const r of [0, Math.PI]) {
      const b = new THREE.Mesh(beamGeo, beamMat);
      b.rotation.y = r;
      beam.add(b);
    }
    g.add(beam);
    root.add(g);
    updaters.push((t) => {
      beam.rotation.y = t * 0.9;
    });
    perches.push(new THREE.Vector3(lx, by + topY + 2.2, lz));
    keepOut.push({ x: lx, z: lz, r: 3.2 });
    // Kanone und Vorräte
    add(P('cannon'), { ...ground(40.6, -18.4), rotY: -2.4, scale: 1 }, 0.9);
    add(P('barrel'), { ...ground(39.4, -9.0), rotY: 1, scale: 1 }, 0.7);
  }

  // =========================================================================
  // Hängebrücke über die Schlucht
  // =========================================================================
  root.add(buildRopeBridge(layout));

  // =========================================================================
  // Furt: die beiden Wege (Fässer / Kisten) baut stunts.ts; hier treibende Fässer und
  // Kisten weiter flussabwärts, Kanu am Ufer
  // =========================================================================
  {
    const floaters: { o: THREE.Object3D; ph: number; y: number }[] = [];
    const drift = (x: number, z: number, y: number, crateish: boolean) => {
      const o = crateish ? floatingCrate(0.55) : bigBarrel(0.3, 0.75);
      if (!crateish) o.rotation.set(Math.PI / 2, R() * 3, 0);
      else o.rotation.y = R() * 3;
      o.position.set(x, y, z);
      o.userData.dynamic = true;
      root.add(o);
      floaters.push({ o, ph: R() * 6, y });
    };
    for (let k = 0; k < 5; k++) {
      const p = RIVER[8 + (k % 4)]!;
      drift(p.x + (R() - 0.5) * p.w, p.z + (R() - 0.5) * p.w, p.y - 0.05, k % 2 === 0);
    }
    updaters.push((t) => {
      for (const f of floaters) {
        f.o.position.y = f.y + Math.sin(t * 1.7 + f.ph) * 0.05;
        f.o.rotation.z = Math.sin(t * 1.3 + f.ph) * 0.08 + (f.o.rotation.x ? 0 : 0);
      }
    });
    // Kanu am Ufer
    add(N('canoe'), { ...ground(19.2, 0.6, 0.02), rotY: 0.4, scale: 1 }, 0.45);
  }

  // =========================================================================
  // Wasserfall: Regenbogen über dem Becken
  // =========================================================================
  {
    const pool = RIVER[RIVER_POOL]!;
    const rb = new THREE.RingGeometry(3.4, 4.3, 48, 1, 0, Math.PI);
    const rbMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      vertexShader: `varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `varying vec2 vP;
        vec3 hue(float h){ return clamp(abs(mod(h*6.0+vec3(0.0,4.0,2.0),6.0)-3.0)-1.0,0.0,1.0); }
        void main(){ float r = (length(vP) - 3.4) / 0.9; float a = smoothstep(0.0,0.15,r)*smoothstep(1.0,0.85,r) * smoothstep(0.0, 1.2, vP.y) * 0.22;
          gl_FragColor = vec4(hue(r * 0.8) * a, a); }`,
    });
    const rainbow = new THREE.Mesh(rb, rbMat);
    rainbow.position.set(pool.x + 1.2, pool.y + 0.4, pool.z + 1.0);
    rainbow.rotation.y = -0.75;
    rainbow.renderOrder = 8;
    root.add(rainbow);
  }

  // =========================================================================
  // Seil-Geländer an den Klippen (zur Abbruchkante hin)
  // =========================================================================
  root.add(buildCliffRails(layout, field));

  // =========================================================================
  // Hochebene im Nordwesten: Tempelruine, Steinköpfe, Lager
  // =========================================================================
  {
    const tx = -29.2;
    const tz = -21.4;
    const ty = footY(tx, tz, 3.2) - 0.05;
    root.add(mesh(new THREE.BoxGeometry(6.4, 0.35, 4.8), mat('#a79d90', { flat: true }), tx, ty + 0.17, tz));
    for (let i = 0; i < 4; i++)
      for (const side of [-1, 1]) {
        const x = tx - 2.6 + i * 1.75;
        const z = tz + side * 2.0;
        const broken = (i + (side > 0 ? 1 : 0)) % 3 === 0;
        add(N(broken ? 'statue_columnDamaged' : 'statue_column'), { x, y: ty + 0.3, z, rotY: R() * 0.4, scale: 1 }, broken ? 1.8 : 2.9);
        if (!broken) perches.push(new THREE.Vector3(x, ty + 3.2, z));
      }
    root.add(mesh(new THREE.BoxGeometry(6.6, 0.4, 0.6), mat('#b5ab9e', { flat: true }), tx + 0.4, ty + 3.35, tz - 2.0));
    add(N('statue_block'), { x: tx, y: ty + 0.32, z: tz, rotY: 0, scale: 1 }, 0.9);
    keepOut.push({ x: tx, z: tz, r: 4.4 });
    torch(tx + 3.6, tz + 2.6);
    torch(tx + 3.6, tz - 2.6);
    // Steinköpfe blicken aufs Meer
    for (const [x, z] of [
      [-32.2, -27.4],
      [-35.4, -22.6],
      [-37.6, -16.8],
      [-38.6, -10.8],
    ] as const) {
      const out = Math.atan2(x + 27, z + 18);
      add(N('statue_head'), { ...ground(x, z, -0.25), rotY: out, scale: 1 }, 3.1);
      keepOut.push({ x, z, r: 1.8 });
    }
    // Lager
    add(N('tent_detailedOpen'), { ...ground(-14.6, -25.2), rotY: 2.2, scale: 1 }, 1.9);
    campfire(-12.6, -23.2);
    add(N('log_large'), { ...ground(-12.0, -21.6), rotY: 1.2, scale: 1 }, 0.45);
    keepOut.push({ x: -14.6, z: -25.2, r: 2.6 });
  }

  // =========================================================================
  // Vulkan: Gipfel, Kraterloch mit Strickleiter, Dampf aus Fumarolen
  // =========================================================================
  {
    const goal = layout.fields[layout.fields.length - 1]!;
    const out = Math.atan2(goal.z - VOLCANO.z, goal.x - VOLCANO.x);
    const gr = layout.fieldRadius * 1.55 + 0.75;
    const at = (a: number, r: number) => ({ x: goal.x + Math.cos(out + a) * r, z: goal.z + Math.sin(out + a) * r });
    const c1 = at(0, gr);
    add(P('chest'), { ...c1, y: H(c1.x, c1.z) - 0.05, rotY: -out + Math.PI / 2, scale: 1 }, 0.9);
    const f1 = at(0.75, gr + 0.2);
    add(P('flag-pirate-high'), { ...f1, y: H(f1.x, f1.z) - 0.1, rotY: 0, scale: 1 }, 3.6);
    const t1 = at(-0.8, gr);
    torch(t1.x, t1.z, 1.4);
    // Strickleiter neben dem Kraterfeld hinab (dort klettern die Figuren heraus)
    const cf = layout.fields[layout.craterField]!;
    const la = Math.atan2(cf.z - VOLCANO.z, cf.x - VOLCANO.x) + 0.62;
    const dir = new THREE.Vector3(Math.cos(la), 0, Math.sin(la));
    const inward = Math.atan2(-dir.z, -dir.x);
    const tx0 = VOLCANO.x + dir.x * (CRATER.crest + 0.1);
    const tz0 = VOLCANO.z + dir.z * (CRATER.crest + 0.1);
    const top = new THREE.Vector3(tx0, H(tx0, tz0) + 0.05, tz0);
    const bottom = new THREE.Vector3(VOLCANO.x + dir.x * (CRATER.ledge - 0.3), CRATER.floorY + 0.05, VOLCANO.z + dir.z * (CRATER.ledge - 0.3));
    const side = new THREE.Vector3(-dir.z, 0, dir.x).multiplyScalar(0.28);
    for (const sgn of [-1, 1]) {
      const a = top.clone().addScaledVector(side, sgn);
      const b = bottom.clone().addScaledVector(side, sgn);
      const m = a.clone().lerp(b, 0.5);
      m.addScaledVector(dir, 0.2);
      root.add(rope([a, m, b], 0.035));
    }
    root.add(mesh(new THREE.CylinderGeometry(0.07, 0.09, 1.1, 6), mat(WOOD_DARK), top.x - side.x * 1.2, top.y + 0.45, top.z - side.z * 1.2));
    root.add(mesh(new THREE.CylinderGeometry(0.07, 0.09, 1.1, 6), mat(WOOD_DARK), top.x + side.x * 1.2, top.y + 0.45, top.z + side.z * 1.2));
    for (let k = 1; k < 9; k++) {
      const u = k / 9;
      const c = top.clone().lerp(bottom, u);
      c.addScaledVector(dir, Math.sin(u * Math.PI) * 0.2);
      const rung = mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.6, 5), mat(WOOD), c.x, c.y, c.z);
      rung.rotation.z = Math.PI / 2;
      rung.rotation.y = -inward + Math.PI / 2;
      root.add(rung);
    }
    for (const [a, r] of [
      [-0.6, 9.5],
      [2.3, 8.8],
      [3.6, 10.5],
      [-2.1, 12.5],
    ] as const) {
      const x = VOLCANO.x + Math.cos(a) * r;
      const z = VOLCANO.z + Math.sin(a) * r;
      smokes.push({ x, y: H(x, z) + 0.2, z, count: 12, size: 1.6, rise: 4.5, spread: 0.4, life: 5 });
    }
  }

  // =========================================================================
  // Küste und Meer: Felsbogen, Wrack, Schiffe, Inselchen
  // =========================================================================
  root.add(buildSeaArch(49, -6.8, R));
  add(P('ship-wreck'), { x: -40.5, y: -0.9, z: -31.5, rotY: 0.9, tilt: 0.12, scale: 1 }, 4.4);
  {
    const ships: { o: THREE.Object3D; r: number; speed: number; phase: number; dir: number; cx: number; cz: number }[] = [];
    const pirate = add(P('ship-pirate-large'), { x: 0, y: -0.4, z: 0, rotY: 0, scale: 1 }, 9);
    if (pirate) ships.push({ o: pirate, r: 74, speed: 0.016, phase: 0.9, dir: 1, cx: 0, cz: -2 });
    const sail = add(P('ship-medium'), { x: 0, y: -0.3, z: 0, rotY: 0, scale: 1 }, 6.5);
    if (sail) ships.push({ o: sail, r: 86, speed: 0.012, phase: 3.6, dir: -1, cx: 4, cz: 0 });
    updaters.push((t) => {
      for (const s of ships) {
        const a = s.phase + t * s.speed * s.dir;
        s.o.position.x = s.cx + Math.cos(a) * s.r;
        s.o.position.z = s.cz + Math.sin(a) * s.r * 0.9;
        s.o.rotation.y = -a - (s.dir > 0 ? 0 : Math.PI);
        s.o.rotation.z = Math.sin(t * 0.8 + s.phase) * 0.04;
        s.o.rotation.x = Math.sin(t * 0.6 + s.phase * 2) * 0.03;
        s.o.position.y = -0.35 + Math.sin(t * 0.9 + s.phase) * 0.12;
      }
    });
    for (const s of ships) {
      s.o.userData.dynamic = true;
      perches.push(s.o.position);
    }
  }
  // Seezeichen-Felsen vor der Nordküste
  for (const [x, z, h] of [
    [9.5, -39.6, 4.2],
    [-6.5, -40.2, 3.2],
    [30.5, -33.5, 3.6],
    [46.5, 4.5, 2.6],
  ] as const) {
    const g = new THREE.Mesh(rockGeometry(1.1 + R() * 0.6, h, R), mat('#6f6359', { flat: true }));
    g.position.set(x, -1.2, z);
    g.castShadow = g.receiveShadow = true;
    root.add(g);
  }

  // Kamera-Hindernisse: alle Wahrzeichen (Gelände-Höhe + typische Höhe), Leuchtturm und Pyramide genauer
  const blockers = keepOut.map((k) => ({ x: k.x, z: k.z, r: k.r * 0.8, top: H(k.x, k.z) + 4 }));
  blockers.push({ x: 41.6, z: -13.4, r: 3.2, top: H(41.6, -13.4) + 11.5 }, { x: -3.4, z: 15.6, r: 4.2, top: H(-3.4, 15.6) + 6.5 });
  mergeStatic(root);

  return {
    group: root,
    keepOut,
    blockers,
    fires,
    smokes,
    perches,
    update(t, dt) {
      for (const u of updaters) u(t, dt);
    },
  };
}

/** Holzfass mit Dauben und Eisenreifen (Lathe, Unterkante bei y = 0). */
export function bigBarrel(radius: number, height: number): THREE.Group {
  const g = new THREE.Group();
  const pts: THREE.Vector2[] = [];
  for (let k = 0; k <= 10; k++) {
    const u = k / 10;
    pts.push(new THREE.Vector2(radius * (0.84 + 0.16 * Math.sin(u * Math.PI)), u * height));
  }
  const body = new THREE.LatheGeometry(pts, 20);
  const pos = body.attributes.position as THREE.BufferAttribute;
  const col = new Float32Array(pos.count * 3);
  const a = new THREE.Color('#a8713f');
  const b = new THREE.Color('#8c5a31');
  for (let i = 0; i < pos.count; i++) {
    const ang = Math.atan2(pos.getZ(i), pos.getX(i));
    const c = Math.floor(((ang + Math.PI) / (Math.PI * 2)) * 20) % 2 ? a : b;
    col.set([c.r, c.g, c.b], i * 3);
  }
  body.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const woodMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, flatShading: true });
  worldMaterial(woodMat);
  g.add(mesh(body, woodMat));
  const lid = mesh(new THREE.CircleGeometry(radius * 0.86, 20).rotateX(-Math.PI / 2), mat('#b98352'), 0, height - 0.01, 0);
  g.add(lid);
  for (const u of [0.12, 0.38, 0.62, 0.88]) {
    const r = radius * (0.84 + 0.16 * Math.sin(u * Math.PI)) + 0.012;
    g.add(mesh(new THREE.TorusGeometry(r, radius * 0.035 + 0.01, 5, 24).rotateX(Math.PI / 2), mat('#4a4744', { rough: 0.5 }), 0, u * height, 0));
  }
  return g;
}

/** Schwimmende Holzkiste. */
export function floatingCrate(size: number): THREE.Group {
  const g = new THREE.Group();
  g.add(mesh(new THREE.BoxGeometry(size, size, size), mat('#a5733f', { flat: true })));
  for (const y of [-size * 0.35, size * 0.35]) g.add(mesh(new THREE.BoxGeometry(size * 1.02, size * 0.12, size * 1.02), mat('#7a4f2b', { flat: true }), 0, y, 0));
  return g;
}

/** Unregelmäßiger Felsklotz (für Brandungsfelsen und den Bogen). */
function rockGeometry(r: number, h: number, R: () => number): THREE.BufferGeometry {
  const geo = new THREE.CylinderGeometry(r * 0.55, r, h, 7, 4);
  const p = geo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const k = 0.75 + R() * 0.5;
    p.setXYZ(i, p.getX(i) * k, p.getY(i) + h / 2, p.getZ(i) * k);
  }
  geo.computeVertexNormals();
  return geo;
}

function buildSeaArch(x: number, z: number, R: () => number): THREE.Group {
  const g = new THREE.Group();
  const geo = new THREE.TorusGeometry(3.4, 1.25, 8, 20, Math.PI);
  const p = geo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const n = noise2(p.getX(i) * 0.6 + 3, p.getY(i) * 0.6) * 0.45 + (R() - 0.5) * 0.15;
    p.setXYZ(i, p.getX(i) * (1 + n * 0.12), p.getY(i) + n * 0.35, p.getZ(i) * (1 + n * 0.3));
  }
  geo.computeVertexNormals();
  const arch = new THREE.Mesh(geo, mat('#7a6d61', { flat: true }));
  arch.castShadow = arch.receiveShadow = true;
  arch.position.y = -1.6;
  g.add(arch);
  for (const sx of [-3.4, 3.4]) {
    const foot = new THREE.Mesh(rockGeometry(1.6, 2.2, R), mat('#6a5e54', { flat: true }));
    foot.position.set(sx, -2.6, 0);
    g.add(foot);
  }
  // Grasnarbe oben
  const top = new THREE.Mesh(new THREE.SphereGeometry(1.25, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), mat('#5fae3e', { flat: true }));
  top.scale.set(1.4, 0.35, 1.1);
  top.position.y = 3.4 - 1.6 + 1.05;
  g.add(top);
  g.position.set(x, 0, z);
  g.rotation.y = 0.5;
  return g;
}

/** Hängebrücke aus Planken, Pfosten und durchhängenden Seilen entlang des Weges. */
function buildRopeBridge(layout: IslandLayout): THREE.Group {
  const g = new THREE.Group();
  const br = layout.bridge;
  const pts = layout.path.filter((p) => p.s >= br.s0 - 0.2 && p.s <= br.s1 + 0.2);
  if (pts.length < 2) return g;
  const width = layout.fieldRadius * 2.5;
  const plankGeo = new THREE.BoxGeometry(width, 0.1, 0.3);
  const sides: THREE.Vector3[][] = [[], []];
  const lows: THREE.Vector3[][] = [[], []];
  for (let i = 0; i < pts.length - 1; i += 2) {
    const a = pts[i]!;
    const b = pts[Math.min(pts.length - 1, i + 1)]!;
    const heading = Math.atan2(b.z - a.z, b.x - a.x);
    const plank = mesh(plankGeo, mat(i % 6 === 0 ? WOOD_DARK : WOOD), a.x, a.y - 0.08, a.z);
    plank.rotation.y = -heading + Math.PI / 2;
    plank.rotation.z = (Math.random() - 0.5) * 0.04;
    g.add(plank);
    const nx = Math.cos(heading + Math.PI / 2) * width * 0.52;
    const nz = Math.sin(heading + Math.PI / 2) * width * 0.52;
    sides[0]!.push(new THREE.Vector3(a.x + nx, a.y + 0.95, a.z + nz));
    sides[1]!.push(new THREE.Vector3(a.x - nx, a.y + 0.95, a.z - nz));
    lows[0]!.push(new THREE.Vector3(a.x + nx, a.y - 0.05, a.z + nz));
    lows[1]!.push(new THREE.Vector3(a.x - nx, a.y - 0.05, a.z - nz));
  }
  const postGeo = new THREE.CylinderGeometry(0.11, 0.14, 2.0, 7);
  for (let s = 0; s < 2; s++) {
    const side = sides[s]!;
    const low = lows[s]!;
    for (const p of [side[0], side[side.length - 1]]) if (p) g.add(mesh(postGeo, mat(WOOD_DARK), p.x, p.y - 0.4, p.z));
    // Handseil hängt zwischen den Pfosten durch
    const hand = side.map((p, i, arr) => p.clone().setY(p.y + 0.15 - Math.sin((i / (arr.length - 1)) * Math.PI) * 0.35));
    g.add(rope(hand, 0.04));
    g.add(rope(low, 0.035));
    for (let i = 1; i < hand.length - 1; i += 2) g.add(rope([hand[i]!, low[i]!], 0.015));
  }
  return g;
}

/** Pfosten mit Seil an der Abbruchseite des Weges (Klippen, Hochebene, Serpentinen). */
function buildCliffRails(layout: IslandLayout, field: Heightfield): THREE.Group {
  const g = new THREE.Group();
  const runs: THREE.Vector3[][] = [];
  let run: THREE.Vector3[] = [];
  const off = layout.fieldRadius * 1.25 + 0.35;
  const br = layout.bridge;
  const ford = layout.ford;
  for (let i = 0; i < layout.path.length - 1; i += 7) {
    const a = layout.path[i]!;
    const b = layout.path[i + 1]!;
    if (!['cliffs', 'gorge', 'plateau', 'volcano'].includes(a.zone) || (a.s > br.s0 - 1 && a.s < br.s1 + 1) || (a.s > ford.s0 - 2 && a.s < ford.s1 + 2)) {
      if (run.length > 1) runs.push(run);
      run = [];
      continue;
    }
    const hd = Math.atan2(b.z - a.z, b.x - a.x);
    let best: THREE.Vector3 | null = null;
    for (const side of [-1, 1]) {
      const x = a.x + Math.cos(hd + Math.PI / 2) * off * side;
      const z = a.z + Math.sin(hd + Math.PI / 2) * off * side;
      const drop = a.y - field.height(x + Math.cos(hd + Math.PI / 2) * 1.6 * side, z + Math.sin(hd + Math.PI / 2) * 1.6 * side);
      if (drop > 1.6) best = new THREE.Vector3(x, field.height(x, z), z);
    }
    if (best && (!run.length || run[run.length - 1]!.distanceTo(best) < 3.5)) run.push(best);
    else {
      if (run.length > 1) runs.push(run);
      run = best ? [best] : [];
    }
  }
  if (run.length > 1) runs.push(run);
  const postGeo = new THREE.CylinderGeometry(0.06, 0.08, 1.0, 6);
  const posts: THREE.Vector3[] = runs.flat();
  const inst = new THREE.InstancedMesh(postGeo, mat(WOOD_DARK), posts.length);
  const m = new THREE.Matrix4();
  posts.forEach((p, i) => inst.setMatrixAt(i, m.makeTranslation(p.x, p.y + 0.45, p.z)));
  inst.castShadow = true;
  g.add(inst);
  for (const r of runs) {
    const pts: THREE.Vector3[] = [];
    r.forEach((p, i) => {
      pts.push(p.clone().setY(p.y + 0.85));
      const n = r[i + 1];
      if (n) pts.push(p.clone().lerp(n, 0.5).setY((p.y + n.y) / 2 + 0.72));
    });
    g.add(rope(pts, 0.025));
  }
  return g;
}
