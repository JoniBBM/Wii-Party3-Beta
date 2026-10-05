/**
 * Inselplan in 2D (reine Mathematik, ohne Grafik): Küste, Lagune, Fluss mit Wasserfall und Furt,
 * Schlucht mit Hängebrücke, Vulkan mit Serpentinen und Kraterrand – und der Weg vom Hafen zum Gipfel.
 *
 * Beamer (3D-Insel) und Spiellogik nutzen denselben Plan: Welche Felder auf den Fässern im Fluss
 * liegen und welches Feld am Kraterrand liegt, ergibt sich direkt aus der Geometrie.
 * Koordinaten: x = Osten, z = Süden (zur Kamera), Einheiten = Meter der 3D-Welt.
 */

import type { FieldType } from './constants.ts';

export interface P2 {
  x: number;
  z: number;
}

export type Zone =
  | 'harbor'
  | 'beach'
  | 'ruins'
  | 'lagoon'
  | 'jungle'
  | 'river'
  | 'cliffs'
  | 'gorge'
  | 'plateau'
  | 'volcano'
  | 'rim'
  | 'summit';

export const VOLCANO = {
  x: -1,
  z: -9,
  /** Höhe des Kraterrands */
  height: 19.5,
  /** Innenkante des Kraterrands */
  craterRadius: 4.2,
  baseRadius: 22,
};

/** Auf diesem Radius läuft der Weg über den Kraterrand. */
export const RIM_RADIUS = VOLCANO.craterRadius + 1.0;

/** Küstenlinie (geschlossen, im Uhrzeigersinn ab Nordwesten; wird geglättet). */
export const COAST: [number, number][] = [
  [-30, -31], [-35, -26], [-39, -19], [-41, -12], [-42, -5], [-42.5, 1], [-41, 7], [-41.5, 12],
  [-43, 17], [-42, 23], [-39, 27.5], [-35.5, 26.5], [-34, 22], [-32.5, 18], [-29.5, 15.5], [-26, 16.5],
  [-23.5, 21], [-22, 26], [-19, 30], [-13, 32], [-6, 32.5], [0, 33], [3, 36.5], [7, 36],
  [10, 32.5], [15, 32], [21, 33.5], [27, 34.5], [33, 32], [37.5, 27], [39, 21], [39.5, 15],
  [41, 9], [42.5, 3], [42, -3], [43.5, -8], [45, -13], [43, -18.5], [38, -23], [31, -27.5],
  [23, -31.5], [14, -34.5], [5, -36], [-4, -36], [-13, -35], [-21, -34], [-26, -33],
];

/** Lagune im Südosten (flaches Wasser hinter einer Sandbank). */
export const LAGOON = { x: 28, z: 26, r: 5.6 };

/** Hafenbucht im Südwesten. */
export const HARBOR = { x: -29, z: 22, dockX: -24.2, dockZ: 19.6 };

export interface RiverPoint extends P2 {
  /** halbe Breite des Wassers */
  w: number;
  /** Wasserspiegel */
  y: number;
}

/**
 * Fluss: Quelle am Vulkanhang → Kante des Wasserfalls → Becken → Furt mit Fässern → Mündung im Osten.
 * Zwischen `lip` und `pool` stürzt das Wasser senkrecht hinab.
 */
export const RIVER: RiverPoint[] = [
  { x: 7.6, z: -13.2, w: 0.7, y: 10.2 },
  { x: 9.4, z: -11.7, w: 0.8, y: 9.95 },
  { x: 10.8, z: -10.5, w: 0.9, y: 9.75 },
  { x: 13.2, z: -8.2, w: 2.4, y: 2.0 },
  { x: 16.6, z: -5.6, w: 1.7, y: 1.85 },
  { x: 19.6, z: -4.1, w: 2.4, y: 1.7 },
  { x: 22.0, z: -3.7, w: 3.0, y: 1.6 },
  { x: 24.8, z: -3.6, w: 2.6, y: 1.5 },
  { x: 28.0, z: -2.7, w: 1.8, y: 1.2 },
  { x: 31.0, z: -1.1, w: 1.8, y: 0.9 },
  { x: 34.5, z: -1.2, w: 2.0, y: 0.6 },
  { x: 38.0, z: 0.0, w: 2.4, y: 0.35 },
  { x: 41.5, z: 0.8, w: 3.0, y: 0.1 },
  { x: 46.0, z: 1.6, w: 3.6, y: -0.2 },
];
export const RIVER_LIP = 2;
export const RIVER_POOL = 3;
export const RIVER_FORD = 6;

/** Schlucht an der Nordküste (Meeresarm), über die eine Hängebrücke führt. */
export const GORGE: (P2 & { w: number })[] = [
  { x: 23.2, z: -39, w: 3.2 },
  { x: 23.8, z: -33, w: 2.6 },
  { x: 24.3, z: -28.5, w: 2.1 },
  { x: 24.9, z: -24.5, w: 1.4 },
  { x: 25.6, z: -21.8, w: 0.5 },
];

// ---------------------------------------------------------------------------
// Weg
// ---------------------------------------------------------------------------

/** Wegpunkte bis zum Fuß des Vulkans (danach folgen die Serpentinen). */
const ROUTE: [number, number, Zone][] = [
  [-21.5, 19, 'harbor'],
  [-17, 22.6, 'harbor'],
  [-12, 26.4, 'beach'],
  [-6.4, 28.2, 'beach'],
  [-1.8, 26.4, 'beach'],
  [1.2, 21.8, 'ruins'],
  [5.8, 18.8, 'ruins'],
  [10.6, 20.2, 'ruins'],
  [15, 23.6, 'beach'],
  [19.6, 22.6, 'lagoon'],
  [24.2, 18.4, 'lagoon'],
  [29.6, 17.4, 'jungle'],
  [34, 14, 'jungle'],
  [35, 9, 'jungle'],
  [31.6, 5, 'jungle'],
  [26.6, 2.6, 'river'],
  [22.6, 1.4, 'river'],
  [22.1, -3.6, 'river'],
  [22.7, -8.6, 'river'],
  [25.6, -12.4, 'cliffs'],
  [31, -14.8, 'cliffs'],
  [36.4, -16, 'cliffs'],
  [35.6, -21, 'cliffs'],
  [31, -24, 'cliffs'],
  [27.5, -26.4, 'gorge'],
  [21, -28, 'gorge'],
  [14.5, -31, 'cliffs'],
  [6.5, -32.6, 'cliffs'],
  [-2.5, -33, 'cliffs'],
  [-10.5, -31.8, 'plateau'],
  [-17.5, -30.4, 'plateau'],
  [-22.2, -26, 'plateau'],
  [-21.6, -20.6, 'plateau'],
  [-26.4, -16.2, 'plateau'],
  [-31.8, -13.8, 'plateau'],
  [-32.6, -9, 'plateau'],
  [-28, -6.4, 'volcano'],
];

const DEG = Math.PI / 180;
const polar = (thetaDeg: number, r: number): P2 => ({
  x: VOLCANO.x + Math.cos(thetaDeg * DEG) * r,
  z: VOLCANO.z + Math.sin(thetaDeg * DEG) * r,
});

/** Liane am Eingang der Tempelruinen (früh auf dem Weg). */
export const VINE_ANCHOR: P2 = { x: 1.2, z: 21.8 };
/** Lavahöhle am mittleren Serpentinenschenkel und ihr Ausgang am Vulkanfuß. */
export const CAVE_ANCHOR: P2 = polarPoint(130, 13.2);
export const CAVE_EXIT_ANCHOR: P2 = polarPoint(140, 19.4);

function polarPoint(thetaDeg: number, r: number): P2 {
  return { x: VOLCANO.x + Math.cos((thetaDeg * Math.PI) / 180) * r, z: VOLCANO.z + Math.sin((thetaDeg * Math.PI) / 180) * r };
}

/** Serpentinen am Südwesthang: Schenkel (Winkel von/bis, Radius von/bis) mit Kehren dazwischen. */
const LEGS: [number, number, number, number][] = [
  [170, 100, 20.2, 17.6],
  [100, 160, 14.6, 12.2],
  [160, 106, 9.4, 7.6],
];

function volcanoRoute(): { p: P2; zone: Zone }[] {
  const out: { p: P2; zone: Zone }[] = [];
  LEGS.forEach(([a0, a1, r0, r1], li) => {
    const steps = Math.max(3, Math.round(Math.abs(a1 - a0) / 12));
    for (let i = 0; i <= steps; i++) {
      const u = i / steps;
      out.push({ p: polar(a0 + (a1 - a0) * u, r0 + (r1 - r0) * u), zone: 'volcano' });
    }
    const next = LEGS[li + 1];
    if (!next) return;
    // Kehre: Halbkreis über das Schenkelende hinaus
    const rOut = r1;
    const rIn = next[2];
    const rc = (rOut + rIn) / 2;
    const rh = (rOut - rIn) / 2;
    const dir = Math.sign(a1 - a0); // Laufrichtung im Winkel
    const c = polar(a1, rc);
    const er = { x: Math.cos(a1 * DEG), z: Math.sin(a1 * DEG) };
    const et = { x: -Math.sin(a1 * DEG) * dir, z: Math.cos(a1 * DEG) * dir };
    for (const phi of [0.5, 1.0, 1.5, 2.1, 2.65]) {
      const k = Math.min(phi, Math.PI);
      out.push({
        p: { x: c.x + er.x * rh * Math.cos(k) + et.x * rh * 1.15 * Math.sin(k), z: c.z + er.z * rh * Math.cos(k) + et.z * rh * 1.15 * Math.sin(k) },
        zone: 'volcano',
      });
    }
  });
  // Zum Kraterrand hinauf und über den Rand bis zum Gipfel (Osten)
  out.push({ p: polar(101, RIM_RADIUS + 1.1), zone: 'volcano' });
  for (let a = 96; a >= 0; a -= 12) out.push({ p: polar(a, RIM_RADIUS), zone: a <= 0 ? 'summit' : 'rim' });
  if (out[out.length - 1]!.zone !== 'summit') out.push({ p: polar(0, RIM_RADIUS), zone: 'summit' });
  return out;
}

function catmull(p0: P2, p1: P2, p2: P2, p3: P2, t: number): P2 {
  const t2 = t * t;
  const t3 = t2 * t;
  const f = (a: number, b: number, c: number, d: number) =>
    0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
  return { x: f(p0.x, p1.x, p2.x, p3.x), z: f(p0.z, p1.z, p2.z, p3.z) };
}

export interface PlanPoint extends P2 {
  /** Bogenlänge ab Start */
  s: number;
  /** 0..1 */
  t: number;
  zone: Zone;
}

export interface PlanField extends P2 {
  /** Laufrichtung (Radiant um die y-Achse; 0 = +x) */
  heading: number;
  zone: Zone;
  /** 0..1 entlang des Weges */
  t: number;
  s: number;
  /** Feld liegt auf einem Floß aus Fässern im Fluss */
  ford: boolean;
  /** Feld liegt auf der Hängebrücke */
  bridge: boolean;
}

export interface Span {
  /** Bogenlänge Anfang/Ende */
  s0: number;
  s1: number;
}

export interface IslandPlan {
  fields: PlanField[];
  path: PlanPoint[];
  length: number;
  spacing: number;
  /** Furt durch den Fluss (Fässer) */
  ford: Span & P2 & { y: number; heading: number };
  /** Hängebrücke über die Schlucht */
  bridge: Span & P2 & { heading: number };
  /** Weg über den Kraterrand */
  rim: Span;
  /** Felder auf den Fässern (Spiellogik: „river“) */
  fordFields: number[];
  /** Feld am Kraterrand, an dem man hineinfällt (Spiellogik: „crater“) */
  craterField: number;
  /** Feld mit der Liane (Spiellogik: „vine“) */
  vineField: number;
  /** Feld mit dem Loch zur Lavahöhle (Spiellogik: „cave“) */
  caveField: number;
  /** Hier kommt man aus der Lavahöhle wieder heraus */
  caveExit: number;
}

function denseRoute(): PlanPoint[] {
  const cps: { p: P2; zone: Zone }[] = [...ROUTE.map(([x, z, zone]) => ({ p: { x, z }, zone })), ...volcanoRoute()];
  const P = cps.map((c) => c.p);
  const pts: (P2 & { zone: Zone })[] = [];
  for (let i = 0; i < P.length - 1; i++) {
    const p0 = P[Math.max(0, i - 1)]!;
    const p1 = P[i]!;
    const p2 = P[i + 1]!;
    const p3 = P[Math.min(P.length - 1, i + 2)]!;
    const n = Math.max(4, Math.ceil(Math.hypot(p2.x - p1.x, p2.z - p1.z) / 0.25));
    for (let k = 0; k < n; k++) pts.push({ ...catmull(p0, p1, p2, p3, k / n), zone: k < n / 2 ? cps[i]!.zone : cps[i + 1]!.zone });
  }
  pts.push({ ...P[P.length - 1]!, zone: 'summit' });
  let s = 0;
  const out: PlanPoint[] = [];
  pts.forEach((p, i) => {
    if (i > 0) s += Math.hypot(p.x - pts[i - 1]!.x, p.z - pts[i - 1]!.z);
    out.push({ x: p.x, z: p.z, zone: p.zone, s, t: 0 });
  });
  for (const p of out) p.t = p.s / s;
  return out;
}

let routeCache: PlanPoint[] | null = null;
function route(): PlanPoint[] {
  return (routeCache ??= denseRoute());
}

/** Punkt (und Richtung) auf dem Weg bei Bogenlänge s. */
export function pointAt(path: PlanPoint[], s: number): P2 & { heading: number; zone: Zone } {
  let lo = 0;
  let hi = path.length - 1;
  s = Math.max(0, Math.min(path[hi]!.s, s));
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (path[mid]!.s < s) lo = mid;
    else hi = mid;
  }
  const a = path[lo]!;
  const b = path[hi]!;
  const f = (s - a.s) / Math.max(1e-6, b.s - a.s);
  return { x: a.x + (b.x - a.x) * f, z: a.z + (b.z - a.z) * f, heading: Math.atan2(b.z - a.z, b.x - a.x), zone: f < 0.5 ? a.zone : b.zone };
}

/** Kürzester Abstand zu einem Polygonzug, mit Parameter (Index + Anteil). */
export function nearestOnPolyline(pts: P2[], x: number, z: number): { d: number; i: number; f: number; x: number; z: number } {
  let best = { d: Infinity, i: 0, f: 0, x: 0, z: 0 };
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i]!;
    const b = pts[i + 1]!;
    const abx = b.x - a.x;
    const abz = b.z - a.z;
    const l2 = abx * abx + abz * abz || 1e-9;
    const f = Math.max(0, Math.min(1, ((x - a.x) * abx + (z - a.z) * abz) / l2));
    const px = a.x + abx * f;
    const pz = a.z + abz * f;
    const d = Math.hypot(x - px, z - pz);
    if (d < best.d) best = { d, i, f, x: px, z: pz };
  }
  return best;
}

/** Wo kreuzt der Weg einen Wasserlauf? Bogenlänge am Kreuzungspunkt + halbe Breite dort. */
function crossing(path: PlanPoint[], line: (P2 & { w: number })[], near: P2): { s: number; w: number } {
  let best = { d: Infinity, s: 0, w: 1 };
  for (const p of path) {
    if (Math.hypot(p.x - near.x, p.z - near.z) > 8) continue;
    const n = nearestOnPolyline(line, p.x, p.z);
    if (n.d < best.d) {
      const a = line[n.i]!;
      const b = line[n.i + 1] ?? a;
      best = { d: n.d, s: p.s, w: a.w + (b.w - a.w) * n.f };
    }
  }
  return best;
}

const planCache = new Map<number, IslandPlan>();

/** Plan für ein Brett mit `fieldCount` Feldern (Start … Ziel). */
export function buildIslandPlan(fieldCount: number): IslandPlan {
  const hit = planCache.get(fieldCount);
  if (hit) return hit;
  const path = route();
  const length = path[path.length - 1]!.s;
  const n = Math.max(2, fieldCount);
  const spacing = length / (n - 1);

  const fordPt = RIVER[RIVER_FORD]!;
  const fc = crossing(path, RIVER, fordPt);
  const ford = { s0: fc.s - fc.w, s1: fc.s + fc.w };
  const gorgeMid = GORGE[2]!;
  const gc = crossing(path, GORGE, gorgeMid);
  // Brücke reicht von Klippenkante zu Klippenkante
  const bridge = { s0: gc.s - gc.w - 1.6, s1: gc.s + gc.w + 1.6 };
  // Kraterrand: ab dem Punkt, an dem der Weg den Randradius erreicht
  let rimS = length;
  for (let i = path.length - 1; i >= 0; i--) {
    const p = path[i]!;
    if (Math.hypot(p.x - VOLCANO.x, p.z - VOLCANO.z) > RIM_RADIUS + 0.35) break;
    rimS = p.s;
  }
  const rim = { s0: rimS, s1: length };

  const sOf = Array.from({ length: n }, (_, i) => i * spacing);
  // Felder auf den Fässern: alle, die im Wasser liegen; mindestens eines (ggf. dorthin verschoben)
  const margin = 0.45;
  let fordFields = sOf.map((s, i) => ({ s, i })).filter((f) => f.i > 0 && f.i < n - 1 && f.s > ford.s0 + margin && f.s < ford.s1 - margin).map((f) => f.i);
  if (!fordFields.length) {
    const i = Math.min(n - 2, Math.max(1, Math.round(fc.s / spacing)));
    sOf[i] = fc.s;
    fordFields = [i];
  }
  // Kraterfeld: etwa 6,5 m vor dem Gipfel auf dem Rand
  const craterTarget = Math.max(rim.s0 + 0.4, length - 6.5);
  let craterField = Math.min(n - 2, Math.max(1, Math.round(craterTarget / spacing)));
  if (craterField === n - 1) craterField = n - 2;
  if (fordFields.includes(craterField)) craterField = Math.min(n - 2, craterField + 1);
  if (sOf[craterField]! < rim.s0 + 0.3 || sOf[craterField]! > length - 1.8) sOf[craterField] = craterTarget;

  // Liane und Lavahöhle: nächstes freies Feld zum jeweiligen Ort
  const sNear = (q: P2) => {
    let best = { d: Infinity, s: 0 };
    for (const p of path) {
      const d = Math.hypot(p.x - q.x, p.z - q.z);
      if (d < best.d) best = { d, s: p.s };
    }
    return best.s;
  };
  const taken = new Set<number>([0, n - 1, ...fordFields, craterField]);
  const pickFree = (s: number) => {
    const i0 = Math.min(n - 2, Math.max(1, Math.round(s / spacing)));
    for (let k = 0; k < n; k++)
      for (const i of [i0 - k, i0 + k]) if (i >= 1 && i <= n - 2 && !taken.has(i)) return (taken.add(i), i);
    return i0;
  };
  const vineField = pickFree(sNear(VINE_ANCHOR));
  const caveField = pickFree(sNear(CAVE_ANCHOR));
  const caveExit = Math.max(1, Math.min(caveField - 1, Math.round(sNear(CAVE_EXIT_ANCHOR) / spacing)));

  const fields: PlanField[] = sOf.map((s, i) => {
    const p = pointAt(path, s);
    let zone = p.zone;
    if (i === 0) zone = 'harbor';
    if (i === n - 1) zone = 'summit';
    return {
      x: p.x,
      z: p.z,
      heading: p.heading,
      zone,
      t: s / length,
      s,
      ford: fordFields.includes(i),
      bridge: s > bridge.s0 + 0.5 && s < bridge.s1 - 0.5,
    };
  });

  const fp = pointAt(path, fc.s);
  const bp = pointAt(path, gc.s);
  const plan: IslandPlan = {
    fields,
    path,
    length,
    spacing,
    ford: { ...ford, x: fp.x, z: fp.z, y: fordPt.y, heading: fp.heading },
    bridge: { ...bridge, x: bp.x, z: bp.z, heading: bp.heading },
    rim,
    fordFields,
    craterField,
    vineField,
    caveField,
    caveExit,
  };
  planCache.set(fieldCount, plan);
  return plan;
}

/** Feldgröße passend zum Abstand der Felder. */
export function fieldRadiusFor(plan: IslandPlan): number {
  return Math.max(0.6, Math.min(1.15, plan.spacing * 0.34));
}

/** Geglättete, geschlossene Küstenlinie. */
export function coastOutline(perSegment = 6): P2[] {
  const P = COAST.map(([x, z]) => ({ x, z }));
  const n = P.length;
  const out: P2[] = [];
  for (let i = 0; i < n; i++) {
    for (let k = 0; k < perSegment; k++) out.push(catmull(P[(i - 1 + n) % n]!, P[i]!, P[(i + 1) % n]!, P[(i + 2) % n]!, k / perSegment));
  }
  return out;
}

/** Feste Sonderfelder, die sich aus der Insel ergeben (für ein Brett mit Ziel auf Feld `goal`). */
export function islandLandmarks(goal: number): { river: number[]; crater: number[]; vine: number[]; cave: number[]; caveExit: number } {
  const plan = buildIslandPlan(goal + 1);
  return { river: [...plan.fordFields], crater: [plan.craterField], vine: [plan.vineField], cave: [plan.caveField], caveExit: plan.caveExit };
}

/** Fässer und Kraterloch an ihre festen Plätze setzen (z. B. für Bretter aus älteren Versionen). */
export function withLandmarks<T extends { fields: FieldType[] }>(board: T): T {
  const goal = board.fields.length - 1;
  const marks = islandLandmarks(goal);
  const fields = board.fields.map((f, i): FieldType => {
    if (marks.river.includes(i)) return 'river';
    if (marks.crater.includes(i)) return 'crater';
    if (marks.vine.includes(i)) return 'vine';
    if (marks.cave.includes(i)) return 'cave';
    return f === 'river' || f === 'crater' || f === 'vine' || f === 'cave' ? 'normal' : f;
  });
  return { ...board, fields };
}

/** Stimmen Fässer und Kraterloch mit der Insel überein? */
export function hasLandmarks(board: { fields: FieldType[] }): boolean {
  const fixed = withLandmarks(board).fields;
  return fixed.every((f, i) => f === board.fields[i]);
}
