/**
 * Block-Texturen der Blockwelt als ein Atlas: jede Kachel 16×16 Pixel, mit 4 Pixel Rand aus der
 * gekachelten Wiederholung, damit Mipmaps nicht in die Nachbarkachel bluten.
 * Alle Muster sind eigene Pixelzeichnungen im typischen Blockspiel-Stil.
 */
import * as THREE from 'three';
import { hex, mix, Pixels, rngFor, shade, type RGB } from './pixels.ts';

const T = 16;
const PAD = 4;
const CELL = T + PAD * 2;
const COLS = 8;

type Painter = (p: Pixels, name: string) => void;

/** Voronoi-Steine (Bruchstein, Kies): Fugen dunkel, Steine zur Mitte hin heller */
function stones(p: Pixels, name: string, count: number, light: RGB, dark: RGB, line: RGB, tint?: (x: number, y: number, c: RGB) => RGB) {
  const rng = rngFor(name);
  const seeds = Array.from({ length: count }, () => ({ x: rng.next() * T, y: rng.next() * T, f: 0.85 + rng.next() * 0.3 }));
  const near = (x: number, y: number) => {
    let a = Infinity;
    let b = Infinity;
    let k = 0;
    for (let i = 0; i < seeds.length; i++) {
      const s = seeds[i]!;
      // gekachelt: Abstand mit Umbruch
      const dx = Math.min(Math.abs(x - s.x), T - Math.abs(x - s.x));
      const dy = Math.min(Math.abs(y - s.y), T - Math.abs(y - s.y));
      const d = Math.hypot(dx, dy);
      if (d < a) {
        b = a;
        a = d;
        k = i;
      } else if (d < b) b = d;
    }
    return { a, b, k };
  };
  for (let y = 0; y < T; y++)
    for (let x = 0; x < T; x++) {
      const { a, b, k } = near(x + 0.5, y + 0.5);
      let c: RGB;
      if (b - a < 1.1) c = line;
      else {
        const t = Math.min(1, a / 4.5);
        c = shade(mix(light, dark, t), seeds[k]!.f);
        if (rng.next() < 0.12) c = shade(c, 0.9);
      }
      p.set(x, y, tint ? tint(x, y, c) : c);
    }
}

const PAINTERS: Record<string, Painter> = {
  grass_top(p, n) {
    p.speckle(0, 0, T, T, ['#5e9b35', '#69a83c', '#74b444', '#80bf4e', '#548b2f'], rngFor(n), [3, 4, 4, 2, 2]);
  },
  dirt(p, n) {
    p.speckle(0, 0, T, T, ['#96694a', '#866043', '#79553a', '#5f4129', '#a47652'], rngFor(n), [3, 4, 3, 1, 1]);
  },
  grass_side(p, n) {
    PAINTERS.dirt!(p, 'dirt');
    const rng = rngFor(n);
    const greens = ['#5e9b35', '#69a83c', '#74b444', '#548b2f'];
    for (let x = 0; x < T; x++) {
      const depth = 2 + Math.floor(rng.next() * 3) + (rng.next() < 0.2 ? 1 : 0);
      for (let y = 0; y < depth; y++) p.set(x, y, greens[Math.floor(rng.next() * greens.length)]!);
    }
  },
  path_top(p, n) {
    p.speckle(0, 0, T, T, ['#94754a', '#a1824f', '#8b6c42', '#b08e5a'], rngFor(n), [4, 3, 2, 1]);
  },
  path_side(p, n) {
    PAINTERS.dirt!(p, 'dirt');
    p.speckle(0, 0, T, 2, ['#94754a', '#a1824f', '#8b6c42'], rngFor(n));
  },
  stone(p, n) {
    const rng = rngFor(n);
    p.speckle(0, 0, T, T, ['#7f7f7f', '#787878', '#888888', '#727272'], rng, [5, 3, 2, 2]);
    for (let i = 0; i < 7; i++) {
      const x = Math.floor(rng.next() * T);
      const y = Math.floor(rng.next() * T);
      const len = 2 + Math.floor(rng.next() * 3);
      for (let k = 0; k < len; k++) p.set((x + k) % T, y, '#6a6a6a');
    }
  },
  cobblestone(p, n) {
    stones(p, n, 9, hex('#a6a6a6'), hex('#6f6f6f'), hex('#4c4c4c'));
  },
  mossy_cobblestone(p, n) {
    const rng = rngFor(n, 3);
    stones(p, 'cobblestone', 9, hex('#a6a6a6'), hex('#6f6f6f'), hex('#4c4c4c'), (x, y, c) => {
      const moss = Math.sin(x * 0.7 + y * 0.3) + Math.cos(y * 0.9 - x * 0.2) + rng.next() * 0.8;
      return moss > 1.1 ? mix(c, hex('#5b7f34'), 0.75) : c;
    });
  },
  gravel(p, n) {
    stones(p, n, 22, hex('#a39c97'), hex('#7a716c'), hex('#5d5652'), (x, y, c) => (((x * 7 + y * 13) % 5 === 0) ? mix(c, hex('#8b6f5d'), 0.4) : c));
  },
  sand(p, n) {
    p.speckle(0, 0, T, T, ['#dbd3a0', '#d6cc94', '#e2dbab', '#cfc48b', '#e8e1b6'], rngFor(n), [4, 3, 2, 2, 1]);
  },
  sandstone(p, n) {
    p.speckle(0, 0, T, T, ['#d8cb94', '#d1c28a', '#ddd19c'], rngFor(n));
    p.rect(0, 0, T, 1, '#e3d8a6');
    p.rect(0, 12, T, 1, '#c5b47c');
    p.rect(0, 15, T, 1, '#bcaa72');
  },
  log_side(p, n) {
    const rng = rngFor(n);
    const tones = ['#6b5032', '#5a4229', '#7a5c3b', '#4e3922'];
    for (let x = 0; x < T; x++) {
      const base = tones[(x * 3 + (x % 4 === 1 ? 1 : 0)) % tones.length]!;
      for (let y = 0; y < T; y++) p.set(x, y, rng.next() < 0.18 ? shade(hex(base), 0.85) : base);
    }
  },
  log_top(p) {
    for (let y = 0; y < T; y++)
      for (let x = 0; x < T; x++) {
        const d = Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5));
        p.set(x, y, d >= 7 ? '#5a4229' : Math.floor(d) % 2 === 0 ? '#b8945f' : '#9f7d4c');
      }
  },
  birch_side(p, n) {
    const rng = rngFor(n);
    p.speckle(0, 0, T, T, ['#e3e0d4', '#d8d4c6', '#ece9df'], rng);
    for (let i = 0; i < 6; i++) {
      const y = Math.floor(rng.next() * T);
      const x = Math.floor(rng.next() * 12);
      const w = 2 + Math.floor(rng.next() * 4);
      p.rect(x, y, w, 1, '#3b3a35');
      if (rng.next() < 0.5) p.rect(x + 1, y + 1, Math.max(1, w - 2), 1, '#55534b');
    }
  },
  planks(p, n) {
    const rng = rngFor(n);
    p.speckle(0, 0, T, T, ['#b8945f', '#af8c58', '#c09c66', '#a5834f'], rng, [4, 3, 2, 1]);
    for (let row = 0; row < 4; row++) {
      p.rect(0, row * 4 + 3, T, 1, '#7f6338');
      const seam = (row * 7 + 3) % T;
      p.rect(seam, row * 4, 1, 3, '#8f7043');
    }
  },
  leaves(p, n) {
    const rng = rngFor(n);
    p.speckle(0, 0, T, T, ['#3e7a2a', '#4b8b33', '#336a22', '#5a9a3c', '#2a5a1c'], rng, [4, 4, 3, 2, 1]);
    for (let i = 0; i < 26; i++) p.set(Math.floor(rng.next() * T), Math.floor(rng.next() * T), '#000000', 0);
  },
  birch_leaves(p, n) {
    const rng = rngFor(n);
    p.speckle(0, 0, T, T, ['#6a9a3c', '#7aab48', '#5b8a33', '#86b852'], rng);
    for (let i = 0; i < 26; i++) p.set(Math.floor(rng.next() * T), Math.floor(rng.next() * T), '#000000', 0);
  },
  water(p, n) {
    const rng = rngFor(n);
    for (let y = 0; y < T; y++)
      for (let x = 0; x < T; x++) {
        const w = Math.sin((x + y * 0.5) * 0.8) * 0.5 + 0.5;
        p.set(x, y, mix(hex('#2f5fd0'), hex('#4c86ee'), w * 0.7 + rng.next() * 0.3));
      }
  },
  lava(p, n) {
    const rng = rngFor(n);
    for (let y = 0; y < T; y++)
      for (let x = 0; x < T; x++) {
        const v = Math.sin(x * 0.9 + Math.sin(y * 0.7) * 2) + Math.cos(y * 0.8 - x * 0.3) + rng.next() * 0.6;
        p.set(x, y, v > 1.3 ? '#ffe36b' : v > 0.4 ? '#ffa31a' : v > -0.6 ? '#e4630f' : '#b8360a');
      }
  },
  netherrack(p, n) {
    p.speckle(0, 0, T, T, ['#6f3535', '#7d3a3a', '#5e2c2c', '#8a4545', '#4f2424'], rngFor(n), [4, 3, 3, 1, 1]);
  },
  nether_bricks(p, n) {
    const rng = rngFor(n);
    p.rect(0, 0, T, T, '#1d0e11');
    for (let row = 0; row < 4; row++) {
      const off = row % 2 ? 4 : 0;
      for (let b = -1; b < 3; b++) {
        const x0 = b * 8 + off;
        for (let y = row * 4; y < row * 4 + 3; y++)
          for (let x = x0; x < x0 + 7; x++) if (x >= 0 && x < T) p.set(x, y, rng.next() < 0.3 ? '#3a1d22' : y === row * 4 ? '#4a252b' : '#2e171b');
      }
    }
  },
  soul_sand(p, n) {
    const rng = rngFor(n);
    p.speckle(0, 0, T, T, ['#544034', '#4a382d', '#5e493b', '#3e2f26'], rng);
    for (let i = 0; i < 3; i++) {
      const x = 2 + Math.floor(rng.next() * 11);
      const y = 2 + Math.floor(rng.next() * 11);
      p.rect(x, y, 1, 2, '#2b1f19');
      p.rect(x + 2, y, 1, 2, '#2b1f19');
      p.rect(x, y + 3, 3, 1, '#2b1f19');
    }
  },
  glowstone(p, n) {
    const rng = rngFor(n);
    stones(p, n, 10, hex('#ffe9a3'), hex('#d9a24a'), hex('#8a5a26'));
    for (let i = 0; i < 12; i++) p.set(Math.floor(rng.next() * T), Math.floor(rng.next() * T), '#fff6d1');
  },
  obsidian(p, n) {
    const rng = rngFor(n);
    p.speckle(0, 0, T, T, ['#14121e', '#1d1a2c', '#100e18', '#2a2140'], rng, [4, 3, 2, 1]);
    for (let i = 0; i < 5; i++) p.set(Math.floor(rng.next() * T), Math.floor(rng.next() * T), '#4a3570');
  },
  magma(p, n) {
    const rng = rngFor(n);
    stones(p, n, 8, hex('#7a2a10'), hex('#4f1a0a'), hex('#ff8a1f'));
    for (let i = 0; i < 6; i++) p.set(Math.floor(rng.next() * T), Math.floor(rng.next() * T), '#ffb347');
  },
  snow(p, n) {
    p.speckle(0, 0, T, T, ['#f4f8fb', '#e8eff4', '#fbfdfe', '#dce6ee'], rngFor(n), [4, 3, 2, 1]);
  },
  wool(p, n) {
    // grau, wird per Vertexfarbe eingefärbt
    const rng = rngFor(n);
    for (let y = 0; y < T; y++)
      for (let x = 0; x < T; x++) {
        const fiber = (x + y * 2 + Math.floor(rng.next() * 2)) % 4 === 0 ? 0.86 : (x * 3 + y) % 7 === 0 ? 1.06 : 1;
        p.set(x, y, shade([228, 228, 228], fiber * (0.94 + rng.next() * 0.08)));
      }
  },
  concrete(p, n) {
    p.speckle(0, 0, T, T, ['#f0f0f0', '#e6e6e6', '#ebebeb'], rngFor(n), [5, 2, 3]);
  },
  tnt_side(p, n) {
    const rng = rngFor(n);
    for (let x = 0; x < T; x++) for (let y = 0; y < T; y++) p.set(x, y, x % 4 === 3 ? '#8f1d14' : rng.next() < 0.2 ? '#c4321f' : '#db3b25');
    p.rect(0, 5, T, 6, '#e9e4dc');
    p.rect(0, 5, T, 1, '#b9b2a8');
    p.rect(0, 10, T, 1, '#b9b2a8');
    // Zündschnur-Symbol statt Schrift
    for (let i = 0; i < 4; i++) p.rect(3 + i * 3, 7, 2, 2, '#2a2a2a');
  },
  tnt_top(p) {
    p.rect(0, 0, T, T, '#c4321f');
    for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) if ((x % 4 === 1 || x % 4 === 2) && (y % 4 === 1 || y % 4 === 2)) p.set(x, y, '#e9e4dc');
    p.rect(7, 7, 2, 2, '#2a2a2a');
  },
  tallgrass(p, n) {
    const rng = rngFor(n);
    p.rect(0, 0, T, T, '#000000', 0);
    for (let i = 0; i < 9; i++) {
      const x = 1 + Math.floor(rng.next() * 14);
      const h = 6 + Math.floor(rng.next() * 9);
      for (let y = T - h; y < T; y++) p.set(x + (y < T - h / 2 && i % 2 ? 1 : 0), y, rng.next() < 0.5 ? '#5e9b35' : '#4f8a2c');
    }
  },
  fern(p, n) {
    const rng = rngFor(n);
    p.rect(0, 0, T, T, '#000000', 0);
    for (let y = 3; y < T; y++) {
      p.set(7, y, '#3f7a2a');
      const w = Math.min(6, Math.floor((T - y) / 2));
      if (y % 2 === 0) for (let k = 1; k <= w; k++) {
        p.set(7 - k, y - Math.floor(k / 2), rng.next() < 0.7 ? '#4f8f33' : '#3f7a2a');
        p.set(7 + k, y - Math.floor(k / 2), rng.next() < 0.7 ? '#4f8f33' : '#3f7a2a');
      }
    }
  },
  poppy(p) {
    p.rect(0, 0, T, T, '#000000', 0);
    p.rect(7, 8, 1, 8, '#3f7a2a');
    p.rect(8, 11, 2, 1, '#4f8f33');
    p.rect(6, 5, 4, 3, '#d6261f');
    p.rect(5, 6, 1, 1, '#b51d18');
    p.rect(10, 6, 1, 1, '#b51d18');
    p.set(7, 6, '#1b1b1b');
    p.set(8, 6, '#3a2a1a');
  },
  dandelion(p) {
    p.rect(0, 0, T, T, '#000000', 0);
    p.rect(7, 9, 1, 7, '#3f7a2a');
    p.rect(6, 6, 3, 3, '#f5d21f');
    p.set(7, 5, '#ffe35a');
    p.set(5, 7, '#e0b818');
    p.set(9, 7, '#e0b818');
  },
  cornflower(p) {
    p.rect(0, 0, T, T, '#000000', 0);
    p.rect(7, 8, 1, 8, '#3f7a2a');
    p.rect(6, 5, 3, 3, '#4f6fe0');
    p.set(7, 4, '#6f8ff0');
    p.set(5, 6, '#3a55c0');
    p.set(9, 6, '#3a55c0');
    p.set(7, 6, '#2a3a8a');
  },
  vine(p, n) {
    const rng = rngFor(n);
    p.rect(0, 0, T, T, '#000000', 0);
    for (let y = 0; y < T; y++) {
      const x = 7 + Math.round(Math.sin(y * 0.7) * 1.5);
      p.set(x, y, '#2f6a1f');
      if (y % 3 === 0) {
        p.rect(x - 3, y, 3, 2, rng.next() < 0.5 ? '#4f8f33' : '#3f7a2a');
        p.rect(x + 1, y + 1, 3, 2, rng.next() < 0.5 ? '#4f8f33' : '#5a9a3c');
      }
    }
  },
  barrel_side(p, n) {
    const rng = rngFor(n);
    for (let x = 0; x < T; x++) {
      const base = x % 4 === 0 ? '#6e4f2c' : '#8a6438';
      for (let y = 0; y < T; y++) p.set(x, y, rng.next() < 0.15 ? '#7a5733' : base);
    }
    for (const y of [2, 13]) p.rect(0, y, T, 1, '#4a4744');
  },
  barrel_top(p) {
    for (let y = 0; y < T; y++)
      for (let x = 0; x < T; x++) {
        const edge = x === 0 || y === 0 || x === T - 1 || y === T - 1;
        p.set(x, y, edge ? '#4a4744' : (x + y) % 5 === 0 ? '#7a5733' : '#9a7445');
      }
    p.rect(4, 4, 8, 8, '#3a2a1a');
    p.rect(5, 5, 6, 6, '#2a1d12');
  },
  crate(p, n) {
    PAINTERS.planks!(p, n);
    p.rect(0, 0, T, 2, '#5a4126');
    p.rect(0, 14, T, 2, '#5a4126');
    p.rect(0, 0, 2, T, '#5a4126');
    p.rect(14, 0, 2, T, '#5a4126');
    for (let i = 2; i < 14; i++) {
      p.set(i, i, '#6b4e2e');
      p.set(i, i + 1 > 13 ? 13 : i + 1, '#5a4126');
    }
  },
  note_block(p, n) {
    const rng = rngFor(n);
    p.speckle(0, 0, T, T, ['#5a3a24', '#4e321f', '#664330'], rng);
    p.rect(0, 0, T, 1, '#3a2516');
    p.rect(0, 15, T, 1, '#3a2516');
    p.rect(9, 3, 2, 8, '#1b1b1b');
    p.rect(10, 3, 3, 2, '#1b1b1b');
    p.rect(5, 9, 5, 4, '#1b1b1b');
  },
  stone_bricks(p, n) {
    const rng = rngFor(n);
    p.speckle(0, 0, T, T, ['#7f7f7f', '#787878', '#868686'], rng);
    for (const y of [7, 15]) p.rect(0, y, T, 1, '#5a5a5a');
    p.rect(7, 0, 1, 7, '#5a5a5a');
    p.rect(15, 8, 1, 7, '#5a5a5a');
    p.rect(0, 0, T, 1, '#959595');
    p.rect(0, 8, T, 1, '#959595');
  },
  slime_block(p) {
    for (let y = 0; y < T; y++)
      for (let x = 0; x < T; x++) {
        const edge = x === 0 || y === 0 || x === T - 1 || y === T - 1;
        const inner = x >= 4 && x <= 11 && y >= 4 && y <= 11;
        const innerEdge = inner && (x === 4 || x === 11 || y === 4 || y === 11);
        p.set(x, y, edge ? '#5fbf4a' : innerEdge ? '#4fa83c' : inner ? '#6fd35a' : '#82dc6c', edge || inner ? 255 : 200);
      }
  },
  portal(p, n) {
    const rng = rngFor(n);
    for (let y = 0; y < T; y++)
      for (let x = 0; x < T; x++) {
        const v = Math.sin(x * 0.9 + y * 0.4) + Math.cos(y * 0.8 - x * 0.5) + rng.next() * 0.7;
        p.set(x, y, v > 1.2 ? '#d68cff' : v > 0.2 ? '#9a3cf0' : '#5a14b0', 210);
      }
  },
  pumpkin_side(p, n) {
    const rng = rngFor(n);
    for (let x = 0; x < T; x++) {
      const rib = x % 4 === 0 ? '#b8560f' : x % 4 === 2 ? '#e8851f' : '#d8701a';
      for (let y = 0; y < T; y++) p.set(x, y, rng.next() < 0.1 ? '#c8641a' : rib);
    }
  },
  pumpkin_top(p, n) {
    PAINTERS.pumpkin_side!(p, n);
    p.rect(6, 6, 4, 4, '#5a7a2a');
    p.rect(7, 7, 2, 2, '#3f5a1c');
  },
  pumpkin_face(p, n) {
    PAINTERS.pumpkin_side!(p, n);
    const glow = '#ffd34d';
    const hot = '#ff9a1f';
    // Augen
    p.rect(3, 4, 3, 3, hot);
    p.rect(10, 4, 3, 3, hot);
    p.rect(4, 5, 1, 1, glow);
    p.rect(11, 5, 1, 1, glow);
    // Mund mit Zähnen
    p.rect(3, 10, 10, 3, hot);
    p.rect(4, 11, 8, 1, glow);
    p.set(5, 10, '#d8701a');
    p.set(9, 12, '#d8701a');
  },
  spruce_leaves(p, n) {
    const rng = rngFor(n);
    p.speckle(0, 0, T, T, ['#2f5a34', '#264d2c', '#3a6a3e', '#1f4024'], rng, [4, 3, 2, 1]);
    for (let i = 0; i < 20; i++) p.set(Math.floor(rng.next() * T), Math.floor(rng.next() * T), '#000000', 0);
  },
  cobweb(p, n) {
    const rng = rngFor(n);
    for (let y = 0; y < T; y++)
      for (let x = 0; x < T; x++) {
        const dx = x - 7.5;
        const dy = y - 7.5;
        const r = Math.hypot(dx, dy);
        const ang = Math.atan2(dy, dx);
        const spoke = Math.abs(Math.sin(ang * 4)) < 0.12;
        const ring = Math.abs((r % 3.2) - 1.6) < 0.35;
        if ((spoke || ring) && r < 8 && rng.next() < 0.9) p.set(x, y, '#e8e8e8', 230);
        else p.set(x, y, '#ffffff', 0);
      }
  },
};

export const BLOCK_TILES = Object.keys(PAINTERS) as (keyof typeof PAINTERS)[];
export type Tile = string;

export interface BlockAtlas {
  texture: THREE.CanvasTexture;
  /** u0, v0, u1, v1 der inneren 16×16-Kachel (three: v nach oben) */
  uv(tile: Tile): [number, number, number, number];
  /** Einzelne Kachel als Bild (für Handy-/Beamer-Oberfläche) */
  dataUrl(tile: Tile): string;
}

let atlas: BlockAtlas | null = null;

export function blockAtlas(): BlockAtlas {
  if (atlas) return atlas;
  const names = BLOCK_TILES;
  const rows = Math.ceil(names.length / COLS);
  const big = new Pixels(COLS * CELL, rows * CELL);
  const tiles = new Map<string, Pixels>();
  names.forEach((name, i) => {
    const tile = new Pixels(T, T);
    PAINTERS[name]!(tile, name);
    tiles.set(name, tile);
    const cx = (i % COLS) * CELL;
    const cy = Math.floor(i / COLS) * CELL;
    // gekachelter Rand: Pixel außerhalb wiederholen die Kachel
    for (let y = -PAD; y < T + PAD; y++)
      for (let x = -PAD; x < T + PAD; x++) {
        const sx = (x + T) % T;
        const sy = (y + T) % T;
        const j = (sy * T + sx) * 4;
        const k = ((cy + PAD + y) * big.w + cx + PAD + x) * 4;
        for (let c = 0; c < 4; c++) big.data[k + c] = tile.data[j + c]!;
      }
  });
  const texture = big.toTexture();
  const index = new Map(names.map((n, i) => [n, i]));
  atlas = {
    texture,
    uv(tile) {
      const i = index.get(tile) ?? 0;
      const x0 = (i % COLS) * CELL + PAD;
      const y0 = Math.floor(i / COLS) * CELL + PAD;
      return [x0 / big.w, 1 - (y0 + T) / big.h, (x0 + T) / big.w, 1 - y0 / big.h];
    },
    dataUrl(tile) {
      return (tiles.get(tile) ?? tiles.values().next().value!).toDataUrl();
    },
  };
  return atlas;
}
