/**
 * Gelände der Blockwelt: die Insel als Säulen aus Würfeln (gleiche Form, gleicher Weg, gleicher Fluss
 * wie die Insel), dazu Bäume, Pflanzen, Fluss-Kaskaden, Wasserfall, Meer und Lava im Krater.
 * Sichtbare Flächen werden in Abschnitten zusammengefasst (nur Außenflächen, Ecken leicht abgedunkelt).
 */
import * as THREE from 'three';
import { RIVER, RIVER_LIP, RIVER_POOL, VOLCANO } from '@insel/shared';
import type { IslandLayout } from '../layout.ts';
import type { Heightfield } from '../terrain.ts';
import type { RiverFx, Water } from '../water.ts';
import { blockAtlas, type Tile } from './atlas.ts';
import { rngFor } from './pixels.ts';

/** Kantenlänge eines Blocks in Welteinheiten (Figur = 2 Blöcke hoch) */
export const BLOCK = 0.66;
const HALF = 60;
const N = Math.ceil((HALF * 2) / BLOCK);
const CHUNK = 24;
const SEA_Y = -0.1;
const DEEP = -6;

type Kind =
  | 'grass'
  | 'dirt'
  | 'path'
  | 'sand'
  | 'sandstone'
  | 'stone'
  | 'cobblestone'
  | 'mossy_cobblestone'
  | 'gravel'
  | 'magma'
  | 'obsidian'
  | 'log'
  | 'birch'
  | 'leaves'
  | 'birch_leaves'
  | 'planks'
  | 'glowstone';

const FACES: Record<Kind, { top: Tile; side: Tile; bottom: Tile }> = {
  grass: { top: 'grass_top', side: 'grass_side', bottom: 'dirt' },
  dirt: { top: 'dirt', side: 'dirt', bottom: 'dirt' },
  path: { top: 'path_top', side: 'path_side', bottom: 'dirt' },
  sand: { top: 'sand', side: 'sand', bottom: 'sand' },
  sandstone: { top: 'sandstone', side: 'sandstone', bottom: 'sandstone' },
  stone: { top: 'stone', side: 'stone', bottom: 'stone' },
  cobblestone: { top: 'cobblestone', side: 'cobblestone', bottom: 'cobblestone' },
  mossy_cobblestone: { top: 'mossy_cobblestone', side: 'mossy_cobblestone', bottom: 'mossy_cobblestone' },
  gravel: { top: 'gravel', side: 'gravel', bottom: 'gravel' },
  magma: { top: 'magma', side: 'magma', bottom: 'magma' },
  obsidian: { top: 'obsidian', side: 'obsidian', bottom: 'obsidian' },
  log: { top: 'log_top', side: 'log_side', bottom: 'log_top' },
  birch: { top: 'log_top', side: 'birch_side', bottom: 'log_top' },
  leaves: { top: 'leaves', side: 'leaves', bottom: 'leaves' },
  birch_leaves: { top: 'birch_leaves', side: 'birch_leaves', bottom: 'birch_leaves' },
  planks: { top: 'planks', side: 'planks', bottom: 'planks' },
  glowstone: { top: 'glowstone', side: 'glowstone', bottom: 'glowstone' },
};

/** Material unterhalb der Oberfläche je Tiefe */
function under(surface: Kind, depth: number): Kind {
  if (depth === 0) return surface;
  switch (surface) {
    case 'grass':
    case 'path':
    case 'dirt':
      return depth <= 3 ? 'dirt' : 'stone';
    case 'sand':
      return depth <= 2 ? 'sand' : depth <= 4 ? 'sandstone' : 'stone';
    case 'gravel':
      return depth <= 1 ? 'gravel' : 'stone';
    case 'magma':
    case 'obsidian':
      return depth <= 1 ? 'obsidian' : 'stone';
    default:
      return 'stone';
  }
}

/** Wertrauschen (deterministisch) für Flecken: Moos, Kies, Waldstücke */
function hash2(x: number, z: number, s = 0) {
  const h = Math.sin(x * 127.1 + z * 311.7 + s * 74.7) * 43758.5453;
  return h - Math.floor(h);
}
function noise(x: number, z: number, s = 0) {
  const xi = Math.floor(x);
  const zi = Math.floor(z);
  const xf = x - xi;
  const zf = z - zi;
  const u = xf * xf * (3 - 2 * xf);
  const v = zf * zf * (3 - 2 * zf);
  const a = hash2(xi, zi, s);
  const b = hash2(xi + 1, zi, s);
  const c = hash2(xi, zi + 1, s);
  const d = hash2(xi + 1, zi + 1, s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

/** Wiederholbare Textur (Wasser, Lava): ein Block = eine Kachel */
function tileTexture(name: Tile): THREE.CanvasTexture {
  const atlas = blockAtlas();
  const img = new Image();
  img.src = atlas.dataUrl(name);
  const c = document.createElement('canvas');
  c.width = c.height = 16;
  const t = new THREE.CanvasTexture(c);
  img.onload = () => {
    c.getContext('2d')!.drawImage(img, 0, 0);
    t.needsUpdate = true;
  };
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestMipmapLinearFilter;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Sammelt Flächen für ein Material */
export class FaceBuffer {
  pos: number[] = [];
  nor: number[] = [];
  uv: number[] = [];
  col: number[] = [];
  idx: number[] = [];

  /** Viereck aus 4 Ecken (gegen den Uhrzeigersinn von außen), uvRect = [u0,v0,u1,v1] */
  quad(c: number[][], n: [number, number, number], uvRect: [number, number, number, number], shade: number[], uvWorld?: boolean) {
    const base = this.pos.length / 3;
    const [u0, v0, u1, v1] = uvRect;
    const uvs = uvWorld ? null : [u0, v0, u1, v0, u1, v1, u0, v1];
    for (let i = 0; i < 4; i++) {
      const p = c[i]!;
      this.pos.push(p[0]!, p[1]!, p[2]!);
      this.nor.push(...n);
      if (uvs) this.uv.push(uvs[i * 2]!, uvs[i * 2 + 1]!);
      else this.uv.push(n[1] !== 0 ? p[0]! / BLOCK : n[0] !== 0 ? p[2]! / BLOCK : p[0]! / BLOCK, n[1] !== 0 ? p[2]! / BLOCK : p[1]! / BLOCK);
      const s = shade[i]!;
      this.col.push(s, s, s);
    }
    // AO-abhängige Diagonale, damit Verläufe nicht verdreht aussehen
    if (shade[0]! + shade[2]! > shade[1]! + shade[3]!) this.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    else this.idx.push(base + 1, base + 2, base + 3, base + 1, base + 3, base);
  }

  build(): THREE.BufferGeometry | null {
    if (!this.idx.length) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setIndex(this.idx);
    g.computeBoundingSphere();
    return g;
  }
}

export interface VoxelWorld {
  group: THREE.Group;
  /** Oberkante der Blöcke an (x, z) */
  topAt: (x: number, z: number) => number;
  water: Water;
  river: RiverFx;
  /** Kamera-Hindernisse (Bäume) */
  blockers: { x: number; z: number; r: number; top: number }[];
  crowns: THREE.Vector3[];
  flowers: THREE.Vector3[];
  /** Lava im Krater (Oberkante) */
  lavaY: number;
  update: (t: number, dt: number) => void;
  dispose: () => void;
}

/** Wasserspiegel des Flusses am nächsten Flussabschnitt */
function riverLevel(x: number, z: number): number {
  let best = Infinity;
  let y = 0;
  for (let i = 0; i < RIVER.length - 1; i++) {
    if (i === RIVER_LIP) continue; // zwischen Kante und Becken fällt das Wasser senkrecht
    const a = RIVER[i]!;
    const b = RIVER[i + 1]!;
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz)));
    const d = Math.hypot(a.x + dx * t - x, a.z + dz * t - z);
    if (d < best) {
      best = d;
      y = a.y + (b.y - a.y) * t;
    }
  }
  return y;
}

export function buildVoxelWorld(layout: IslandLayout, field: Heightfield): VoxelWorld {
  const atlas = blockAtlas();
  const B = BLOCK;
  const idx = (i: number, j: number) => j * N + i;
  const cx = (i: number) => -HALF + (i + 0.5) * B;
  const top = new Int16Array(N * N);
  const surf: Kind[] = new Array(N * N);
  /** Wasserspiegel als Blockstufe (−9999 = kein Fluss/Bach) */
  const water = new Int16Array(N * N).fill(-9999);
  const lava = new Uint8Array(N * N);
  const pathR = layout.fieldRadius * 0.95;
  const V = VOLCANO;

  // 1) Säulenhöhen und Oberflächen
  for (let j = 0; j < N; j++)
    for (let i = 0; i < N; i++) {
      const x = cx(i);
      const z = cx(j);
      const h = field.height(x, z);
      let k = Math.round(h / B);
      const rV = Math.hypot(x - V.x, z - V.z);
      const pd = field.pathDistance(x, z);
      const slope = field.slope(x, z);
      const n1 = noise(x * 0.18, z * 0.18, 1);
      let kind: Kind;
      if (h < 0.55 && rV > V.baseRadius * 0.5) kind = h < -2.5 && n1 > 0.6 ? 'gravel' : 'sand';
      else if (rV < V.craterRadius + 1.6 && h > V.height - 6) kind = n1 > 0.55 ? 'magma' : 'obsidian';
      else if (pd < pathR) kind = h > 11 ? 'gravel' : 'path';
      else if (h > 15) kind = n1 > 0.62 ? 'gravel' : n1 > 0.35 ? 'stone' : 'cobblestone';
      else if (h > 9 && rV < V.baseRadius * 0.75) kind = n1 > 0.55 ? 'grass' : n1 > 0.3 ? 'stone' : 'gravel';
      else if (slope > 0.62) kind = n1 > 0.5 ? 'stone' : 'mossy_cobblestone';
      else kind = 'grass';
      // Fluss und Bach: Bett unter den Wasserspiegel legen
      const rd = field.riverDistance(x, z);
      const cd = field.creekDistance(x, z);
      if (rd < 0.15 || cd < 0.1) {
        const wl = cd < rd ? creekLevel(layout, x, z) : riverLevel(x, z);
        const wk = Math.round(wl / B);
        water[idx(i, j)] = wk;
        k = Math.min(k, wk - 1);
        kind = n1 > 0.5 ? 'gravel' : 'sand';
      }
      top[idx(i, j)] = k;
      surf[idx(i, j)] = kind;
    }

  // Lava im Krater: bis knapp unter den Rand füllen
  let lavaK = -9999;
  {
    let floor = 9999;
    for (let j = 0; j < N; j++)
      for (let i = 0; i < N; i++) if (Math.hypot(cx(i) - V.x, cx(j) - V.z) < V.craterRadius - 0.8) floor = Math.min(floor, top[idx(i, j)]!);
    if (floor < 9999) {
      lavaK = floor + 1;
      for (let j = 0; j < N; j++)
        for (let i = 0; i < N; i++) {
          const r = Math.hypot(cx(i) - V.x, cx(j) - V.z);
          if (r < V.craterRadius && top[idx(i, j)]! < lavaK) lava[idx(i, j)] = 1;
        }
    }
  }

  const H = (i: number, j: number) => (i < 0 || j < 0 || i >= N || j >= N ? DEEP : Math.max(DEEP, top[idx(i, j)]!));

  // 2) Bäume, Pflanzen
  const extra = new Map<string, Kind>();
  const key = (i: number, y: number, j: number) => `${i},${y},${j}`;
  const blockers: VoxelWorld['blockers'] = [];
  const crowns: THREE.Vector3[] = [];
  const flowers: THREE.Vector3[] = [];
  const plants: { x: number; y: number; z: number; tile: Tile; s: number }[] = [];
  const taken = new Uint8Array(N * N);
  const rng = rngFor('trees');
  // Plätze der Auftritte und Kamerawege frei halten (Fluss-Ufer, Liane, Höhle, Start, Ziel)
  const keepClear: { x: number; z: number; r: number }[] = [];
  const spot = (i: number | undefined, r: number) => {
    const f = i === undefined ? undefined : layout.fields[i];
    if (f) keepClear.push({ x: f.x, z: f.z, r });
  };
  spot((layout.fordFields[0] ?? 0) - 1, 11);
  spot(layout.plan.vineField, 8);
  spot(layout.plan.caveField, 7);
  spot(0, 10);
  spot(layout.fields.length - 1, 8);
  const clearOf = (x: number, z: number) => keepClear.every((k) => Math.hypot(x - k.x, z - k.z) > k.r);
  for (let j = 2; j < N - 2; j++)
    for (let i = 2; i < N - 2; i++) {
      const c = idx(i, j);
      if (surf[c] !== 'grass' || water[c] !== -9999) continue;
      const x = cx(i);
      const z = cx(j);
      const h = top[c]! * B;
      if (h < 1 || field.pathDistance(x, z) < 2.6 || field.riverDistance(x, z) < 1.4 || field.creekDistance(x, z) < 1.2) continue;
      const rV = Math.hypot(x - V.x, z - V.z);
      if (rV < V.baseRadius * 0.55) continue;
      const forest = noise(x * 0.07, z * 0.07, 3);
      const r = rng.next();
      const pathD = field.pathDistance(x, z);
      // Pflanzen
      if (r < 0.16 && field.pathDistance(x, z) > pathR + 0.3) {
        const f = rng.next();
        const tile: Tile = f < 0.55 ? 'tallgrass' : f < 0.7 ? 'fern' : f < 0.8 ? 'poppy' : f < 0.92 ? 'dandelion' : 'cornflower';
        plants.push({ x, y: h, z, tile, s: 0.8 + rng.next() * 0.25 });
        if (tile === 'poppy' || tile === 'dandelion' || tile === 'cornflower') flowers.push(new THREE.Vector3(x, h + 0.3, z));
        continue;
      }
      // kleine Laubbüsche dürfen näher an den Weg, Bäume stehen abseits (dort fährt die Kamera)
      if (pathD < 6.5 || !clearOf(x, z)) {
        if (pathD > pathR + 1.2 && rng.next() < 0.012 && clearOf(x, z)) {
          extra.set(key(i, top[c]! + 1, j), 'leaves');
          if (rng.next() < 0.5) extra.set(key(i + 1, top[c]! + 1, j), 'leaves');
          taken[c] = 1;
        }
        continue;
      }
      if (forest < 0.45 || rng.next() > (forest - 0.4) * 0.12) continue;
      // Abstand zu anderen Bäumen
      let free = true;
      for (let dj = -3; dj <= 3 && free; dj++) for (let di = -3; di <= 3; di++) if (taken[idx(i + di, j + dj)]) free = false;
      if (!free) continue;
      // flacher Boden
      if (Math.abs(H(i + 1, j) - H(i, j)) > 1 || Math.abs(H(i, j + 1) - H(i, j)) > 1) continue;
      taken[c] = 1;
      const birch = noise(x * 0.11, z * 0.11, 9) > 0.62;
      const big = !birch && forest > 0.72 && rng.next() < 0.35;
      const trunk: Kind = birch ? 'birch' : 'log';
      const leaf: Kind = birch ? 'birch_leaves' : 'leaves';
      const base = top[c]! + 1;
      const height = big ? 6 + Math.floor(rng.next() * 2) : 4 + Math.floor(rng.next() * 2) + (birch ? 1 : 0);
      for (let y = 0; y < height; y++) extra.set(key(i, base + y, j), trunk);
      const crownY = base + height;
      const rad = big ? 3 : 2;
      for (let dy = -2; dy <= 1; dy++) {
        const rr = dy >= 0 ? (dy === 1 ? 1 : rad - 1) : rad;
        for (let dj = -rr; dj <= rr; dj++)
          for (let di = -rr; di <= rr; di++) {
            const corner = Math.abs(di) === rr && Math.abs(dj) === rr;
            if (corner && (dy === 1 || rng.next() < 0.6)) continue;
            const kk = key(i + di, crownY + dy, j + dj);
            if (!extra.has(kk)) extra.set(kk, leaf);
          }
      }
      const wx = x;
      const wz = z;
      crowns.push(new THREE.Vector3(wx, (crownY + 0.5) * B, wz));
      blockers.push({ x: wx, z: wz, r: (rad + 0.5) * B, top: (crownY + 2) * B });
    }

  // 3) Flächen erzeugen (je Abschnitt ein Mesh pro Material)
  const solidMat = new THREE.MeshLambertMaterial({ map: atlas.texture, vertexColors: true });
  const leafMat = new THREE.MeshLambertMaterial({ map: atlas.texture, vertexColors: true, alphaTest: 0.5, side: THREE.DoubleSide });
  const waterTex = tileTexture('water');
  const lavaTex = tileTexture('lava');
  const waterMat = new THREE.MeshLambertMaterial({ map: waterTex, vertexColors: true, transparent: true, opacity: 0.8, depthWrite: false, side: THREE.DoubleSide });
  const lavaMat = new THREE.MeshBasicMaterial({ map: lavaTex, vertexColors: true });
  const plantMat = new THREE.MeshLambertMaterial({ map: atlas.texture, alphaTest: 0.5, side: THREE.DoubleSide });
  const group = new THREE.Group();
  group.name = 'blockwelt';
  const geos: THREE.BufferGeometry[] = [];

  const solidAt = (i: number, y: number, j: number) => {
    if (i < 0 || j < 0 || i >= N || j >= N) return y <= DEEP;
    if (y <= top[idx(i, j)]!) return true;
    const e = extra.get(key(i, y, j));
    return !!e && e !== 'leaves' && e !== 'birch_leaves';
  };
  const anyAt = (i: number, y: number, j: number) => solidAt(i, y, j) || extra.has(key(i, y, j));
  /** Eckverdunkelung für eine Fläche oben: drei Nachbarn je Ecke */
  const aoTop = (i: number, y: number, j: number, di: number, dj: number) => {
    const s1 = anyAt(i + di, y + 1, j) ? 1 : 0;
    const s2 = anyAt(i, y + 1, j + dj) ? 1 : 0;
    const c = anyAt(i + di, y + 1, j + dj) ? 1 : 0;
    const occ = s1 && s2 ? 3 : s1 + s2 + c;
    return 1 - occ * 0.17;
  };
  const SIDE = { x: 0.86, z: 0.76, bottom: 0.55 };

  for (let cj = 0; cj < N; cj += CHUNK)
    for (let ci = 0; ci < N; ci += CHUNK) {
      const solid = new FaceBuffer();
      const leaves = new FaceBuffer();
      const wat = new FaceBuffer();
      const lav = new FaceBuffer();
      const emit = (buf: FaceBuffer, kind: Kind, i: number, y: number, j: number, isLeaf: boolean) => {
        const x0 = -HALF + i * B;
        const z0 = -HALF + j * B;
        // Block der Stufe y reicht von (y−1)·B bis y·B – Oberkante einer Säule = Stufe·B ≈ Geländehöhe
        const y0 = (y - 1) * B;
        const x1 = x0 + B;
        const z1 = z0 + B;
        const y1 = y * B;
        const f = FACES[kind];
        const open = (di: number, dy: number, dj: number) => (isLeaf ? !extra.has(key(i + di, y + dy, j + dj)) && !solidAt(i + di, y + dy, j + dj) : !solidAt(i + di, y + dy, j + dj) );
        if (open(0, 1, 0)) {
          const a = [aoTop(i, y, j, -1, -1), aoTop(i, y, j, 1, -1), aoTop(i, y, j, 1, 1), aoTop(i, y, j, -1, 1)];
          buf.quad([[x0, y1, z0], [x0, y1, z1], [x1, y1, z1], [x1, y1, z0]], [0, 1, 0], atlas.uv(f.top), [a[0]!, a[3]!, a[2]!, a[1]!]);
        }
        if (y > DEEP && open(0, -1, 0)) buf.quad([[x0, y0, z1], [x0, y0, z0], [x1, y0, z0], [x1, y0, z1]], [0, -1, 0], atlas.uv(f.bottom), [SIDE.bottom, SIDE.bottom, SIDE.bottom, SIDE.bottom]);
        const side = atlas.uv(f.side);
        const sx = [SIDE.x, SIDE.x, SIDE.x, SIDE.x];
        const sz = [SIDE.z, SIDE.z, SIDE.z, SIDE.z];
        if (open(1, 0, 0)) buf.quad([[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]], [1, 0, 0], side, sx);
        if (open(-1, 0, 0)) buf.quad([[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]], [-1, 0, 0], side, sx);
        if (open(0, 0, 1)) buf.quad([[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], [0, 0, 1], side, sz);
        if (open(0, 0, -1)) buf.quad([[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]], [0, 0, -1], side, sz);
      };

      for (let j = cj; j < Math.min(N, cj + CHUNK); j++)
        for (let i = ci; i < Math.min(N, ci + CHUNK); i++) {
          const c = idx(i, j);
          const k = top[c]!;
          if (k < DEEP) continue;
          // sichtbare Tiefe: bis zum niedrigsten Nachbarn
          const low = Math.max(DEEP, Math.min(H(i - 1, j), H(i + 1, j), H(i, j - 1), H(i, j + 1), k) - 0);
          for (let y = k; y >= low; y--) emit(solid, under(surf[c]!, k - y), i, y, j, false);
          // Wasser (Fluss/Bach): Oberfläche + Kaskaden-Seiten
          const wk = water[c]!;
          if (wk > -9999) {
            const x0 = -HALF + i * B;
            const z0 = -HALF + j * B;
            const yw = wk * B - 0.1;
            wat.quad([[x0, yw, z0], [x0, yw, z0 + B], [x0 + B, yw, z0 + B], [x0 + B, yw, z0]], [0, 1, 0], [0, 0, 1, 1], [1, 1, 1, 1], true);
            const nb: [number, number, number][] = [
              [1, 0, 0],
              [-1, 0, 0],
              [0, 1, 0],
              [0, -1, 0],
            ];
            for (const [di, dj] of nb as unknown as [number, number][]) {
              const ni = i + di;
              const nj = j + dj;
              const inside = ni >= 0 && nj >= 0 && ni < N && nj < N;
              const nw = inside ? water[idx(ni, nj)]! : -9999;
              const nt = inside ? top[idx(ni, nj)]! : DEEP;
              const floor = nw > -9999 ? nw * B - 0.1 : nt >= wk ? yw : Math.max(nt * B, SEA_Y);
              if (floor >= yw - 0.01) continue;
              const xa = di > 0 ? x0 + B : x0;
              const za = dj > 0 ? z0 + B : z0;
              if (di !== 0) wat.quad([[xa, floor, z0], [xa, floor, z0 + B], [xa, yw, z0 + B], [xa, yw, z0]], [di, 0, 0], [0, 0, 1, 1], [0.85, 0.85, 1, 1], true);
              else wat.quad([[x0, floor, za], [x0 + B, floor, za], [x0 + B, yw, za], [x0, yw, za]], [0, 0, dj], [0, 0, 1, 1], [0.8, 0.8, 1, 1], true);
            }
          }
          if (lava[c]) {
            const x0 = -HALF + i * B;
            const z0 = -HALF + j * B;
            const yl = lavaK * B - 0.12;
            lav.quad([[x0, yl, z0], [x0, yl, z0 + B], [x0 + B, yl, z0 + B], [x0 + B, yl, z0]], [0, 1, 0], [0, 0, 1, 1], [1, 1, 1, 1], true);
          }
        }
      // Baum-Blöcke in diesem Abschnitt
      for (const [k, kind] of extra) {
        const [i, y, j] = k.split(',').map(Number) as [number, number, number];
        if (i < ci || i >= ci + CHUNK || j < cj || j >= cj + CHUNK) continue;
        const leaf = kind === 'leaves' || kind === 'birch_leaves';
        emit(leaf ? leaves : solid, kind, i, y, j, leaf);
      }
      for (const [buf, mat, shadow] of [
        [solid, solidMat, true],
        [leaves, leafMat, true],
        [wat, waterMat, false],
        [lav, lavaMat, false],
      ] as const) {
        const g = buf.build();
        if (!g) continue;
        geos.push(g);
        const m = new THREE.Mesh(g, mat);
        m.castShadow = shadow;
        m.receiveShadow = mat !== lavaMat;
        if (mat === waterMat) m.renderOrder = 3;
        group.add(m);
      }
    }

  // Wasserfall zwischen Kante und Becken: senkrechte Wasserwand
  const lip = RIVER[RIVER_LIP]!;
  const pool = RIVER[RIVER_POOL]!;
  {
    const buf = new FaceBuffer();
    const dx = pool.x - lip.x;
    const dz = pool.z - lip.z;
    const len = Math.hypot(dx, dz);
    const nx = -dz / len;
    const nz = dx / len;
    const w = lip.w + 0.4;
    const steps = 6;
    for (let s = 0; s < steps; s++) {
      const t0 = s / steps;
      const t1 = (s + 1) / steps;
      const ya = lip.y + (pool.y - lip.y) * t0;
      const yb = lip.y + (pool.y - lip.y) * t1;
      const px = lip.x + dx * (t0 + t1) * 0.5;
      const pz = lip.z + dz * (t0 + t1) * 0.5;
      buf.quad(
        [
          [px - nx * w, yb, pz - nz * w],
          [px + nx * w, yb, pz + nz * w],
          [px + nx * w, ya, pz + nz * w],
          [px - nx * w, ya, pz - nz * w],
        ],
        [dx / len, 0, dz / len],
        [0, 0, 1, 1],
        [0.95, 0.95, 1, 1],
        true,
      );
    }
    const g = buf.build();
    if (g) {
      // senkrechte Flächen: UV aus Länge und Höhe
      const pos = g.getAttribute('position') as THREE.BufferAttribute;
      const uv = g.getAttribute('uv') as THREE.BufferAttribute;
      for (let v = 0; v < pos.count; v++) uv.setXY(v, (pos.getX(v) * nx + pos.getZ(v) * nz) / B, pos.getY(v) / B);
      geos.push(g);
      const fallMat = waterMat.clone();
      fallMat.map = waterTex.clone();
      fallMat.map.needsUpdate = true;
      const m = new THREE.Mesh(g, fallMat);
      m.renderOrder = 3;
      group.add(m);
      (group.userData as { fall?: THREE.MeshLambertMaterial }).fall = fallMat;
    }
  }

  // Pflanzen: gekreuzte Flächen
  {
    const pos: number[] = [];
    const uvs: number[] = [];
    const ind: number[] = [];
    for (const p of plants) {
      const [u0, v0, u1, v1] = atlas.uv(p.tile);
      const s = B * 0.48 * p.s;
      const h = B * p.s;
      for (const a of [Math.PI / 4, -Math.PI / 4]) {
        const ox = Math.cos(a) * s;
        const oz = Math.sin(a) * s;
        const b = pos.length / 3;
        pos.push(p.x - ox, p.y, p.z - oz, p.x + ox, p.y, p.z + oz, p.x + ox, p.y + h, p.z + oz, p.x - ox, p.y + h, p.z - oz);
        uvs.push(u0, v0, u1, v0, u1, v1, u0, v1);
        ind.push(b, b + 1, b + 2, b, b + 2, b + 3);
      }
    }
    if (ind.length) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
      g.setIndex(ind);
      g.computeVertexNormals();
      geos.push(g);
      const m = new THREE.Mesh(g, plantMat);
      group.add(m);
    }
  }

  // Meer
  const seaGeo = new THREE.PlaneGeometry(520, 520, 1, 1);
  seaGeo.rotateX(-Math.PI / 2);
  {
    const uv = seaGeo.getAttribute('uv') as THREE.BufferAttribute;
    const pos = seaGeo.getAttribute('position') as THREE.BufferAttribute;
    for (let v = 0; v < pos.count; v++) uv.setXY(v, pos.getX(v) / B, pos.getZ(v) / B);
  }
  const seaTex = waterTex.clone();
  seaTex.needsUpdate = true;
  const seaMat = new THREE.MeshLambertMaterial({ map: seaTex, transparent: true, opacity: 0.8, depthWrite: false });
  const sea = new THREE.Mesh(seaGeo, seaMat);
  sea.position.y = SEA_Y;
  sea.renderOrder = 2;
  // Meeresboden außerhalb des Rasters
  const floorGeo = new THREE.PlaneGeometry(520, 520, 1, 1);
  floorGeo.rotateX(-Math.PI / 2);
  const floor = new THREE.Mesh(floorGeo, new THREE.MeshLambertMaterial({ color: '#b9ae7c' }));
  floor.position.y = DEEP * B;
  group.add(floor);

  const waterObj: Water = {
    mesh: sea,
    update(t) {
      // Wasser fließt langsam, Lava wabert
      seaTex.offset.set(t * 0.05, t * 0.03);
      waterTex.offset.set(0, -t * 0.6);
      lavaTex.offset.set(t * 0.04, Math.sin(t * 0.3) * 0.2);
      const fall = (group.userData as { fall?: THREE.MeshLambertMaterial }).fall;
      if (fall?.map) fall.map.offset.set(0, t * 2.2);
    },
    setSun() {},
    setUltra() {},
    dispose() {
      seaGeo.dispose();
      seaMat.dispose();
      seaTex.dispose();
    },
  };
  const riverObj: RiverFx = {
    group: new THREE.Group(),
    update() {},
    dispose() {},
    fallBase: new THREE.Vector3(pool.x, pool.y, pool.z),
  };

  return {
    group,
    topAt(x, z) {
      const i = Math.floor((x + HALF) / B);
      const j = Math.floor((z + HALF) / B);
      return H(i, j) * B;
    },
    water: waterObj,
    river: riverObj,
    blockers,
    crowns,
    flowers,
    lavaY: lavaK * B - 0.12,
    update() {},
    dispose() {
      for (const g of geos) g.dispose();
      floorGeo.dispose();
      for (const m of [solidMat, leafMat, waterMat, lavaMat, plantMat]) m.dispose();
      waterTex.dispose();
      lavaTex.dispose();
    },
  };
}

/** Wasserspiegel des Bachs (nächster Bachpunkt) */
function creekLevel(layout: IslandLayout, x: number, z: number): number {
  let best = Infinity;
  let y = 0;
  for (const p of layout.creek) {
    const d = Math.hypot(p.x - x, p.z - z);
    if (d < best) {
      best = d;
      y = p.y;
    }
  }
  return y;
}

