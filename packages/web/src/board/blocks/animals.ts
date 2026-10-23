/**
 * Leben in der Blockwelt: Nutztiere grasen auf den Wiesen, Zombies und Skelette streifen durch die
 * Wälder, Spinnen und Fledermäuse an der Lavahöhle, Schleime am Wasser, Knaller am Vulkanfuß.
 * Einfache Wander-Logik: Ziel in der Nähe suchen, hinlaufen (Beine schwingen), kurz stehen bleiben.
 */
import * as THREE from 'three';
import { VOLCANO } from '@insel/shared';
import type { AnimalWorld } from '../animals.ts';
import type { IslandLayout } from '../layout.ts';
import type { Heightfield } from '../terrain.ts';
import { buildMob, type MobKind } from './mobs.ts';
import { rngFor } from './pixels.ts';

interface Walker {
  kind: MobKind;
  o: THREE.Group;
  home: THREE.Vector3;
  range: number;
  target: THREE.Vector3;
  speed: number;
  wait: number;
  phase: number;
  parts: Record<string, THREE.Object3D | undefined>;
  fly?: boolean;
}

const LEGS: Partial<Record<MobKind, string[]>> = {
  pig: ['leg0', 'leg1', 'leg2', 'leg3'],
  cow: ['leg0', 'leg1', 'leg2', 'leg3'],
  sheep: ['leg0', 'leg1', 'leg2', 'leg3'],
  chicken: ['leg0', 'leg1'],
  zombie: ['legL', 'legR'],
  skeleton: ['legL', 'legR'],
  knaller: ['foot0', 'foot1', 'foot2', 'foot3'],
};

/** Größe der Kastenmodelle in der Welt (Figur ≈ 1,33 Einheiten hoch) */
const SCALE: Partial<Record<MobKind, number>> = { pig: 0.62, cow: 0.62, sheep: 0.62, chicken: 0.62, zombie: 0.64, skeleton: 0.64, spider: 0.6, slime: 0.55, knaller: 0.62, bat: 0.45 };

export function buildBlockAnimals(layout: IslandLayout, field: Heightfield, topAt: (x: number, z: number) => number): AnimalWorld {
  const group = new THREE.Group();
  group.name = 'block-animals';
  const templates = new Map<MobKind, THREE.Group>();
  const make = (k: MobKind) => {
    let t = templates.get(k);
    if (!t) {
      t = buildMob(k).root;
      templates.set(k, t);
    }
    return t.clone(true);
  };
  const rng = rngFor('animals');
  const walkers: Walker[] = [];
  const V = VOLCANO;

  /** Platz auf trockenem Land abseits des Wegs */
  const land = (x: number, z: number, minPath = 3.2) =>
    topAt(x, z) > 0.6 && field.riverDistance(x, z) > 1.2 && field.creekDistance(x, z) > 1 && field.pathDistance(x, z) > minPath && field.slope(x, z) < 0.45;

  const find = (test: (x: number, z: number) => boolean, tries = 400): THREE.Vector3 | null => {
    for (let i = 0; i < tries; i++) {
      const x = (rng.next() - 0.5) * 92;
      const z = (rng.next() - 0.5) * 76;
      if (test(x, z)) return new THREE.Vector3(x, topAt(x, z), z);
    }
    return null;
  };

  const spawn = (kind: MobKind, at: THREE.Vector3, range: number, speed: number, fly = false) => {
    const o = make(kind);
    o.scale.setScalar(SCALE[kind] ?? 0.6);
    o.position.copy(at);
    o.rotation.y = rng.next() * Math.PI * 2;
    group.add(o);
    const parts: Walker['parts'] = {};
    o.traverse((c) => {
      if (c.name) parts[c.name] = c;
    });
    // Grundhaltung: Zombies strecken die Arme vor, Spinnenbeine gespreizt nach unten
    if (kind === 'zombie') for (const a of ['armL', 'armR']) parts[a] && (parts[a]!.rotation.x = -Math.PI / 2);
    if (kind === 'spider')
      for (let i = 0; i < 8; i++) {
        const leg = parts[`leg${i}`];
        if (!leg) continue;
        const side = i < 4 ? 1 : -1;
        leg.rotation.z = side * 0.55;
        leg.rotation.y = ((i % 4) - 1.5) * 0.35 * -side;
      }
    walkers.push({ kind, o, home: at.clone(), range, target: at.clone(), speed, wait: rng.next() * 3, phase: rng.next() * 10, parts, fly });
  };

  // Nutztiere in kleinen Herden auf Wiesen (nicht am Vulkan)
  const meadow = (x: number, z: number) => land(x, z, 4) && Math.hypot(x - V.x, z - V.z) > V.baseRadius * 0.75 && topAt(x, z) < 7;
  const herds: [MobKind, number][] = [
    ['sheep', 4],
    ['cow', 3],
    ['pig', 3],
    ['chicken', 4],
    ['sheep', 3],
    ['pig', 2],
  ];
  for (const [kind, n] of herds) {
    const c = find(meadow);
    if (!c) continue;
    for (let i = 0; i < n; i++) {
      const p = c.clone().add(new THREE.Vector3((rng.next() - 0.5) * 3, 0, (rng.next() - 0.5) * 3));
      if (!meadow(p.x, p.z)) continue;
      p.y = topAt(p.x, p.z);
      spawn(kind, p, 4, kind === 'chicken' ? 0.9 : 0.6);
    }
  }
  // Monster abseits des Wegs
  const wild = (x: number, z: number) => land(x, z, 6) && topAt(x, z) < 12;
  for (const kind of ['zombie', 'zombie', 'skeleton', 'skeleton', 'zombie'] as MobKind[]) {
    const p = find(wild);
    if (p) spawn(kind, p, 6, 0.7);
  }
  // Knaller schleichen am Vulkanfuß herum
  for (let i = 0; i < 2; i++) {
    const p = find((x, z) => land(x, z, 4) && Math.abs(Math.hypot(x - V.x, z - V.z) - V.baseRadius * 0.7) < 4);
    if (p) spawn('knaller', p, 5, 0.5);
  }
  // Schleime am Wasser
  for (let i = 0; i < 3; i++) {
    const p = find((x, z) => land(x, z, 3) && field.riverDistance(x, z) < 5);
    if (p) spawn('slime', p, 3, 0.8);
  }
  // Spinnen und Fledermäuse an der Höhle
  const cave = layout.fields[layout.plan.caveField];
  if (cave) {
    for (let i = 0; i < 2; i++) {
      const p = find((x, z) => land(x, z, 3) && Math.hypot(x - cave.x, z - cave.z) < 12 && Math.hypot(x - cave.x, z - cave.z) > 4);
      if (p) spawn('spider', p, 4, 1.0);
    }
    for (let i = 0; i < 4; i++) spawn('bat', new THREE.Vector3(cave.x + (rng.next() - 0.5) * 6, cave.y + 3 + rng.next() * 2, cave.z + (rng.next() - 0.5) * 6), 5, 2.2, true);
  }

  const frustum = new THREE.Frustum();
  const m4 = new THREE.Matrix4();
  const tmp = new THREE.Vector3();
  let frame = 0;

  const step = (w: Walker, t: number, dt: number) => {
    const o = w.o;
    const p = w.parts;
    if (w.fly) {
      // Fledermäuse: Kreise um ihr Zuhause, Flügelschlag
      const a = t * 0.9 + w.phase;
      o.position.set(w.home.x + Math.cos(a) * w.range, w.home.y + Math.sin(t * 2 + w.phase) * 0.8, w.home.z + Math.sin(a * 1.3) * w.range * 0.6);
      o.rotation.y = -a;
      const flap = Math.sin(t * 22 + w.phase) * 0.9;
      if (p.wingL) p.wingL.rotation.z = flap;
      if (p.wingR) p.wingR.rotation.z = -flap;
      return;
    }
    const d = tmp.set(w.target.x - o.position.x, 0, w.target.z - o.position.z);
    const dist = d.length();
    let moving = false;
    if (w.wait > 0) {
      w.wait -= dt;
      if (w.wait <= 0) {
        // neues Ziel in der Nähe, nur auf trockenem Land
        for (let i = 0; i < 8; i++) {
          const x = w.home.x + (Math.random() - 0.5) * 2 * w.range;
          const z = w.home.z + (Math.random() - 0.5) * 2 * w.range;
          if (land(x, z, 2.2)) {
            w.target.set(x, 0, z);
            break;
          }
        }
      }
    } else if (dist > 0.15) {
      moving = true;
      d.normalize();
      const want = Math.atan2(d.x, d.z);
      let diff = want - o.rotation.y;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      o.rotation.y += diff * Math.min(1, dt * 4);
      o.position.x += d.x * w.speed * dt;
      o.position.z += d.z * w.speed * dt;
      o.position.y += (topAt(o.position.x, o.position.z) - o.position.y) * Math.min(1, dt * 10);
    } else w.wait = 1.5 + Math.random() * 4;

    const swing = moving ? Math.sin((t + w.phase) * 9) * 0.6 : 0;
    const legs = LEGS[w.kind] ?? [];
    legs.forEach((n, i) => {
      const leg = p[n];
      if (leg) leg.rotation.x = (i % 2 === 0) !== (i >= 2) ? swing : -swing;
    });
    if (w.kind === 'skeleton') {
      if (p.armL) p.armL.rotation.x = -swing;
      if (p.armR) p.armR.rotation.x = swing;
    }
    if (w.kind === 'spider') for (let i = 0; i < 8; i++) if (p[`leg${i}`]) p[`leg${i}`]!.rotation.x = moving ? Math.sin((t + w.phase) * 14 + i) * 0.3 : 0;
    if (w.kind === 'slime') {
      // hüpfen: zusammendrücken, springen, landen
      const h = (t * 1.4 + w.phase) % 1;
      const air = moving ? Math.max(0, Math.sin(h * Math.PI)) : 0;
      o.position.y = topAt(o.position.x, o.position.z) + air * 0.7;
      const s = SCALE.slime!;
      o.scale.set(s * (1 + (1 - air) * 0.12), s * (1 - (1 - air) * 0.12 + air * 0.1), s * (1 + (1 - air) * 0.12));
    }
    if (w.kind === 'chicken' && p.wingL && p.wingR) {
      const flap = moving ? Math.abs(Math.sin(t * 16)) * 0.6 : 0;
      p.wingL.rotation.z = -flap;
      p.wingR.rotation.z = flap;
    }
    // Grasen: Kopf senken, wenn sie stehen
    if ((w.kind === 'sheep' || w.kind === 'cow') && p.head) p.head.rotation.x = moving ? 0 : 0.5 + Math.sin(t * 2 + w.phase) * 0.1;
  };

  return {
    group,
    update(t, dt, camera) {
      frame++;
      camera.updateMatrixWorld();
      m4.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
      frustum.setFromProjectionMatrix(m4);
      for (const w of walkers) {
        const seen = frustum.containsPoint(w.o.position) && w.o.position.distanceToSquared(camera.position) < 60 * 60;
        if (seen || frame % 4 === 0) step(w, t, seen ? dt : dt * 4);
      }
    },
    // Der Kommentator kennt (noch) keine Sprüche zu Blockwelt-Tieren
    inView: () => false,
  };
}
