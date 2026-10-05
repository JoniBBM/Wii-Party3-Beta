/**
 * Natürliche Geländeform der Insel – ohne Weg: Küste mit Stränden und Steilküsten, Riff,
 * Hochebenen mit Klippen, Tempelhügel, Dschungel-Niederung, Felsstufe am Wasserfall,
 * Lagune und der Vulkan mit Schildsockel, Kegel, Graten und Krater.
 * Reine Mathematik: Grundlage für Gelände, Weghöhen und die Platzierung der Deko.
 */
import { coastOutline, LAGOON, VOLCANO, type P2 } from '@insel/shared';
import { fbm, lerp, noise2, smoothstep } from './noise.ts';

export const TERRAIN_SIZE = 132;
const HALF = TERRAIN_SIZE / 2;

// ---------------------------------------------------------------------------
// Abstand zur Küste (positiv = an Land), einmalig auf einem Gitter berechnet
// ---------------------------------------------------------------------------
const SDF_CELL = 0.5;
const SDF_N = Math.round(TERRAIN_SIZE / SDF_CELL) + 1;
let sdf: Float32Array | null = null;

function buildSdf(): Float32Array {
  const poly = coastOutline(6);
  const n = poly.length;
  const out = new Float32Array(SDF_N * SDF_N);
  // Segmente in grobe Zellen einsortieren (Suche nur in der Nähe, Rest wird gekappt)
  const CELL = 6;
  const REACH = 24;
  const buckets = new Map<number, number[]>();
  const key = (cx: number, cz: number) => cx * 4099 + cz;
  for (let i = 0; i < n; i++) {
    const a = poly[i]!;
    const b = poly[(i + 1) % n]!;
    const x0 = Math.floor((Math.min(a.x, b.x) - REACH) / CELL);
    const x1 = Math.floor((Math.max(a.x, b.x) + REACH) / CELL);
    const z0 = Math.floor((Math.min(a.z, b.z) - REACH) / CELL);
    const z1 = Math.floor((Math.max(a.z, b.z) + REACH) / CELL);
    for (let cx = x0; cx <= x1; cx++)
      for (let cz = z0; cz <= z1; cz++) {
        const k = key(cx, cz);
        const arr = buckets.get(k);
        if (arr) arr.push(i);
        else buckets.set(k, [i]);
      }
  }
  for (let iz = 0; iz < SDF_N; iz++) {
    const z = -HALF + iz * SDF_CELL;
    // Innen/außen per Strahl in x-Richtung: Schnittpunkte dieser Zeile einmal bestimmen
    const xs: number[] = [];
    for (let i = 0; i < n; i++) {
      const a = poly[i]!;
      const b = poly[(i + 1) % n]!;
      if (a.z > z !== b.z > z) xs.push(a.x + ((z - a.z) / (b.z - a.z)) * (b.x - a.x));
    }
    xs.sort((p, q) => p - q);
    for (let ix = 0; ix < SDF_N; ix++) {
      const x = -HALF + ix * SDF_CELL;
      let inside = false;
      for (const cx of xs) if (cx < x) inside = !inside;
      const segs = buckets.get(key(Math.floor(x / CELL), Math.floor(z / CELL)));
      let d = REACH;
      if (segs)
        for (const i of segs) {
          const a = poly[i]!;
          const b = poly[(i + 1) % n]!;
          const abx = b.x - a.x;
          const abz = b.z - a.z;
          const f = Math.max(0, Math.min(1, ((x - a.x) * abx + (z - a.z) * abz) / (abx * abx + abz * abz || 1e-9)));
          const dd = Math.hypot(x - a.x - abx * f, z - a.z - abz * f);
          if (dd < d) d = dd;
        }
      out[iz * SDF_N + ix] = inside ? d : -d;
    }
  }
  return out;
}

/** Abstand zur Küstenlinie in Metern (positiv an Land, negativ im Meer, gekappt bei ±24). */
export function coastDistance(x: number, z: number): number {
  sdf ??= buildSdf();
  const fx = Math.max(0, Math.min(SDF_N - 1.001, (x + HALF) / SDF_CELL));
  const fz = Math.max(0, Math.min(SDF_N - 1.001, (z + HALF) / SDF_CELL));
  const ix = Math.floor(fx);
  const iz = Math.floor(fz);
  const tx = fx - ix;
  const tz = fz - iz;
  const i = iz * SDF_N + ix;
  return lerp(lerp(sdf[i]!, sdf[i + 1]!, tx), lerp(sdf[i + SDF_N]!, sdf[i + SDF_N + 1]!, tx), tz);
}

// ---------------------------------------------------------------------------
// Landschaftsstufen (Hochebenen, Hügel) – je mit unregelmäßiger Kante
// ---------------------------------------------------------------------------
interface Blob {
  x: number;
  z: number;
  rx: number;
  rz: number;
  h: number;
  /** Breite der Böschung als Anteil des Radius (klein = Klippe) */
  edge: number;
}
interface Ridge {
  pts: P2[];
  w: number;
  h: number;
  edge: number;
}

const BLOBS: Record<string, Blob> = {
  nwPlateau: { x: -26.5, z: -19.5, rx: 12, rz: 13.5, h: 7.4, edge: 0.34 },
  westHigh: { x: -35.5, z: 3, rx: 7.8, rz: 10.5, h: 5.6, edge: 0.36 },
  ruinsHill: { x: 3.5, z: 18.6, rx: 9.5, rz: 6.4, h: 3.1, edge: 0.6 },
  jungle: { x: 25, z: 6, rx: 15, rz: 13, h: 2.3, edge: 0.9 },
  lighthouse: { x: 41.6, z: -13.4, rx: 3.6, rz: 3.4, h: 6.6, edge: 0.5 },
  fallShelf: { x: 9.3, z: -12.4, rx: 4.3, rz: 3.7, h: 10.8, edge: 0.3 },
  southHill: { x: -12, z: 18, rx: 6, rz: 5, h: 2.4, edge: 0.7 },
  saddle: { x: -25.5, z: -6.5, rx: 8.5, rz: 6.5, h: 6.9, edge: 0.6 },
};

const RIDGES: Ridge[] = [
  // Steilküste im Norden
  { pts: [{ x: -25, z: -29.5 }, { x: -10, z: -32 }, { x: 6, z: -32.5 }, { x: 20, z: -29.5 }, { x: 31, z: -24 }, { x: 38, z: -17 }], w: 8.5, h: 6.4, edge: 0.42 },
  // Hochland im Nordosten (Leuchtturm)
  { pts: [{ x: 25.5, z: -13.5 }, { x: 31, z: -15.5 }, { x: 38, z: -14.5 }, { x: 42, z: -12 }], w: 6.5, h: 4.4, edge: 0.55 },
];

function distToPolyline(pts: P2[], x: number, z: number): number {
  let d = Infinity;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i]!;
    const b = pts[i + 1]!;
    const abx = b.x - a.x;
    const abz = b.z - a.z;
    const f = Math.max(0, Math.min(1, ((x - a.x) * abx + (z - a.z) * abz) / (abx * abx + abz * abz)));
    d = Math.min(d, Math.hypot(x - a.x - abx * f, z - a.z - abz * f));
  }
  return d;
}

/** Anteil 0…1, wie sehr ein Punkt zu einer Landschaftsstufe gehört (mit zerklüfteter Kante). */
export function blobMask(name: keyof typeof BLOBS, x: number, z: number): number {
  const b = BLOBS[name]!;
  const q = Math.hypot((x - b.x) / b.rx, (z - b.z) / b.rz) + noise2(x * 0.21 + b.x, z * 0.21 - b.z) * 0.13 + noise2(x * 0.7 - b.z, z * 0.7 + b.x) * 0.04;
  // zweistufig: Hauptkante + kleine Vorstufe → wirkt wie verwitterter Fels
  return smoothstep(1, 1 - b.edge, q) * 0.82 + smoothstep(1 - b.edge * 0.6, 1 - b.edge * 1.6, q) * 0.18;
}

function ridgeMask(r: Ridge, x: number, z: number): number {
  const q = distToPolyline(r.pts, x, z) / r.w + noise2(x * 0.19 + 5, z * 0.19 + 2) * 0.1;
  return smoothstep(1, 1 - r.edge, q);
}

/** Höhe der Stufen (ohne Küste/Vulkan); weiche Vereinigung, damit Übergänge nicht abreißen. */
function tiers(x: number, z: number): number {
  let h = 0;
  for (const key of Object.keys(BLOBS) as (keyof typeof BLOBS)[]) h = smax(h, BLOBS[key]!.h * blobMask(key, x, z), 0.8);
  for (const r of RIDGES) h = smax(h, r.h * ridgeMask(r, x, z), 0.8);
  return h;
}

/** Weiche Maximum-Funktion (k = Rundungsbreite). */
export function smax(a: number, b: number, k: number): number {
  const h = Math.max(0, k - Math.abs(a - b)) / k;
  return Math.max(a, b) + h * h * k * 0.25;
}

// ---------------------------------------------------------------------------
// Vulkan
// ---------------------------------------------------------------------------
/** Kamm des Kraterrands (Radius), Kraterboden und Lavasee. */
export const CRATER = {
  crest: VOLCANO.craterRadius + 0.9,
  ledge: 3.2,
  lava: 2.1,
  floorY: VOLCANO.height - 3.1,
  lavaY: VOLCANO.height - 3.55,
};

export function crestHeight(theta: number): number {
  return VOLCANO.height + Math.cos(theta) * 0.45 + noise2(Math.cos(theta) * 2.2 + 9, Math.sin(theta) * 2.2) * 0.35;
}

export function volcanoHeight(x: number, z: number): number {
  const dx = x - VOLCANO.x;
  const dz = z - VOLCANO.z;
  const r = Math.hypot(dx, dz);
  const th = Math.atan2(dz, dx);
  const crest = crestHeight(th);
  if (r < CRATER.crest) {
    // Krater: Lavagrube, Felsboden, Innenwand bis zum Kamm
    if (r < CRATER.lava) return CRATER.lavaY - 0.5 + smoothstep(0, CRATER.lava, r) * 0.4;
    if (r < CRATER.ledge) return lerp(CRATER.lavaY + 0.1, CRATER.floorY, smoothstep(CRATER.lava, CRATER.lava + 0.4, r)) + noise2(x * 1.3, z * 1.3) * 0.08;
    const k = smoothstep(CRATER.ledge, CRATER.crest, r);
    return lerp(CRATER.floorY, crest, Math.pow(k, 0.75)) + noise2(x * 0.9, z * 0.9) * 0.15 * (1 - k);
  }
  // Sockel („Tafel“) mit zerklüfteter Abbruchkante – im Osten (Dschungel/Fluss) niedriger
  const east = smoothstep(0.15, 0.85, Math.cos(th - (15 * Math.PI) / 180));
  const shieldH = 6.6 - 3.8 * east;
  const edge = 23 + fbm(th * 2.4 + 1, 3.3, 3) * 3.4;
  const shield = shieldH * (1 - smoothstep(edge - 6.5, edge + 1.5, r));
  // Kegel mit radialen Graten und Rinnen
  const t = (r - CRATER.crest) / (25 - CRATER.crest);
  const ridges = fbm(th * 3.2 + 4, r * 0.16, 3) * 1.4 + Math.abs(noise2(th * 7.5, r * 0.08)) * 0.9;
  const tc = Math.min(1, Math.max(0, t));
  const cone = crest * Math.pow(1 - tc, 1.5) * smoothstep(1.02, 0.85, tc + 0.02) + ridges * Math.sin(tc * Math.PI) * 1.2;
  return smax(shield, cone, 2.2);
}

/** Kleine vorgelagerte Inseln (Sandinsel mit Palmen, Felsinseln). */
export const ISLETS = [
  { x: -47.5, z: 33.5, r: 3.4, h: 1.3, rocky: false },
  { x: 52.5, z: 13, r: 2.8, h: 1.2, rocky: false },
  { x: -49, z: -27.5, r: 2.4, h: 3.2, rocky: true },
  { x: 13, z: -45.5, r: 1.8, h: 2.6, rocky: true },
];

/** Lavastrom an der Nordflanke (2D-Mittellinie mit halber Breite). */
export function lavaFlowPoints(): (P2 & { w: number })[] {
  const out: (P2 & { w: number })[] = [];
  for (let k = 0; k <= 26; k++) {
    const u = k / 26;
    const a = ((-84 + u * 14 + Math.sin(u * 9) * 3) * Math.PI) / 180;
    const r = 6.3 + u * 9.2;
    out.push({ x: VOLCANO.x + Math.cos(a) * r, z: VOLCANO.z + Math.sin(a) * r, w: 0.4 + u * 0.45 });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Natürliche Höhe
// ---------------------------------------------------------------------------
/** Höhe über dem Meeresspiegel ohne Weg, Fluss und Schlucht. */
export function natural(x: number, z: number): number {
  const d = coastDistance(x, z) + fbm(x * 0.085 + 3, z * 0.085 - 7, 3) * 1.8;
  // Meeresboden: Schelf, dann tiefer; im Süden und Osten ein Riff mit flachem Wasser
  const off = Math.max(0, -d);
  const reefZone = smoothstep(-6, 14, z) * 0.7 + smoothstep(14, 34, x) * 0.5;
  const reef = Math.exp(-((off - 9) ** 2) / 6) * 1.4 * Math.min(1, reefZone) * (0.6 + 0.4 * noise2(x * 0.15, z * 0.15));
  const seaFloor = -0.9 - smoothstep(0, 18, off) * 6.5 - fbm(x * 0.05, z * 0.05, 2) * 0.8 + reef;
  // Strandprofil
  const beachTop = 0.25 + 0.95 * smoothstep(0, 6.5, d);
  let h = d < 0 ? lerp(0.25, seaFloor, smoothstep(0, -7, d)) : beachTop;

  // Hinterland
  const T = tiers(x, z);
  const cliff = smoothstep(3.6, 5.6, T);
  const inland = smoothstep(lerp(3, 0.15, cliff), lerp(9.5, 2.2, cliff), d);
  const hills = fbm(x * 0.06 + 11, z * 0.06 - 4, 4) * 1.1 + 0.4;
  const land = Math.max(beachTop, (T + hills * smoothstep(0.5, 3, T + 1) * 0.6) * inland);
  if (d > -2) h = lerp(h, Math.max(h, land), smoothstep(-2, 0.5, d));

  // Vulkan (reicht bis ins Meer im Norden)
  const dv = Math.hypot(x - VOLCANO.x, z - VOLCANO.z);
  if (dv < 30) {
    const vh = volcanoHeight(x, z) * (d < 0 ? smoothstep(-6, 0, d) : 1);
    h = dv < CRATER.crest ? vh : smax(h, vh, 1.6);
  }

  // Vorgelagerte Inseln
  for (const is of ISLETS) {
    const di = Math.hypot(x - is.x, z - is.z) + noise2(x * 0.5, z * 0.5) * 0.5;
    if (di < is.r + 7) {
      const k = Math.pow(smoothstep(is.r + 6, 0, di), 1.4);
      const peak = is.rocky ? is.h * smoothstep(is.r, 0, di) + 0.4 : 0.3 + (is.h - 0.3) * smoothstep(is.r * 0.9, 0, di);
      h = Math.max(h, lerp(-2.4, peak, k));
    }
  }

  // Lagune: flaches Becken hinter der Sandbank, Durchlass im Südosten
  const dl = Math.hypot(x - LAGOON.x, z - LAGOON.z) + noise2(x * 0.3, z * 0.3) * 0.5;
  const lk = 1 - smoothstep(LAGOON.r - 1.2, LAGOON.r + 1.4, dl);
  if (lk > 0) h = lerp(h, -0.7 - smoothstep(LAGOON.r, 0, dl) * 0.5, lk);
  const ch = distToPolyline([{ x: 32, z: 28.5 }, { x: 35.5, z: 31.5 }, { x: 38, z: 33.5 }], x, z);
  if (ch < 2.6) h = Math.min(h, lerp(-0.55, h, smoothstep(0.9, 2.6, ch)));
  return h;
}
