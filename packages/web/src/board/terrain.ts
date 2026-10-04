/**
 * Gelände der Insel als Höhenfeld: Küste, Hügel, Hochebene, Vulkan mit Krater,
 * eingeebneter Weg und Flussbett. Farben pro Vertex (Sand, Gras, Weg, Fels, Lava-Gestein).
 */
import * as THREE from 'three';
import type { IslandLayout } from './layout.ts';
import { fbm, lerp, noise2, smoothstep } from './noise.ts';

export const TERRAIN_SIZE = 84;
export const SEA_LEVEL = 0;

/** Schneller Abstand zu einem Polygonzug über ein Gitter von Segmenten. */
class SegmentGrid {
  private cells = new Map<number, number[]>();
  constructor(
    private pts: { x: number; z: number; y: number; t?: number }[],
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
  nearest(x: number, z: number): { d: number; y: number; t: number; i: number } {
    const k = Math.floor(x / this.cell) * 73856093 ^ Math.floor(z / this.cell) * 19349663;
    const segs = this.cells.get(k);
    let best = { d: Infinity, y: 0, t: 0, i: -1 };
    if (!segs) return best;
    for (const i of segs) {
      const a = this.pts[i]!;
      const b = this.pts[i + 1]!;
      const abx = b.x - a.x;
      const abz = b.z - a.z;
      const l2 = abx * abx + abz * abz || 1e-6;
      const f = Math.max(0, Math.min(1, ((x - a.x) * abx + (z - a.z) * abz) / l2));
      const d = Math.hypot(x - (a.x + abx * f), z - (a.z + abz * f));
      if (d < best.d) best = { d, y: a.y + (b.y - a.y) * f, t: (a.t ?? 0) + ((b.t ?? 0) - (a.t ?? 0)) * f, i };
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
  riverDistance(x: number, z: number): number;
  /** Geländeneigung 0 (flach) … 1 (senkrecht). */
  slope(x: number, z: number): number;
}

export function riverLevel(t: number) {
  return lerp(3.2, -0.25, Math.pow(t, 0.8));
}

export function buildHeightfield(layout: IslandLayout, res: number): Heightfield {
  const { volcano } = layout;
  const pathGrid = new SegmentGrid(layout.path, 3, 5);
  // Fluss mit Parameter t (0 = Quelle, 1 = Mündung)
  const riverPts = layout.river.map((p, i, arr) => ({ ...p, y: 0, t: i / (arr.length - 1) }));
  const riverGrid = new SegmentGrid(riverPts, 3, 5);
  const half = TERRAIN_SIZE / 2;
  const n = res + 1;
  const heights = new Float32Array(n * n);
  const pathWidth = layout.fieldRadius * 1.35;
  const bridge = layout.bridge;

  for (let iz = 0; iz < n; iz++) {
    for (let ix = 0; ix < n; ix++) {
      const x = -half + (ix / res) * TERRAIN_SIZE;
      const z = -half + (iz / res) * TERRAIN_SIZE;
      const r = Math.hypot(x * 0.97, z * 1.02);
      const ang = Math.atan2(z, x);
      // Küstenlinie mit Buchten
      const coast = 28.5 + noise2(Math.cos(ang) * 1.6 + 3, Math.sin(ang) * 1.6) * 2.6 + Math.sin(ang * 3 + 0.6) * 0.9;
      const land = smoothstep(coast + 1.2, coast - 3.5, r);
      // Landprofil: Strand → Hügel; Norden/Westen höher (Klippen, Hochebene)
      const regional = smoothstep(4, -22, z) * 2.4 + smoothstep(2, -24, x) * 1.6;
      const hills = fbm(x * 0.055 + 11, z * 0.055 - 4, 4) * 2.2;
      let landH = 0.75 + 3.4 * smoothstep(coast - 1, coast - 13, r) + regional * smoothstep(coast, coast - 10, r) + hills * smoothstep(coast, coast - 8, r);
      // Klippen im Norden: steile Kante zum Meer
      const north = smoothstep(-12, -22, z);
      landH += north * smoothstep(coast + 0.5, coast - 2.5, r) * 1.6;
      const seaH = -0.6 - Math.max(0, r - coast) * 0.42 - fbm(x * 0.08, z * 0.08, 2) * 0.6;
      let h = lerp(seaH, landH, land);

      // Vulkan
      const dv = Math.hypot(x - volcano.x, z - volcano.z);
      const ridges = noise2(Math.atan2(z - volcano.z, x - volcano.x) * 2.5, dv * 0.25) * 0.9;
      const coneT = 1 - smoothstep(volcano.craterRadius, volcano.baseRadius, dv);
      let cone = volcano.height * Math.pow(coneT, 1.35) + ridges * coneT * (1 - coneT) * 3;
      if (dv < volcano.craterRadius) {
        // Krater mit flachem Boden (dort liegt der Lavasee)
        const k = 1 - dv / volcano.craterRadius;
        cone = volcano.height - 2.7 * smoothstep(0, 0.42, k);
      }
      // weiche Vereinigung (smooth max) – nur im Bereich des Vulkans
      if (coneT > 0) {
        const kBlend = 1.8;
        const hm = Math.max(0, kBlend - Math.abs(h - cone)) / kBlend;
        h = Math.max(h, cone) + hm * hm * kBlend * 0.25 * coneT;
      }

      // Weg einebnen (Terrasse am Berg)
      const p = pathGrid.nearest(x, z);
      if (p.i >= 0) {
        const k = 1 - smoothstep(pathWidth, pathWidth + 2.6, p.d);
        const target = p.y - 0.06;
        // Bergseitig nicht absenken, sondern nur bis zur Weghöhe abtragen/auffüllen
        h = lerp(h, target, k);
      }

      // Flussbett (nicht unter der Brücke auffüllen)
      const rv = riverGrid.nearest(x, z);
      if (rv.i >= 0) {
        const w = lerp(0.9, 2.4, rv.t);
        const k = 1 - smoothstep(w, w + 1.6, rv.d);
        const bed = riverLevel(rv.t) - 0.55;
        const nearBridge = Math.hypot(x - bridge.x, z - bridge.z) < bridge.length * 0.6;
        if (k > 0) h = nearBridge ? Math.min(h, lerp(h, bed, k)) : lerp(h, Math.min(h, bed), k);
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
    riverDistance: (x, z) => riverGrid.nearest(x, z).d,
    slope(x, z) {
      const e = 0.4;
      const dx = sampleRaw(x + e, z) - sampleRaw(x - e, z);
      const dz = sampleRaw(x, z + e) - sampleRaw(x, z - e);
      const ny = (2 * e) / Math.hypot(dx, 2 * e, dz);
      return 1 - ny;
    },
  };
}

const C = (hex: string) => new THREE.Color(hex);
const COLORS = {
  sandWet: C('#d5b97f'),
  sand: C('#f3dda2'),
  sandLight: C('#fbe9bd'),
  grass: C('#7fc657'),
  grassDark: C('#4f9e3d'),
  grassYellow: C('#a6cf5c'),
  jungle: C('#3f8c37'),
  path: C('#e2c48a'),
  pathEdge: C('#c9a96c'),
  rock: C('#9e9282'),
  rockDark: C('#5e504a'),
  basalt: C('#4a3d39'),
  lavaStreak: C('#7a3324'),
  lavaRock: C('#3d302c'),
  crater: C('#2e2220'),
  seabed: C('#d8c58f'),
};

export function buildTerrainMesh(layout: IslandLayout, field: Heightfield): THREE.Mesh {
  const { res, heights } = field;
  const geo = new THREE.PlaneGeometry(TERRAIN_SIZE, TERRAIN_SIZE, res, res);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  // PlaneGeometry nach rotateX: Zeilen laufen von z = -half (oben) nach +half
  for (let i = 0; i < pos.count; i++) pos.setY(i, heights[i]!);
  geo.computeVertexNormals();
  const normals = geo.attributes.normal as THREE.BufferAttribute;
  const colors = new Float32Array(pos.count * 3);
  const pathWidth = layout.fieldRadius * 1.25;
  const v = layout.volcano;
  const tmp = new THREE.Color();

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const h = pos.getY(i);
    const ny = normals.getY(i);
    const n1 = fbm(x * 0.18, z * 0.18, 3);
    const n2 = noise2(x * 0.6 + 7, z * 0.6 - 3);

    // Grundfarbe nach Höhe
    if (h < 0.15) tmp.copy(COLORS.sandWet).lerp(COLORS.seabed, smoothstep(0.1, -2, h));
    else if (h < 1.25 + n1 * 0.4) tmp.copy(COLORS.sand).lerp(COLORS.sandLight, smoothstep(0.2, 1, n2 * 0.5 + 0.5) * 0.6);
    else {
      tmp.copy(COLORS.grass).lerp(COLORS.grassDark, smoothstep(-0.3, 0.5, n1));
      tmp.lerp(COLORS.grassYellow, smoothstep(0.35, 0.8, n2) * 0.35);
      // Dschungel im Osten dunkler
      const jungle = smoothstep(6, 16, x) * smoothstep(-14, -4, z) * smoothstep(24, 14, z);
      tmp.lerp(COLORS.jungle, jungle * 0.55);
      // Übergang Sand → Gras
      tmp.lerp(COLORS.sand, smoothstep(1.7, 1.2, h) * 0.8);
    }
    // Fels an steilen Hängen
    const steep = smoothstep(0.78, 0.55, ny);
    tmp.lerp(COLORS.rock, steep * 0.9);
    // Vulkan: oben Lava-Gestein
    const dv = Math.hypot(x - v.x, z - v.z);
    const volcanic = smoothstep(v.height * 0.25, v.height * 0.7, h) * smoothstep(v.baseRadius, v.baseRadius * 0.45, dv);
    tmp.lerp(COLORS.rockDark, volcanic * 0.9);
    tmp.lerp(COLORS.basalt, volcanic * smoothstep(-0.2, 0.4, n1) * 0.6);
    // Erkaltete Lavaströme: radiale Streifen am oberen Kegel
    const ang = Math.atan2(z - v.z, x - v.x);
    const streak = smoothstep(0.55, 0.9, noise2(ang * 4.5, dv * 0.12) * 0.5 + 0.5);
    tmp.lerp(COLORS.lavaStreak, streak * volcanic * smoothstep(v.baseRadius * 0.8, v.craterRadius + 1, dv) * 0.75);
    tmp.lerp(COLORS.lavaRock, smoothstep(v.craterRadius + 3, v.craterRadius, dv) * 0.9);
    if (dv < v.craterRadius - 0.2) tmp.copy(COLORS.crater);

    // Weg
    const pd = field.pathDistance(x, z);
    const pathK = 1 - smoothstep(pathWidth * 0.75 + n2 * 0.15, pathWidth + 0.35, pd);
    if (pathK > 0) {
      tmp.lerp(COLORS.pathEdge, smoothstep(0, 0.6, pathK) * 0.6);
      tmp.lerp(COLORS.path, smoothstep(0.4, 1, pathK));
    }
    // Leichte Helligkeitsvariation
    const shade = 1 + n2 * 0.05;
    colors[i * 3] = tmp.r * shade;
    colors[i * 3 + 1] = tmp.g * shade;
    colors[i * 3 + 2] = tmp.b * shade;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.92,
    metalness: 0,
    flatShading: false,
  });
  const mesh = new THREE.Mesh(geo, material);
  mesh.receiveShadow = true;
  mesh.castShadow = true;
  mesh.name = 'terrain';
  return mesh;
}

/** Höhen als Textur für den Wasser-Shader (Tiefe → Farbe, Schaum an der Küste). */
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
