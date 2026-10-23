/**
 * Spielfigur der Blockwelt: Kastenmännchen mit Pixel-Haut (8er-Kopf, 12er-Rumpf/Arme/Beine) aus den
 * gleichen Editor-Einstellungen wie die Insel-Figur. Hemd = Teamfarbe. Bewegungen wie die
 * Insel-Figur (poseFigure), nur mit hängenden Armen.
 */
import * as THREE from 'three';
import { FIGURE_HAIR_COLORS, FIGURE_PANTS, FIGURE_SKINS, teamColor, type FigureConfig, type TeamColorKey } from '@insel/shared';
import { buildBoxModel, type BoxSpec, type Face, type FacePainter } from '../board/blocks/boxmodel.ts';
import { hex, mix, Pixels, rngFor, shade, type RGB } from '../board/blocks/pixels.ts';
import { poseFigure, type FigureRig } from './figure3d.ts';

/** Gesamthöhe in Einheiten (wie die Insel-Figur, damit Kamera und Felder passen) */
const HEIGHT = 1.57;

const speck = (base: RGB, salt: string, spread = 0.06): FacePainter => (face, p) => {
  const rng = rngFor(`${salt}-${face}`);
  for (let y = 0; y < p.h; y++) for (let x = 0; x < p.w; x++) p.set(x, y, shade(base, 1 - spread + rng.next() * spread * 2));
};

function eyesFor(kind: FigureConfig['eyes'], p: Pixels, skin: RGB) {
  const iris = '#3b2f5c';
  const dark = '#262626';
  const lid = shade(skin, 0.82);
  const open = (x: number, inner: 'l' | 'r') => {
    p.set(x, 4, inner === 'l' ? '#ffffff' : iris);
    p.set(x + 1, 4, inner === 'l' ? iris : '#ffffff');
  };
  const line = (x: number) => {
    p.set(x, 4, dark);
    p.set(x + 1, 4, dark);
    p.set(x, 3, lid);
    p.set(x + 1, 3, lid);
  };
  switch (kind) {
    case 'happy':
      p.set(1, 4, dark);
      p.set(2, 3, dark);
      p.set(5, 3, dark);
      p.set(6, 4, dark);
      break;
    case 'sleepy':
      line(1);
      line(5);
      break;
    case 'wink':
      open(1, 'l');
      line(5);
      break;
    case 'star':
      for (const x of [1, 5]) {
        p.rect(x, 3, 2, 2, '#ffd34d');
        p.set(x, 3, '#fff2a1');
      }
      break;
    default:
      open(1, 'l');
      open(5, 'r');
  }
}

function mouthFor(kind: FigureConfig['mouth'], p: Pixels, skin: RGB) {
  const dark = shade(skin, 0.45);
  switch (kind) {
    case 'grin':
      p.rect(2, 6, 4, 1, '#ffffff');
      p.rect(2, 7, 4, 1, dark);
      break;
    case 'open':
      p.rect(3, 6, 2, 1, dark);
      p.rect(3, 7, 2, 1, '#c0392b');
      break;
    case 'o':
      p.rect(3, 6, 2, 2, dark);
      break;
    case 'tongue':
      p.rect(2, 6, 4, 1, dark);
      p.set(4, 7, '#f07a8a');
      break;
    default:
      p.set(2, 6, dark);
      p.rect(3, 7, 2, 1, dark);
      p.set(5, 6, dark);
  }
}

export function createBlockFigure(config: FigureConfig, color: TeamColorKey, opts: { base?: boolean } = {}): FigureRig {
  const team = teamColor(color);
  const skin = hex(FIGURE_SKINS[config.skin] ?? FIGURE_SKINS[1]);
  const hair = hex(FIGURE_HAIR_COLORS[config.hairColor] ?? FIGURE_HAIR_COLORS[1]);
  const pants = hex(FIGURE_PANTS[config.pants] ?? FIGURE_PANTS[0]);
  const shirt = hex(team.hex);
  const shirtDark = hex(team.dark);
  const style = config.hairStyle;
  const wide = config.body === 'round';
  const legH = config.body === 'tall' ? 14 : 12;
  const bodyW = wide ? 10 : 8;
  const bodyD = wide ? 6 : 4;
  const seed = `${config.skin}-${config.hairStyle}-${config.hairColor}-${color}`;

  // --- Kopf -------------------------------------------------------------------------------
  const hairPx = (rng: { next(): number }) => shade(hair, style === 'curly' ? (rng.next() < 0.5 ? 0.82 : 1.08) : 0.92 + rng.next() * 0.14);
  const hairDepth = style === 'long' ? 8 : style === 'curly' ? 4 : style === 'bald' ? 0 : 2;
  const paintHead: FacePainter = (face, p) => {
    speck(skin, `${seed}-skin`, 0.04)(face, p);
    const rng = rngFor(`${seed}-hair-${face}`);
    if (style !== 'bald') {
      if (face === 'top') for (let y = 0; y < p.h; y++) for (let x = 0; x < p.w; x++) p.set(x, y, style === 'mohawk' && (x < 3 || x > 4) ? shade(skin, 0.9) : hairPx(rng));
      if (face === 'back' || face === 'left' || face === 'right') {
        const d = style === 'mohawk' ? 1 : face === 'back' ? Math.max(hairDepth, 3) : hairDepth;
        for (let y = 0; y < Math.min(p.h, d); y++)
          for (let x = 0; x < p.w; x++) if (!(style === 'mohawk' && face !== 'back' && (x < 3 || x > 4))) p.set(x, y, hairPx(rng));
        // stufig auslaufen
        if (style !== 'long' && d < p.h) for (let x = 0; x < p.w; x++) if (rng.next() < 0.35) p.set(x, d, hairPx(rng));
      }
      if (face === 'front') {
        const fringe = style === 'spiky' ? 1 : style === 'curly' ? 2 : style === 'mohawk' ? 0 : 1;
        for (let y = 0; y < fringe; y++) for (let x = 0; x < p.w; x++) p.set(x, y, hairPx(rng));
        if (style === 'short' || style === 'bun') p.set(0, 1, hairPx(rng)), p.set(7, 1, hairPx(rng)), p.set(1, 1, hairPx(rng));
        if (style === 'long' || style === 'curly') for (let y = 1; y < (style === 'long' ? 7 : 4); y++) p.set(0, y, hairPx(rng)), p.set(7, y, hairPx(rng));
        if (style === 'spiky') for (let x = 0; x < 8; x += 2) p.set(x, 1, hairPx(rng));
      }
    }
    if (face === 'front') {
      // Nase, Augen, Mund
      p.rect(3, 5, 2, 1, shade(skin, 0.88));
      eyesFor(config.eyes, p, skin);
      mouthFor(config.mouth, p, skin);
      if (config.accessory === 'glasses') {
        for (const x of [0, 4]) {
          p.rect(x, 3, 4, 1, '#2b2b2b');
          p.set(x, 4, '#2b2b2b');
          p.set(x + 3, 4, '#2b2b2b');
        }
      }
      if (config.accessory === 'sunglasses') {
        p.rect(0, 3, 8, 2, '#1b1b1b');
        p.set(1, 3, '#4d4d4d');
        p.set(5, 3, '#4d4d4d');
      }
    }
    if (config.accessory === 'bandana' && face !== 'top' && face !== 'bottom') {
      for (let x = 0; x < p.w; x++) {
        p.set(x, 1, (x + (face === 'front' ? 0 : 1)) % 3 === 0 ? '#f4f4f4' : '#c8302a');
        p.set(x, 2, '#a8261f');
      }
    }
  };

  const headChildren: BoxSpec[] = [];
  const box = (name: string, size: [number, number, number], pivot: [number, number, number], from: [number, number, number], paint: FacePainter, cutout = false): BoxSpec => ({
    name,
    size,
    pivot,
    from,
    paint,
    cutout,
  });
  const hairBox: FacePainter = (face, p) => {
    const rng = rngFor(`${seed}-hx-${face}`);
    for (let y = 0; y < p.h; y++) for (let x = 0; x < p.w; x++) p.set(x, y, hairPx(rng));
  };
  if (style === 'bun') headChildren.push(box('bun', [4, 3, 4], [0, 8, -2], [-2, 0, -2], hairBox));
  if (style === 'mohawk') headChildren.push(box('mohawk', [2, 3, 8], [0, 8, 0], [-1, 0, -4], hairBox));
  if (style === 'spiky') for (const [x, z] of [[-3, -2], [0, -3], [3, -1], [-2, 2], [2, 2]] as const) headChildren.push(box(`spike${x}${z}`, [2, 2, 2], [x, 8, z], [-1, 0, -1], hairBox));
  if (style === 'long') headChildren.push(box('hairBack', [8, 5, 1], [0, 0, -4], [-4, -5, -1], hairBox));

  const solid = (c: RGB | string, salt: string): FacePainter => speck(typeof c === 'string' ? hex(c) : c, `${seed}-${salt}`, 0.05);
  switch (config.accessory) {
    case 'cap':
      headChildren.push(box('cap', [8, 2, 8], [0, 8, 0], [-4, -0.5, -4], solid('#d63c3c', 'cap')));
      headChildren.push(box('brim', [8, 1, 4], [0, 7.5, 4], [-4, 0, 0], solid('#b52f2f', 'brim')));
      break;
    case 'crown':
      headChildren.push(
        box(
          'crown',
          [8, 3, 8],
          [0, 8, 0],
          [-4, -0.5, -4],
          (face, p) => {
            for (let y = 0; y < p.h; y++) for (let x = 0; x < p.w; x++) p.set(x, y, y === 0 && x % 2 === 1 && face !== 'top' && face !== 'bottom' ? '#000000' : (x + y) % 3 ? '#f5c518' : '#ffe27a', y === 0 && x % 2 === 1 && face !== 'top' && face !== 'bottom' ? 0 : 255);
            if (face === 'top') p.rect(1, 1, p.w - 2, p.h - 2, '#000000', 0);
            if (face === 'front') p.set(3, 1, '#d63c3c');
          },
          true,
        ),
      );
      break;
    case 'party': {
      const stripes: FacePainter = (face, p) => {
        for (let y = 0; y < p.h; y++) for (let x = 0; x < p.w; x++) p.set(x, y, (x + y) % 3 === 0 ? '#ffd34d' : '#9b59d6');
      };
      headChildren.push(box('party0', [6, 2, 6], [0, 8, 0], [-3, 0, -3], stripes));
      headChildren.push(box('party1', [4, 2, 4], [0, 10, 0], [-2, 0, -2], stripes));
      headChildren.push(box('party2', [2, 2, 2], [0, 12, 0], [-1, 0, -1], solid('#ff5fa2', 'pompom')));
      break;
    }
    case 'headphones':
      headChildren.push(box('band', [10, 1, 2], [0, 8.5, 0], [-5, 0, -1], solid('#2b2b2b', 'band')));
      headChildren.push(box('cupL', [1, 3, 3], [4.5, 4, 0], [0, -1.5, -1.5], solid(shirt, 'cupL')));
      headChildren.push(box('cupR', [1, 3, 3], [-4.5, 4, 0], [-1, -1.5, -1.5], solid(shirt, 'cupR')));
      break;
    case 'flower':
      headChildren.push(
        box('flower', [3, 3, 1], [3, 7, 4], [-1.5, -1.5, 0], (_f, p) => {
          p.rect(0, 0, 3, 3, '#ff5fa2');
          p.set(1, 1, '#ffd34d');
        }),
      );
      break;
    case 'bandana':
      headChildren.push(box('knot', [2, 2, 1], [0, 6, -4], [-1, -1, -1], solid('#c8302a', 'knot')));
      break;
    case 'tophat':
      headChildren.push(box('hatBrim', [10, 1, 10], [0, 8, 0], [-5, 0, -5], solid('#1e1e24', 'brim')));
      headChildren.push(
        box('hatTop', [6, 5, 6], [0, 9, 0], [-3, 0, -3], (face, p) => {
          speck(hex('#1e1e24'), `${seed}-hat`)(face, p);
          if (face !== 'top' && face !== 'bottom') p.rect(0, p.h - 2, p.w, 1, '#c8302a');
        }),
      );
      break;
  }

  // --- Körper -------------------------------------------------------------------------------
  const paintShirt: FacePainter = (face, p) => {
    speck(shirt, `${seed}-shirt`)(face, p);
    if (face === 'top' || face === 'bottom') return;
    // Saum und Gürtel
    p.rect(0, p.h - 1, p.w, 1, pants);
    p.rect(0, p.h - 2, p.w, 1, shirtDark);
    if (face === 'front') {
      const c = Math.floor(p.w / 2);
      p.rect(c - 1, 0, 2, 1, skin);
      p.set(c - 1, 1, mix(skin, shirt, 0.5));
      // kleines Teamwappen
      p.rect(c - 1, 4, 2, 2, shirtDark);
    }
  };
  const paintArm: FacePainter = (face, p) => {
    speck(skin, `${seed}-arm`, 0.04)(face, p);
    if (face === 'top') speck(shirt, `${seed}-sleeve`)(face, p);
    if (face !== 'top' && face !== 'bottom') {
      const rng = rngFor(`${seed}-sl-${face}`);
      for (let y = 0; y < 4; y++) for (let x = 0; x < p.w; x++) p.set(x, y, shade(shirt, 0.94 + rng.next() * 0.1));
      p.rect(0, 3, p.w, 1, shirtDark);
    }
  };
  const paintLeg: FacePainter = (face, p) => {
    speck(pants, `${seed}-pants`)(face, p);
    if (face !== 'top' && face !== 'bottom') p.rect(0, p.h - 2, p.w, 2, '#3a3a40');
    if (face === 'bottom') p.rect(0, 0, p.w, p.h, '#2c2c30');
  };

  const shoulderY = legH + 12;
  const spec: BoxSpec = {
    name: 'torso',
    size: [bodyW, 12, bodyD],
    pivot: [0, legH, 0],
    from: [-bodyW / 2, 0, -bodyD / 2],
    paint: paintShirt,
    children: [
      { name: 'head', size: [8, 8, 8], pivot: [0, 12, 0], from: [-4, 0, -4], paint: paintHead, children: headChildren, cutout: false },
      { name: 'armL', size: [4, 12, 4], pivot: [bodyW / 2 + 2, 10, 0], from: [-2, -10, -2], paint: paintArm },
      { name: 'armR', size: [4, 12, 4], pivot: [-bodyW / 2 - 2, 10, 0], from: [-2, -10, -2], paint: paintArm },
      { name: 'legL', size: [4, legH, 4], pivot: [2 * (wide ? 1.25 : 1), 0, 0], from: [-2, -legH, -2], paint: paintLeg },
      { name: 'legR', size: [4, legH, 4], pivot: [-2 * (wide ? 1.25 : 1), 0, 0], from: [-2, -legH, -2], paint: paintLeg },
    ],
  };
  const model = buildBoxModel(spec);
  const total = shoulderY + 8 + (headChildren.length ? 1 : 0);
  const scale = HEIGHT / ((legH + 20) / 16);

  // Gelenke so umhängen, dass poseFigure sie wie bei der Insel-Figur bewegt:
  // body (alles über den Füßen) → Beine, Rumpf → Arme, Kopf
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const holder = model.root;
  holder.scale.setScalar(scale);
  body.add(holder);
  const parts = model.parts;
  const torso = parts.torso as THREE.Group;
  const legL = parts.legL as THREE.Group;
  const legR = parts.legR as THREE.Group;
  // Beine hängen am Rumpf-Drehpunkt (Hüfte) – für poseFigure an body statt am Rumpf
  torso.remove(legL, legR);
  holder.add(legL, legR);
  legL.position.y += legH / 16;
  legR.position.y += legH / 16;

  // Teamfarbener, eckiger Rahmen am Boden (statt Leuchtring)
  const frame = new THREE.Shape();
  frame.moveTo(-0.5, -0.5);
  frame.lineTo(0.5, -0.5);
  frame.lineTo(0.5, 0.5);
  frame.lineTo(-0.5, 0.5);
  frame.lineTo(-0.5, -0.5);
  const hole = new THREE.Path();
  hole.moveTo(-0.4, -0.4);
  hole.lineTo(-0.4, 0.4);
  hole.lineTo(0.4, 0.4);
  hole.lineTo(0.4, -0.4);
  hole.lineTo(-0.4, -0.4);
  frame.holes.push(hole);
  const base = new THREE.Mesh(new THREE.ShapeGeometry(frame), new THREE.MeshBasicMaterial({ color: team.hex, transparent: true, opacity: 0.9, depthWrite: false }));
  base.rotation.x = -Math.PI / 2;
  base.scale.setScalar(0.8);
  base.position.y = 0.012;
  base.renderOrder = 2;
  base.visible = opts.base ?? true;
  root.add(base);

  const rig: FigureRig = {
    root,
    body,
    head: parts.head as THREE.Group,
    armL: parts.armL as THREE.Group,
    armR: parts.armR as THREE.Group,
    legL,
    legR,
    eyes: [],
    base,
    mode: 'idle',
    seed: Math.random() * 100,
    height: (total / 16) * scale,
    setMode(mode) {
      rig.mode = mode;
    },
    update(t) {
      const tt = t + rig.seed;
      poseFigure(rig, rig.mode, tt, 0.04);
      // Blockfiguren drehen den Kopf ohne Neigung zur Seite
      rig.head.rotation.z = 0;
      if (base.visible) (base.material as THREE.MeshBasicMaterial).opacity = 0.65 + Math.sin(tt * 3) * 0.2;
    },
    dispose() {
      model.dispose();
      base.geometry.dispose();
      (base.material as THREE.Material).dispose();
    },
  };
  rig.update(0, 0);
  return rig;
}

export type { Face };
