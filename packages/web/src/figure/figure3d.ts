/**
 * Mii-artige Spielfigur aus Grundkörpern. Gleicher Code für Beamer, Editor und Vorschau.
 * Die Hemdfarbe ist immer die Teamfarbe – so ist jedes Team sofort erkennbar.
 */
import * as THREE from 'three';
import {
  FIGURE_HAIR_COLORS,
  FIGURE_PANTS,
  FIGURE_SKINS,
  teamColor,
  type FigureConfig,
  type TeamColorKey,
} from '@insel/shared';

export type FigureMode = 'idle' | 'walk' | 'jump' | 'cheer' | 'sad' | 'fly' | 'stuck';

// ---------------------------------------------------------------------------
// Geteilte Geometrien (einmal pro Seite)
// ---------------------------------------------------------------------------
const G = {
  sphere: new THREE.SphereGeometry(1, 32, 24),
  sphereLow: new THREE.SphereGeometry(1, 16, 12),
  capsule: new THREE.CapsuleGeometry(1, 1, 8, 16),
  hairCap: new THREE.SphereGeometry(1, 32, 16, 0, Math.PI * 2, 0, Math.PI * 0.56),
  cone: new THREE.ConeGeometry(1, 1, 16),
  cylinder: new THREE.CylinderGeometry(1, 1, 1, 24),
  torusArc: new THREE.TorusGeometry(1, 0.22, 10, 24, Math.PI),
  torus: new THREE.TorusGeometry(1, 0.12, 10, 32),
  ring: new THREE.RingGeometry(0.78, 1, 48),
  disc: new THREE.CircleGeometry(1, 40),
  box: new THREE.BoxGeometry(1, 1, 1),
  star: (() => {
    const s = new THREE.Shape();
    for (let i = 0; i < 10; i++) {
      const r = i % 2 === 0 ? 1 : 0.45;
      const a = (i / 10) * Math.PI * 2 + Math.PI / 2;
      if (i === 0) s.moveTo(Math.cos(a) * r, Math.sin(a) * r);
      else s.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    return new THREE.ExtrudeGeometry(s, { depth: 0.3, bevelEnabled: false });
  })(),
};

const matCache = new Map<string, THREE.MeshStandardMaterial>();
function mat(color: string, opts: { rough?: number; metal?: number; emissive?: string; transparent?: number } = {}) {
  const key = `${color}|${opts.rough ?? 0.6}|${opts.metal ?? 0}|${opts.emissive ?? ''}|${opts.transparent ?? 1}`;
  let m = matCache.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({
      color,
      roughness: opts.rough ?? 0.6,
      metalness: opts.metal ?? 0,
      emissive: opts.emissive ? new THREE.Color(opts.emissive) : new THREE.Color(0),
      emissiveIntensity: opts.emissive ? 0.35 : 0,
      transparent: (opts.transparent ?? 1) < 1,
      opacity: opts.transparent ?? 1,
    });
    matCache.set(key, m);
  }
  return m;
}

function mesh(geo: THREE.BufferGeometry, material: THREE.Material, s: [number, number, number], p: [number, number, number], r?: [number, number, number]) {
  const m = new THREE.Mesh(geo, material);
  m.scale.set(...s);
  m.position.set(...p);
  if (r) m.rotation.set(...r);
  m.castShadow = true;
  return m;
}

export interface FigureRig {
  root: THREE.Group;
  /** Alles oberhalb der Füße (für Hüpfen/Atmen). */
  body: THREE.Group;
  head: THREE.Group;
  armL: THREE.Group;
  armR: THREE.Group;
  legL: THREE.Group;
  legR: THREE.Group;
  eyes: THREE.Object3D[];
  base: THREE.Mesh;
  mode: FigureMode;
  /** Für Blinzeln/Variation je Figur unterschiedlich. */
  seed: number;
  update: (t: number, dt: number) => void;
  setMode: (mode: FigureMode) => void;
  dispose: () => void;
  height: number;
}

const DARK = '#1d1f2a';

function buildEye(style: FigureConfig['eyes'], side: 1 | -1, isWinking: boolean): THREE.Object3D {
  const g = new THREE.Group();
  const dark = mat(DARK, { rough: 0.25 });
  if (style === 'happy' || (style === 'wink' && isWinking)) {
    const arc = mesh(G.torusArc, dark, [0.055, 0.055, 0.055], [0, -0.01, 0]);
    g.add(arc);
  } else if (style === 'sleepy') {
    g.add(mesh(G.sphere, dark, [0.05, 0.03, 0.03], [0, -0.012, 0]));
    g.add(mesh(G.box, mat(DARK), [0.12, 0.012, 0.02], [0, 0.012, 0.012]));
  } else if (style === 'star') {
    const st = mesh(G.star, mat('#ffcf33', { rough: 0.3, emissive: '#ffb300' }), [0.06, 0.06, 0.06], [0, 0, -0.005]);
    g.add(st);
  } else {
    g.add(mesh(G.sphere, dark, [0.052, 0.07, 0.035], [0, 0, 0]));
    g.add(mesh(G.sphereLow, mat('#ffffff', { rough: 0.2 }), [0.016, 0.016, 0.01], [0.016 * side, 0.024, 0.03]));
  }
  return g;
}

function buildMouth(style: FigureConfig['mouth']): THREE.Object3D {
  const g = new THREE.Group();
  const lip = mat('#8a2f2a', { rough: 0.5 });
  switch (style) {
    case 'grin': {
      g.add(mesh(G.torusArc, lip, [0.11, 0.08, 0.06], [0, 0.02, 0], [0, 0, Math.PI]));
      g.add(mesh(G.sphere, mat('#ffffff', { rough: 0.3 }), [0.085, 0.03, 0.02], [0, -0.025, 0.005]));
      break;
    }
    case 'open': {
      g.add(mesh(G.sphere, mat('#5a1a1f', { rough: 0.4 }), [0.08, 0.06, 0.03], [0, -0.02, 0]));
      g.add(mesh(G.sphere, mat('#ef6f7a'), [0.05, 0.025, 0.02], [0, -0.05, 0.012]));
      break;
    }
    case 'o':
      g.add(mesh(G.torus, lip, [0.035, 0.045, 0.06], [0, -0.01, 0]));
      break;
    case 'tongue':
      g.add(mesh(G.torusArc, lip, [0.08, 0.06, 0.05], [0, 0.015, 0], [0, 0, Math.PI]));
      g.add(mesh(G.sphere, mat('#ef6f7a'), [0.035, 0.045, 0.02], [0.02, -0.055, 0.01]));
      break;
    default:
      g.add(mesh(G.torusArc, lip, [0.08, 0.06, 0.05], [0, 0.015, 0], [0, 0, Math.PI]));
  }
  return g;
}

function buildHair(style: FigureConfig['hairStyle'], color: string, headR: number): THREE.Group {
  const g = new THREE.Group();
  if (style === 'bald') return g;
  const m = mat(color, { rough: 0.55 });
  const cap = (scale = 1.06) => mesh(G.hairCap, m, [headR * scale, headR * scale * 1.02, headR * scale], [0, 0.02, -0.01], [-0.18, 0, 0]);
  switch (style) {
    case 'short': {
      g.add(cap());
      g.add(mesh(G.sphere, m, [headR * 0.55, headR * 0.16, headR * 0.3], [-headR * 0.25, headR * 0.62, headR * 0.62], [0.5, 0.3, 0.2]));
      break;
    }
    case 'spiky': {
      g.add(cap(1.04));
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * Math.PI * 2;
        const tilt = 0.55;
        const c = mesh(G.cone, m, [headR * 0.22, headR * 0.55, headR * 0.22], [Math.cos(a) * headR * 0.45, headR * 0.92, Math.sin(a) * headR * 0.45 - 0.03], [Math.sin(a) * tilt, 0, -Math.cos(a) * tilt]);
        g.add(c);
      }
      g.add(mesh(G.cone, m, [headR * 0.24, headR * 0.6, headR * 0.24], [0, headR * 1.12, 0]));
      break;
    }
    case 'long': {
      g.add(cap(1.08));
      g.add(mesh(G.capsule, m, [headR * 0.78, headR * 0.6, headR * 0.45], [0, -headR * 0.2, -headR * 0.42]));
      g.add(mesh(G.capsule, m, [headR * 0.22, headR * 0.5, headR * 0.22], [headR * 0.82, -headR * 0.25, 0], [0, 0, 0.12]));
      g.add(mesh(G.capsule, m, [headR * 0.22, headR * 0.5, headR * 0.22], [-headR * 0.82, -headR * 0.25, 0], [0, 0, -0.12]));
      break;
    }
    case 'curly': {
      for (let i = 0; i < 26; i++) {
        const phi = Math.acos(1 - (i / 26) * 1.15);
        const theta = i * 2.39996;
        const r = headR * 1.02;
        const x = Math.sin(phi) * Math.cos(theta) * r;
        const z = Math.sin(phi) * Math.sin(theta) * r - 0.02;
        const y = Math.cos(phi) * r + 0.03;
        if (z > headR * 0.55 && y < headR * 0.55) continue; // Gesicht frei lassen
        g.add(mesh(G.sphereLow, m, [headR * 0.3, headR * 0.3, headR * 0.3], [x, y, z]));
      }
      break;
    }
    case 'bun': {
      g.add(cap(1.05));
      g.add(mesh(G.sphere, m, [headR * 0.38, headR * 0.38, headR * 0.38], [0, headR * 1.05, -headR * 0.35]));
      g.add(mesh(G.torus, mat('#ff6fb5'), [headR * 0.22, headR * 0.22, headR * 0.3], [0, headR * 0.9, -headR * 0.28], [Math.PI / 2.4, 0, 0]));
      break;
    }
    case 'mohawk': {
      for (let i = 0; i < 6; i++) {
        const a = -0.9 + i * 0.36;
        g.add(
          mesh(G.cone, m, [headR * 0.14, headR * 0.5, headR * 0.3], [0, Math.cos(a) * headR * 1.05, Math.sin(a) * headR * 1.05], [a, 0, 0]),
        );
      }
      break;
    }
  }
  return g;
}

function buildAccessory(kind: FigureConfig['accessory'], team: string, headR: number): THREE.Group {
  const g = new THREE.Group();
  const top = headR * 0.95;
  switch (kind) {
    case 'cap': {
      const m = mat(team, { rough: 0.6 });
      g.add(mesh(G.hairCap, m, [headR * 1.1, headR * 0.95, headR * 1.1], [0, 0.04, 0], [-0.1, 0, 0]));
      g.add(mesh(G.cylinder, m, [headR * 0.62, 0.025, headR * 0.5], [0, headR * 0.5, headR * 0.72], [0.18, 0, 0]));
      g.add(mesh(G.sphereLow, mat('#ffffff'), [0.04, 0.03, 0.04], [0, headR * 1.08, 0]));
      break;
    }
    case 'crown': {
      const gold = mat('#ffcc33', { rough: 0.25, metal: 0.85, emissive: '#7a5200' });
      g.add(mesh(G.cylinder, gold, [headR * 0.55, 0.12, headR * 0.55], [0, top + 0.02, 0]));
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        g.add(mesh(G.cone, gold, [0.06, 0.16, 0.06], [Math.cos(a) * headR * 0.5, top + 0.15, Math.sin(a) * headR * 0.5]));
        g.add(mesh(G.sphereLow, mat(i % 2 ? '#e8423f' : '#2f7de1', { rough: 0.2 }), [0.03, 0.03, 0.03], [Math.cos(a) * headR * 0.56, top + 0.02, Math.sin(a) * headR * 0.56]));
      }
      break;
    }
    case 'party': {
      g.add(mesh(G.cone, mat(team, { rough: 0.5 }), [headR * 0.42, headR * 1.05, headR * 0.42], [headR * 0.12, top + headR * 0.42, 0], [0, 0, -0.18]));
      g.add(mesh(G.sphere, mat('#ffffff'), [0.065, 0.065, 0.065], [headR * 0.3, top + headR * 0.98, 0]));
      for (let i = 0; i < 3; i++) {
        g.add(mesh(G.torus, mat('#ffffff', { rough: 0.4 }), [headR * (0.34 - i * 0.09), headR * (0.34 - i * 0.09), 0.3], [headR * (0.07 + i * 0.05), top + headR * (0.15 + i * 0.27), 0], [Math.PI / 2, -0.18, 0]));
      }
      break;
    }
    case 'headphones': {
      const dark = mat('#2a2f3a', { rough: 0.35 });
      g.add(mesh(G.torusArc, dark, [headR * 1.08, headR * 1.08, headR * 0.5], [0, 0.02, 0], [0, 0, 0]));
      g.add(mesh(G.cylinder, mat(team, { rough: 0.4 }), [0.11, 0.08, 0.11], [headR * 1.02, 0, 0], [0, 0, Math.PI / 2]));
      g.add(mesh(G.cylinder, mat(team, { rough: 0.4 }), [0.11, 0.08, 0.11], [-headR * 1.02, 0, 0], [0, 0, Math.PI / 2]));
      break;
    }
    case 'glasses':
    case 'sunglasses': {
      const frame = mat(kind === 'sunglasses' ? '#111' : '#3a2a20', { rough: 0.3 });
      for (const side of [1, -1]) {
        g.add(mesh(G.torus, frame, [0.085, 0.07, 0.25], [side * 0.13, 0.08, headR * 0.93]));
        if (kind === 'sunglasses') g.add(mesh(G.disc, mat('#121722', { rough: 0.1, metal: 0.4 }), [0.085, 0.07, 1], [side * 0.13, 0.08, headR * 0.935]));
      }
      g.add(mesh(G.box, frame, [0.08, 0.018, 0.018], [0, 0.1, headR * 0.95]));
      break;
    }
    case 'flower': {
      const petal = mat('#ff7fb8', { rough: 0.5 });
      const cx = headR * 0.62;
      const cy = headR * 0.62;
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        g.add(mesh(G.sphereLow, petal, [0.07, 0.04, 0.07], [cx + Math.cos(a) * 0.075, cy + Math.sin(a) * 0.075, headR * 0.35], [Math.PI / 2, 0, 0]));
      }
      g.add(mesh(G.sphereLow, mat('#ffd23f'), [0.045, 0.045, 0.045], [cx, cy, headR * 0.38]));
      break;
    }
    case 'bandana': {
      g.add(mesh(G.torus, mat(team, { rough: 0.6 }), [headR * 0.93, headR * 0.93, 0.75], [0, headR * 0.5, -0.02], [Math.PI / 2 - 0.22, 0, 0]));
      g.add(mesh(G.sphereLow, mat(team), [0.06, 0.05, 0.04], [0, headR * 0.38, -headR * 0.95]));
      break;
    }
    case 'tophat': {
      const black = mat('#1a1b22', { rough: 0.45 });
      g.add(mesh(G.cylinder, black, [headR * 0.72, 0.03, headR * 0.72], [0, top - 0.02, 0]));
      g.add(mesh(G.cylinder, black, [headR * 0.46, 0.38, headR * 0.46], [0, top + 0.17, 0]));
      g.add(mesh(G.cylinder, mat(team), [headR * 0.47, 0.07, headR * 0.47], [0, top + 0.03, 0]));
      break;
    }
  }
  return g;
}

export function createFigure(config: FigureConfig, color: TeamColorKey, opts: { base?: boolean } = {}): FigureRig {
  const team = teamColor(color);
  const skin = FIGURE_SKINS[config.skin] ?? FIGURE_SKINS[1];
  const hair = FIGURE_HAIR_COLORS[config.hairColor] ?? FIGURE_HAIR_COLORS[1];
  const pants = FIGURE_PANTS[config.pants] ?? FIGURE_PANTS[0];
  const skinM = mat(skin, { rough: 0.62 });
  const shirtM = mat(team.hex, { rough: 0.72 });
  const pantsM = mat(pants, { rough: 0.8 });
  const shoeM = mat('#2b2d38', { rough: 0.45 });

  const wide = config.body === 'round' ? 1.25 : 1;
  const tall = config.body === 'tall' ? 1.18 : 1;
  const legLen = 0.32 * tall;
  const headR = 0.34;

  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);

  // Beine (Pivot an der Hüfte)
  const hipY = 0.12 + legLen;
  const mkLeg = (side: number) => {
    const leg = new THREE.Group();
    leg.position.set(0.1 * side * wide, hipY, 0);
    leg.add(mesh(G.capsule, pantsM, [0.085, legLen * 0.55, 0.085], [0, -legLen * 0.5, 0]));
    leg.add(mesh(G.sphere, shoeM, [0.1, 0.07, 0.15], [0, -legLen - 0.02, 0.04]));
    body.add(leg);
    return leg;
  };
  const legL = mkLeg(1);
  const legR = mkLeg(-1);

  // Rumpf
  const torsoH = 0.34 * tall;
  const torsoY = hipY + torsoH * 0.5 + 0.02;
  body.add(mesh(G.capsule, shirtM, [0.21 * wide, torsoH * 0.5, 0.17 * wide], [0, torsoY, 0]));
  body.add(mesh(G.sphere, pantsM, [0.205 * wide, 0.09, 0.165 * wide], [0, hipY + 0.02, 0]));
  // Teamfarbiges Brust-Emblem (Kreis)
  body.add(mesh(G.disc, mat('#ffffff', { rough: 0.5, transparent: 0.9 }), [0.07, 0.07, 1], [0, torsoY + 0.05, 0.172 * wide + 0.003]));
  body.add(mesh(G.disc, mat(team.dark, { rough: 0.5 }), [0.045, 0.045, 1], [0, torsoY + 0.05, 0.172 * wide + 0.005]));

  // Arme (Pivot an der Schulter)
  const shoulderY = torsoY + torsoH * 0.38;
  const mkArm = (side: number) => {
    const arm = new THREE.Group();
    arm.position.set(0.25 * side * wide, shoulderY, 0);
    arm.rotation.z = 0.32 * side;
    arm.add(mesh(G.capsule, shirtM, [0.07, 0.08, 0.07], [0, -0.08, 0]));
    arm.add(mesh(G.capsule, skinM, [0.058, 0.1, 0.058], [0, -0.22, 0]));
    arm.add(mesh(G.sphere, skinM, [0.07, 0.07, 0.07], [0, -0.33, 0]));
    body.add(arm);
    return arm;
  };
  const armL = mkArm(1);
  const armR = mkArm(-1);

  // Kopf
  const head = new THREE.Group();
  head.position.set(0, shoulderY + 0.06 + headR, 0);
  body.add(head);
  head.add(mesh(G.sphere, skinM, [headR, headR * 1.04, headR * 0.96], [0, 0, 0]));
  // Ohren
  head.add(mesh(G.sphereLow, skinM, [0.06, 0.09, 0.05], [headR * 0.97, 0, 0]));
  head.add(mesh(G.sphereLow, skinM, [0.06, 0.09, 0.05], [-headR * 0.97, 0, 0]));
  // Nase
  head.add(mesh(G.sphereLow, skinM, [0.045, 0.04, 0.05], [0, -0.02, headR * 0.95]));
  // Wangen
  const blush = mat('#ff8a9a', { rough: 0.9, transparent: 0.35 });
  head.add(mesh(G.disc, blush, [0.06, 0.04, 1], [0.17, -0.07, headR * 0.9], [0, 0.45, 0]));
  head.add(mesh(G.disc, blush, [0.06, 0.04, 1], [-0.17, -0.07, headR * 0.9], [0, -0.45, 0]));
  // Augen
  const eyes: THREE.Object3D[] = [];
  for (const side of [1, -1] as const) {
    const eye = buildEye(config.eyes, side, config.eyes === 'wink' && side === -1);
    eye.position.set(side * 0.12, 0.06, headR * 0.92);
    eye.rotation.y = side * 0.32;
    head.add(eye);
    eyes.push(eye);
  }
  // Augenbrauen
  const browM = mat(hair, { rough: 0.6 });
  for (const side of [1, -1]) {
    head.add(mesh(G.capsule, browM, [0.016, 0.035, 0.016], [side * 0.12, 0.17, headR * 0.9], [0, side * 0.3, Math.PI / 2 + side * 0.15]));
  }
  // Mund
  const mouth = buildMouth(config.mouth);
  mouth.position.set(0, -0.13, headR * 0.93);
  head.add(mouth);
  // Haare & Zubehör
  head.add(buildHair(config.hairStyle, hair, headR));
  head.add(buildAccessory(config.accessory, team.hex, headR));

  // Teamfarbener Leuchtring am Boden
  const base = new THREE.Mesh(
    G.ring,
    new THREE.MeshBasicMaterial({ color: team.hex, transparent: true, opacity: 0.9, depthWrite: false }),
  );
  base.rotation.x = -Math.PI / 2;
  base.scale.setScalar(0.42);
  base.position.y = 0.012;
  base.renderOrder = 2;
  base.visible = opts.base ?? true;
  root.add(base);

  const height = head.position.y + headR * 1.2;
  const seed = Math.random() * 100;

  const rig: FigureRig = {
    root,
    body,
    head,
    armL,
    armR,
    legL,
    legR,
    eyes,
    base,
    mode: 'idle',
    seed,
    height,
    setMode(mode) {
      rig.mode = mode;
    },
    update(t) {
      const tt = t + seed;
      const m = rig.mode;
      // Blinzeln
      const blink = (tt % 4.3) < 0.12 ? 0.1 : 1;
      for (const e of eyes) e.scale.y = m === 'stuck' ? 0.6 : blink;

      let bob = 0;
      let armSwing = 0;
      let legSwing = 0;
      let armLift = 0;
      let headTilt = 0;
      let headTurn = Math.sin(tt * 0.6) * 0.18 * (m === 'idle' ? 1 : 0.2);
      switch (m) {
        case 'idle':
          bob = Math.sin(tt * 2.2) * 0.01;
          armSwing = Math.sin(tt * 2.2) * 0.05;
          break;
        case 'walk':
          bob = Math.abs(Math.sin(tt * 11)) * 0.04;
          armSwing = Math.sin(tt * 11) * 0.7;
          legSwing = Math.sin(tt * 11) * 0.6;
          break;
        case 'jump':
          armLift = 2.4;
          legSwing = 0.25;
          break;
        case 'cheer':
          bob = Math.abs(Math.sin(tt * 7)) * 0.12;
          armLift = 2.6 + Math.sin(tt * 14) * 0.25;
          headTilt = -0.12;
          break;
        case 'sad':
          headTilt = 0.35;
          armSwing = 0;
          bob = Math.sin(tt * 1.5) * 0.005;
          break;
        case 'fly':
          armLift = 1.6 + Math.sin(tt * 20) * 0.2;
          legSwing = Math.sin(tt * 18) * 0.5;
          break;
        case 'stuck':
          bob = Math.sin(tt * 25) * 0.006;
          armLift = 0.4;
          headTurn = Math.sin(tt * 3) * 0.5;
          break;
      }
      body.position.y = bob;
      body.scale.y = m === 'idle' ? 1 + Math.sin(tt * 2.2) * 0.01 : 1;
      armL.rotation.x = armSwing;
      armR.rotation.x = -armSwing;
      armL.rotation.z = 0.32 + armLift;
      armR.rotation.z = -0.32 - armLift;
      legL.rotation.x = -legSwing;
      legR.rotation.x = legSwing;
      head.rotation.y = headTurn;
      head.rotation.x = headTilt;
      if (base.visible) {
        const mBase = base.material as THREE.MeshBasicMaterial;
        mBase.opacity = 0.65 + Math.sin(tt * 3) * 0.2;
      }
    },
    dispose() {
      (base.material as THREE.Material).dispose();
    },
  };
  rig.update(0, 0);
  return rig;
}
