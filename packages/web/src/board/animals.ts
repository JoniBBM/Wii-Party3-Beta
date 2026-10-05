/**
 * Tiere: Delfine springen vor der Küste, ein Wal bläst Fontänen, Fischschwärme, Mantarochen
 * und Meeresschildkröten im flachen Wasser, Krabben am Strand, Frösche am Fluss, Flamingos in
 * der Lagune, Möwen kreisen über Hafen und Leuchtturm, Papageien, Tukane und Affen in den
 * Bäumen und auf den Ruinen, Schmetterlinge über den Blumen.
 *
 * Meerestiere, Krabben, Frösche und Schildkröten: Quaternius/Poly-Modelle mit Animationen
 * (Teil-Meshes zu einem Mesh mit Vertex-Farben zusammengefasst). Affen, Vögel und Flamingos sind
 * prozedural (rig.ts, monkey.ts, birds.ts), Fische und Schmetterlinge instanziert mit
 * Bewegung im Vertex-Shader (swarms.ts).
 *
 * Leistung: Tiere im Blickfeld werden jedes Bild bewegt, alle anderen nur jedes 4. Bild.
 */
import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { LAGOON, RIVER, RIVER_POOL } from '@insel/shared';
import { loadModel, worldMaterial } from './assets.ts';
import { circlePath, eightPath, Flamingo, FlyingBird, PerchBird, type BirdKind, type BirdSpot, type FlightPath } from './birds.ts';
import { coastDistance } from './ground.ts';
import type { IslandLayout } from './layout.ts';
import { Monkey, type MonkeySpot } from './monkey.ts';
import { rand } from './noise.ts';
import type { Agent, AgentCtx } from './rig.ts';
import { buildButterflies, buildSchool, type FishKind } from './swarms.ts';
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
  /** wirft Schatten (nur an Land) */
  shadow: boolean;
}

const SPECIES = {
  dolphin: { file: 'dolphin', size: 2.3, measure: 'length', yaw: 0, clip: 'Swim', shadow: false },
  whale: { file: 'whale', size: 10, measure: 'length', yaw: 0, clip: 'Swim', shadow: false },
  manta: { file: 'manta', size: 2.4, measure: 'span', yaw: 0, clip: 'Swim', shadow: false },
  crab: { file: 'crab', size: 0.5, measure: 'span', yaw: 0, clip: 'Walk', shadow: true },
  frog: { file: 'frog', size: 0.34, measure: 'length', yaw: 0, clip: 'Idle', shadow: true },
  turtle: { file: 'turtle2', size: 1.1, measure: 'length', yaw: 0, shadow: false },
  tortoise: { file: 'turtle', size: 0.7, measure: 'length', yaw: 0, shadow: true },
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

/**
 * Teil-Meshes eines Modells (ein Mesh je Material) zu einem Mesh mit Vertex-Farben
 * zusammenfassen: aus 2–6 Draw-Calls je Tier wird einer.
 */
function flatten(scene: THREE.Object3D) {
  const byParent = new Map<THREE.Object3D, THREE.Mesh[]>();
  scene.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || !m.parent) return;
    const list = byParent.get(m.parent) ?? [];
    list.push(m);
    byParent.set(m.parent, list);
  });
  for (const [parent, meshes] of byParent) {
    if (meshes.length < 2) continue;
    const mats = meshes.map((m) => m.material);
    if (mats.some((mt) => Array.isArray(mt) || (mt as THREE.MeshStandardMaterial).map || mt.transparent)) continue;
    const skins = meshes.map((m) => (m as THREE.SkinnedMesh).isSkinnedMesh === true);
    if (skins.some((s) => s !== skins[0])) continue;
    const skinned = skins[0]!;
    const first = meshes[0] as THREE.SkinnedMesh;
    if (skinned && meshes.some((m) => (m as THREE.SkinnedMesh).skeleton !== first.skeleton || !(m as THREE.SkinnedMesh).bindMatrix.equals(first.bindMatrix))) continue;
    const keep = skinned ? ['position', 'normal', 'skinIndex', 'skinWeight'] : ['position', 'normal'];
    const geos = meshes.map((m) => {
      const g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
      const color = (m.material as THREE.MeshStandardMaterial).color ?? new THREE.Color(1, 1, 1);
      const own = g.attributes.color as THREE.BufferAttribute | undefined;
      for (const k of Object.keys(g.attributes)) if (!keep.includes(k)) g.deleteAttribute(k);
      if (!g.attributes.normal) g.computeVertexNormals();
      // nicht gehäutete Teile dürfen eigene Lagen haben → in die Geometrie übernehmen
      if (!skinned) {
        m.updateMatrix();
        g.applyMatrix4(m.matrix);
      }
      const n = g.attributes.position!.count;
      const col = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        col[i * 3] = color.r * (own ? own.getX(i) : 1);
        col[i * 3 + 1] = color.g * (own ? own.getY(i) : 1);
        col[i * 3 + 2] = color.b * (own ? own.getZ(i) : 1);
      }
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      return g;
    });
    const geo = mergeGeometries(geos, false);
    for (const g of geos) g.dispose();
    if (!geo) continue;
    const mat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: Math.max(0.75, (mats[0] as THREE.MeshStandardMaterial).roughness ?? 1),
      metalness: 0,
    });
    worldMaterial(mat);
    let mesh: THREE.Mesh;
    if (skinned) {
      const sk = new THREE.SkinnedMesh(geo, mat);
      sk.position.copy(first.position);
      sk.quaternion.copy(first.quaternion);
      sk.scale.copy(first.scale);
      sk.bindMode = first.bindMode;
      sk.bind(first.skeleton, first.bindMatrix);
      mesh = sk;
    } else mesh = new THREE.Mesh(geo, mat);
    mesh.name = first.name;
    parent.add(mesh);
    for (const m of meshes) parent.remove(m);
  }
}

async function prepare(sp: Species): Promise<Prepared> {
  const scene = await loadModel(`animals/${sp.file}`);
  flatten(scene);
  const clips = (scene.userData.animations as THREE.AnimationClip[] | undefined) ?? [];
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
  const raw = sp.measure === 'height' ? size.y : Math.max(size.x, size.z);
  let skinned = false;
  scene.traverse((o) => {
    if ((o as THREE.SkinnedMesh).isSkinnedMesh) skinned = true;
    const m = o as THREE.Mesh;
    if (m.isMesh) {
      m.castShadow = sp.shadow;
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
  pivot.rotation.set(0, sp.yaw, 0);
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
  // Sichtbarkeitsprüfung wieder an: Kugel aus der verformten Pose, großzügig erweitert
  root.updateMatrixWorld(true);
  inner.traverse((o) => {
    const m = o as THREE.SkinnedMesh;
    if (!m.isSkinnedMesh) return;
    m.computeBoundingSphere();
    if (m.boundingSphere && Number.isFinite(m.boundingSphere.radius) && m.boundingSphere.radius > 0) {
      m.boundingSphere.radius *= 1.6;
      m.frustumCulled = true;
    }
  });
  return { root, mixer, play };
}

// ---------------------------------------------------------------------------

export interface AnimalWorld {
  group: THREE.Group;
  update: (t: number, dt: number, camera: THREE.Camera) => void;
}

interface Ctx {
  layout: IslandLayout;
  field: Heightfield;
  canopies: THREE.Vector3[];
  flowers: THREE.Vector3[];
  perches: THREE.Vector3[];
  /** Anteil der Tiere (1 = alle, 0.5 = halb so viele) */
  detail: number;
  /** Effekt: Wasser spritzt (Delfinsprung, Walfontäne) */
  splash?: (x: number, y: number, z: number, big: boolean) => void;
}

const headingTo = (dx: number, dz: number) => Math.atan2(dx, dz);

/** Tiere im Blickfeld jedes Bild bewegen, die übrigen jedes 4. Bild (mit aufgelaufener Zeit). */
const NEAR = 18;
const SLOW_EVERY = 4;

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

  const agents: (Agent & { acc: number; slot: number })[] = [];
  const addAgent = (a: Agent) => {
    agents.push({ obj: a.obj, radius: a.radius, update: a.update.bind(a), acc: 0, slot: agents.length % SLOW_EVERY });
  };
  /** Modell-Tier als Agent: eigene Bewegung + Animation */
  const animal = (a: Animal | null, radius: number, fn: (t: number, dt: number) => void) => {
    if (!a) return;
    addAgent({
      obj: a.root,
      radius,
      update: (t, dt) => {
        fn(t, dt);
        a.mixer?.update(dt);
      },
    });
  };
  const many = Math.max(0.25, Math.min(1, ctx.detail));
  const { field } = ctx;

  const world: AnimalWorld = {
    group,
    update: (() => {
      const frustum = new THREE.Frustum();
      const pv = new THREE.Matrix4();
      const sphere = new THREE.Sphere();
      const actx: AgentCtx = { cam: new THREE.Vector3(), visible: true };
      let frame = 0;
      return (t: number, dt: number, camera: THREE.Camera) => {
        frame++;
        pv.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
        frustum.setFromProjectionMatrix(pv);
        camera.getWorldPosition(actx.cam);
        for (const a of agents) {
          a.acc += dt;
          const pos = a.obj.position;
          sphere.center.copy(pos);
          sphere.radius = a.radius;
          const vis = pos.distanceToSquared(actx.cam) < NEAR * NEAR || frustum.intersectsSphere(sphere);
          if (!vis && (frame + a.slot) % SLOW_EVERY !== 0) continue;
          actx.visible = vis;
          a.update(t, Math.min(0.25, a.acc), actx);
          a.acc = 0;
        }
      };
    })(),
  };

  if (new URLSearchParams(location.search).has('zoo')) {
    buildZoo(group, addAgent, make, R);
    return world;
  }

  // --- Delfine: Schule zieht um die Insel und springt ---------------------------
  for (let pod = 0; pod < 2; pod++) {
    const radius = pod === 0 ? 56 : 64;
    const speed = (pod === 0 ? 0.045 : -0.038) * (0.9 + R() * 0.2);
    const phase0 = R() * Math.PI * 2;
    for (let k = 0; k < 3; k++) {
      const a = make('dolphin');
      if (!a) continue;
      const off = k * 0.05;
      const side = (k - 1) * 2.2;
      let jumpAt = 3 + R() * 6;
      let jump = -1;
      animal(a, 2.5, (t, dt) => {
        const ang = phase0 + t * speed - off * Math.sign(speed);
        const r = radius + side;
        const x = Math.cos(ang) * r;
        const z = Math.sin(ang) * r * 0.92;
        const dx = -Math.sin(ang) * Math.sign(speed);
        const dz = Math.cos(ang) * 0.92 * Math.sign(speed);
        // Sprung: Bogen aus dem Wasser
        jumpAt -= dt;
        if (jump < 0 && jumpAt <= 0) {
          jump = 0;
          jumpAt = 4 + R() * 9;
          ctx.splash?.(x, 0, z, false);
        }
        let y = -0.55 + Math.sin(t * 1.3 + side) * 0.1;
        let pitch = 0;
        if (jump >= 0) {
          jump += dt / 1.25;
          const u = Math.min(1, jump);
          y = -0.5 + Math.sin(u * Math.PI) * 2.1;
          pitch = -Math.cos(u * Math.PI) * 0.9;
          if (jump >= 1) {
            jump = -1;
            ctx.splash?.(x, 0, z, false);
          }
        }
        a.root.position.set(x, y, z);
        a.root.rotation.set(0, headingTo(dx, dz), 0);
        (a.root.children[0] as THREE.Object3D).rotation.x = pitch;
      });
    }
  }

  // --- Wal weit draußen mit Fontäne ---------------------------------------------
  {
    const w = make('whale');
    let spoutAt = 6;
    animal(w, 8, (t, dt) => {
      const a = 2.4 + t * 0.008;
      const x = Math.cos(a) * 110;
      const z = Math.sin(a) * 100;
      const breathe = Math.max(0, Math.sin(t * 0.25));
      w!.root.position.set(x, -2.6 + breathe * 1.9, z);
      w!.root.rotation.y = headingTo(-Math.sin(a), Math.cos(a));
      spoutAt -= dt;
      if (spoutAt <= 0 && breathe > 0.8) {
        spoutAt = 7;
        ctx.splash?.(x, 1.2, z, true);
      }
    });
  }

  // --- Fischschwärme im flachen, klaren Wasser (je Schwarm ein Draw-Call) ---------
  const schools: { x: number; z: number; r: number; y: number; kind: FishKind; size: number }[] = [
    { x: LAGOON.x, z: LAGOON.z, r: 2.8, y: -0.45, kind: 'clown', size: 0.3 },
    { x: LAGOON.x - 1.5, z: LAGOON.z + 1.5, r: 1.8, y: -0.55, kind: 'tang', size: 0.4 },
    { x: -30, z: 24, r: 2.6, y: -0.6, kind: 'yellow', size: 0.42 },
    { x: 8, z: 36, r: 3.2, y: -0.7, kind: 'tang', size: 0.42 },
    { x: 40, z: 22, r: 3, y: -0.8, kind: 'yellow', size: 0.45 },
    { x: -40, z: 6, r: 3, y: -0.8, kind: 'clown', size: 0.32 },
  ];
  for (const s of schools) group.add(buildSchool({ ...s, count: Math.round(9 * many) }, R));

  // --- Mantarochen und Meeresschildkröten ziehen durchs Flachwasser --------------
  const glider = (kind: SpeciesName, cx: number, cz: number, rx: number, rz: number, y: number, speed: number) => {
    const a0 = R() * 6;
    const an = make(kind);
    animal(an, 2, (t) => {
      const a = a0 + t * speed;
      const x = cx + Math.cos(a) * rx;
      const z = cz + Math.sin(a) * rz;
      an!.root.position.set(x, y + Math.sin(t * 0.8 + a0) * 0.12, z);
      an!.root.rotation.y = headingTo(-Math.sin(a) * rx * Math.sign(speed), Math.cos(a) * rz * Math.sign(speed));
      an!.root.rotation.z = Math.sin(t * 0.9 + a0) * 0.12;
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
    const c = make('crab');
    if (!c) continue;
    const dirA = R() * Math.PI;
    const len = 1.2 + R() * 1.4;
    const ph = R() * 6;
    let mode = 'Walk';
    animal(c, 0.5, (t) => {
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
    const f = make('frog');
    if (!f) continue;
    let next = 2 + R() * 4;
    let hop = -1;
    let from = new THREE.Vector3(bx, field.height(bx, bz), bz);
    let to = from.clone();
    f.root.position.copy(from);
    animal(f, 0.5, (_t, dt) => {
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
      }
    });
  }

  // --- Flamingos in der Lagune ---------------------------------------------------
  {
    const n = Math.round(6 * many);
    const placed: THREE.Vector3[] = [];
    // Pfahlhütte mit Kanu in der Lagune freihalten
    const huts = ctx.perches.filter((p) => field.height(p.x, p.z) < 0.2);
    for (let i = 0; i < 400 && placed.length < n; i++) {
      const a = R() * Math.PI * 2;
      const r = 1.5 + R() * (LAGOON.r - 1);
      const x = LAGOON.x + Math.cos(a) * r;
      const z = LAGOON.z + Math.sin(a) * r;
      const h = field.height(x, z);
      // im flachen Wasser stehen, nicht zu dicht beieinander
      if (h < -0.55 || h > 0.05 || placed.some((p) => Math.hypot(p.x - x, p.z - z) < 1.3)) continue;
      if (huts.some((p) => Math.hypot(p.x - x, p.z - z) < 3.4)) continue;
      placed.push(new THREE.Vector3(x, h, z));
    }
    for (const p of placed) {
      const f = new Flamingo(p, R, (x, z) => Math.max(-0.55, field.height(x, z)), 0.95 + R() * 0.15);
      group.add(f.root);
      addAgent(f);
    }
  }

  // --- Affen in den Baumkronen und auf den Ruinen ---------------------------------
  const { spots, branches, lookout } = monkeySpots(ctx, R);
  if (branches) group.add(branches);
  const placeMonkey = (s: MonkeySpot) => {
    const m = new Monkey(s, R);
    group.add(m.root);
    addAgent(m);
  };
  // einer thront auf dem Tempel der Pyramide
  if (lookout) placeMonkey(lookout);
  // die übrigen in Trupps: an Ästen (zum Hängen), auf Kronen und Säulen
  const free = spots.filter((s) => s.next.length > 0);
  free.sort((a, b) => Number(b.hang) - Number(a.hang));
  for (let k = lookout ? 1 : 0; k < Math.round(8 * many) && free.length; k++) {
    const i = k < 3 && free[0]!.hang ? 0 : Math.floor(R() * free.length);
    const s = free.splice(i, 1)[0]!;
    // Nachbarn nicht alle besetzen, damit es Sprungziele gibt
    for (const nb of s.next) {
      const j = free.indexOf(nb);
      if (j >= 0 && R() < 0.6) free.splice(j, 1);
    }
    placeMonkey(s);
  }

  // --- Papageien und Tukane in den Kronen, einige fliegen ------------------------
  {
    const used = new Set(spots.map((s) => `${s.p.x.toFixed(1)}|${s.p.z.toFixed(1)}`));
    const birdSpots: BirdSpot[] = ctx.canopies
      .filter((c) => {
        const h = c.y - field.height(c.x, c.z);
        return h > 2.5 && h < 7 && c.y < 10 && !used.has(`${c.x.toFixed(1)}|${c.z.toFixed(1)}`);
      })
      .map((c) => ({ p: new THREE.Vector3(c.x, c.y + 0.3, c.z), taken: false }));
    // bevorzugt nahe am Weg (dort schaut die Kamera hin)
    birdSpots.sort((a, b) => field.pathDistance(a.p.x, a.p.z) - field.pathDistance(b.p.x, b.p.z));
    const near = birdSpots.slice(0, 40);
    const n = Math.round(8 * many);
    for (let k = 0; k < n && near.length; k++) {
      const s = near[Math.floor(R() * near.length)]!;
      if (s.taken) continue;
      const kind: BirdKind = k % 3 === 2 ? 'toucan' : 'parrot';
      const b = new PerchBird(kind, s, near, R, kind === 'toucan' ? 1.05 : 1);
      group.add(b.root);
      addAgent(b);
    }
    const flyers: [BirdKind, FlightPath, number][] = [
      ['parrot', eightPath(26, 6, 9, 6, 9.5, 0.22, 0), 4.2],
      ['parrot', eightPath(25, 7, 8, 7, 10.5, 0.2, 2.2), 4.4],
      ['toucan', circlePath(-2, 18, 9, 10, -0.24, 1), 3.6],
    ];
    for (const [kind, path, hz] of flyers.slice(0, Math.max(1, Math.round(flyers.length * many)))) {
      const b = new FlyingBird(kind, path, R, 1.1, hz);
      group.add(b.root);
      addAgent(b);
    }
  }

  // --- Möwen: kreisen über Hafen, Klippen und Leuchtturm; einige sitzen ----------
  {
    const circles = [
      { x: -27, z: 22, r: 7, y: 9 },
      { x: 41, z: -14, r: 6, y: 13 },
      { x: 8, z: -34, r: 9, y: 11 },
      { x: -38, z: -18, r: 8, y: 12 },
      { x: 20, z: 30, r: 10, y: 10 },
    ];
    for (const c of circles.slice(0, Math.max(2, Math.round(circles.length * many)))) {
      for (let k = 0; k < 2; k++) {
        const sp = (0.3 + R() * 0.12) * (k ? 1 : -1);
        const g = new FlyingBird('gull', circlePath(c.x, c.z, c.r * (0.8 + R() * 0.5), c.y + k * 1.5, sp, R() * 6), R, 1, 2.6 + R() * 0.6);
        group.add(g.root);
        addAgent(g);
      }
    }
    const roofs: BirdSpot[] = ctx.perches
      .filter((p) => p.y < 6 && p.y - Math.max(0, field.height(p.x, p.z)) > 2.6)
      .map((p) => ({ p: p.clone(), taken: false }));
    for (const s of roofs.slice(0, Math.round(4 * many))) {
      const g = new PerchBird('gull', s, roofs, R, 1);
      group.add(g.root);
      addAgent(g);
    }
  }

  // Landschildkröte am Wegesrand im Dschungel
  {
    const tt = make('tortoise');
    animal(tt, 0.6, (t) => {
      const u = Math.sin(t * 0.03) * 0.5 + 0.5;
      const x = 18 + u * 6;
      const z = 9 + Math.sin(u * 3) * 1.5;
      tt!.root.position.set(x, field.height(x, z), z);
      tt!.root.rotation.y = headingTo(Math.cos(t * 0.03) > 0 ? 1 : -1, 0);
    });
  }

  // --- Schmetterlinge flattern über den Blumen (alle in einem Draw-Call) ----------
  {
    const beds = ctx.flowers;
    const spots: THREE.Vector3[] = [];
    const n = Math.round(beds.length * 1.4 * many);
    for (let i = 0; i < n && beds.length; i++) spots.push(beds[i % beds.length]!);
    if (spots.length) group.add(buildButterflies(spots, R));
  }

  return world;
}

// ---------------------------------------------------------------------------
// Sitzplätze der Affen
// ---------------------------------------------------------------------------

/**
 * Kronen im Dschungel, Äste (zum Hängen, ragen zum Weg hin aus der Krone) und Säulen der
 * Ruinen, verbunden zu Sprungwegen; dazu ein Aussichtsplatz auf dem Tempel der Pyramide.
 */
function monkeySpots(ctx: Ctx, R: () => number): { spots: MonkeySpot[]; branches: THREE.Mesh | null; lookout: MonkeySpot | null } {
  const { field } = ctx;
  const spots: MonkeySpot[] = [];
  const sticks: { a: THREE.Vector3; b: THREE.Vector3 }[] = [];
  const clear = ctx.layout.fieldRadius * 1.5;
  // Baumkronen im Dschungel (Ostseite), nicht die hohen Bäume der Hochebenen
  const jungle = ctx.canopies.filter((c) => {
    const h = c.y - field.height(c.x, c.z);
    return c.x > 11 && c.z > -14 && c.z < 19 && h > 3 && h < 6.5;
  });
  for (const c of jungle) spots.push({ p: new THREE.Vector3(c.x, c.y + 0.35, c.z), hang: false, next: [], taken: false });
  // Äste: an Kronen nahe am Weg, zur offenen Seite hin
  const maxBranches = 6;
  for (const c of [...jungle].sort((a, b) => field.pathDistance(a.x, a.z) - field.pathDistance(b.x, b.z))) {
    if (sticks.length >= maxBranches) break;
    const g = field.height(c.x, c.z);
    const H = (c.y - g) / 0.85;
    const L = 0.36 * H + 0.9;
    // Richtung, in der der Weg am schnellsten näher kommt
    let best = 0;
    let bestD = Infinity;
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2;
      const d = field.pathDistance(c.x + Math.cos(a) * 2.5, c.z + Math.sin(a) * 2.5);
      if (d < bestD) {
        bestD = d;
        best = a;
      }
    }
    const a = best + (R() - 0.5) * 0.5;
    const dir = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
    const base = new THREE.Vector3(c.x, g + 0.4 * H, c.z);
    const tip = base.clone().addScaledVector(dir, L);
    tip.y = g + 0.47 * H;
    // nicht über dem Weg, Platz unter dem Ast, keine andere Krone im Weg
    if (field.pathDistance(tip.x, tip.z) < clear) continue;
    if (field.height(tip.x, tip.z) > tip.y - 1.2) continue;
    if (ctx.canopies.some((o) => o !== c && Math.hypot(o.x - tip.x, o.z - tip.z) < 1.6 && o.y > tip.y - 1.5)) continue;
    if (sticks.some((s) => s.b.distanceTo(tip) < 2.5)) continue;
    sticks.push({ a: base, b: tip });
    const f = (L - 0.62) / L;
    const p = base.clone().lerp(tip, f);
    p.y += 0.07;
    spots.push({ p, hang: true, next: [], taken: false });
  }
  // Säulen der Allee (1,6–2,3 m hoch)
  for (const p of ctx.perches) {
    const h = p.y - field.height(p.x, p.z);
    if (h < 1.4 || h > 2.6) continue;
    spots.push({ p: p.clone(), hang: false, next: [], taken: false });
  }
  for (const a of spots)
    for (const b of spots) {
      if (a === b) continue;
      const d = Math.hypot(a.p.x - b.p.x, a.p.z - b.p.z);
      if (d > 1.2 && d < 5.5 && Math.abs(a.p.y - b.p.y) < 2.6) a.next.push(b);
    }
  // Tempel auf der Pyramide (höchster Sitzplatz an Land unter 10 m)
  const temple = ctx.perches.find((p) => p.y < 10 && p.y - field.height(p.x, p.z) > 4.5 && field.height(p.x, p.z) > 1);
  const lookout = temple ? { p: temple.clone(), hang: false, next: [], taken: false } : null;
  return { spots, branches: branchMesh(sticks), lookout };
}

/** Äste mit Blätterbüscheln als ein statisches Mesh. */
function branchMesh(list: { a: THREE.Vector3; b: THREE.Vector3 }[]): THREE.Mesh | null {
  if (!list.length) return null;
  const geos: THREE.BufferGeometry[] = [];
  const bark = new THREE.Color('#8a5a3a');
  const leaf = new THREE.Color('#3f9634');
  const leafDark = new THREE.Color('#2a7731');
  const up = new THREE.Vector3(0, 1, 0);
  const q = new THREE.Quaternion();
  const m = new THREE.Matrix4();
  const add = (src: THREE.BufferGeometry, c: THREE.Color, mat: THREE.Matrix4) => {
    const g = src.index ? src.toNonIndexed() : src.clone();
    g.deleteAttribute('uv');
    g.applyMatrix4(mat);
    const n = g.attributes.position!.count;
    const col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) col.set([c.r, c.g, c.b], i * 3);
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geos.push(g);
  };
  const blob = new THREE.IcosahedronGeometry(1, 0);
  for (const { a, b } of list) {
    const d = b.clone().sub(a);
    const L = d.length();
    d.normalize();
    q.setFromUnitVectors(up, d);
    m.compose(a.clone().addScaledVector(d, L / 2), q, new THREE.Vector3(1, 1, 1));
    add(new THREE.CylinderGeometry(0.05, 0.1, L, 7), bark, m);
    // Zweig nach oben und Blätterbüschel an der Spitze
    const twigBase = a.clone().lerp(b, 0.42);
    const twigDir = d.clone().add(new THREE.Vector3(0, 1.6, 0)).normalize();
    m.compose(twigBase.clone().addScaledVector(twigDir, 0.25), q.clone().setFromUnitVectors(up, twigDir), new THREE.Vector3(1, 1, 1));
    add(new THREE.CylinderGeometry(0.025, 0.04, 0.5, 5), bark, m);
    m.compose(twigBase.clone().addScaledVector(twigDir, 0.55), new THREE.Quaternion(), new THREE.Vector3(0.32, 0.26, 0.32));
    add(blob, leafDark, m);
    m.compose(b.clone().addScaledVector(d, 0.14).add(new THREE.Vector3(0, 0.06, 0)), new THREE.Quaternion().setFromAxisAngle(up, L), new THREE.Vector3(0.27, 0.22, 0.25));
    add(blob, leaf, m);
  }
  const geo = mergeGeometries(geos, false);
  for (const g of geos) g.dispose();
  if (!geo) return null;
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, flatShading: true });
  worldMaterial(mat);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'branches';
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

// ---------------------------------------------------------------------------
// Zoo (?zoo): alle Tierarten nebeneinander über dem Meer im Süden
// ---------------------------------------------------------------------------
function buildZoo(group: THREE.Group, addAgent: (a: Agent) => void, make: (n: SpeciesName) => Animal | null, R: () => number) {
  const Z = 48;
  const Y = 2;
  // Ast als Sitzstange für die Affen
  const branch = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 16, 10), new THREE.MeshStandardMaterial({ color: '#7a5434', roughness: 0.9 }));
  branch.rotation.z = Math.PI / 2;
  branch.position.set(0, Y - 0.06, Z);
  group.add(branch);
  const states = [['sit', 'scratch'], ['eat'], ['look'], ['hang'], ['wave'], ['crouch', 'sit']] as const;
  const spots: MonkeySpot[] = [];
  for (let i = 0; i < 7; i++) spots.push({ p: new THREE.Vector3(-6 + i * 1.7, Y, Z), hang: true, next: [], taken: false });
  spots[5]!.next.push(spots[6]!);
  spots[6]!.next.push(spots[5]!);
  states.forEach((seq, i) => {
    const m = new Monkey(spots[i]!, R);
    m.demo = [...seq];
    group.add(m.root);
    addAgent(m);
  });
  // Vögel: sitzend auf einem zweiten Ast, fliegend auf der Stelle, Flamingo im Wasser
  const perch = branch.clone();
  perch.scale.set(1, 0.3, 1);
  perch.position.set(11, Y - 0.06, Z);
  group.add(perch);
  const birdSpots: BirdSpot[] = [9.2, 10.4, 11.6, 12.8].map((x) => ({ p: new THREE.Vector3(x, Y, Z), taken: false }));
  (['parrot', 'toucan', 'gull', 'parrot'] as BirdKind[]).forEach((kind, i) => {
    const b = new PerchBird(kind, birdSpots[i]!, birdSpots, R);
    b.demo = i === 3 ? ['spread'] : ['idle', 'preen', 'spread'];
    group.add(b.root);
    addAgent(b);
  });
  (['parrot', 'toucan', 'gull'] as BirdKind[]).forEach((kind, i) => {
    const x = 15 + i * 1.6;
    const still: FlightPath = { at: (t, out) => out.set(x, Y + 0.8, Z + t * 1e-4) };
    const b = new FlyingBird(kind, still, R, 1, kind === 'gull' ? 2.8 : 4);
    group.add(b.root);
    addAgent(b);
  });
  for (const [i, demo] of [['oneLeg'], ['dip'], ['preen', 'walk']].entries()) {
    const f = new Flamingo(new THREE.Vector3(20 + i * 1.5, -0.2, Z), R, () => -0.2);
    f.demo = demo as ('oneLeg' | 'dip' | 'preen' | 'walk')[];
    f.setYaw(Math.PI / 2);
    group.add(f.root);
    addAgent(f);
  }
  // Fische knapp unter, Schmetterlinge über dem Wasser
  group.add(buildSchool({ x: -12, y: 0.6, z: Z, r: 1.2, kind: 'clown', count: 6, size: 0.3 }, R));
  group.add(buildSchool({ x: -12, y: 1.4, z: Z, r: 1.4, kind: 'tang', count: 6, size: 0.42 }, R));
  group.add(buildSchool({ x: -12, y: 2.2, z: Z, r: 1.6, kind: 'yellow', count: 6, size: 0.45 }, R));
  group.add(buildButterflies([0, 1, 2, 3, 4, 5].map((i) => new THREE.Vector3(-16 + (i % 3) * 1.2, Y, Z + Math.floor(i / 3) * 1.2)), R, 0.5));
  // Modell-Tiere in einer Reihe dahinter
  (Object.keys(SPECIES) as SpeciesName[]).forEach((n, i) => {
    const a = make(n);
    if (!a) return;
    a.root.position.set(-9 + i * 3, 0.3, Z - 4);
    a.root.scale.setScalar(Math.min(1, 1.6 / SPECIES[n].size));
    addAgent({ obj: a.root, radius: 2, update: (_t, dt) => a.mixer?.update(dt) });
  });
}
