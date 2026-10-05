/**
 * Vögel aus Grundkörpern (Papagei, Tukan, Möwe) und Flamingos – je Tier eine SkinnedMesh mit
 * starrer Gewichtung. Sitzende Vögel neigen und drehen ruckartig den Kopf, putzen sich, spreizen
 * kurz die Flügel und fliegen ab und zu zu einem anderen Sitzplatz. Fliegende Vögel schlagen mit
 * den Flügeln im Wechsel mit Gleitphasen und legen sich in die Kurve.
 */
import * as THREE from 'three';
import { addRot, applyPose, CH, dampAngle, ease, limb, mix, move, Poser, RigSpec, rot, scale, SHAPE, type Agent, type AgentCtx, type PoseFn, type Rigged } from './rig.ts';

export type BirdKind = 'parrot' | 'toucan' | 'gull';

/** Knochen eines Vogels */
const V = { base: 0, body: 1, head: 2, tail: 3, wingL1: 4, wingL2: 5, wingR1: 6, wingR2: 7 } as const;

interface Look {
  body: string;
  belly: string;
  head: string;
  /** Feld um das Auge (Papagei: weiß, Tukan: blau) */
  face?: string;
  wingIn: string;
  wingBand?: string;
  wingOut: string;
  wingTip: string;
  tail: string;
  tailTip: string;
  beak: string;
  beakTip: string;
  feet: string;
  /** Rumpf: Länge, halbe Breite, halbe Höhe */
  len: number;
  wid: number;
  hgt: number;
  headR: number;
  beakLen: number;
  beakR: number;
  inLen: number;
  outLen: number;
  chord: number;
  tailLen: number;
  tailW: number;
  legLen: number;
  /** Haltung beim Sitzen (negativ = Brust hoch) */
  sitPitch: number;
  /** Länge der angelegten Flügel (Anteil) */
  folded: number;
}

const LOOKS: Record<BirdKind, Look> = {
  parrot: {
    body: '#e3262c',
    belly: '#d81f2a',
    head: '#e8302c',
    face: '#f7f1e6',
    wingIn: '#e3262c',
    wingBand: '#ffc61a',
    wingOut: '#2463d8',
    wingTip: '#163f9e',
    tail: '#e3262c',
    tailTip: '#2a6ae0',
    beak: '#f1e6cc',
    beakTip: '#2a2626',
    feet: '#5d5f68',
    len: 0.3,
    wid: 0.075,
    hgt: 0.08,
    headR: 0.07,
    beakLen: 0.06,
    beakR: 0.032,
    inLen: 0.16,
    outLen: 0.21,
    chord: 0.11,
    tailLen: 0.34,
    tailW: 0.045,
    legLen: 0.045,
    sitPitch: -0.95,
    folded: 0.85,
  },
  toucan: {
    body: '#18181d',
    belly: '#fff0b8',
    head: '#18181d',
    face: '#3da2ff',
    wingIn: '#1d1d23',
    wingOut: '#1d1d23',
    wingTip: '#0e0e12',
    tail: '#1b1b20',
    tailTip: '#e0262c',
    beak: '#ff8a1c',
    beakTip: '#121214',
    feet: '#4a5a8a',
    len: 0.28,
    wid: 0.075,
    hgt: 0.085,
    headR: 0.07,
    beakLen: 0.2,
    beakR: 0.045,
    inLen: 0.15,
    outLen: 0.17,
    chord: 0.11,
    tailLen: 0.2,
    tailW: 0.06,
    legLen: 0.045,
    sitPitch: -0.8,
    folded: 0.9,
  },
  gull: {
    body: '#f5f7fa',
    belly: '#ffffff',
    head: '#f8fafc',
    wingIn: '#a7b1bd',
    wingOut: '#9aa5b2',
    wingTip: '#202328',
    tail: '#f2f4f6',
    tailTip: '#e8ebee',
    beak: '#ffc62e',
    beakTip: '#e0402a',
    feet: '#f0a030',
    len: 0.34,
    wid: 0.08,
    hgt: 0.08,
    headR: 0.066,
    beakLen: 0.075,
    beakR: 0.017,
    inLen: 0.24,
    outLen: 0.3,
    chord: 0.13,
    tailLen: 0.13,
    tailW: 0.075,
    legLen: 0.075,
    sitPitch: -0.3,
    folded: 0.6,
  },
};

const specs = new Map<string, RigSpec>();

function birdSpec(kind: BirdKind, feet: boolean): RigSpec {
  const key = `${kind}|${feet}`;
  const hit = specs.get(key);
  if (hit) return hit;
  const L = LOOKS[kind];
  const s = new RigSpec();
  const hb = L.legLen + L.hgt * 0.9;
  const base = s.bone('base', -1, 0, 0, 0);
  const body = s.bone('body', base, 0, hb, 0);
  const head = s.bone('head', body, 0, L.hgt * 0.55, L.len * 0.4);
  const tail = s.bone('tail', body, 0, L.hgt * 0.1, -L.len * 0.42);
  const wings: number[] = [];
  for (const side of [1, -1]) {
    const w1 = s.bone('wing1', body, L.wid * 0.75 * side, L.hgt * 0.4, L.len * 0.12, 'YZX');
    const w2 = s.bone('wing2', w1, L.inLen * side, 0, 0, 'YZX');
    wings.push(w1, w2);
  }
  if (s.count !== 8) throw new Error('Vogel-Bauplan passt nicht');

  // Rumpf
  s.part(body, SHAPE.ball, L.body, [0, 0, 0], [L.wid, L.hgt, L.len / 2]);
  if (kind === 'toucan') s.part(body, SHAPE.ball, L.belly, [0, L.hgt * 0.15, L.len * 0.3], [L.wid * 0.85, L.hgt * 0.75, L.len * 0.24]);
  else s.part(body, SHAPE.ball, L.belly, [0, -L.hgt * 0.3, L.len * 0.05], [L.wid * 0.85, L.hgt * 0.7, L.len * 0.4]);
  if (kind === 'toucan') s.part(body, SHAPE.ball, L.tailTip, [0, -L.hgt * 0.55, -L.len * 0.3], [L.wid * 0.5, L.hgt * 0.35, L.len * 0.15]);
  // Kopf
  const hr = L.headR;
  const hc: [number, number, number] = [0, hr * 0.75, hr * 0.25];
  s.part(head, SHAPE.ball, L.head, hc, [hr * 0.92, hr, hr * 1.05]);
  for (const side of [1, -1]) {
    const eye: [number, number, number] = [hc[0] + hr * 0.68 * side, hc[1] + hr * 0.18, hc[2] + hr * 0.42];
    if (L.face) s.part(head, SHAPE.ballLo, L.face, [eye[0] - 0.006 * side, eye[1] - hr * 0.05, eye[2] - 0.004], [hr * 0.36, hr * 0.42, hr * 0.42]);
    s.part(head, SHAPE.bead, '#15110f', [eye[0] + 0.004 * side, eye[1], eye[2] + 0.004], hr * 0.2);
    s.part(head, SHAPE.bead, '#ffffff', [eye[0] + 0.009 * side, eye[1] + hr * 0.08, eye[2] + hr * 0.14], hr * 0.07);
  }
  // Schnabel (zeigt nach +z)
  const bz = hc[2] + hr * 0.85;
  const by = hc[1] - hr * 0.12;
  if (kind === 'parrot') {
    s.part(head, SHAPE.ball, L.beak, [0, by + 0.006, bz], [L.beakR, L.beakR * 1.05, L.beakR * 1.1]);
    s.part(head, SHAPE.cone, L.beak, [0, by - 0.018, bz + L.beakR * 0.8], [L.beakR * 0.55, 0.05, L.beakR * 0.55], [Math.PI / 2 + 1.1, 0, 0]);
    s.part(head, SHAPE.ball, L.beakTip, [0, by - 0.02, bz - 0.004], [L.beakR * 0.75, L.beakR * 0.55, L.beakR * 0.8]);
  } else if (kind === 'toucan') {
    s.part(head, SHAPE.ball, L.beak, [0, by, bz + 0.01], [L.beakR * 0.95, L.beakR * 1.2, L.beakR * 0.9]);
    s.part(head, SHAPE.cone, L.beak, [0, by - 0.006, bz + L.beakLen * 0.5], [L.beakR, L.beakLen, L.beakR * 0.8], [Math.PI / 2 + 0.12, 0, 0]);
    s.part(head, SHAPE.cone, L.beakTip, [0, by - 0.018, bz + L.beakLen * 0.93], [L.beakR * 0.3, L.beakLen * 0.16, L.beakR * 0.26], [Math.PI / 2 + 0.25, 0, 0]);
    s.part(head, SHAPE.ball, '#ffd23a', [0, by + L.beakR * 0.55, bz + L.beakLen * 0.3], [L.beakR * 0.55, L.beakR * 0.35, L.beakLen * 0.3]);
  } else {
    s.part(head, SHAPE.cone, L.beak, [0, by, bz + L.beakLen * 0.45], [L.beakR, L.beakLen, L.beakR * 0.9], [Math.PI / 2 + 0.08, 0, 0]);
    s.part(head, SHAPE.bead, L.beakTip, [0, by - L.beakR * 0.7, bz + L.beakLen * 0.62], L.beakR * 0.45);
  }
  // Schwanz
  s.part(tail, SHAPE.ballLo, L.tail, [0, 0, -L.tailLen * 0.42], [L.tailW, 0.014, L.tailLen * 0.5]);
  if (kind !== 'toucan') s.part(tail, SHAPE.ballLo, L.tailTip, [0, -0.002, -L.tailLen * 0.78], [L.tailW * 0.8, 0.012, L.tailLen * 0.22]);
  // Flügel (Ruhepose: ausgebreitet, Vorderkante bei z = 0)
  for (let i = 0; i < 2; i++) {
    const side = i === 0 ? 1 : -1;
    const w1 = wings[i * 2]!;
    const w2 = wings[i * 2 + 1]!;
    s.part(w1, SHAPE.ballLo, L.wingIn, [(L.inLen / 2) * side, 0, -L.chord * 0.35], [L.inLen * 0.55, 0.016, L.chord / 2]);
    if (L.wingBand) s.part(w1, SHAPE.ballLo, L.wingBand, [(L.inLen * 0.55) * side, 0.004, -L.chord * 0.55], [L.inLen * 0.5, 0.014, L.chord * 0.28]);
    s.part(w2, SHAPE.ballLo, L.wingOut, [(L.outLen * 0.45) * side, 0, -L.chord * 0.32], [L.outLen * 0.5, 0.013, L.chord * 0.42]);
    // Handschwingen als Finger
    for (let f = 0; f < 3; f++) {
      s.part(w2, SHAPE.bead, L.wingTip, [(L.outLen * (0.78 + f * 0.04)) * side, -0.002, -L.chord * (0.18 + f * 0.17)], [L.outLen * 0.22, 0.01, L.chord * 0.1], [0, -0.25 * side * f, 0]);
    }
  }
  // Füße (nur sitzende Vögel)
  if (feet) {
    for (const side of [1, -1]) {
      s.part(base, limb(0.007, L.legLen, 5), L.feet, [L.wid * 0.38 * side, L.legLen, 0.0]);
      for (const a of [-0.45, 0, 0.45]) s.part(base, SHAPE.bead, L.feet, [L.wid * 0.38 * side + Math.sin(a) * 0.02, 0.004, Math.cos(a) * 0.02], [0.007, 0.006, 0.02], [0, a, 0]);
      s.part(base, SHAPE.bead, L.feet, [L.wid * 0.38 * side, 0.004, -0.015], [0.006, 0.006, 0.014]);
    }
  }
  specs.set(key, s);
  return s;
}

// ---------------------------------------------------------------------------
// Posen
// ---------------------------------------------------------------------------

/** Flügel anlegen (k = 1) oder ausbreiten (k = 0) mit Schlagwinkel `flap` (+ = hoch). */
function wings(p: Float32Array, fold: number, flap: number, flap2: number, sweep = 0.1, folded = 1) {
  const roll = -1.5 * fold;
  const sw = mix(sweep, 1.5, fold);
  const droop = mix(flap, -0.12, fold);
  const d2 = mix(flap2, 0, fold);
  const s2 = mix(0.04, 0.14, fold);
  rot(p, V.wingL1, roll, sw, droop);
  rot(p, V.wingR1, roll, -sw, -droop);
  rot(p, V.wingL2, 0, s2, d2);
  rot(p, V.wingR2, 0, -s2, -d2);
  // angelegt wirken lange Flügel kürzer (Hand liegt unter dem Arm)
  const k = mix(1, folded, fold);
  scale(p, V.wingL1, k);
  scale(p, V.wingR1, k);
}

// ---------------------------------------------------------------------------

export interface BirdSpot {
  p: THREE.Vector3;
  taken: boolean;
}

/** Ein fliegender Vogel auf einer Runde (Kreis/Acht). */
export interface FlightPath {
  /** Lage zur Zeit t */
  at: (t: number, out: THREE.Vector3) => THREE.Vector3;
}

/** Sitzender Vogel: Kopf ruckt, putzt sich, spreizt die Flügel, fliegt ab und zu um. */
export class PerchBird implements Agent {
  readonly root = new THREE.Group();
  readonly obj = this.root;
  readonly radius = 0.8;
  private rig: Rigged;
  private poser: Poser;
  private L: Look;
  private state: 'idle' | 'preen' | 'spread' | 'fly' = 'idle';
  private time = 0;
  private dur = 2;
  private headYaw = 0;
  private headTilt = 0;
  private headWantYaw = 0;
  private headWantTilt = 0;
  private headNext = 0;
  /** Anteil der ruckartigen Kopfbewegung (nur beim ruhigen Sitzen) */
  private headW = 1;
  /** Restzeit eines kleinen Hüpfers beim Umdrehen */
  private hop = 0;
  private preenSide = 1;
  private yaw: number;
  private yawWant: number;
  private from = new THREE.Vector3();
  private to = new THREE.Vector3();
  private u = 0;
  private flightTime = 1;
  private arc = 1;
  private phase = 0;
  private seed = Math.random() * 50;
  private poses: Record<'idle' | 'preen' | 'spread' | 'fly', PoseFn>;
  private target: BirdSpot | null = null;
  /** Vorführung im Zoo: nur diese Zustände */
  demo: ('idle' | 'preen' | 'spread')[] | null = null;

  constructor(
    readonly kind: BirdKind,
    private spot: BirdSpot,
    private spots: BirdSpot[],
    private R: () => number,
    size = 1,
  ) {
    this.L = LOOKS[kind];
    this.rig = birdSpec(kind, true).create();
    this.root.name = kind;
    this.root.userData.animal = this;
    this.root.add(this.rig.mesh);
    this.root.scale.setScalar(size);
    this.root.position.copy(spot.p);
    spot.taken = true;
    this.yaw = this.yawWant = R() * Math.PI * 2;
    this.poses = this.makePoses();
    this.poser = new Poser(this.rig.bones.length, this.poses.idle);
  }

  private makePoses() {
    const L = this.L;
    const perch = (p: Float32Array, t: number) => {
      const breathe = Math.sin(t * 2.6) * 0.012;
      rot(p, V.body, L.sitPitch + breathe, 0, 0);
      move(p, V.body, 0, 0, -Math.sin(L.sitPitch) * L.len * 0.08);
      rot(p, V.head, -L.sitPitch - 0.05, 0, 0);
      rot(p, V.tail, -0.25 + Math.sin(t * 1.1) * 0.04, 0, 0);
      wings(p, 1, 0, 0, 0.1, L.folded);
    };
    const idle: PoseFn = (p, t) => perch(p, t);
    const preen: PoseFn = (p, t) => {
      perch(p, t);
      const s = this.preenSide;
      // Kopf nach hinten zum Flügel, kleine schnelle Zupfbewegungen
      rot(p, V.head, -L.sitPitch + 0.55 + Math.sin(t * 15) * 0.08, 2.1 * s, 0.25 * s);
      addRot(p, s > 0 ? V.wingL1 : V.wingR1, 0.35, -0.25 * s, 0.12 * s);
      addRot(p, V.body, 0.08, 0.2 * s, 0);
    };
    const spread: PoseFn = (p, t) => {
      perch(p, t);
      // Flügel auf, zwei, drei Schläge, dann wieder an
      const k = ease(this.time / 0.25) * (1 - ease((this.time - this.dur + 0.3) / 0.3));
      const f = Math.sin(t * 11) * 0.45 * k;
      wings(p, 1 - k, 0.55 + f, 0.2 + f * 0.6, 0.25, L.folded);
      addRot(p, V.body, -0.15 * k, 0, 0);
      addRot(p, V.tail, 0.25 * k, 0, 0);
    };
    const fly: PoseFn = (p) => {
      const u = this.u;
      // Abflug steil, Landung mit aufgestellten Flügeln
      const land = ease((u - 0.75) / 0.25);
      const flap = Math.sin(this.phase);
      rot(p, V.body, mix(-0.15, L.sitPitch * 0.8, land) - (u < 0.15 ? 0.4 * (1 - u / 0.15) : 0), 0, 0);
      move(p, V.body, 0, -0.01, 0);
      rot(p, V.head, mix(0.1, -L.sitPitch * 0.7, land), 0, 0);
      rot(p, V.tail, mix(0.05, 0.35, land), 0, 0);
      wings(p, 0, mix(0.1, 0.7, land) + flap * 0.85, mix(0.05, 0.3, land) + Math.sin(this.phase - 0.9) * 0.55, mix(0.05, 0.3, land));
    };
    return { idle, preen, spread, fly };
  }

  private enter(s: 'idle' | 'preen' | 'spread' | 'fly') {
    const R = this.R;
    this.state = s;
    this.time = 0;
    let fade = 0.35;
    if (s === 'idle') this.dur = 2 + R() * 4;
    else if (s === 'preen') {
      this.dur = 1.5 + R() * 2;
      this.preenSide = R() < 0.5 ? 1 : -1;
    } else if (s === 'spread') {
      this.dur = 0.9 + R() * 0.6;
      fade = 0.2;
    } else {
      this.from.copy(this.spot.p);
      this.to.copy(this.target!.p);
      const d = this.from.distanceTo(this.to);
      this.flightTime = 0.8 + d * 0.16;
      this.arc = 1.2 + d * 0.12;
      this.dur = this.flightTime;
      this.u = 0;
      this.yawWant = Math.atan2(this.to.x - this.from.x, this.to.z - this.from.z);
      this.spot.taken = false;
      fade = 0.15;
    }
    this.poser.play(this.poses[s], fade);
  }

  update(t: number, dt: number, ctx: AgentCtx) {
    const R = this.R;
    this.time += dt;
    if (this.time >= this.dur) {
      if (this.state === 'fly') {
        this.spot = this.target!;
        this.target = null;
        this.root.position.copy(this.spot.p);
        this.enter('idle');
        this.yawWant = this.yaw + (R() - 0.5) * 2;
      } else if (this.state !== 'idle') this.enter('idle');
      else if (this.demo) this.enter(this.demo[Math.floor(R() * this.demo.length)]!);
      else {
        const r = R();
        const near = this.spots.filter((s) => !s.taken && s !== this.spot && s.p.distanceTo(this.spot.p) < 16 && s.p.distanceTo(this.spot.p) > 3);
        if (r < 0.12 && near.length) {
          this.target = near[Math.floor(R() * near.length)]!;
          this.target.taken = true;
          this.enter('fly');
        } else if (r < 0.4) this.enter('preen');
        else if (r < 0.58) this.enter('spread');
        else {
          // umdrehen mit kleinem Hüpfer
          this.yawWant += (R() - 0.5) * 2.4;
          this.hop = 0.28;
          this.enter('idle');
        }
      }
    }
    if (this.state === 'fly') {
      this.u = Math.min(1, this.time / this.flightTime);
      const u = this.u;
      this.root.position.lerpVectors(this.from, this.to, ease(u * 1.1 - 0.05));
      this.root.position.y += 4 * this.arc * u * (1 - u);
      this.phase += dt * (u > 0.8 ? 20 : 15);
    } else if (this.hop > 0) {
      this.hop = Math.max(0, this.hop - dt);
      this.root.position.y = this.spot.p.y + Math.sin((1 - this.hop / 0.28) * Math.PI) * 0.07 * this.root.scale.y;
    }
    this.yaw = dampAngle(this.yaw, this.yawWant, this.state === 'fly' ? 8 : this.hop > 0 ? 14 : 5, dt);
    this.root.rotation.y = this.yaw;

    // Kopf ruckartig: kurz halten, dann schnell neu ausrichten
    this.headNext -= dt;
    if (this.headNext <= 0) {
      this.headNext = 0.35 + R() * 1.6;
      this.headWantYaw = (R() - 0.5) * 1.9;
      this.headWantTilt = (R() - 0.5) * 0.9;
      if (ctx.visible && R() < 0.3) {
        // zur Kamera schauen
        const cy = Math.atan2(ctx.cam.x - this.root.position.x, ctx.cam.z - this.root.position.z);
        this.headWantYaw = Math.max(-1.3, Math.min(1.3, Math.atan2(Math.sin(cy - this.yaw), Math.cos(cy - this.yaw))));
      }
    }
    const k = 1 - Math.exp(-dt * 22);
    this.headYaw += (this.headWantYaw - this.headYaw) * k;
    this.headTilt += (this.headWantTilt - this.headTilt) * k;
    this.headW += ((this.state === 'idle' ? 1 : 0) - this.headW) * (1 - Math.exp(-dt * 6));

    const tt = t + this.seed;
    this.poser.update(tt, dt);
    const p = this.poser.out;
    const w = this.headW;
    addRot(p, V.head, Math.sin(tt * 0.9) * 0.05 * w, this.headYaw * w, this.headTilt * w);
    applyPose(this.rig, p);
  }
}

/** Fliegender Vogel auf fester Bahn: Flügelschläge im Wechsel mit Gleiten, Schräglage in Kurven. */
export class FlyingBird implements Agent {
  readonly root = new THREE.Group();
  readonly obj = this.root;
  readonly radius = 1.2;
  private rig: Rigged;
  private poser: Poser;
  private phase = Math.random() * 6;
  private flapping = true;
  private left = 1 + Math.random() * 2;
  private w = 1;
  private climb = 0;
  private prev = new THREE.Vector3();
  private cur = new THREE.Vector3();
  private dir = new THREE.Vector3();
  private heading = 0;
  private bank = 0;
  private pitch = 0;
  private seed = Math.random() * 50;

  constructor(
    readonly kind: BirdKind,
    private path: FlightPath,
    private R: () => number,
    size = 1,
    private flapHz = 3.2,
  ) {
    this.rig = birdSpec(kind, false).create();
    this.root.name = `${kind}-fly`;
    this.root.userData.animal = this;
    this.root.add(this.rig.mesh);
    this.root.scale.setScalar(size);
    this.root.rotation.order = 'YXZ';
    this.poser = new Poser(this.rig.bones.length, (p) => {
      const flap = Math.sin(this.phase);
      const glide = 1 - this.w;
      rot(p, V.body, -0.08 + glide * 0.04, 0, 0);
      move(p, V.body, 0, -flap * 0.012 * this.w, 0);
      rot(p, V.head, 0.06 - flap * 0.05 * this.w, 0, 0);
      rot(p, V.tail, 0.05 + flap * 0.06 * this.w, 0, 0);
      // Schlag: Hand folgt dem Arm verzögert; beim Gleiten leichte V-Stellung
      const a1 = mix(0.14 + Math.sin(this.seed + this.phase * 0.1) * 0.03, 0.15 + flap * 0.85, this.w);
      const a2 = mix(0.06, 0.1 + Math.sin(this.phase - 0.9) * 0.6, this.w);
      wings(p, 0, a1, a2, mix(0.04, 0.1 - flap * 0.12, this.w));
    });
    path.at(0, this.cur);
    this.root.position.copy(this.cur);
  }

  update(t: number, dt: number) {
    const R = this.R;
    this.left -= dt;
    if (this.left <= 0) {
      this.flapping = !this.flapping;
      this.left = this.flapping ? 1.2 + R() * 1.6 : 1.6 + R() * 2.6;
    }
    this.w += ((this.flapping ? 1 : 0) - this.w) * (1 - Math.exp(-dt * 5));
    // beim Gleiten Flügelschlag in hoher Stellung auslaufen lassen
    this.phase += dt * this.flapHz * Math.PI * 2 * (0.35 + this.w * 0.65);
    // steigen beim Schlagen, sinken beim Gleiten
    this.climb += ((this.flapping ? 0.5 : -0.35) * dt);
    this.climb = Math.max(-1.2, Math.min(1.2, this.climb));
    this.prev.copy(this.cur);
    this.path.at(t, this.cur);
    this.cur.y += this.climb;
    this.root.position.copy(this.cur);
    if (dt > 0) {
      this.dir.subVectors(this.cur, this.prev);
      const h = Math.atan2(this.dir.x, this.dir.z);
      const turn = Math.atan2(Math.sin(h - this.heading), Math.cos(h - this.heading)) / dt;
      this.heading = h;
      const speed = Math.hypot(this.dir.x, this.dir.z) / dt;
      // Schräglage aus Kurvenrate und Tempo (übertrieben, damit man es sieht)
      const want = Math.max(-0.7, Math.min(0.7, -turn * speed * 0.12));
      this.bank += (want - this.bank) * (1 - Math.exp(-dt * 3));
      const pw = -Math.atan2(this.dir.y / dt, Math.max(0.5, speed)) * 0.8;
      this.pitch += (pw - this.pitch) * (1 - Math.exp(-dt * 3));
    }
    this.root.rotation.set(this.pitch, this.heading, this.bank);
    this.poser.update(t, dt);
    applyPose(this.rig, this.poser.out);
  }
}

/** Kreis um einen Mittelpunkt, leicht elliptisch und wellig in der Höhe. */
export function circlePath(cx: number, cz: number, r: number, y: number, speed: number, phase: number, wobble = 0.15): FlightPath {
  return {
    at(t, out) {
      const a = phase + t * speed;
      const rr = r * (1 + Math.sin(a * 2 + phase) * wobble);
      return out.set(cx + Math.cos(a) * rr, y + Math.sin(t * 0.37 + phase) * 0.8, cz + Math.sin(a) * rr * 0.85);
    },
  };
}

/** Liegende Acht über einem Gebiet. */
export function eightPath(cx: number, cz: number, rx: number, rz: number, y: number, speed: number, phase: number): FlightPath {
  return {
    at(t, out) {
      const a = phase + t * speed;
      return out.set(cx + Math.sin(a) * rx, y + Math.sin(a * 2 + 1) * 1.0, cz + Math.sin(a * 2) * rz);
    },
  };
}

// ---------------------------------------------------------------------------
// Flamingo
// ---------------------------------------------------------------------------

const F = { base: 0, body: 1, neck1: 2, neck2: 3, neck3: 4, head: 5, thighL: 6, shinL: 7, thighR: 8, shinR: 9, wingL: 10, wingR: 11, tail: 12 } as const;
const PINK = '#ff8fb1';
const PINK_DEEP = '#f2668f';
const PINK_LIGHT = '#ffc0d3';

let flamingoSpec: RigSpec | null = null;
function flamingo(): RigSpec {
  if (flamingoSpec) return flamingoSpec;
  const s = new RigSpec();
  const legH = 0.74;
  const base = s.bone('base', -1, 0, 0, 0);
  const body = s.bone('body', base, 0, legH + 0.06, 0);
  const n1 = s.bone('neck1', body, 0, 0.06, 0.15);
  const n2 = s.bone('neck2', n1, 0, 0.17, 0);
  const n3 = s.bone('neck3', n2, 0, 0.17, 0);
  const head = s.bone('head', n3, 0, 0.15, 0);
  for (const side of [1, -1]) {
    const th = s.bone('thigh', body, 0.045 * side, -0.04, -0.01);
    const sh = s.bone('shin', th, 0, -0.36, 0);
    s.part(th, limb(0.014, 0.36, 6), PINK_DEEP);
    s.part(th, SHAPE.bead, PINK_DEEP, [0, -0.36, 0], 0.022);
    s.part(sh, limb(0.012, 0.38, 6), PINK_DEEP);
    // Schwimmfuß
    s.part(sh, SHAPE.ballLo, PINK_DEEP, [0, -0.39, 0.035], [0.03, 0.008, 0.055]);
  }
  for (const side of [1, -1]) {
    const w = s.bone('wing', body, 0.09 * side, 0.03, 0.02);
    s.part(w, SHAPE.ballLo, PINK, [0.01 * side, 0, -0.08], [0.035, 0.08, 0.17]);
    s.part(w, SHAPE.ballLo, '#2b2228', [0.012 * side, -0.01, -0.24], [0.024, 0.04, 0.045]);
  }
  const tail = s.bone('tail', body, 0, 0.02, -0.2);
  if (s.count !== 13) throw new Error('Flamingo-Bauplan passt nicht');
  s.part(body, SHAPE.ball, PINK, [0, 0, 0], [0.11, 0.105, 0.21]);
  s.part(body, SHAPE.ball, PINK_LIGHT, [0, 0.04, 0.02], [0.09, 0.07, 0.17]);
  s.part(tail, SHAPE.ballLo, PINK_LIGHT, [0, 0, -0.04], [0.05, 0.03, 0.08]);
  s.part(n1, limb(0.03, 0.17, 7), PINK, [0, 0.17, 0], 1);
  s.part(n2, limb(0.026, 0.17, 7), PINK, [0, 0.17, 0], 1);
  s.part(n3, limb(0.024, 0.15, 7), PINK, [0, 0.15, 0], 1);
  // Kopf mit geknicktem Schnabel (vorn rosa, Spitze schwarz)
  s.part(head, SHAPE.ball, PINK, [0, 0.03, 0.01], [0.045, 0.045, 0.055]);
  s.part(head, SHAPE.cone, '#ffe9ef', [0, 0.02, 0.085], [0.024, 0.08, 0.02], [Math.PI / 2, 0, 0]);
  s.part(head, SHAPE.cone, '#1d1a1f', [0, -0.01, 0.13], [0.014, 0.06, 0.012], [Math.PI / 2 + 1.0, 0, 0]);
  for (const side of [1, -1]) {
    s.part(head, SHAPE.bead, '#fff6c8', [0.034 * side, 0.045, 0.03], 0.012);
    s.part(head, SHAPE.bead, '#15110f', [0.04 * side, 0.046, 0.034], 0.0065);
  }
  flamingoSpec = s;
  return s;
}

/** Flamingo in der Lagune: auf einem Bein, Kopf ins Wasser tunken, putzen, ein paar Schritte. */
export class Flamingo implements Agent {
  readonly root = new THREE.Group();
  readonly obj = this.root;
  readonly radius = 1.0;
  private rig: Rigged;
  private poser: Poser;
  private state: 'stand' | 'oneLeg' | 'dip' | 'preen' | 'walk' = 'stand';
  private time = 0;
  private dur = 2;
  private poses: Record<'stand' | 'oneLeg' | 'dip' | 'preen' | 'walk', PoseFn>;
  private home: THREE.Vector3;
  private walkFrom = new THREE.Vector3();
  private walkTo = new THREE.Vector3();
  private yaw: number;
  private yawWant: number;
  private seed = Math.random() * 50;
  demo: ('stand' | 'oneLeg' | 'dip' | 'preen' | 'walk')[] | null = null;

  constructor(
    pos: THREE.Vector3,
    private R: () => number,
    private ground: (x: number, z: number) => number,
    size = 1,
  ) {
    this.rig = flamingo().create();
    this.root.name = 'flamingo';
    this.root.userData.animal = this;
    this.root.add(this.rig.mesh);
    this.root.scale.setScalar(size);
    this.root.position.copy(pos);
    this.home = pos.clone();
    this.yaw = this.yawWant = R() * Math.PI * 2;
    const neck = (p: Float32Array, t: number) => {
      // S-förmiger Hals
      rot(p, F.neck1, 0.4 + Math.sin(t * 0.7) * 0.04, 0, 0);
      rot(p, F.neck2, -1.0, 0, 0);
      rot(p, F.neck3, 0.75, 0, 0);
      rot(p, F.head, -0.05, Math.sin(t * 0.4) * 0.35, 0);
      rot(p, F.body, -0.12 + Math.sin(t * 2) * 0.01, 0, 0);
      rot(p, F.wingL, 0, 0, 0);
      rot(p, F.wingR, 0, 0, 0);
    };
    const stand: PoseFn = (p, t) => {
      neck(p, t);
      rot(p, F.thighL, 0, 0, 0.02);
      rot(p, F.thighR, 0, 0, -0.02);
    };
    const oneLeg: PoseFn = (p, t) => {
      neck(p, t);
      // linkes Bein hochgeklappt, Körper über das Standbein
      move(p, F.body, -0.035, 0, 0);
      rot(p, F.body, -0.12, 0, -0.06);
      rot(p, F.thighL, -0.45, 0, 0.25);
      rot(p, F.shinL, 2.7, 0, 0);
      rot(p, F.thighR, 0, 0, 0.04);
    };
    const dip: PoseFn = (p, t) => {
      stand(p, t);
      // Hals tief, Kopf kopfüber ins Wasser, seitlich hin und her seihen
      rot(p, F.body, 0.75, 0, 0);
      rot(p, F.neck1, 1.35, Math.sin(t * 1.3) * 0.15, 0);
      rot(p, F.neck2, 0.55, 0, 0);
      rot(p, F.neck3, 0.45, 0, 0);
      rot(p, F.head, 0.6, Math.sin(t * 6) * 0.25, 0);
    };
    const preen: PoseFn = (p, t) => {
      stand(p, t);
      rot(p, F.neck1, -0.2, 0.9, 0);
      rot(p, F.neck2, 0.9, 0.4, 0.3);
      rot(p, F.neck3, 0.6, 0.5, 0);
      rot(p, F.head, 0.9 + Math.sin(t * 14) * 0.1, 0.4, 0);
      rot(p, F.wingL, 0, 0, 0.35 + Math.sin(t * 5) * 0.05);
    };
    const walk: PoseFn = (p, t) => {
      neck(p, t);
      const s = Math.sin(t * 3.4);
      rot(p, F.thighL, -Math.max(0, s) * 0.7, 0, 0.02);
      rot(p, F.shinL, Math.max(0, s) * 1.2, 0, 0);
      rot(p, F.thighR, -Math.max(0, -s) * 0.7, 0, -0.02);
      rot(p, F.shinR, Math.max(0, -s) * 1.2, 0, 0);
      addRot(p, F.neck1, Math.sin(t * 6.8) * 0.06, 0, 0);
      addRot(p, F.body, 0, 0, s * 0.03);
    };
    this.poses = { stand, oneLeg, dip, preen, walk };
    this.poser = new Poser(this.rig.bones.length, stand);
  }

  /** Blickrichtung setzen (Zoo) */
  setYaw(y: number) {
    this.yaw = this.yawWant = y;
  }

  private enter(s: 'stand' | 'oneLeg' | 'dip' | 'preen' | 'walk') {
    const R = this.R;
    this.state = s;
    this.time = 0;
    this.dur = s === 'oneLeg' ? 6 + R() * 6 : s === 'dip' ? 3 + R() * 3 : s === 'preen' ? 2 + R() * 2 : s === 'walk' ? 3 + R() * 2 : 2 + R() * 2;
    if (s === 'walk') {
      const a = R() * Math.PI * 2;
      const d = 0.5 + R() * 1.0;
      this.walkFrom.copy(this.root.position);
      this.walkTo.set(this.home.x + Math.cos(a) * d, 0, this.home.z + Math.sin(a) * d);
      this.walkTo.y = this.ground(this.walkTo.x, this.walkTo.z);
      this.yawWant = Math.atan2(this.walkTo.x - this.walkFrom.x, this.walkTo.z - this.walkFrom.z);
    }
    this.poser.play(this.poses[s], s === 'dip' ? 0.8 : 0.6);
  }

  update(t: number, dt: number) {
    const R = this.R;
    this.time += dt;
    if (this.time >= this.dur) {
      if (this.demo) this.enter(this.demo[Math.floor(R() * this.demo.length)]!);
      else {
        const r = R();
        this.enter(this.state !== 'stand' ? 'stand' : r < 0.3 ? 'oneLeg' : r < 0.6 ? 'dip' : r < 0.8 ? 'preen' : 'walk');
      }
    }
    if (this.state === 'walk') {
      const u = ease((this.time - 0.4) / (this.dur - 0.8));
      this.root.position.lerpVectors(this.walkFrom, this.walkTo, u);
    }
    this.yaw = dampAngle(this.yaw, this.yawWant, 1.5, dt);
    this.root.rotation.y = this.yaw;
    this.poser.update(t + this.seed, dt);
    const p = this.poser.out;
    // Beine hängen am Rumpf: dessen Neigung ausgleichen, damit die Füße stehen bleiben
    const bx = p[F.body * CH]!;
    const bz = p[F.body * CH + 2]!;
    addRot(p, F.thighL, -bx, 0, -bz);
    addRot(p, F.thighR, -bx, 0, -bz);
    applyPose(this.rig, p);
  }
}

