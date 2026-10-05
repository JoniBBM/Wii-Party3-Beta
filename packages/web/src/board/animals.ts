/**
 * Tiere: Delfine springen vor der Küste, ein Wal bläst Fontänen, Fischschwärme, Mantarochen
 * und Meeresschildkröten im flachen Wasser, Krabben am Strand, Frösche am Fluss, Flamingos in
 * der Lagune, Möwen kreisen über Hafen und Leuchtturm, Papageien, Tukane und Affen in den
 * Bäumen, Schmetterlinge über den Blumen.
 * Modelle: Quaternius (CC0, mit Animationen) und Poly by Google u. a. (CC-BY, siehe LICENSES.md).
 */
import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { LAGOON, RIVER, RIVER_POOL } from '@insel/shared';
import { loadModel, worldMaterial } from './assets.ts';
import { coastDistance } from './ground.ts';
import type { IslandLayout } from './layout.ts';
import { rand } from './noise.ts';
import type { Heightfield } from './terrain.ts';

interface Species {
  file: string;
  /** Zielgröße in Metern */
  size: number;
  /** worauf sich die Größe bezieht */
  measure: 'length' | 'height' | 'span';
  /** Drehung, damit der Kopf nach +z zeigt */
  yaw: number;
  /** Animation (Name enthält …) */
  clip?: string;
  /** zusätzliche Kippung (Modelle, die liegen) */
  pitch?: number;
}

const SPECIES = {
  dolphin: { file: 'dolphin', size: 2.3, measure: 'length', yaw: 0, clip: 'Swim' },
  whale: { file: 'whale', size: 10, measure: 'length', yaw: 0, clip: 'Swim' },
  fish: { file: 'fish', size: 0.42, measure: 'length', yaw: 0, clip: 'Swim' },
  fish2: { file: 'fish2', size: 0.5, measure: 'length', yaw: 0, clip: 'Swim' },
  clownfish: { file: 'clownfish', size: 0.32, measure: 'length', yaw: 0, clip: 'Swim' },
  manta: { file: 'manta', size: 2.4, measure: 'span', yaw: 0, clip: 'Swim' },
  crab: { file: 'crab', size: 0.5, measure: 'span', yaw: 0, clip: 'Walk' },
  frog: { file: 'frog', size: 0.34, measure: 'length', yaw: 0, clip: 'Idle' },
  gull: { file: 'seagull_fly', size: 1.3, measure: 'span', yaw: -Math.PI / 2 },
  gullStand: { file: 'seagull', size: 0.55, measure: 'height', yaw: 0 },
  parrot: { file: 'parrot', size: 0.6, measure: 'height', yaw: 0 },
  toucan: { file: 'toucan', size: 0.55, measure: 'height', yaw: 0 },
  monkey: { file: 'capuchin', size: 0.75, measure: 'height', yaw: 0 },
  flamingo: { file: 'flamingo', size: 1.45, measure: 'height', yaw: 0 },
  turtle: { file: 'turtle2', size: 1.1, measure: 'length', yaw: 0 },
  tortoise: { file: 'turtle', size: 0.7, measure: 'length', yaw: 0 },
  butterfly: { file: 'butterfly', size: 0.3, measure: 'span', yaw: 0 },
} satisfies Record<string, Species>;

export type SpeciesName = keyof typeof SPECIES;

interface Prepared {
  template: THREE.Object3D;
  clips: THREE.AnimationClip[];
  scale: number;
  center: THREE.Vector3;
  minY: number;
  skinned: boolean;
}

/** Größe eines Modells inkl. Skelett-Verformung (Quaternius-Modelle sind skaliert/rotiert). */
function measure(obj: THREE.Object3D): THREE.Box3 {
  obj.updateMatrixWorld(true);
  const box = new THREE.Box3();
  const v = new THREE.Vector3();
  obj.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const pos = m.geometry.attributes.position as THREE.BufferAttribute;
    const skinned = (m as THREE.SkinnedMesh).isSkinnedMesh;
    if (skinned) (m as THREE.SkinnedMesh).skeleton.update();
    for (let i = 0; i < pos.count; i += Math.max(1, Math.floor(pos.count / 600))) {
      if (skinned) (m as THREE.SkinnedMesh).getVertexPosition(i, v).applyMatrix4(m.matrixWorld);
      else v.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld);
      box.expandByPoint(v);
    }
  });
  return box;
}

async function prepare(sp: Species): Promise<Prepared> {
  const scene = await loadModel(`animals/${sp.file}`);
  const clips = ((scene.userData.animations as THREE.AnimationClip[] | undefined) ?? []);
  let box = measure(scene);
  const bad = (b: THREE.Box3) => b.isEmpty() || !Number.isFinite(b.min.x + b.max.x + b.min.y + b.max.y + b.min.z + b.max.z);
  if (bad(box)) {
    // Ruhepose ohne Skelett-Verformung
    box = new THREE.Box3();
    scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      m.geometry.computeBoundingBox();
      box.union(m.geometry.boundingBox!.clone().applyMatrix4(m.matrixWorld));
    });
  }
  const size = box.getSize(new THREE.Vector3());
  const raw = sp.measure === 'height' ? size.y : sp.measure === 'span' ? Math.max(size.x, size.z) : Math.max(size.x, size.z);
  let skinned = false;
  scene.traverse((o) => {
    if ((o as THREE.SkinnedMesh).isSkinnedMesh) skinned = true;
    const m = o as THREE.Mesh;
    if (m.isMesh) {
      m.castShadow = true;
      m.receiveShadow = true;
      for (const mat of Array.isArray(m.material) ? m.material : [m.material]) worldMaterial(mat);
    }
  });
  return { template: scene, clips, scale: sp.size / Math.max(1e-6, raw), center: box.getCenter(new THREE.Vector3()), minY: box.min.y, skinned };
}

export interface Animal {
  root: THREE.Object3D;
  mixer: THREE.AnimationMixer | null;
  play: (name: string, fade?: number) => void;
}

function spawn(p: Prepared, sp: Species): Animal {
  const inner = p.skinned ? cloneSkinned(p.template) : p.template.clone(true);
  // Modell zentrieren, auf den Boden stellen, normieren, Kopf nach +z
  inner.position.set(-p.center.x, -p.minY, -p.center.z);
  const pivot = new THREE.Group();
  pivot.add(inner);
  pivot.scale.setScalar(p.scale);
  pivot.rotation.set(sp.pitch ?? 0, sp.yaw, 0);
  const root = new THREE.Group();
  root.add(pivot);
  let mixer: THREE.AnimationMixer | null = null;
  let current: THREE.AnimationAction | null = null;
  const play = (name: string, fade = 0.25) => {
    if (!mixer) return;
    const clip = p.clips.find((c) => c.name.toLowerCase().includes(name.toLowerCase()));
    if (!clip) return;
    const action = mixer.clipAction(clip);
    if (action === current) return;
    action.reset().fadeIn(fade).play();
    current?.fadeOut(fade);
    current = action;
  };
  if (p.clips.length) {
    mixer = new THREE.AnimationMixer(inner);
    if (sp.clip) play(sp.clip, 0);
    mixer.update(Math.random() * 2);
  }
  return { root, mixer, play };
}

// ---------------------------------------------------------------------------

export interface AnimalWorld {
  group: THREE.Group;
  update: (t: number, dt: number) => void;
}

interface Ctx {
  layout: IslandLayout;
  field: Heightfield;
  canopies: THREE.Vector3[];
  flowers: THREE.Vector3[];
  perches: THREE.Vector3[];
  quality: 'beauty' | 'fast';
  /** Effekt: Wasser spritzt (Delfinsprung, Walfontäne) */
  splash?: (x: number, y: number, z: number, big: boolean) => void;
}

const headingTo = (dx: number, dz: number) => Math.atan2(dx, dz);

export async function buildAnimals(ctx: Ctx): Promise<AnimalWorld> {
  const group = new THREE.Group();
  group.name = 'animals';
  const R = rand(31337);
  const prepared = new Map<SpeciesName, Prepared>();
  const names = Object.keys(SPECIES) as SpeciesName[];
  const results = await Promise.allSettled(names.map(async (n) => [n, await prepare(SPECIES[n])] as const));
  for (const r of results) if (r.status === 'fulfilled') prepared.set(r.value[0], r.value[1]);
  const make = (n: SpeciesName): Animal | null => {
    const p = prepared.get(n);
    if (!p) return null;
    const a = spawn(p, SPECIES[n]);
    group.add(a.root);
    return a;
  };
  const updaters: ((t: number, dt: number) => void)[] = [];
  const mixers: THREE.AnimationMixer[] = [];
  const track = (a: Animal | null) => {
    if (a?.mixer) mixers.push(a.mixer);
    return a;
  };
  const many = ctx.quality === 'beauty' ? 1 : 0.5;
  const { field } = ctx;

  if (new URLSearchParams(location.search).has('zoo')) {
    // Aufstellung zum Prüfen von Größe und Blickrichtung (Kopf sollte zur Kamera/Süden zeigen)
    names.forEach((n, i) => {
      const a = track(make(n));
      if (!a) return;
      const x = -16 + (i % 6) * 6.5;
      const z = 14 + Math.floor(i / 6) * 7;
      a.root.position.set(x, 9, z);
      a.root.scale.setScalar(3 / SPECIES[n].size);
    });
    return {
      group,
      update(_t, dt) {
        for (const m of mixers) m.update(dt);
      },
    };
  }

  // --- Delfine: Schule zieht um die Insel und springt ---------------------------
  for (let pod = 0; pod < 2; pod++) {
    const members: { a: Animal; off: number; side: number; jumpAt: number; jump: number }[] = [];
    for (let k = 0; k < 3; k++) {
      const a = track(make('dolphin'));
      if (a) members.push({ a, off: k * 0.05, side: (k - 1) * 2.2, jumpAt: 3 + R() * 6, jump: -1 });
    }
    const radius = pod === 0 ? 56 : 64;
    const speed = (pod === 0 ? 0.045 : -0.038) * (0.9 + R() * 0.2);
    const phase0 = R() * Math.PI * 2;
    updaters.push((t, dt) => {
      for (const m of members) {
        const a = phase0 + t * speed - m.off * Math.sign(speed);
        const r = radius + m.side;
        const x = Math.cos(a) * r;
        const z = Math.sin(a) * r * 0.92;
        const dx = -Math.sin(a) * Math.sign(speed);
        const dz = Math.cos(a) * 0.92 * Math.sign(speed);
        // Sprung: Bogen aus dem Wasser
        m.jumpAt -= dt;
        if (m.jump < 0 && m.jumpAt <= 0) {
          m.jump = 0;
          m.jumpAt = 4 + R() * 9;
          ctx.splash?.(x, 0, z, false);
        }
        let y = -0.55 + Math.sin(t * 1.3 + m.side) * 0.1;
        let pitch = 0;
        if (m.jump >= 0) {
          m.jump += dt / 1.25;
          const u = m.jump;
          y = -0.5 + Math.sin(u * Math.PI) * 2.1;
          pitch = -Math.cos(u * Math.PI) * 0.9;
          if (m.jump >= 1) {
            m.jump = -1;
            ctx.splash?.(x, 0, z, false);
          }
        }
        m.a.root.position.set(x, y, z);
        m.a.root.rotation.set(0, headingTo(dx, dz), 0);
        (m.a.root.children[0] as THREE.Object3D).rotation.x = pitch;
      }
    });
  }

  // --- Wal weit draußen mit Fontäne ---------------------------------------------
  {
    const w = track(make('whale'));
    if (w) {
      let spoutAt = 6;
      updaters.push((t, dt) => {
        const a = 2.4 + t * 0.008;
        const x = Math.cos(a) * 110;
        const z = Math.sin(a) * 100;
        const breathe = Math.max(0, Math.sin(t * 0.25));
        w.root.position.set(x, -2.6 + breathe * 1.9, z);
        w.root.rotation.y = headingTo(-Math.sin(a), Math.cos(a));
        spoutAt -= dt;
        if (spoutAt <= 0 && breathe > 0.8) {
          spoutAt = 7;
          ctx.splash?.(x, 1.2, z, true);
        }
      });
    }
  }

  // --- Fischschwärme im flachen, klaren Wasser -----------------------------------
  const schools = [
    { x: LAGOON.x, z: LAGOON.z, r: 2.8, y: -0.45, kind: 'clownfish' as const },
    { x: LAGOON.x - 1.5, z: LAGOON.z + 1.5, r: 1.8, y: -0.55, kind: 'fish' as const },
    { x: -30, z: 24, r: 2.6, y: -0.6, kind: 'fish2' as const },
    { x: 8, z: 36, r: 3.2, y: -0.7, kind: 'fish' as const },
    { x: 40, z: 22, r: 3, y: -0.8, kind: 'fish2' as const },
    { x: -40, z: 6, r: 3, y: -0.8, kind: 'clownfish' as const },
  ];
  for (const s of schools) {
    const n = Math.round(7 * many);
    const fish: { a: Animal; ph: number; rr: number; dy: number }[] = [];
    for (let k = 0; k < n; k++) {
      const a = track(make(s.kind));
      if (a) fish.push({ a, ph: (k / n) * Math.PI * 2 + R() * 0.4, rr: s.r * (0.6 + R() * 0.5), dy: (R() - 0.5) * 0.25 });
    }
    const dir = R() < 0.5 ? 1 : -1;
    updaters.push((t) => {
      for (const f of fish) {
        const a = f.ph + t * 0.35 * dir;
        const wob = Math.sin(t * 0.7 + f.ph * 3) * 0.4;
        const x = s.x + Math.cos(a) * (f.rr + wob);
        const z = s.z + Math.sin(a) * (f.rr + wob);
        f.a.root.position.set(x, s.y + f.dy + Math.sin(t * 2 + f.ph) * 0.05, z);
        f.a.root.rotation.y = headingTo(-Math.sin(a) * dir, Math.cos(a) * dir);
      }
    });
  }

  // --- Mantarochen und Meeresschildkröten ziehen durchs Flachwasser --------------
  const glider = (kind: SpeciesName, cx: number, cz: number, rx: number, rz: number, y: number, speed: number) => {
    const a0 = R() * 6;
    const an = track(make(kind));
    if (!an) return;
    updaters.push((t) => {
      const a = a0 + t * speed;
      const x = cx + Math.cos(a) * rx;
      const z = cz + Math.sin(a) * rz;
      an.root.position.set(x, y + Math.sin(t * 0.8 + a0) * 0.12, z);
      an.root.rotation.y = headingTo(-Math.sin(a) * rx * Math.sign(speed), Math.cos(a) * rz * Math.sign(speed));
      an.root.rotation.z = Math.sin(t * 0.9 + a0) * 0.12;
    });
  };
  glider('manta', 10, 40, 9, 4, -1.1, 0.06);
  glider('manta', 44, -18, 6, 8, -1.3, -0.05);
  glider('turtle', -10, 37, 7, 3, -0.45, -0.07);
  glider('turtle', 33, 30, 4, 3, -0.4, 0.09);
  glider('turtle', -45, 12, 3, 6, -0.6, 0.06);

  // --- Krabben laufen am Strand hin und her --------------------------------------
  const beachSpots: THREE.Vector3[] = [];
  for (let i = 0; i < 900 && beachSpots.length < Math.round(9 * many); i++) {
    const x = (R() - 0.5) * 92;
    const z = (R() - 0.5) * 76;
    const h = field.height(x, z);
    const cd = coastDistance(x, z);
    if (h < 0.35 || h > 1.0 || cd < 0.5 || cd > 4.5 || field.pathDistance(x, z) < 1.8) continue;
    beachSpots.push(new THREE.Vector3(x, h, z));
  }
  for (const sp of beachSpots) {
    const c = track(make('crab'));
    if (!c) continue;
    const dirA = R() * Math.PI;
    const len = 1.2 + R() * 1.4;
    const ph = R() * 6;
    let mode = 'Walk';
    updaters.push((t) => {
      const u = Math.sin(t * 0.45 + ph);
      const walking = Math.abs(Math.cos(t * 0.45 + ph)) > 0.25;
      const want = walking ? 'Walk' : Math.sin(t * 0.1 + ph) > 0.6 ? 'Dance' : 'Idle';
      if (want !== mode) {
        mode = want;
        c.play(want);
      }
      const x = sp.x + Math.cos(dirA) * u * len;
      const z = sp.z + Math.sin(dirA) * u * len;
      c.root.position.set(x, field.height(x, z) + 0.02, z);
      // seitwärts laufen: Blick quer zur Laufrichtung
      c.root.rotation.y = -dirA;
    });
  }

  // --- Frösche am Fluss und am Teich unter dem Wasserfall ------------------------
  for (let k = 0; k < Math.round(4 * many) + 1; k++) {
    const p = RIVER[RIVER_POOL + 1 + k * 2] ?? RIVER[RIVER_POOL]!;
    const side = k % 2 ? 1 : -1;
    const bx = p.x + side * (p.w + 0.6);
    const bz = p.z + side * 0.4;
    const f = track(make('frog'));
    if (!f) continue;
    let next = 2 + R() * 4;
    let hop = -1;
    let from = new THREE.Vector3(bx, field.height(bx, bz), bz);
    let to = from.clone();
    updaters.push((_t, dt) => {
      next -= dt;
      if (hop < 0 && next <= 0) {
        hop = 0;
        next = 3 + R() * 5;
        f.play('Jump', 0.1);
        const a = R() * Math.PI * 2;
        const x = bx + Math.cos(a) * 0.8;
        const z = bz + Math.sin(a) * 0.8;
        from = f.root.position.clone();
        to = new THREE.Vector3(x, field.height(x, z), z);
        f.root.rotation.y = headingTo(to.x - from.x, to.z - from.z);
      }
      if (hop >= 0) {
        hop += dt / 0.6;
        const u = Math.min(1, hop);
        f.root.position.lerpVectors(from, to, u);
        f.root.position.y += Math.sin(u * Math.PI) * 0.35;
        if (hop >= 1) {
          hop = -1;
          f.play('Idle', 0.2);
        }
      } else if (f.root.position.lengthSq() === 0) f.root.position.copy(from);
    });
  }

  // --- Flamingos in der Lagune ---------------------------------------------------
  for (let k = 0; k < Math.round(5 * many) + 1; k++) {
    const fl = make('flamingo');
    if (!fl) continue;
    const a = (k / 6) * Math.PI * 2 + R();
    const r = 2 + R() * 2.8;
    const x = LAGOON.x + Math.cos(a) * r;
    const z = LAGOON.z + Math.sin(a) * r;
    fl.root.position.set(x, Math.max(-0.75, field.height(x, z)) + 0.05, z);
    fl.root.rotation.y = R() * 6;
    const ph = R() * 6;
    updaters.push((t) => {
      // ab und zu den Kopf zum Wasser senken
      fl.root.rotation.x = Math.max(0, Math.sin(t * 0.3 + ph) - 0.6) * 0.6;
      fl.root.rotation.y += Math.sin(t * 0.2 + ph) * 0.0015;
    });
  }

  // --- Möwen: kreisen über Hafen, Klippen und Leuchtturm; einige sitzen ----------
  const circles = [
    { x: -27, z: 22, r: 7, y: 9 },
    { x: 41, z: -14, r: 6, y: 13 },
    { x: 8, z: -34, r: 9, y: 11 },
    { x: -38, z: -18, r: 8, y: 12 },
    { x: 20, z: 30, r: 10, y: 10 },
  ];
  for (const c of circles.slice(0, Math.round(circles.length * many) + 1)) {
    for (let k = 0; k < 2; k++) {
      const g = make('gull');
      if (!g) continue;
      const a0 = R() * 6;
      const sp = (0.32 + R() * 0.15) * (k ? 1 : -1);
      const rr = c.r * (0.8 + R() * 0.5);
      updaters.push((t) => {
        const a = a0 + t * sp;
        const x = c.x + Math.cos(a) * rr;
        const z = c.z + Math.sin(a) * rr;
        g.root.position.set(x, c.y + k * 1.5 + Math.sin(t * 0.7 + a0) * 0.6, z);
        g.root.rotation.set(0, headingTo(-Math.sin(a) * Math.sign(sp), Math.cos(a) * Math.sign(sp)), 0);
        (g.root.children[0] as THREE.Object3D).rotation.z = 0.35 * Math.sign(sp);
      });
    }
  }
  const sitting = ctx.perches.filter((p) => p.y < 6).slice(0, 4);
  for (const p of sitting) {
    const g = make('gullStand');
    if (!g) continue;
    g.root.position.copy(p);
    g.root.rotation.y = R() * 6;
  }

  // --- Papageien, Tukane und Affen in den Baumkronen und auf Ruinen ---------------
  const crowns = ctx.canopies.filter((c) => c.y > 3);
  const pickCrown = () => crowns[Math.floor(R() * crowns.length)];
  for (let k = 0; k < Math.round(6 * many) + 2; k++) {
    const kind: SpeciesName = k % 3 === 0 ? 'toucan' : 'parrot';
    const b = make(kind);
    const c = pickCrown();
    if (!b || !c) continue;
    b.root.position.set(c.x + (R() - 0.5) * 0.8, c.y + 0.2, c.z + (R() - 0.5) * 0.8);
    const ph = R() * 6;
    const base = R() * 6;
    updaters.push((t) => {
      b.root.rotation.y = base + Math.sin(t * 0.6 + ph) * 0.5 + (Math.sin(t * 0.13 + ph) > 0.9 ? 1.2 : 0);
    });
  }
  // ein Papagei fliegt Runden über den Dschungel
  {
    const b = make('parrot');
    if (b) {
      updaters.push((t) => {
        const a = t * 0.25;
        const x = 26 + Math.cos(a) * 8;
        const z = 8 + Math.sin(a * 1.3) * 6;
        const nx = 26 + Math.cos(a + 0.05) * 8;
        const nz = 8 + Math.sin((a + 0.05) * 1.3) * 6;
        b.root.position.set(x, 9 + Math.sin(a * 2) * 1.2, z);
        b.root.rotation.set(0.25, headingTo(nx - x, nz - z), Math.sin(t * 9) * 0.15);
      });
    }
  }
  const monkeySpots = [...ctx.perches.filter((p) => p.y > 2 && p.y < 12).slice(0, 3), ...crowns.slice(5, 9)];
  for (const p of monkeySpots.slice(0, Math.round(5 * many) + 1)) {
    const m = make('monkey');
    if (!m) continue;
    m.root.position.copy(p);
    const ph = R() * 6;
    const base = R() * 6;
    updaters.push((t) => {
      m.root.rotation.y = base + Math.sin(t * 0.5 + ph) * 0.7;
      m.root.position.y = p.y + Math.abs(Math.sin(t * 3 + ph)) * (Math.sin(t * 0.21 + ph) > 0.85 ? 0.25 : 0);
    });
  }
  // Landschildkröte am Wegesrand im Dschungel
  {
    const tt = make('tortoise');
    if (tt) {
      updaters.push((t) => {
        const u = Math.sin(t * 0.03) * 0.5 + 0.5;
        const x = 18 + u * 6;
        const z = 9 + Math.sin(u * 3) * 1.5;
        tt.root.position.set(x, field.height(x, z), z);
        tt.root.rotation.y = headingTo(Math.cos(t * 0.03) > 0 ? 1 : -1, 0);
      });
    }
  }

  // --- Schmetterlinge flattern über den Blumen ----------------------------------
  const flowers = ctx.flowers.slice(0, Math.round(16 * many));
  for (const f of flowers) {
    const b = make('butterfly');
    if (!b) continue;
    const ph = R() * 6;
    const tint = new THREE.Color().setHSL(R(), 0.8, 0.6);
    b.root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        m.castShadow = false;
        m.material = (m.material as THREE.MeshStandardMaterial).clone();
        (m.material as THREE.MeshStandardMaterial).color.lerp(tint, 0.6);
      }
    });
    const wings = b.root.children[0] as THREE.Object3D;
    const s0 = wings.scale.x;
    updaters.push((t) => {
      const x = f.x + Math.sin(t * 0.7 + ph) * 1.4 + Math.sin(t * 1.9 + ph * 2) * 0.3;
      const z = f.z + Math.cos(t * 0.6 + ph) * 1.4;
      const y = f.y + 0.3 + Math.abs(Math.sin(t * 2.2 + ph)) * 0.5;
      b.root.position.set(x, y, z);
      b.root.rotation.y = t * 0.7 + ph;
      wings.scale.x = s0 * (0.25 + Math.abs(Math.sin(t * 16 + ph)) * 0.75);
    });
  }

  return {
    group,
    update(t, dt) {
      for (const m of mixers) m.update(dt);
      for (const u of updaters) u(t, dt);
    },
  };
}
