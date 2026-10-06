/**
 * Gelände der Insel als Höhenfeld: natürliche Form (ground.ts) + Wegterrassen + Flussbett mit
 * Ufern, Wasserfallbecken und Schlucht. Farben pro Vertex: Strand, Wiese, Dschungel, Hochebene,
 * geschichtete Klippen, Lavagestein mit glühenden Rissen, Krater, Weg.
 */
import * as THREE from 'three';
import { GORGE, RIVER, RIVER_POOL, VOLCANO } from '@insel/shared';
import { blobMask, coastDistance, CRATER, natural, TERRAIN_SIZE } from './ground.ts';
import { basinWeight, riverLevelAt, type IslandLayout } from './layout.ts';
import { fbm, lerp, noise2, smoothstep } from './noise.ts';
import { patchTerrainMaterial } from './worldfx.ts';

export { TERRAIN_SIZE };
export const SEA_LEVEL = 0;

interface GridPoint {
  x: number;
  z: number;
}

/** Schneller Abstand zu einem Polygonzug über ein Gitter von Segmenten. */
class SegmentGrid<T extends GridPoint> {
  private cells = new Map<number, number[]>();
  constructor(
    readonly pts: T[],
    private cell: number,
    reach: number,
  ) {
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i]!;
      const b = pts[i + 1]!;
      const x0 = Math.floor((Math.min(a.x, b.x) - reach) / cell);
      const x1 = Math.floor((Math.max(a.x, b.x) + reach) / cell);
      const z0 = Math.floor((Math.min(a.z, b.z) - reach) / cell);
      const z1 = Math.floor((Math.max(a.z, b.z) + reach) / cell);
      for (let cx = x0; cx <= x1; cx++)
        for (let cz = z0; cz <= z1; cz++) {
          const k = cx * 73856093 ^ cz * 19349663;
          let arr = this.cells.get(k);
          if (!arr) this.cells.set(k, (arr = []));
          arr.push(i);
        }
    }
  }
  /** Nächstes Segment: Abstand, Segmentindex, Anteil auf dem Segment. */
  nearest(x: number, z: number): { d: number; i: number; f: number } {
    const k = Math.floor(x / this.cell) * 73856093 ^ Math.floor(z / this.cell) * 19349663;
    const segs = this.cells.get(k);
    let best = { d: Infinity, i: -1, f: 0 };
    if (!segs) return best;
    for (const i of segs) {
      const a = this.pts[i]!;
      const b = this.pts[i + 1]!;
      const abx = b.x - a.x;
      const abz = b.z - a.z;
      const l2 = abx * abx + abz * abz || 1e-6;
      const f = Math.max(0, Math.min(1, ((x - a.x) * abx + (z - a.z) * abz) / l2));
      const d = Math.hypot(x - (a.x + abx * f), z - (a.z + abz * f));
      if (d < best.d) best = { d, i, f };
    }
    return best;
  }
}

export interface Heightfield {
  size: number;
  res: number;
  heights: Float32Array;
  /** Bilinear interpolierte Höhe. */
  height(x: number, z: number): number;
  /** Abstand zum Weg (für Deko-Platzierung). */
  pathDistance(x: number, z: number): number;
  /** Abstand zum Wasser des Flusses (negativ = im Wasser) */
  riverDistance(x: number, z: number): number;
  /** Abstand zum Bach hinter der Liane (negativ = im Wasser) */
  creekDistance(x: number, z: number): number;
  /** Abstand zum Rand der Schlucht (negativ = in der Schlucht) */
  gorgeDistance(x: number, z: number): number;
  /** Geländeneigung 0 (flach) … 1 (senkrecht). */
  slope(x: number, z: number): number;
}

const riverPts = RIVER.map((p) => ({ ...p }));
const pool = RIVER[RIVER_POOL]!;

export function buildHeightfield(layout: IslandLayout, res: number): Heightfield {
  const pathGrid = new SegmentGrid(layout.path, 3, 6);
  const riverGrid = new SegmentGrid(riverPts, 3, 7);
  const gorgeGrid = new SegmentGrid(GORGE, 3, 6);
  const basin = layout.fordBasin;
  /** Abstand zum Rand des Furtbeckens (negativ = im Becken) */
  const basinDistance = (x: number, z: number) => {
    if (!basin) return Infinity;
    const dx = x - basin.x;
    const dz = z - basin.z;
    const u = Math.abs(dx * basin.along.x + dz * basin.along.z) - basin.halfAlong;
    const v = Math.abs(dx * basin.across.x + dz * basin.across.z) - basin.halfAcross;
    return Math.max(u, v);
  };
  const creek = layout.creek;
  const creekGrid = creek.length > 1 ? new SegmentGrid(creek, 3, 4) : null;
  const half = TERRAIN_SIZE / 2;
  const n = res + 1;
  const heights = new Float32Array(n * n);
  const pw = layout.fieldRadius * 1.3;
  const br = layout.bridge;
  // Jedes Feld bekommt eine ebene Fläche (sonst schneiden Felder in Kehren in den Hang)
  const padCell = 4;
  const pads = new Map<number, number[]>();
  layout.fields.forEach((f, i) => {
    if (f.ford || f.bridge) return;
    for (let cx = Math.floor((f.x - 3) / padCell); cx <= Math.floor((f.x + 3) / padCell); cx++)
      for (let cz = Math.floor((f.z - 3) / padCell); cz <= Math.floor((f.z + 3) / padCell); cz++) {
        const k = cx * 7919 + cz;
        const arr = pads.get(k);
        if (arr) arr.push(i);
        else pads.set(k, [i]);
      }
  });
  const padR = (i: number) => layout.fieldRadius * (i === 0 ? 2.1 : i === layout.fields.length - 1 ? 1.55 : 1) + 0.35;

  const riverInfo = (x: number, z: number) => {
    const r = riverGrid.nearest(x, z);
    if (r.i < 0) return null;
    const a = riverPts[r.i]!;
    const b = riverPts[r.i + 1]!;
    return { d: r.d, w: a.w + (b.w - a.w) * r.f, level: riverLevelAt(r.i, r.f), i: r.i };
  };
  const creekInfo = (x: number, z: number) => {
    const c = creekGrid?.nearest(x, z);
    if (!c || c.i < 0) return null;
    const a = creek[c.i]!;
    const b = creek[c.i + 1]!;
    return { d: c.d, w: a.w + (b.w - a.w) * c.f, level: a.y + (b.y - a.y) * c.f, first: c.i === 0 && c.f < 0.05 };
  };
  const gorgeInfo = (x: number, z: number) => {
    const g = gorgeGrid.nearest(x, z);
    if (g.i < 0) return null;
    const a = GORGE[g.i]!;
    const b = GORGE[g.i + 1]!;
    const u = (g.i + g.f) / (GORGE.length - 1);
    return { d: g.d, w: a.w + (b.w - a.w) * g.f, bed: lerp(-3.2, -0.9, u) };
  };

  for (let iz = 0; iz < n; iz++) {
    for (let ix = 0; ix < n; ix++) {
      const x = -half + (ix / res) * TERRAIN_SIZE;
      const z = -half + (iz / res) * TERRAIN_SIZE;
      let h = natural(x, z);

      // Weg-Terrasse (nicht auf der Brücke, nicht in den Krater hinein)
      const p = pathGrid.nearest(x, z);
      if (p.i >= 0) {
        const a = layout.path[p.i]!;
        const b = layout.path[p.i + 1]!;
        const s = a.s + (b.s - a.s) * p.f;
        if (s < br.s0 - 0.6 || s > br.s1 + 0.6) {
          const py = a.y + (b.y - a.y) * p.f;
          let k = 1 - smoothstep(pw, pw + 2.8, p.d);
          const dv = Math.hypot(x - VOLCANO.x, z - VOLCANO.z);
          k *= smoothstep(CRATER.crest - 0.9, CRATER.crest - 0.15, dv);
          if (k > 0) h = lerp(h, py - 0.07, k);
        }
      }

      // Feldflächen
      const near = pads.get(Math.floor(x / padCell) * 7919 + Math.floor(z / padCell));
      if (near) {
        for (const i of near) {
          const f = layout.fields[i]!;
          const d = Math.hypot(x - f.x, z - f.z);
          const r = padR(i);
          if (d < r + 1.4) {
            const k = 1 - smoothstep(r, r + 1.4, d);
            const dv = Math.hypot(x - VOLCANO.x, z - VOLCANO.z);
            if (dv < CRATER.crest - 0.2) continue;
            h = lerp(h, f.y - 0.07, k);
          }
        }
      }

      // Fluss: Ufer aufschütten, Bett graben
      const rv = riverInfo(x, z);
      if (rv) {
        if (rv.level > 0.25) {
          const bank = 1 - smoothstep(rv.w + 0.6, rv.w + 3.4, rv.d);
          h = Math.max(h, lerp(h, rv.level + 0.32, bank));
        }
        const depth = 0.45 + rv.w * 0.2;
        const k = 1 - smoothstep(rv.w * 0.5, rv.w + 0.5, rv.d);
        h = Math.min(h, lerp(h, rv.level - depth, k));
      }
      // Furtbecken: gleichmäßig tief, damit Fässer und Kisten ganz im Wasser stehen
      if (basin) {
        const k = basinWeight(basin, x, z, 0.55);
        if (k > 0) h = Math.min(h, lerp(h, basin.y - 0.9 - noise2(x * 0.7, z * 0.7) * 0.12, k));
      }
      // Bach hinter der Liane: schmales Bett mit flachen Ufern
      const ck = creekInfo(x, z);
      if (ck && !ck.first) {
        const k = 1 - smoothstep(ck.w * 0.6, ck.w + 0.4, ck.d);
        h = Math.min(h, lerp(h, ck.level - 0.28 - ck.w * 0.2, k));
      }
      // Becken unter dem Wasserfall
      const dp = Math.hypot(x - pool.x, z - pool.z);
      if (dp < pool.w + 1.2) {
        const k = 1 - smoothstep(pool.w - 0.3, pool.w + 0.8, dp);
        h = Math.min(h, lerp(h, pool.y - 1.6 + smoothstep(0, pool.w, dp) * 0.9, k));
      }
      // Schlucht
      const g = gorgeInfo(x, z);
      if (g) {
        const k = 1 - smoothstep(g.w, g.w + 0.9, g.d + noise2(x * 0.8, z * 0.8) * 0.25);
        h = Math.min(h, lerp(h, g.bed, k));
      }
      heights[iz * n + ix] = h;
    }
  }

  const sampleRaw = (x: number, z: number) => {
    const fx = ((x + half) / TERRAIN_SIZE) * res;
    const fz = ((z + half) / TERRAIN_SIZE) * res;
    const ix = Math.max(0, Math.min(res - 1, Math.floor(fx)));
    const iz = Math.max(0, Math.min(res - 1, Math.floor(fz)));
    const tx = Math.min(1, Math.max(0, fx - ix));
    const tz = Math.min(1, Math.max(0, fz - iz));
    const h00 = heights[iz * n + ix]!;
    const h10 = heights[iz * n + ix + 1]!;
    const h01 = heights[(iz + 1) * n + ix]!;
    const h11 = heights[(iz + 1) * n + ix + 1]!;
    return lerp(lerp(h00, h10, tx), lerp(h01, h11, tx), tz);
  };

  return {
    size: TERRAIN_SIZE,
    res,
    heights,
    height: sampleRaw,
    pathDistance: (x, z) => pathGrid.nearest(x, z).d,
    riverDistance(x, z) {
      const r = riverInfo(x, z);
      const c = creekInfo(x, z);
      const dPool = Math.hypot(x - pool.x, z - pool.z) - pool.w;
      return Math.min(r ? r.d - r.w : Infinity, c ? c.d - c.w : Infinity, dPool, basinDistance(x, z));
    },
    creekDistance(x, z) {
      const c = creekInfo(x, z);
      return c ? c.d - c.w : Infinity;
    },
    gorgeDistance(x, z) {
      const g = gorgeInfo(x, z);
      return g ? g.d - g.w : Infinity;
    },
    slope(x, z) {
      const e = 0.4;
      const dx = sampleRaw(x + e, z) - sampleRaw(x - e, z);
      const dz = sampleRaw(x, z + e) - sampleRaw(x, z - e);
      const ny = (2 * e) / Math.hypot(dx, 2 * e, dz);
      return 1 - ny;
    },
  };
}

/** Reihenfolge der Ultra-Materialien (Attribute matA/matB, Ebenen der Texturfelder in ultra.ts) */
export const MAT = { sand: 0, grass: 1, rock: 2, path: 3, volcanic: 4, pebbles: 5 } as const;

const C = (hex: string) => new THREE.Color(hex);
const COL = {
  seabed: C('#c9bd8a'),
  seagrass: C('#7f9a5c'),
  seabedDeep: C('#8fa58a'),
  sandWet: C('#c9a96c'),
  sand: C('#eed192'),
  sandLight: C('#f7e2ad'),
  grassLight: C('#86c94e'),
  grass: C('#5fb23e'),
  grassDark: C('#3c8a31'),
  grassGold: C('#a7c753'),
  meadow: C('#93ca55'),
  earth: C('#7b6046'),
  jungle: C('#2f7c33'),
  jungleFloor: C('#3f6a2b'),
  plateau: C('#a2c45b'),
  path: C('#ddb87c'),
  pathEdge: C('#b48a56'),
  pathStone: C('#c9b394'),
  mud: C('#86684a'),
  pebbles: C('#a59a88'),
  rockLight: C('#a39282'),
  rock: C('#7f6e60'),
  rockDark: C('#56483f'),
  rockRed: C('#8f5f47'),
  ash: C('#6d625d'),
  basalt: C('#3c3431'),
  lavaRock: C('#2c2422'),
  lavaRed: C('#6b3324'),
  sulfur: C('#cdb64e'),
  crater: C('#241a18'),
};

export function buildTerrainMesh(layout: IslandLayout, field: Heightfield): THREE.Mesh {
  const { res, heights } = field;
  const geo = new THREE.PlaneGeometry(TERRAIN_SIZE, TERRAIN_SIZE, res, res);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) pos.setY(i, heights[i]!);
  geo.computeVertexNormals();
  const normals = geo.attributes.normal as THREE.BufferAttribute;
  const colors = new Float32Array(pos.count * 3);
  const glow = new Float32Array(pos.count);
  // Materialanteile je Punkt für die Ultra-Grafik (Sand, Gras, Fels, Weg | Vulkangestein, Kiesel)
  const matA = new Float32Array(pos.count * 4);
  const matB = new Float32Array(pos.count * 2);
  const W = new Float32Array(6);
  const setW = (k: number) => {
    W.fill(0);
    W[k] = 1;
  };
  const mixW = (k: number, a: number) => {
    if (a <= 0) return;
    const b = Math.min(1, a);
    for (let j = 0; j < 6; j++) W[j]! *= 1 - b;
    W[k]! += b;
  };
  const pathWidth = layout.fieldRadius * 1.22;
  const v = layout.volcano;
  const tmp = new THREE.Color();
  const br = layout.bridge;

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const h = pos.getY(i);
    const ny = normals.getY(i);
    const n1 = fbm(x * 0.16, z * 0.16, 3);
    const n2 = noise2(x * 0.55 + 7, z * 0.55 - 3);
    const n3 = noise2(x * 1.7 - 2, z * 1.7 + 9);
    const d = coastDistance(x, z);
    const dv = Math.hypot(x - v.x, z - v.z);
    const th = Math.atan2(z - v.z, x - v.x);

    // --- Grundfarbe nach Höhe / Lage -------------------------------------------
    if (h < 0.05) {
      setW(MAT.sand);
      // Meeresgrund: Sand, Seegraswiesen, tiefer grünlich
      tmp.copy(COL.seabed).lerp(COL.seagrass, smoothstep(0.15, 0.55, n1) * smoothstep(-0.6, -1.8, h) * 0.85);
      tmp.lerp(COL.seabedDeep, smoothstep(-2.5, -7, h));
      tmp.lerp(COL.sandWet, smoothstep(-0.6, 0.05, h) * 0.7);
    } else if (h < 1.05 + n1 * 0.35 && d < 9) {
      setW(MAT.sand);
      tmp.copy(COL.sandWet).lerp(COL.sand, smoothstep(0.1, 0.5, h));
      tmp.lerp(COL.sandLight, smoothstep(0.2, 0.9, n2 * 0.5 + 0.5) * smoothstep(0.4, 0.9, h) * 0.7);
    } else {
      setW(MAT.grass);
      tmp.copy(COL.grass).lerp(COL.grassDark, smoothstep(-0.25, 0.45, n1));
      tmp.lerp(COL.grassLight, smoothstep(0.3, 0.8, n2) * 0.4);
      tmp.lerp(COL.grassGold, smoothstep(0.45, 0.85, n3 * 0.5 + 0.5) * 0.3);
      // Dschungel dunkel und satt
      const jungle = Math.max(blobMask('jungle', x, z), smoothstep(14, 22, x) * smoothstep(-10, -2, z) * smoothstep(22, 12, z));
      tmp.lerp(COL.jungle, jungle * 0.6);
      tmp.lerp(COL.jungleFloor, jungle * smoothstep(0.1, 0.6, n2) * 0.35);
      // Hochebenen goldgrün, Tempelhügel als Blumenwiese
      tmp.lerp(COL.plateau, Math.max(blobMask('nwPlateau', x, z), blobMask('saddle', x, z), blobMask('westHigh', x, z)) * smoothstep(5, 6.5, h) * 0.55);
      tmp.lerp(COL.meadow, blobMask('ruinsHill', x, z) * 0.45);
      // Übergang Sand → Gras
      tmp.lerp(COL.sand, smoothstep(1.55, 1.05, h + n1 * 0.25) * smoothstep(12, 4, d) * 0.85);
      mixW(MAT.sand, smoothstep(1.55, 1.05, h + n1 * 0.25) * smoothstep(12, 4, d) * 0.85);
    }

    // --- Fels an steilen Hängen: geschichtete Klippen ---------------------------
    const steep = smoothstep(0.8, 0.52, ny);
    if (steep > 0) {
      const band = Math.sin(h * 3.1 + n1 * 2.2) * 0.5 + 0.5;
      const rockC = COL.rock.clone().lerp(COL.rockLight, smoothstep(0.55, 0.9, band)).lerp(COL.rockDark, smoothstep(0.25, 0.05, band) * 0.7);
      rockC.lerp(COL.rockRed, smoothstep(0.35, 0.8, n2) * 0.3);
      tmp.lerp(rockC, steep * 0.95);
      mixW(MAT.rock, steep * 0.95);
    }
    // Grasnarbe oben an Klippenkanten bleibt grün; feuchtes Ufer am Fluss
    const rd = field.riverDistance(x, z);
    if (rd < 1.6 && h > 0.2) {
      tmp.lerp(COL.mud, smoothstep(1.6, 0.2, rd) * 0.55);
      tmp.lerp(COL.pebbles, smoothstep(0.6, -0.4, rd) * smoothstep(0.2, 0.7, n3) * 0.6);
      mixW(MAT.pebbles, smoothstep(1.6, 0.2, rd) * 0.75);
    }

    // --- Vulkan --------------------------------------------------------------
    if (dv < 27) {
      // Übergang Wiese → Erde → Asche/Basalt
      tmp.lerp(COL.earth, smoothstep(22, 16, dv) * smoothstep(4, 7.5, h) * 0.55);
      mixW(MAT.path, smoothstep(22, 16, dv) * smoothstep(4, 7.5, h) * 0.45);
      const cone = smoothstep(21, 13, dv) * smoothstep(7, 10.5, h);
      const ashC = COL.ash.clone().lerp(COL.basalt, smoothstep(-0.2, 0.4, n1)).lerp(COL.lavaRed, smoothstep(0.4, 0.8, n2) * 0.45);
      tmp.lerp(ashC, cone * 0.92);
      mixW(MAT.volcanic, cone * 0.95);
      // erstarrte Lavaströme: radiale Bahnen
      const flow = smoothstep(0.58, 0.82, noise2(th * 4.2 + 1.3, dv * 0.09) * 0.5 + 0.5);
      tmp.lerp(COL.lavaRock, flow * cone * smoothstep(23, CRATER.crest + 2, dv) * 0.85);
      // Schwefel am Kraterrand
      tmp.lerp(COL.sulfur, smoothstep(CRATER.crest + 2.5, CRATER.crest + 0.6, dv) * smoothstep(0.55, 0.85, n3 * 0.5 + 0.5) * 0.45);
      if (dv < CRATER.crest - 0.15) {
        setW(MAT.volcanic);
        tmp.copy(COL.crater).lerp(COL.lavaRock, n3 * 0.5 + 0.5);
        // Glut im Kraterboden
        glow[i] = smoothstep(CRATER.ledge + 0.8, CRATER.lava, dv) * 0.55 + smoothstep(0.6, 0.85, n3 * 0.5 + 0.5) * smoothstep(CRATER.crest, CRATER.ledge, dv) * 0.35;
      }
    }

    // --- Weg ------------------------------------------------------------------
    const pd = field.pathDistance(x, z);
    // der Bach unterbricht den Weg (dort Uferkies statt Weg)
    const cd = field.creekDistance(x, z);
    const pathK = (1 - smoothstep(pathWidth * 0.78 + n2 * 0.12, pathWidth + 0.38, pd)) * smoothstep(0.1, 0.7, cd);
    if (pathK > 0 && !(Math.hypot(x - br.x, z - br.z) < br.length * 0.5 && h < br.a.y - 1)) {
      tmp.lerp(COL.pathEdge, smoothstep(0, 0.55, pathK) * 0.65);
      const center = COL.path.clone().lerp(COL.pathStone, smoothstep(0.35, 0.75, n3 * 0.5 + 0.5) * 0.5);
      tmp.lerp(center, smoothstep(0.45, 1, pathK));
      mixW(MAT.path, smoothstep(0, 0.55, pathK) * 0.65);
      mixW(MAT.path, smoothstep(0.45, 1, pathK));
      glow[i] = 0;
    }

    const shade = 1 + n2 * 0.045;
    colors[i * 3] = tmp.r * shade;
    colors[i * 3 + 1] = tmp.g * shade;
    colors[i * 3 + 2] = tmp.b * shade;
    matA.set([W[0]!, W[1]!, W[2]!, W[3]!], i * 4);
    matB.set([W[4]!, W[5]!], i * 2);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.setAttribute('glow', new THREE.BufferAttribute(glow, 1));
  geo.setAttribute('matA', new THREE.BufferAttribute(matA, 4));
  geo.setAttribute('matB', new THREE.BufferAttribute(matB, 2));

  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.93, metalness: 0 });
  patchTerrainMaterial(material);
  const mesh = new THREE.Mesh(geo, material);
  mesh.receiveShadow = true;
  mesh.castShadow = true;
  mesh.name = 'terrain';
  return mesh;
}

/** Farbe des Geländes an (x, z) – z. B. damit Gras die Bodenfarbe übernimmt. */
export function terrainColorSampler(mesh: THREE.Mesh, res: number) {
  const col = (mesh.geometry.attributes.color as THREE.BufferAttribute).array as Float32Array;
  const n = res + 1;
  const half = TERRAIN_SIZE / 2;
  return (x: number, z: number, out: THREE.Color) => {
    const fx = Math.max(0, Math.min(res - 0.001, ((x + half) / TERRAIN_SIZE) * res));
    const fz = Math.max(0, Math.min(res - 0.001, ((z + half) / TERRAIN_SIZE) * res));
    const ix = Math.floor(fx);
    const iz = Math.floor(fz);
    const tx = fx - ix;
    const tz = fz - iz;
    const i00 = (iz * n + ix) * 3;
    const i10 = i00 + 3;
    const i01 = i00 + n * 3;
    const i11 = i01 + 3;
    const ch = (o: number) => lerp(lerp(col[i00 + o]!, col[i10 + o]!, tx), lerp(col[i01 + o]!, col[i11 + o]!, tx), tz);
    return out.setRGB(ch(0), ch(1), ch(2));
  };
}

/** Höhen als Textur für die Wasser-Shader (Tiefe → Farbe, Durchsicht, Schaum an der Küste). */
export function heightTexture(field: Heightfield): THREE.DataTexture {
  const n = field.res + 1;
  // Half-Float ist in WebGL2 immer linear filterbar (Float32 nur mit Erweiterung)
  const half = new Uint16Array(field.heights.length);
  for (let i = 0; i < half.length; i++) half[i] = THREE.DataUtils.toHalfFloat(field.heights[i]!);
  const tex = new THREE.DataTexture(half, n, n, THREE.RedFormat, THREE.HalfFloatType);
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return tex;
}
