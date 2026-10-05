/**
 * 3D-Inselplan: der gemeinsame 2D-Plan (Weg, Fluss, Schlucht, Vulkan) plus Höhen.
 * Der Weg folgt dem natürlichen Gelände (geglättet, am Vulkan stetig steigend), liegt in der
 * Furt auf den Fässern, auf der Hängebrücke über der Schlucht und oben auf dem Kraterrand.
 */
import {
  buildIslandPlan,
  fieldRadiusFor,
  HARBOR,
  RIVER,
  RIVER_FORD,
  RIVER_LIP,
  RIVER_POOL,
  VOLCANO,
  type IslandPlan,
  type RiverPoint,
  type Zone,
} from '@insel/shared';
import { crestHeight, natural } from './ground.ts';

export type { Zone } from '@insel/shared';

export interface P3 {
  x: number;
  y: number;
  z: number;
}

export interface FieldSpot extends P3 {
  /** Laufrichtung (Radiant, um die y-Achse; 0 = +x). */
  heading: number;
  zone: Zone;
  /** 0..1 entlang des Weges */
  t: number;
  s: number;
  /** liegt auf einem Fass-Floß im Fluss */
  ford: boolean;
  /** liegt auf der Hängebrücke */
  bridge: boolean;
}

export interface PathPoint extends P3 {
  t: number;
  s: number;
  zone: Zone;
}

export interface IslandLayout {
  plan: IslandPlan;
  fields: FieldSpot[];
  path: PathPoint[];
  volcano: typeof VOLCANO;
  river: RiverPoint[];
  /** Furt: Wasserspiegel und Oberkante der Fass-Flöße */
  ford: IslandPlan['ford'] & { raftY: number };
  /** Hängebrücke über die Schlucht (Endpunkte mit Höhe) */
  bridge: IslandPlan['bridge'] & { a: P3; b: P3; length: number };
  harbor: { x: number; z: number; heading: number };
  fieldRadius: number;
  fordFields: number[];
  craterField: number;
  /** Weghöhe an Bogenlänge s */
  pathY: (s: number) => number;
}

/** Wasserspiegel der Furt + Höhe der Fässer */
export const RAFT_TOP = 0.46;

const cache = new Map<number, IslandLayout>();

function pathHeights(plan: IslandPlan): number[] {
  const { path, ford, bridge, rim } = plan;
  const n = path.length;
  const raw = path.map((p) => natural(p.x, p.z));
  // Wasserstellen erst einmal überbrücken (linear zwischen den Ufern)
  const bridgeOver = (y: number[], s0: number, s1: number) => {
    const i0 = path.findIndex((p) => p.s >= s0);
    let i1 = path.findIndex((p) => p.s > s1);
    if (i1 < 0) i1 = n - 1;
    const a = y[Math.max(0, i0 - 1)]!;
    const b = y[i1]!;
    for (let i = i0; i < i1; i++) y[i] = a + (b - a) * ((path[i]!.s - s0) / Math.max(1e-6, s1 - s0));
  };
  bridgeOver(raw, ford.s0 - 1.5, ford.s1 + 1.5);
  bridgeOver(raw, bridge.s0, bridge.s1);

  // Glätten (gaußförmig, ±5 m)
  const ds = path[1]!.s - path[0]!.s || 0.25;
  const R = Math.round(5 / ds);
  const weights = Array.from({ length: R * 2 + 1 }, (_, k) => Math.exp(-((((k - R) * ds) / 2.6) ** 2)));
  let y = raw.map((_, i) => {
    let sum = 0;
    let wsum = 0;
    for (let k = -R; k <= R; k++) {
      const j = i + k;
      if (j < 0 || j >= n) continue;
      const w = weights[k + R]!;
      sum += raw[j]! * w;
      wsum += w;
    }
    return sum / wsum;
  });
  // Nie unter Wasser, am Strand knapp über dem Sand
  y = y.map((v) => Math.max(v, 0.95));

  // Vulkan: ab dem Fuß des Bergs nur noch bergauf; oben auf dem Kraterkamm
  const climb0 = path.findIndex((p) => p.zone === 'volcano');
  const rimStart = path.findIndex((p) => p.s >= rim.s0);
  for (let i = Math.max(1, climb0); i < n; i++) y[i] = Math.max(y[i]!, y[i - 1]!);
  // Serpentinen: gleichmäßige Steigung vom Fuß des Kegels bis zum Kraterrand
  // (das Gelände wird dafür terrassiert – keine steilen Stufen in den Kehren)
  const climbA = path.findIndex((p, i) => i >= climb0 && Math.hypot(p.x - VOLCANO.x, p.z - VOLCANO.z) < 17.4);
  const crest0 = crestHeight(Math.atan2(path[rimStart]!.z - VOLCANO.z, path[rimStart]!.x - VOLCANO.x)) + 0.06;
  const yA = y[climbA]!;
  const sA = path[climbA]!.s;
  const sR = path[rimStart]!.s;
  for (let i = climbA; i < rimStart; i++) {
    const u = (path[i]!.s - sA) / (sR - sA);
    const e = 0.75 * u + 0.25 * u * u * (3 - 2 * u);
    y[i] = yA + (crest0 - yA) * e;
  }
  const crestAt = (i: number) => {
    const p = path[i]!;
    return crestHeight(Math.atan2(p.z - VOLCANO.z, p.x - VOLCANO.x)) + 0.06;
  };
  for (let i = rimStart; i < n; i++) y[i] = crestAt(i);

  // Furt: auf den Fässern (Wasserspiegel + Fass), an den Ufern weich anschließen
  const raftY = ford.y + RAFT_TOP;
  for (let i = 0; i < n; i++) {
    const s = path[i]!.s;
    const inside = Math.min(s - ford.s0, ford.s1 - s);
    if (inside > -1.6) {
      const k = Math.min(1, Math.max(0, (inside + 1.6) / 1.6));
      y[i] = y[i]! + (raftY - y[i]!) * k;
    }
  }
  // Hängebrücke: gerade zwischen den Klippen mit leichtem Durchhang
  const i0 = path.findIndex((p) => p.s >= bridge.s0);
  const i1 = path.findIndex((p) => p.s >= bridge.s1);
  const ya = y[i0]!;
  const yb = y[i1]!;
  for (let i = i0; i <= i1; i++) {
    const u = (path[i]!.s - bridge.s0) / (bridge.s1 - bridge.s0);
    y[i] = ya + (yb - ya) * u - Math.sin(u * Math.PI) * 0.35;
  }
  return y;
}

export function buildLayout(fieldCount: number): IslandLayout {
  const hit = cache.get(fieldCount);
  if (hit) return hit;
  const plan = buildIslandPlan(fieldCount);
  const ys = pathHeights(plan);
  const path: PathPoint[] = plan.path.map((p, i) => ({ x: p.x, y: ys[i]!, z: p.z, s: p.s, t: p.t, zone: p.zone }));
  const pathY = (s: number) => {
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
    return a.y + (b.y - a.y) * ((s - a.s) / Math.max(1e-6, b.s - a.s));
  };
  const fields: FieldSpot[] = plan.fields.map((f) => ({ ...f, y: pathY(f.s) }));
  const bp0 = path.find((p) => p.s >= plan.bridge.s0)!;
  const bp1 = path.find((p) => p.s >= plan.bridge.s1) ?? path[path.length - 1]!;
  const start = fields[0]!;
  const layout: IslandLayout = {
    plan,
    fields,
    path,
    volcano: { ...VOLCANO },
    river: RIVER,
    ford: { ...plan.ford, raftY: plan.ford.y + RAFT_TOP },
    bridge: {
      ...plan.bridge,
      a: { x: bp0.x, y: bp0.y, z: bp0.z },
      b: { x: bp1.x, y: bp1.y, z: bp1.z },
      length: plan.bridge.s1 - plan.bridge.s0,
    },
    harbor: { x: HARBOR.dockX, z: HARBOR.dockZ, heading: Math.atan2(HARBOR.dockZ - start.z, HARBOR.dockX - start.x) },
    fieldRadius: fieldRadiusFor(plan),
    fordFields: plan.fordFields,
    craterField: plan.craterField,
    pathY,
  };
  cache.set(fieldCount, layout);
  return layout;
}

/** Wasserspiegel des Flusses an einem Punkt der Mittellinie (Index i, Anteil f) – mit Wasserfall. */
export function riverLevelAt(i: number, f: number): number {
  const a = RIVER[i]!;
  const b = RIVER[i + 1] ?? a;
  if (i === RIVER_LIP) {
    // Kante → Becken: bis kurz vor den Beckenrand oben, dann senkrecht hinunter
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    const fall = 1 - (b.w * 0.92) / len;
    return f < fall ? a.y : b.y;
  }
  return a.y + (b.y - a.y) * f;
}

export { RIVER_FORD, RIVER_LIP, RIVER_POOL };
