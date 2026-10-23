/**
 * Leben in der Blockwelt: Nutztiere grasen auf den Wiesen, Zombies und Skelette streifen durch die
 * Wälder, Spinnen und Fledermäuse an der Lavahöhle, Schleime am Wasser, Knaller am Vulkanfuß.
 * Einfache Wander-Logik wie im Blockspiel: Ziel in der Nähe suchen (nur mit freiem Weg dorthin),
 * hinlaufen (Beine schwingen), eine Stufe mit echtem Sprung hinauf, kurz stehen bleiben.
 * Schleime bewegen sich nur hüpfend. Ein festgefahrenes Tier wird nur dann nach Hause versetzt,
 * wenn die Kamera weder die alte noch die neue Stelle sieht – im Bild ploppt nichts.
 */
import * as THREE from 'three';
import { VOLCANO } from '@insel/shared';
import type { AnimalWorld } from '../animals.ts';
import type { IslandLayout } from '../layout.ts';
import { CameraSight } from '../sight.ts';
import type { Heightfield } from '../terrain.ts';
import { buildMob, type MobKind } from './mobs.ts';
import { rngFor } from './pixels.ts';
import { BLOCK, type VoxelWorld } from './world.ts';

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
  /** halbe Breite der Standfläche (Quadrat um die Mitte) */
  r: number;
  /** zurückgelegte Strecke (treibt die Beine – kein Rutschen) */
  dist: number;
  /** Schwung der Beine 0 … 1 (läuft an und aus) */
  amp: number;
  /** Steig-/Fallgeschwindigkeit */
  vy: number;
  /** Blickziel des Kopfs im Stehen */
  look: number;
  /** vergebliche Anläufe in Folge (hängt fest?) */
  fails: number;
  /** Schleim: Stauchung nach der Landung (1 → 0), Pause bis zum nächsten Sprung, aktuelle Form */
  squash: number;
  rest: number;
  form: number;
  /** aufgelaufene Zeit (Tiere außer Sicht werden seltener bewegt) */
  acc: number;
  slot: number;
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
/** halbe Breite der Standfläche je Art (Meter) */
const FOOT: Partial<Record<MobKind, number>> = { pig: 0.28, cow: 0.32, sheep: 0.3, chicken: 0.14, zombie: 0.18, skeleton: 0.18, spider: 0.4, slime: 0.16, knaller: 0.18 };

/** Schwerkraft und Sprung: knapp über eine Blockstufe (wie im Blockspiel) */
const GRAVITY = 18;
const JUMP = Math.sqrt(2 * GRAVITY * (BLOCK + 0.14));
/** Abstand der Prüfpunkte auf dem Weg zum Ziel */
const PROBE = 0.3;
/** Tiere außer Sicht nur jedes 2. Bild bewegen (mit aufgelaufener Zeit) */
const SLOW_EVERY = 2;
/** schnellste Drehung (rad/s) – weich, aber ohne Herumzucken */
const MAX_TURN = 5;

/** Winkel weich nachführen (kürzester Weg), höchstens MAX_TURN */
const turnTo = (from: number, to: number, rate: number, dt: number) => {
  const d = Math.atan2(Math.sin(to - from), Math.cos(to - from));
  const step = d * Math.min(1, rate * dt);
  return from + Math.max(-MAX_TURN * dt, Math.min(MAX_TURN * dt, step));
};

export function buildBlockAnimals(layout: IslandLayout, field: Heightfield, world: VoxelWorld): AnimalWorld {
  const topAt = world.topAt;
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

  /** Platz auf trockenem Land abseits des Wegs, ohne Baum/Busch */
  const land = (x: number, z: number, minPath = 3.2) =>
    topAt(x, z) > 0.6 && !world.wet(x, z) && !world.occupied(x, z) && field.riverDistance(x, z) > 1.2 && field.creekDistance(x, z) > 1 && field.pathDistance(x, z) > minPath && field.slope(x, z) < 0.45;

  /** Ecken und Mitte der Standfläche */
  const FEET = [
    [0, 0],
    [1, 1],
    [1, -1],
    [-1, 1],
    [-1, -1],
  ] as const;
  /** Boden unter der ganzen Standfläche: der höchste Block darunter (man steht auf der Kante) */
  const groundAt = (x: number, z: number, r: number) => {
    let h = -Infinity;
    for (const [a, b] of FEET) h = Math.max(h, topAt(x + a * r, z + b * r));
    return h;
  };
  /** darf die Standfläche hier sein? (trocken, kein Baum/Busch, nicht auf dem Weg) */
  const free = (x: number, z: number, r: number) => {
    for (const [a, b] of FEET) {
      const px = x + a * r;
      const pz = z + b * r;
      if (topAt(px, pz) <= 0.3 || world.wet(px, pz) || world.occupied(px, pz)) return false;
    }
    return field.pathDistance(x, z) > 1.6;
  };
  /** gerade Linie begehbar? Unterwegs höchstens eine Stufe hinauf oder hinunter */
  const clearLine = (x0: number, z0: number, x1: number, z1: number, r: number) => {
    const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, z1 - z0) / PROBE));
    let prev = groundAt(x0, z0, r);
    for (let i = 1; i <= n; i++) {
      const x = x0 + ((x1 - x0) * i) / n;
      const z = z0 + ((z1 - z0) * i) / n;
      if (!free(x, z, r)) return false;
      const h = groundAt(x, z, r);
      if (Math.abs(h - prev) > BLOCK + 0.05) return false;
      prev = h;
    }
    return true;
  };

  const find = (test: (x: number, z: number) => boolean, tries = 400): THREE.Vector3 | null => {
    for (let i = 0; i < tries; i++) {
      const x = (rng.next() - 0.5) * 92;
      const z = (rng.next() - 0.5) * 76;
      if (test(x, z)) return new THREE.Vector3(x, topAt(x, z), z);
    }
    return null;
  };

  const spawn = (kind: MobKind, at: THREE.Vector3, range: number, speed: number, fly = false) => {
    const r = FOOT[kind] ?? 0.2;
    if (!fly) {
      // Standfläche muss ganz frei sein – sonst ein Stück daneben versuchen
      const x0 = at.x;
      const z0 = at.z;
      for (let i = 0; i < 16 && !free(at.x, at.z, r); i++) {
        at.x = x0 + (rng.next() - 0.5) * 3;
        at.z = z0 + (rng.next() - 0.5) * 3;
      }
      if (!free(at.x, at.z, r) || !land(at.x, at.z, 2.2)) return;
      at.y = groundAt(at.x, at.z, r);
    }
    const o = make(kind);
    o.name = kind;
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
    walkers.push({
      kind,
      o,
      home: at.clone(),
      range,
      target: at.clone(),
      speed,
      wait: rng.next() * 3,
      phase: rng.next() * 10,
      parts,
      fly,
      r,
      dist: 0,
      amp: 0,
      vy: 0,
      look: 0,
      fails: 0,
      squash: 0,
      rest: 0,
      form: 0,
      acc: 0,
      slot: walkers.length % SLOW_EVERY,
    });
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
  // Schleime am Wasser (hüpfen schneller, als sie laufen würden)
  for (let i = 0; i < 3; i++) {
    const p = find((x, z) => land(x, z, 3) && field.riverDistance(x, z) < 5);
    if (p) spawn('slime', p, 3, 1.25);
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

  const sight = new CameraSight();
  const tmp = new THREE.Vector3();
  const look = new THREE.Vector3();
  let frame = 0;
  /** eigene Uhr: läuft nur mit den (begrenzten) Bildschritten – nach einem Ruckler springt kein Tier */
  let clock = 0;

  /** Sieht die Kamera das Tier (bzw. die Stelle)? Mit Rand, Mitte auf halber Körperhöhe */
  const visibleAt = (p: THREE.Vector3, margin = 2.5, range = 110) => sight.sees(look.set(p.x, p.y + 0.5, p.z), 1, margin, range);

  /** neues Ziel in der Nähe: trockenes, freies Land mit begehbarem Weg dorthin, nicht bei anderen */
  const pickTarget = (w: Walker) => {
    const o = w.o.position;
    // nach mehreren vergeblichen Anläufen zurück Richtung Zuhause
    const homeward = w.fails >= 3;
    for (let i = 0; i < 12; i++) {
      const cx = homeward ? (w.home.x + o.x) / 2 : w.home.x;
      const cz = homeward ? (w.home.z + o.z) / 2 : w.home.z;
      const span = homeward ? Math.max(1, w.range * 0.5) : w.range;
      const x = cx + (Math.random() - 0.5) * 2 * span;
      const z = cz + (Math.random() - 0.5) * 2 * span;
      if (Math.hypot(x - o.x, z - o.z) < 0.8) continue;
      if (!land(x, z, 2.2) || !free(x, z, w.r)) continue;
      if (walkers.some((v) => v !== w && !v.fly && (Math.hypot(v.target.x - x, v.target.z - z) < 1.1 || Math.hypot(v.o.position.x - x, v.o.position.z - z) < 1.1))) continue;
      if (!clearLine(o.x, o.z, x, z, w.r)) continue;
      w.target.set(x, 0, z);
      return true;
    }
    return false;
  };

  /** kommt dem Tier beim Schritt nach (nx, nz) ein anderes zu nahe? */
  const bumps = (w: Walker, nx: number, nz: number) => {
    for (const v of walkers) {
      if (v === w || v.fly) continue;
      const min = w.r + v.r + 0.08;
      const dx = v.o.position.x - nx;
      const dz = v.o.position.z - nz;
      if (dx * dx + dz * dz < min * min) {
        // nur, wenn der Schritt näher heranführt (auseinanderlaufen geht immer)
        const ox = v.o.position.x - w.o.position.x;
        const oz = v.o.position.z - w.o.position.z;
        if (dx * dx + dz * dz < ox * ox + oz * oz) return true;
      }
    }
    return false;
  };

  /** gescheitert: kurz warten, neues Ziel; hängt es fest, außer Sicht nach Hause versetzen */
  const blocked = (w: Walker) => {
    w.target.copy(w.o.position);
    w.wait = 0.5 + Math.random() * 1.2;
    w.fails++;
    if (w.fails >= 6 && !visibleAt(w.o.position, 4, 400) && !visibleAt(w.home, 4, 400)) {
      w.o.position.set(w.home.x, groundAt(w.home.x, w.home.z, w.r), w.home.z);
      w.target.copy(w.o.position);
      w.vy = 0;
      w.fails = 0;
    }
  };

  const step = (w: Walker, t: number, dt: number) => {
    const o = w.o;
    const p = w.parts;
    if (w.fly) {
      // Fledermäuse: Kreise um ihr Zuhause, Flügelschlag, nie in Blöcke hinein
      const a = t * 0.9 + w.phase;
      const x = w.home.x + Math.cos(a) * w.range;
      const z = w.home.z + Math.sin(a * 1.3) * w.range * 0.6;
      const want = Math.max(w.home.y + Math.sin(t * 2 + w.phase) * 0.8, topAt(x, z) + 1.1);
      o.position.x = x;
      o.position.z = z;
      o.position.y += (want - o.position.y) * Math.min(1, dt * 3);
      // Blick in Flugrichtung (Ableitung der Bahn), weich nachgeführt
      o.rotation.y = turnTo(o.rotation.y, Math.atan2(-Math.sin(a) * w.range, Math.cos(a * 1.3) * 1.3 * w.range * 0.6), 6, dt);
      const flap = Math.sin(t * 22 + w.phase) * 0.9;
      if (p.wingL) p.wingL.rotation.z = flap;
      if (p.wingR) p.wingR.rotation.z = -flap;
      return;
    }
    const slime = w.kind === 'slime';
    const here = groundAt(o.position.x, o.position.z, w.r);
    const onGround = w.vy === 0 && o.position.y <= here + 1e-3;
    const d = tmp.set(w.target.x - o.position.x, 0, w.target.z - o.position.z);
    const dist = d.length();
    let moving = false;
    if (w.wait > 0) {
      if (onGround) w.wait -= dt;
      if (w.wait <= 0) {
        if (!pickTarget(w)) {
          w.wait = 0.6 + Math.random();
          w.fails++;
          if (w.fails >= 6) blocked(w);
        }
      } else if (Math.random() < dt * 0.4) w.look = (Math.random() - 0.5) * 1.6;
    } else if (dist > 0.15) {
      d.normalize();
      const want = Math.atan2(d.x, d.z);
      let diff = want - o.rotation.y;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      // Schleime drehen sich nur am Boden
      if (!slime || onGround) o.rotation.y = turnTo(o.rotation.y, want, 5, dt);
      // erst laufen, wenn ungefähr in Zielrichtung gedreht (wie im Original)
      if (Math.abs(diff) < 0.6) {
        // Schleim: Absprung am Boden nach kurzer Pause, vorwärts nur in der Luft
        if (slime && onGround) {
          if (w.rest <= 0) w.vy = JUMP;
        }
        if (!slime || !onGround) {
          const s = Math.min(w.speed * dt, dist);
          const nx = o.position.x + d.x * s;
          const nz = o.position.z + d.z * s;
          const there = groundAt(nx, nz, w.r);
          // höchstens eine Blockstufe hinauf oder hinunter, nicht ins Wasser, in Bäume oder in andere Tiere
          if (!free(nx, nz, w.r) || there - here > BLOCK + 0.05 || here - there > BLOCK + 0.05 || bumps(w, nx, nz)) blocked(w);
          else if (there > o.position.y + 0.02) {
            // Stufe: abspringen und erst weiter, wenn die Füße darüber sind
            if (onGround) w.vy = JUMP;
          } else {
            o.position.x = nx;
            o.position.z = nz;
            w.dist += s;
            moving = true;
          }
        }
      }
      w.look = 0;
    } else {
      w.wait = (slime ? 0.8 : 1.5) + Math.random() * 4;
      w.fails = 0;
    }

    // Höhe: springen und fallen mit Schwerkraft, landen auf dem höchsten Block unter der Standfläche
    const ground = groundAt(o.position.x, o.position.z, w.r);
    if (w.vy !== 0 || o.position.y > ground + 1e-3) {
      // exakte Wurfparabel: gleiche Sprunghöhe, egal wie groß der Zeitschritt ist
      o.position.y += w.vy * dt - 0.5 * GRAVITY * dt * dt;
      w.vy -= GRAVITY * dt;
      if (o.position.y <= ground) {
        o.position.y = ground;
        if (slime && w.vy < -1) {
          w.squash = 1;
          w.rest = 0.35 + Math.random() * 0.45;
        }
        w.vy = 0;
      }
    } else o.position.y = ground;
    if (slime) w.rest -= dt;

    // Beine: Schwung läuft an/aus, Takt folgt der Strecke (diagonale Paare)
    w.amp += ((moving ? 1 : 0) - w.amp) * Math.min(1, dt * 6);
    const swing = Math.sin(w.dist * (7 / BLOCK)) * 0.85 * w.amp;
    const legs = LEGS[w.kind] ?? [];
    legs.forEach((n, i) => {
      const leg = p[n];
      if (leg) leg.rotation.x = (i % 2 === 0) !== (i >= 2) ? swing : -swing;
    });
    if (w.kind === 'skeleton') {
      if (p.armL) p.armL.rotation.x = -swing * 0.8;
      if (p.armR) p.armR.rotation.x = swing * 0.8;
    }
    if (w.kind === 'zombie') {
      // Arme vorgestreckt, wippen leicht im Schritt
      if (p.armL) p.armL.rotation.x = -Math.PI / 2 + Math.sin(t * 2 + w.phase) * 0.06 + swing * 0.1;
      if (p.armR) p.armR.rotation.x = -Math.PI / 2 - Math.sin(t * 2 + w.phase) * 0.06 - swing * 0.1;
    }
    if (w.kind === 'spider') for (let i = 0; i < 8; i++) if (p[`leg${i}`]) p[`leg${i}`]!.rotation.x = Math.sin(w.dist * (9 / BLOCK) + i * 1.6) * 0.35 * w.amp;
    if (slime) {
      // Form: kurz vor dem Absprung geduckt, im Flug gestreckt, nach der Landung gestaucht –
      // weich überblendet, damit nichts von einem Bild zum nächsten springt
      w.squash = Math.max(0, w.squash - dt * 3);
      const air = w.vy !== 0 ? Math.min(1, Math.abs(w.vy) / JUMP) : 0;
      const crouch = w.vy === 0 && w.wait <= 0 && dist > 0.15 && w.rest > 0 && w.rest < 0.2 ? 1 : 0;
      const want = air * 0.12 - w.squash * 0.2 - crouch * 0.12;
      w.form += (want - w.form) * Math.min(1, dt * 16);
      const sc = SCALE.slime!;
      o.scale.set(sc * (1 - w.form * 0.5), sc * (1 + w.form), sc * (1 - w.form * 0.5));
    }
    if (w.kind === 'chicken' && p.wingL && p.wingR) {
      // Flügel schlagen nur beim Hüpfen/Fallen
      const flap = w.vy !== 0 ? Math.abs(Math.sin(t * 20)) * 0.9 : 0;
      p.wingL.rotation.z = -flap;
      p.wingR.rotation.z = flap;
    }
    // Kopf: im Stehen umschauen, Schafe und Kühe grasen
    if (p.head) {
      const graze = (w.kind === 'sheep' || w.kind === 'cow') && !moving && w.wait > 0 && Math.sin(t * 0.4 + w.phase) > 0.2;
      p.head.rotation.x += ((graze ? 0.75 : 0) - p.head.rotation.x) * Math.min(1, dt * 4);
      p.head.rotation.y += ((graze ? 0 : w.look) - p.head.rotation.y) * Math.min(1, dt * 3);
    }
  };

  return {
    group,
    update(_t, dt, camera) {
      frame++;
      clock += dt;
      sight.update(camera);
      for (const w of walkers) {
        w.acc += dt;
        const seen = visibleAt(w.o.position, 1.5);
        if (!seen && (frame + w.slot) % SLOW_EVERY !== 0) continue;
        step(w, clock, Math.min(0.1, w.acc));
        w.acc = 0;
      }
    },
    // Der Kommentator kennt (noch) keine Sprüche zu Blockwelt-Tieren
    inView: () => false,
  };
}
