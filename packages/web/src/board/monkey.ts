/**
 * Affen im Stil der Spielfiguren: weiche Grundkörper, helles Gesichtsfeld, große Augen mit
 * Glanzpunkt. Eine SkinnedMesh je Affe (starr gewichtet, ein Draw-Call), Verhalten wechselt
 * zufällig und weich: sitzen, kratzen, Banane essen, umschauen, am Arm schaukeln, springen,
 * winken. Der Schwanz pendelt immer.
 */
import * as THREE from 'three';
import { addRot, applyPose, dampAngle, ease, limb, mix, move, Poser, RigSpec, rot, scale, SHAPE, type Agent, type AgentCtx, type PoseFn, type Rigged } from './rig.ts';

/** Knochen (Reihenfolge = Anlage im Bauplan) */
const B = {
  base: 0,
  hips: 1,
  chest: 2,
  head: 3,
  eyes: 4,
  uArmL: 5,
  fArmL: 6,
  handL: 7,
  uArmR: 8,
  fArmR: 9,
  handR: 10,
  banana: 11,
  thighL: 12,
  shinL: 13,
  thighR: 14,
  shinR: 15,
  tail1: 16,
  tail2: 17,
  tail3: 18,
  tail4: 19,
} as const;

const FUR = '#8c552b';
const FUR_DARK = '#6a3d1f';
const FACE = '#f7d6a8';
const SKIN = '#e8b98a';
const BELLY = '#eec08c';
const EAR_IN = '#f0a48a';
const DARK = '#24150e';
const BANANA = '#ffd83a';

/** Länge der Glieder (Modellmaße, ein stehender Affe ist ~0,86 hoch) */
const ARM_U = 0.16;
const ARM_F = 0.15;

let spec: RigSpec | null = null;

function monkeySpec(): RigSpec {
  if (spec) return spec;
  const s = new RigSpec();
  const base = s.bone('base', -1, 0, 0, 0);
  const hips = s.bone('hips', base, 0, 0.3, 0);
  const chest = s.bone('chest', hips, 0, 0.13, 0);
  const head = s.bone('head', chest, 0, 0.17, 0);
  const eyes = s.bone('eyes', head, 0, 0.135, 0.13);
  const arm = (side: number) => {
    const u = s.bone('uArm', chest, 0.115 * side, 0.12, 0);
    const f = s.bone('fArm', u, 0, -ARM_U, 0);
    const h = s.bone('hand', f, 0, -ARM_F, 0);
    s.part(u, limb(0.036, ARM_U), FUR);
    s.part(f, limb(0.032, ARM_F), FUR);
    s.part(h, SHAPE.ballLo, SKIN, [0, -0.022, 0.004], [0.04, 0.048, 0.034]);
    return h;
  };
  arm(1);
  const handR = arm(-1);
  const banana = s.bone('banana', handR, 0, -0.02, 0.01);
  // Banane: gebogene Perlenkette, braune Spitzen
  for (let i = 0; i <= 6; i++) {
    const u = i / 6;
    const r = i === 0 || i === 6 ? 0.008 : 0.011 + Math.sin(u * Math.PI) * 0.006;
    s.part(banana, SHAPE.bead, i === 0 || i === 6 ? '#6b4a1e' : BANANA, [0, 0.03 - u * 0.17, 0.012 + Math.sin(u * Math.PI) * 0.035], [r, 0.02, r]);
  }
  const leg = (side: number) => {
    const th = s.bone('thigh', hips, 0.065 * side, -0.02, 0);
    const sh = s.bone('shin', th, 0, -0.135, 0);
    s.part(th, limb(0.042, 0.135), FUR);
    s.part(sh, limb(0.037, 0.125), FUR);
    s.part(sh, SHAPE.ballLo, SKIN, [0, -0.13, 0.03], [0.04, 0.026, 0.068]);
  };
  leg(1);
  leg(-1);
  let parent = hips;
  const tailR = [0.026, 0.022, 0.019, 0.016];
  for (let i = 0; i < 4; i++) {
    const tb = s.bone('tail', parent, 0, i === 0 ? -0.02 : 0, i === 0 ? -0.09 : -0.12);
    s.part(tb, limb(tailR[i]!, 0.12, 7), FUR, [0, 0, 0], 1, [Math.PI / 2, 0, 0]);
    if (i === 3) s.part(tb, SHAPE.bead, FUR_DARK, [0, 0, -0.12], 0.021);
    parent = tb;
  }
  if (s.count !== 20) throw new Error('Affen-Bauplan passt nicht zu den Knochen-Indizes');

  // Rumpf
  s.part(hips, SHAPE.ball, FUR, [0, 0.03, -0.01], [0.105, 0.1, 0.095]);
  s.part(chest, SHAPE.ball, FUR, [0, 0.05, 0], [0.118, 0.13, 0.1]);
  s.part(chest, SHAPE.ball, BELLY, [0, 0.0, 0.052], [0.084, 0.11, 0.058]);
  // Kopf
  s.part(head, SHAPE.ball, FUR, [0, 0.12, 0], [0.15, 0.14, 0.14]);
  for (const side of [1, -1]) {
    s.part(head, SHAPE.ball, FACE, [0.046 * side, 0.135, 0.1], [0.064, 0.072, 0.05]);
    s.part(head, SHAPE.ballLo, FUR, [0.148 * side, 0.125, -0.01], [0.052, 0.056, 0.026], [0, 0.35 * side, 0]);
    s.part(head, SHAPE.ballLo, EAR_IN, [0.153 * side, 0.125, 0.007], [0.034, 0.038, 0.012], [0, 0.35 * side, 0]);
    s.part(head, SHAPE.cone, FUR_DARK, [0.032 * side, 0.255, 0.0], [0.026, 0.06, 0.026], [0.2, 0, -0.5 * side]);
  }
  s.part(head, SHAPE.cone, FUR_DARK, [0, 0.268, 0.02], [0.028, 0.065, 0.028], [0.3, 0, 0]);
  s.part(head, SHAPE.ball, FACE, [0, 0.07, 0.105], [0.088, 0.062, 0.065]);
  s.part(head, SHAPE.bead, DARK, [0, 0.097, 0.167], [0.02, 0.011, 0.01]);
  s.part(head, SHAPE.arc, DARK, [0, 0.066, 0.163], [0.026, 0.02, 0.02], [0, 0, Math.PI]);
  // Augen (eigener Knochen zum Blinzeln)
  for (const side of [1, -1]) {
    s.part(eyes, SHAPE.ball, DARK, [0.044 * side, 0, 0.022], [0.021, 0.027, 0.014]);
    s.part(eyes, SHAPE.bead, '#ffffff', [0.044 * side + 0.007, 0.011, 0.035], 0.0075);
  }
  spec = s;
  return s;
}

// ---------------------------------------------------------------------------

export interface MonkeySpot {
  /** Sitzpunkt (Oberkante von Ast, Krone, Säule) */
  p: THREE.Vector3;
  /** darunter frei: hier kann ein Affe am Arm hängen */
  hang: boolean;
  /** Sprungziele in der Nähe */
  next: MonkeySpot[];
  taken: boolean;
}

type State = 'sit' | 'scratch' | 'eat' | 'look' | 'hang' | 'wave' | 'crouch' | 'fly' | 'land';

const TAU = Math.PI * 2;

export class Monkey implements Agent {
  readonly root = new THREE.Group();
  readonly obj = this.root;
  readonly radius = 1.3;
  private rig: Rigged;
  private poser: Poser;
  private poses: Record<State, PoseFn>;
  private state: State = 'sit';
  private time = 0;
  private dur = 1 + Math.random() * 3;
  private yaw: number;
  private yawWant: number;
  private from = new THREE.Vector3();
  private to = new THREE.Vector3();
  /** Fortschritt im Sprung 0..1 */
  private u = 0;
  private flightTime = 1;
  private arc = 1;
  private target: MonkeySpot | null = null;
  private seed = Math.random() * 100;
  private headScratch = true;
  private blink = 3;
  /** Nur zur Vorführung: kein Wechsel, sondern feste Abfolge */
  demo: State[] | null = null;
  private demoIdx = 0;

  constructor(
    private spot: MonkeySpot,
    private R: () => number,
    size = 0.9,
  ) {
    this.rig = monkeySpec().create();
    this.root.name = 'monkey';
    this.root.userData.animal = this;
    this.root.add(this.rig.mesh);
    this.root.scale.setScalar(size * (0.92 + R() * 0.16));
    this.root.position.copy(spot.p);
    spot.taken = true;
    this.yaw = this.yawWant = R() * TAU;
    this.root.rotation.y = this.yaw;
    this.poses = this.makePoses();
    this.poser = new Poser(this.rig.bones.length, this.poses.sit);
  }

  // --- Posen ---------------------------------------------------------------
  private makePoses(): Record<State, PoseFn> {
    const sitBase = (p: Float32Array, t: number) => {
      move(p, B.hips, 0, -0.19, -0.03);
      rot(p, B.hips, 0.2, 0, 0);
      rot(p, B.chest, 0.15 + Math.sin(t * 2.1) * 0.025, 0, 0);
      rot(p, B.head, -0.3, 0, 0);
      rot(p, B.thighL, -2.1, 0, 0.32);
      rot(p, B.shinL, 2.45, 0, -0.1);
      rot(p, B.thighR, -2.1, 0, -0.32);
      rot(p, B.shinR, 2.45, 0, 0.1);
      rot(p, B.uArmL, -0.55, 0, 0.14);
      rot(p, B.fArmL, -0.55, 0, 0);
      rot(p, B.uArmR, -0.55, 0, -0.14);
      rot(p, B.fArmR, -0.55, 0, 0);
      rot(p, B.tail1, -1.25, 0, 0);
      rot(p, B.tail2, -0.25, 0, 0);
      rot(p, B.tail3, 0.45, 0, 0);
      rot(p, B.tail4, 0.8, 0, 0);
      scale(p, B.banana, 0);
    };
    const sit: PoseFn = (p, t) => {
      sitBase(p, t);
      // ruhig sitzen, Kopf wandert ein wenig
      addRot(p, B.head, Math.sin(t * 0.43) * 0.08, Math.sin(t * 0.31) * 0.35, Math.sin(t * 0.57) * 0.08);
      addRot(p, B.fArmL, Math.sin(t * 0.8) * 0.08, 0, 0);
    };
    const scratch: PoseFn = (p, t) => {
      sitBase(p, t);
      const fast = Math.sin(t * 19);
      if (this.headScratch) {
        // rechte Hand kratzt am Kopf, Kopf neigt sich dagegen
        rot(p, B.uArmR, -0.35, 0, -2.45);
        rot(p, B.fArmR, 0, 0, -1.55 + fast * 0.2);
        rot(p, B.head, -0.2, 0.15, 0.22);
      } else {
        // linker Arm hoch, rechte Hand kratzt in der Achsel
        rot(p, B.uArmL, -0.2, 0, 2.3);
        rot(p, B.fArmL, 0, 0, 0.9);
        rot(p, B.uArmR, -1.0, 0, 0.55);
        rot(p, B.fArmR, -1.25 + fast * 0.25, 0, 0.3);
        rot(p, B.head, -0.45, -0.25, -0.15);
        addRot(p, B.chest, 0, -0.15, -0.1);
      }
    };
    const eat: PoseFn = (p, t) => {
      sitBase(p, t);
      scale(p, B.banana, 1);
      // Banane zum Mund führen, abbeißen, kauen
      const cyc = (t * 0.45) % 1;
      const k = ease(cyc < 0.3 ? cyc / 0.3 : cyc < 0.55 ? 1 : 1 - (cyc - 0.55) / 0.3);
      rot(p, B.uArmR, mix(-0.75, -1.25, k), mix(0, 0.15, k), mix(-0.15, 0.35, k));
      rot(p, B.fArmR, mix(-0.9, -1.75, k), 0, 0);
      rot(p, B.handR, mix(-0.3, -0.6, k), 0, 0);
      rot(p, B.uArmL, -0.7, 0, 0.1);
      rot(p, B.fArmL, -0.9, 0, -0.2);
      const chew = Math.max(0, Math.sin(t * 13)) * 0.05 * (1 - k);
      rot(p, B.head, mix(-0.25, 0.1, k) + chew, Math.sin(t * 0.5) * 0.15, 0);
    };
    const look: PoseFn = (p, t) => {
      sitBase(p, t);
      move(p, B.hips, 0, -0.14, -0.03);
      // Hand über die Augen, Oberkörper und Kopf schwenken weit
      rot(p, B.uArmL, -2.45, 0, -0.22);
      rot(p, B.fArmL, -0.45, 0, -0.15);
      rot(p, B.handL, 0.9, 0, 0);
      const sweep = Math.sin(t * 0.75) * 0.85;
      rot(p, B.head, -0.3, sweep * 0.45, -sweep * 0.1);
      addRot(p, B.chest, -0.12, sweep * 0.55, 0);
    };
    const hang: PoseFn = (p, t) => {
      // linke Hand hält oben, Körper pendelt darunter
      const sw = Math.sin(t * 1.9);
      rot(p, B.base, sw * 0.42, 0, Math.sin(t * 0.95) * 0.08);
      move(p, B.hips, -0.115, -0.9, 0);
      rot(p, B.uArmL, 0, 0, Math.PI - 0.06);
      rot(p, B.fArmL, 0, 0, 0.04);
      rot(p, B.handL, 0, 0, 0.2);
      rot(p, B.uArmR, sw * 0.5 - 0.2, 0, -0.5 + Math.sin(t * 1.9 + 1) * 0.25);
      rot(p, B.fArmR, -0.5, 0, 0);
      rot(p, B.chest, sw * -0.08, 0, 0.06);
      rot(p, B.head, -0.25, Math.sin(t * 0.6) * 0.6, -0.15);
      rot(p, B.thighL, -0.35 - sw * 0.35, 0, 0.12);
      rot(p, B.shinL, 0.55 + Math.sin(t * 1.9 - 0.8) * 0.3, 0, 0);
      rot(p, B.thighR, -0.25 + sw * 0.25, 0, -0.12);
      rot(p, B.shinR, 0.45 + Math.sin(t * 1.9 + 0.4) * 0.3, 0, 0);
      rot(p, B.tail1, -0.2, 0, 0);
      rot(p, B.tail2, 0.5, 0, 0);
      rot(p, B.tail3, 0.7, 0, 0);
      rot(p, B.tail4, 0.9, 0, 0);
      scale(p, B.banana, 0);
    };
    const wave: PoseFn = (p, t) => {
      // aufrecht stehen und mit rechts winken
      move(p, B.hips, Math.sin(t * 4.5) * 0.012, -0.04 + Math.abs(Math.sin(t * 4.5)) * 0.015, 0);
      rot(p, B.hips, 0.05, 0, Math.sin(t * 4.5) * 0.06);
      rot(p, B.chest, -0.05, 0, -Math.sin(t * 4.5) * 0.05);
      rot(p, B.head, -0.2, 0, Math.sin(t * 2.2) * 0.18);
      rot(p, B.thighL, -0.35, 0, 0.12);
      rot(p, B.shinL, 0.45, 0, 0);
      rot(p, B.thighR, -0.35, 0, -0.12);
      rot(p, B.shinR, 0.45, 0, 0);
      rot(p, B.uArmR, -0.25, 0, -2.6);
      rot(p, B.fArmR, 0, 0, -0.35 + Math.sin(t * 9) * 0.5);
      rot(p, B.handR, 0, 0, Math.sin(t * 9 - 0.5) * 0.3);
      rot(p, B.uArmL, 0.1, 0, 0.35);
      rot(p, B.fArmL, -0.3, 0, 0);
      rot(p, B.tail1, -0.5, 0, 0);
      rot(p, B.tail2, 0.4, 0, 0);
      rot(p, B.tail3, 0.6, 0, 0);
      rot(p, B.tail4, 0.8, 0, 0);
      scale(p, B.banana, 0);
    };
    const crouch: PoseFn = (p, t) => {
      sitBase(p, t);
      move(p, B.hips, 0, -0.21, -0.05);
      rot(p, B.hips, 0.55, 0, 0);
      rot(p, B.chest, 0.35, 0, 0);
      rot(p, B.head, -0.75, 0, 0);
      rot(p, B.uArmL, 0.9, 0, 0.2);
      rot(p, B.uArmR, 0.9, 0, -0.2);
      rot(p, B.fArmL, -0.2, 0, 0);
      rot(p, B.fArmR, -0.2, 0, 0);
    };
    const fly: PoseFn = (p) => {
      const u = this.u;
      // gestreckt wie ein Superheld, zur Landung Arme und Beine nach vorn
      const reach = ease((u - 0.55) / 0.4);
      rot(p, B.base, Math.sin(u * Math.PI) * 0.95, 0, 0);
      move(p, B.hips, 0, -0.05, 0);
      rot(p, B.chest, -0.15, 0, 0);
      rot(p, B.head, mix(-0.7, -0.4, reach), 0, 0);
      rot(p, B.uArmL, mix(-2.7, -1.6, reach), 0, 0.35);
      rot(p, B.uArmR, mix(-2.7, -1.6, reach), 0, -0.35);
      rot(p, B.fArmL, -0.15, 0, 0);
      rot(p, B.fArmR, -0.15, 0, 0);
      rot(p, B.thighL, mix(0.45, -1.2, reach), 0, 0.2);
      rot(p, B.thighR, mix(0.65, -1.2, reach), 0, -0.2);
      rot(p, B.shinL, mix(0.5, 1.2, reach), 0, 0);
      rot(p, B.shinR, mix(0.3, 1.2, reach), 0, 0);
      rot(p, B.tail1, 0.35, 0, 0);
      rot(p, B.tail2, 0.15, 0, 0);
      rot(p, B.tail3, 0.2, 0, 0);
      rot(p, B.tail4, 0.4, 0, 0);
      scale(p, B.banana, 0);
    };
    const land: PoseFn = (p, t) => {
      sitBase(p, t);
      move(p, B.hips, 0, -0.22, 0.0);
      rot(p, B.hips, 0.65, 0, 0);
      rot(p, B.chest, 0.3, 0, 0);
      rot(p, B.head, -0.8, 0, 0);
      rot(p, B.uArmL, -0.95, 0, 0.25);
      rot(p, B.uArmR, -0.95, 0, -0.25);
      rot(p, B.fArmL, -0.2, 0, 0);
      rot(p, B.fArmR, -0.2, 0, 0);
      rot(p, B.tail1, -0.2, 0, 0);
    };
    return { sit, scratch, eat, look, hang, wave, crouch, fly, land };
  }

  // --- Verhalten -----------------------------------------------------------
  private enter(s: State, ctx: AgentCtx) {
    const R = this.R;
    this.state = s;
    this.time = 0;
    let fade = 0.45;
    switch (s) {
      case 'sit':
        this.dur = 1.5 + R() * 3.5;
        // oft neugierig Richtung Kamera
        if (R() < 0.55) this.yawWant = this.camYaw(ctx) + (R() - 0.5) * 1.6;
        else if (R() < 0.5) this.yawWant += (R() - 0.5) * 2.4;
        break;
      case 'scratch':
        this.dur = 1.8 + R() * 2.2;
        this.headScratch = R() < 0.6;
        break;
      case 'eat':
        this.dur = 5 + R() * 5;
        break;
      case 'look':
        this.dur = 3 + R() * 3;
        break;
      case 'hang':
        this.dur = 4 + R() * 5;
        fade = 0.6;
        break;
      case 'wave':
        this.dur = 2.2 + R() * 1.5;
        this.yawWant = this.camYaw(ctx);
        break;
      case 'crouch':
        this.dur = 0.38;
        fade = 0.25;
        this.yawWant = Math.atan2(this.target!.p.x - this.spot.p.x, this.target!.p.z - this.spot.p.z);
        break;
      case 'fly': {
        this.from.copy(this.spot.p);
        this.to.copy(this.target!.p);
        const d = Math.hypot(this.to.x - this.from.x, this.to.z - this.from.z);
        this.flightTime = 0.42 + d * 0.085;
        this.arc = 0.45 + d * 0.16 + Math.abs(this.to.y - this.from.y) * 0.35;
        this.dur = this.flightTime;
        this.u = 0;
        fade = 0.12;
        break;
      }
      case 'land':
        this.dur = 0.45;
        fade = 0.08;
        this.spot.taken = false;
        this.spot = this.target!;
        this.target = null;
        this.root.position.copy(this.spot.p);
        break;
    }
    if (this.demo) {
      // Vorführung: zur Kamera schauen, kurze Pausen
      if (s !== 'crouch' && s !== 'fly') this.yawWant = this.camYaw(ctx);
      if (s === 'sit') this.dur = 1;
    }
    this.poser.play(this.poses[s], fade);
  }

  private camYaw(ctx: AgentCtx) {
    return Math.atan2(ctx.cam.x - this.root.position.x, ctx.cam.z - this.root.position.z);
  }

  private next(ctx: AgentCtx): State {
    const R = this.R;
    if (this.demo) {
      const s = this.demo[this.demoIdx++ % this.demo.length]!;
      if (s === 'crouch' && !this.pickTarget()) return 'sit';
      return s;
    }
    const camNear = ctx.visible && ctx.cam.distanceTo(this.root.position) < 32;
    const opts: [State, number][] = [
      ['scratch', 2],
      ['eat', 2],
      ['look', 1.6],
      ['sit', 1],
      ['wave', camNear ? 1.4 : 0],
      ['hang', this.spot.hang ? 2 : 0],
      ['crouch', this.spot.next.some((n) => !n.taken) ? 2.6 : 0],
    ];
    let sum = 0;
    for (const o of opts) sum += o[1];
    let r = R() * sum;
    for (const [s, w] of opts) {
      r -= w;
      if (r <= 0) {
        if (s === 'crouch' && !this.pickTarget()) return 'sit';
        return s;
      }
    }
    return 'sit';
  }

  private pickTarget(): boolean {
    const free = this.spot.next.filter((n) => !n.taken);
    if (!free.length) return false;
    this.target = free[Math.floor(this.R() * free.length)]!;
    this.target.taken = true;
    return true;
  }

  update(t: number, dt: number, ctx: AgentCtx) {
    this.time += dt;
    if (this.time >= this.dur) {
      switch (this.state) {
        case 'crouch':
          this.enter('fly', ctx);
          break;
        case 'fly':
          this.enter('land', ctx);
          break;
        case 'land':
          this.enter('sit', ctx);
          break;
        case 'sit':
          this.enter(this.next(ctx), ctx);
          break;
        default:
          this.enter('sit', ctx);
      }
    }
    if (this.state === 'fly') {
      this.u = Math.min(1, this.time / this.flightTime);
      const u = this.u;
      this.root.position.lerpVectors(this.from, this.to, u);
      this.root.position.y += 4 * this.arc * u * (1 - u);
    }
    if (this.state === 'wave') this.yawWant = this.camYaw(ctx);
    const turnRate = this.state === 'crouch' ? 12 : this.state === 'fly' ? 0 : 2.5;
    this.yaw = dampAngle(this.yaw, this.yawWant, turnRate, dt);
    this.root.rotation.y = this.yaw;

    const tt = t + this.seed;
    this.poser.update(tt, dt);
    const p = this.poser.out;
    // Schwanz pendelt immer ein wenig (Welle von der Wurzel zur Spitze)
    for (let i = 0; i < 4; i++) addRot(p, B.tail1 + i, Math.sin(tt * 1.7 - i * 0.8) * 0.06, Math.sin(tt * 1.3 - i * 0.7) * (0.22 + i * 0.05), 0);
    // Blinzeln
    this.blink -= dt;
    if (this.blink < 0) this.blink = 2 + Math.random() * 4;
    if (this.blink < 0.12) scale(p, B.eyes, 1, 0.12);
    applyPose(this.rig, p);
  }
}
