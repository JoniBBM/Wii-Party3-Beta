/**
 * Inselplan (reine Mathematik, ohne Three.js): Weg vom Hafen über Strand, Dschungel,
 * Flussbrücke, Klippen und Hochebene bis spiralförmig auf den Vulkangipfel.
 * Felder werden gleichmäßig entlang des Weges verteilt – für jede Brettlänge.
 * Koordinaten: x = Osten, z = Süden (zur Kamera), y = oben. Meeresspiegel y = 0.
 */

export interface P3 {
  x: number;
  y: number;
  z: number;
}

export type Zone = 'harbor' | 'beach' | 'jungle' | 'river' | 'cliffs' | 'plateau' | 'volcano' | 'summit';

export interface FieldSpot extends P3 {
  /** Laufrichtung (Radiant, um die y-Achse; 0 = +x). */
  heading: number;
  zone: Zone;
  /** 0..1 entlang des Weges */
  t: number;
}

export interface IslandLayout {
  fields: FieldSpot[];
  /** Dichter Polygonzug des Weges (für Pfad, Gelände, Editor). */
  path: (P3 & { t: number })[];
  volcano: { x: number; z: number; height: number; craterRadius: number; baseRadius: number };
  river: { x: number; z: number }[];
  bridge: { x: number; z: number; y: number; heading: number; length: number };
  harbor: { x: number; z: number; heading: number };
  fieldRadius: number;
  islandRadius: number;
}

/** Maßstab der Insel (Entwurf in „Planeinheiten“, Spielwelt etwas kompakter). */
const S = 0.62;

export const VOLCANO = { x: 1.2, z: -3.8, height: 15, craterRadius: 2.9, baseRadius: 15.5 };

/** Kontrollpunkte des Weges um die Insel (ohne Vulkanspirale). */
const RING: [number, number, number, Zone][] = [
  [-27, 1.25, 33, 'harbor'],
  [-19, 1.35, 36.5, 'beach'],
  [-8, 1.4, 38.5, 'beach'],
  [4, 1.45, 38, 'beach'],
  [16, 1.6, 34.5, 'beach'],
  [27, 2.4, 27, 'jungle'],
  [34.5, 3.2, 16, 'jungle'],
  [37, 3.6, 3, 'jungle'],
  [33.5, 3.9, -9, 'river'],
  [26, 4.2, -19.5, 'river'],
  [15, 5.0, -28, 'cliffs'],
  [2, 5.8, -32.5, 'cliffs'],
  [-12, 6.3, -30.5, 'cliffs'],
  [-24, 6.6, -23, 'plateau'],
  [-32, 6.8, -11, 'plateau'],
  [-33, 7.0, 2, 'plateau'],
  [-27, 7.4, 13, 'plateau'],
];

function catmullRom(p0: P3, p1: P3, p2: P3, p3: P3, t: number): P3 {
  const t2 = t * t;
  const t3 = t2 * t;
  const f = (a: number, b: number, c: number, d: number) =>
    0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
  return { x: f(p0.x, p1.x, p2.x, p3.x), y: f(p0.y, p1.y, p2.y, p3.y), z: f(p0.z, p1.z, p2.z, p3.z) };
}

function controlPoints(): { p: P3; zone: Zone }[] {
  const pts = RING.map(([x, y, z, zone]) => ({ p: { x: x * S, y: y * 0.72, z: z * S }, zone }));
  // Spirale um den Vulkan: vom Westen kommend, gegen den Uhrzeigersinn (Winkel nimmt ab) nach oben.
  const last = pts[pts.length - 1]!.p;
  const a0 = Math.atan2(last.z - VOLCANO.z, last.x - VOLCANO.x);
  const r0 = Math.hypot(last.x - VOLCANO.x, last.z - VOLCANO.z);
  const turns = 1.08;
  const steps = 12;
  const startY = last.y;
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const ease = t;
    const a = a0 - ease * turns * Math.PI * 2;
    const r = r0 + (VOLCANO.craterRadius + 1.1 - r0) * Math.pow(ease, 0.8);
    const y = startY + (VOLCANO.height - startY + 0.12) * Math.pow(ease, 1.1);
    pts.push({ p: { x: VOLCANO.x + Math.cos(a) * r, y, z: VOLCANO.z + Math.sin(a) * r }, zone: i === steps ? 'summit' : 'volcano' });
  }
  return pts;
}

function zoneAt(cps: { zone: Zone }[], segment: number): Zone {
  return cps[Math.min(cps.length - 1, Math.max(0, segment))]!.zone;
}

const cache = new Map<number, IslandLayout>();

export function buildLayout(fieldCount: number): IslandLayout {
  const hit = cache.get(fieldCount);
  if (hit) return hit;
  const cps = controlPoints();
  const P = cps.map((c) => c.p);
  // Dicht abtasten
  const dense: (P3 & { seg: number })[] = [];
  const perSeg = 40;
  for (let i = 0; i < P.length - 1; i++) {
    const p0 = P[Math.max(0, i - 1)]!;
    const p1 = P[i]!;
    const p2 = P[i + 1]!;
    const p3 = P[Math.min(P.length - 1, i + 2)]!;
    for (let s = 0; s < perSeg; s++) dense.push({ ...catmullRom(p0, p1, p2, p3, s / perSeg), seg: i + (s >= perSeg / 2 ? 1 : 0) });
  }
  dense.push({ ...P[P.length - 1]!, seg: P.length - 1 });

  // Bogenlänge; Höhenunterschiede zählen weniger (Felder am Berg nicht zu weit auseinander).
  const len: number[] = [0];
  for (let i = 1; i < dense.length; i++) {
    const a = dense[i - 1]!;
    const b = dense[i]!;
    len.push(len[i - 1]! + Math.hypot(b.x - a.x, (b.y - a.y) * 0.45, b.z - a.z));
  }
  const total = len[len.length - 1]!;
  const path = dense.map((d, i) => ({ x: d.x, y: d.y, z: d.z, t: len[i]! / total }));

  const sampleAt = (target: number) => {
    let lo = 0;
    let hi = len.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (len[mid]! < target) lo = mid;
      else hi = mid;
    }
    const a = dense[lo]!;
    const b = dense[hi]!;
    const f = (target - len[lo]!) / Math.max(1e-6, len[hi]! - len[lo]!);
    return {
      x: a.x + (b.x - a.x) * f,
      y: a.y + (b.y - a.y) * f,
      z: a.z + (b.z - a.z) * f,
      heading: Math.atan2(b.z - a.z, b.x - a.x),
      seg: f < 0.5 ? a.seg : b.seg,
    };
  };

  const fields: FieldSpot[] = [];
  for (let i = 0; i < fieldCount; i++) {
    const t = fieldCount === 1 ? 0 : i / (fieldCount - 1);
    const s = sampleAt(t * total);
    let zone = zoneAt(cps, s.seg);
    if (i === 0) zone = 'harbor';
    if (i === fieldCount - 1) zone = 'summit';
    fields.push({ x: s.x, y: s.y, z: s.z, heading: s.heading, zone, t });
  }
  // Ziel exakt auf dem Gipfelplateau
  const goal = fields[fieldCount - 1]!;
  goal.y = VOLCANO.height + 0.12;

  const spacing = total / Math.max(1, fieldCount - 1);
  // Fluss: von der Bergflanke nach Nordosten ins Meer, kreuzt den Weg zwischen Dschungel und Klippen.
  const river = [
    { x: 14, z: -12 },
    { x: 20, z: -11 },
    { x: 26.5, z: -13.5 },
    { x: 31, z: -15 },
    { x: 37, z: -19 },
    { x: 44, z: -24 },
    { x: 52, z: -28 },
  ].map((p) => ({ x: p.x * S, z: p.z * S }));
  // Brücke dort, wo der Weg dem Fluss am nächsten kommt (= Kreuzung)
  const distToRiver = (x: number, z: number) => {
    let d = Infinity;
    for (let i = 0; i < river.length - 1; i++) {
      const a = river[i]!;
      const b = river[i + 1]!;
      const abx = b.x - a.x;
      const abz = b.z - a.z;
      const f = Math.max(0, Math.min(1, ((x - a.x) * abx + (z - a.z) * abz) / (abx * abx + abz * abz)));
      d = Math.min(d, Math.hypot(x - (a.x + abx * f), z - (a.z + abz * f)));
    }
    return d;
  };
  let best = { d: Infinity, i: 0 };
  path.forEach((p, i) => {
    const d = distToRiver(p.x, p.z);
    if (d < best.d) best = { d, i };
  });
  const bp = path[best.i]!;
  const bn = path[Math.min(path.length - 1, best.i + 3)]!;

  const layout: IslandLayout = {
    fields,
    path,
    volcano: { ...VOLCANO },
    river,
    bridge: { x: bp.x, z: bp.z, y: bp.y, heading: Math.atan2(bn.z - bp.z, bn.x - bp.x), length: 4.6 },
    harbor: { x: -31 * S, z: 36.5 * S, heading: Math.atan2(36.5 - 33, -31 + 27) },
    fieldRadius: Math.max(0.55, Math.min(1.05, spacing * 0.34)),
    islandRadius: 30,
  };
  cache.set(fieldCount, layout);
  return layout;
}

/** Kürzester Abstand eines Punktes (x, z) zum Weg, plus Weghöhe dort. */
export function nearestOnPath(layout: IslandLayout, x: number, z: number): { d: number; y: number; t: number } {
  let best = { d: Infinity, y: 0, t: 0 };
  const path = layout.path;
  for (let i = 0; i < path.length - 1; i += 1) {
    const a = path[i]!;
    const b = path[i + 1]!;
    const abx = b.x - a.x;
    const abz = b.z - a.z;
    const l2 = abx * abx + abz * abz || 1e-6;
    let f = ((x - a.x) * abx + (z - a.z) * abz) / l2;
    f = Math.max(0, Math.min(1, f));
    const px = a.x + abx * f;
    const pz = a.z + abz * f;
    const d = Math.hypot(x - px, z - pz);
    if (d < best.d) best = { d, y: a.y + (b.y - a.y) * f, t: a.t + (b.t - a.t) * f };
  }
  return best;
}
