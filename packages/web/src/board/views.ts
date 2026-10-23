/**
 * Feste Kamerablicke der Mutproben an Liane und Furt – nur aus Plan und Gelände berechnet.
 * Dieselben Blicke nutzen die Auftritte (stunts.ts, im Spiel und in der Spielerklärung) und die
 * Bepflanzung beider Welten (props.ts, landmarks.ts, blocks/world.ts): Bäume, Säulen und hohe Deko
 * halten die Sichtachsen frei, damit nie eine Baumkrone vor der Kamera hängt.
 */
import * as THREE from 'three';
import { RIVER, RIVER_FORD } from '@insel/shared';
import type { IslandLayout } from './layout.ts';
import type { Heightfield } from './terrain.ts';

export interface Shot {
  position: THREE.Vector3;
  lookAt: THREE.Vector3;
}

/** Blick samt den Punkten, die unbedingt frei zu sehen sein sollen */
interface View extends Shot {
  keys: THREE.Vector3[];
}

/** Länge der Liane (Aufhängung bis Griff) */
export const LIANA_LEN = 5;

const UP = new THREE.Vector3(0, 1, 0);

/** Lianenfeld mit Laufrichtung (`dir`) und Querrichtung (`side`). */
export function vineFrame(layout: IslandLayout) {
  const f = layout.fields[layout.plan.vineField]!;
  const dir = new THREE.Vector3(Math.cos(f.heading), 0, Math.sin(f.heading));
  const side = new THREE.Vector3(-dir.z, 0, dir.x);
  return { f, dir, side };
}

/**
 * Riesenbaum der Liane: Seite (`sx` entlang `side`, dort wo das Gelände höher liegt = weg vom
 * Strand), Stamm (tx, tz), Aufhängung der Liane und grob die Kronen (beide Welten).
 */
export function vineTree(layout: IslandLayout, field: Heightfield) {
  const { f, dir, side } = vineFrame(layout);
  const sx = field.height(f.x + side.x * 4, f.z + side.z * 4) >= field.height(f.x - side.x * 4, f.z - side.z * 4) ? 1 : -1;
  // Liane hängt so, dass die Figur gut einen Meter über dem Boden baumelt
  const pivot = new THREE.Vector3(f.x, f.y + LIANA_LEN + 2.9, f.z);
  const tx = f.x + side.x * sx * 4.6 - dir.x * 0.6;
  const tz = f.z + side.z * sx * 4.6 - dir.z * 0.6;
  const crowns = [
    { c: new THREE.Vector3(tx, pivot.y + 1.3, tz), r: 3.0 },
    { c: pivot.clone().addScaledVector(side, sx * 0.3).add(new THREE.Vector3(0, 0.9, 0)), r: 2.1 },
  ];
  return { sx, tx, tz, pivot, crowns };
}

/** Beamer-Kamera (wie scene.ts) zum Ausmessen des Bildausschnitts */
const frameCam = new THREE.PerspectiveCamera(42, 16 / 9, 0.5, 600);

/**
 * Strahlen von der Kamera zu Rändern und Ecken des Bildes – jeweils bis zum Boden bzw. kurz vor
 * das Motiv. Was dort steht, verdeckt einen Teil des Bildes (Vordergrund).
 */
function frameRays(field: Heightfield, position: THREE.Vector3, look: THREE.Vector3): THREE.Vector3[] {
  frameCam.position.copy(position);
  frameCam.lookAt(look);
  frameCam.updateMatrixWorld();
  const d = position.distanceTo(look);
  const out: THREE.Vector3[] = [];
  for (const [sx, sy] of [[-0.75, -0.7], [0, -0.75], [0.75, -0.7], [-0.8, 0], [0.8, 0], [-0.6, 0.5], [0.6, 0.5]] as const) {
    const dir = new THREE.Vector3(sx, sy, 0.5).unproject(frameCam).sub(position).normalize();
    let len = d * 0.85;
    for (let t = 1; t < len; t += 0.5) {
      const q = position.clone().addScaledVector(dir, t);
      if (q.y < field.height(q.x, q.z)) {
        len = t;
        break;
      }
    }
    out.push(position.clone().addScaledVector(dir, len));
  }
  return out;
}

/**
 * Wie schlecht ist ein Blick? Gelände oder Baumkronen auf den Sichtlinien zu den wichtigen Punkten,
 * Baumkronen irgendwo im Bild, Kamera zu dicht über dem Boden, Hang dicht neben der Blickachse.
 */
function viewScore(field: Heightfield, position: THREE.Vector3, look: THREE.Vector3, keys: THREE.Vector3[], crowns: { c: THREE.Vector3; r: number }[]): number {
  let score = 0;
  const p = new THREE.Vector3();
  const inCrown = (q: THREE.Vector3) => crowns.some((c) => q.distanceTo(c.c) < c.r);
  for (const k of [look, ...keys]) {
    let hit = 0;
    for (let t = 0.04; t <= 0.94; t += 0.06) {
      p.lerpVectors(position, k, t);
      if (p.y < field.height(p.x, p.z) + 0.3 || inCrown(p)) hit++;
    }
    score += hit;
  }
  // Baumkrone irgendwo im Bild (Raster über das ganze Bild): je verdecktem Strahl ein Punkt
  if (crowns.length) {
    frameCam.position.copy(position);
    frameCam.lookAt(look);
    frameCam.updateMatrixWorld();
    const d = position.distanceTo(look);
    const dir = new THREE.Vector3();
    for (const sx of [-0.85, -0.45, 0, 0.45, 0.85])
      for (const sy of [-0.6, 0, 0.45, 0.85]) {
        dir.set(sx, sy, 0.5).unproject(frameCam).sub(position).normalize();
        for (let t = 0.8; t <= d; t += 0.6)
          if (inCrown(p.copy(position).addScaledVector(dir, t))) {
            score += 1;
            break;
          }
      }
  }
  if (position.y < field.height(position.x, position.z) + 2) score += 20;
  // Hang dicht neben der Blickachse füllt sonst das halbe Bild
  const dir = look.clone().sub(position).setY(0).normalize();
  for (const a of [-0.42, 0.42])
    for (const d of [2.5, 5]) {
      const q = position.clone().addScaledVector(dir.clone().applyAxisAngle(UP, a), d);
      if (field.height(q.x, q.z) > position.y - 1 - d * 0.4) score += 0.5;
    }
  return score;
}

/** Bester Blick aus Kandidaten (Reihenfolge = Vorliebe, kleine Aufschläge in `bias`). */
function pick(field: Heightfield, cands: { position: THREE.Vector3; bias: number }[], look: THREE.Vector3, keys: THREE.Vector3[], crowns: { c: THREE.Vector3; r: number }[]): View {
  let best = cands[0]!;
  let bestScore = Infinity;
  for (const c of cands) {
    const score = viewScore(field, c.position, look, keys, crowns) + c.bias;
    if (score < bestScore) {
      bestScore = score;
      best = c;
    }
  }
  return { position: best.position, lookAt: look, keys };
}

/** Stelle, an der der Bach den Weg quert (oder kurz hinter dem Lianenfeld). */
function creekPoint(layout: IslandLayout): THREE.Vector3 {
  const c = layout.creekCross;
  if (c) return new THREE.Vector3(c.x, c.y + 0.3, c.z);
  const { f, dir } = vineFrame(layout);
  return new THREE.Vector3(f.x + dir.x * 3, f.y, f.z + dir.z * 3);
}

function vineViewFull(layout: IslandLayout, field: Heightfield): View {
  const { f, dir, side } = vineFrame(layout);
  const tree = vineTree(layout, field);
  const s = -tree.sx;
  const target = new THREE.Vector3(f.x + dir.x * 1.9, f.y + 1.2, f.z + dir.z * 1.9);
  const look = target.clone().setY(target.y + 0.8);
  const next = layout.fields[layout.plan.vineField + 1];
  const keys = [new THREE.Vector3(f.x, f.y + 1.6, f.z), creekPoint(layout)];
  if (next) keys.push(new THREE.Vector3(next.x, next.y + 0.4, next.z));
  // Grundrichtung: zur Seite gegenüber dem Baum, etwas nach hinten
  const base = Math.atan2(side.z * s - dir.z * 0.5, side.x * s - dir.x * 0.5);
  const cands: { position: THREE.Vector3; bias: number }[] = [];
  for (const h of [6.5, 8.5])
    for (const da of [0, -0.25, 0.25, -0.5, 0.5, 0.8, -0.8]) {
      const a = base + da * s;
      cands.push({ position: new THREE.Vector3(target.x + Math.cos(a) * 8.8, target.y + h, target.z + Math.sin(a) * 8.8), bias: Math.abs(da) * 0.4 + (h > 6.5 ? 0.3 : 0) });
    }
  return pick(field, cands, look, keys, tree.crowns);
}

/**
 * Liane: von der Seite gegenüber dem Baum (der Stamm steht hinter der Szene), leicht von hinten –
 * Figur an der Liane, Bach und Landefeld im Bild. Gewählt wird nur nach Gelände und Baum der Liane,
 * damit die Bepflanzung genau diesen Blick freihalten kann.
 */
export function vineView(layout: IslandLayout, field: Heightfield): Shot {
  const v = vineViewFull(layout, field);
  return { position: v.position, lookAt: v.lookAt };
}

function swingViewFull(layout: IslandLayout, field: Heightfield, to: THREE.Vector3): View {
  const { f } = vineFrame(layout);
  const tree = vineTree(layout, field);
  const a = new THREE.Vector3(f.x, f.y + 1.5, f.z);
  const mid = a.clone().lerp(to, 0.5);
  const d = new THREE.Vector3(to.x - a.x, 0, to.z - a.z);
  const len = Math.max(2, d.length());
  d.normalize();
  const perp = new THREE.Vector3(-d.z, 0, d.x);
  // auf der Seite der Lianen-Kamera (gegenüber dem Baum)
  const ref = vineViewFull(layout, field).position;
  const sign = Math.sign(perp.dot(ref.clone().sub(a))) || 1;
  const look = mid.clone().add(new THREE.Vector3(0, -0.5, 0));
  const keys = [a, creekPoint(layout), to.clone().setY(to.y + 0.6)];
  // von hinten oben über die Liane hinweg in Flugrichtung; wo die Krone über der Aufhängung oder
  // der Baum ins Bild ragen würde, weiter seitlich bzw. tiefer
  const cands: { position: THREE.Vector3; bias: number }[] = [];
  for (const back of [6, 8.5, 3.5])
    for (const lat of [3, 6, 9])
      for (const [h, hb] of [
        [7.5 + len * 0.3, 0],
        [5.5 + len * 0.22, 0.3],
        [10 + len * 0.35, 0.6],
      ] as const) {
        const position = a.clone().addScaledVector(d, -back).addScaledVector(perp, sign * (lat + len * 0.1)).add(new THREE.Vector3(0, h, 0));
        position.y = Math.max(position.y, field.height(position.x, position.z) + 3);
        cands.push({ position, bias: Math.abs(back - 6) * 0.08 + (lat - 3) * 0.08 + hb });
      }
  return pick(field, cands, look, keys, tree.crowns);
}

/** Schwung: von hinten oben über die Liane hinweg in Flugrichtung, auf der Seite der Lianen-Kamera. */
export function swingView(layout: IslandLayout, field: Heightfield, to: THREE.Vector3): Shot {
  const v = swingViewFull(layout, field, to);
  return { position: v.position, lookAt: v.lookAt };
}

/** Furt: Strömungsrichtung, flussaufwärts und Abstand der Kisten-Reihe von den Fässern. */
export function fordLanes(layout: IslandLayout) {
  const fr = layout.fieldRadius;
  const basin = layout.fordBasin;
  const a = RIVER[RIVER_FORD - 1]!;
  const b = RIVER[RIVER_FORD + 1]!;
  const flow = basin ? new THREE.Vector3(basin.along.x, 0, basin.along.z) : new THREE.Vector3(b.x - a.x, 0, b.z - a.z).normalize();
  const up = flow.clone().negate();
  const gap = Math.min(fr * 2.3 + 0.5, (basin?.halfAlong ?? 6) - fr * 0.95 - 0.35);
  return { flow, up, gap };
}

function riverViewFull(layout: IslandLayout, field: Heightfield): View | null {
  const ff = layout.fordFields;
  if (!ff.length) return null;
  const bank = layout.fields[ff[0]! - 1];
  const exit = layout.fields[ff[ff.length - 1]! + 1];
  if (!bank || !exit) return null;
  const { up, gap } = fordLanes(layout);
  const top = layout.ford.raftY;
  const keys = [new THREE.Vector3(bank.x, bank.y + 0.6, bank.z), new THREE.Vector3(exit.x, exit.y + 0.6, exit.z)];
  for (const i of ff) {
    const f = layout.fields[i]!;
    keys.push(new THREE.Vector3(f.x, top, f.z), new THREE.Vector3(f.x + up.x * gap, top, f.z + up.z * gap));
  }
  const mid = new THREE.Vector3((bank.x + exit.x) / 2, layout.ford.y + 0.6, (bank.z + exit.z) / 2);
  // ein Stück zur mittleren Kiste hin
  const cf = layout.fields[ff[Math.floor(ff.length / 2)]!]!;
  mid.lerp(new THREE.Vector3(cf.x + up.x * gap, top - 0.06, cf.z + up.z * gap), 0.35);
  const dir = new THREE.Vector3(exit.x - bank.x, 0, exit.z - bank.z).normalize();
  const side = new THREE.Vector3(-dir.z, 0, dir.x);
  const toCrates = Math.sign(side.dot(up)) || 1;
  // hinter dem Ufer, etwas zur Fässer-Seite versetzt: beide Wege nebeneinander im Bild
  const cands: { position: THREE.Vector3; bias: number }[] = [];
  for (const [back, lat, h, bias] of [
    [6.5, 3.2, 5.4, 0],
    [6.5, 3.2, 7.2, 0.4],
    [7.5, 1.5, 6.4, 0.6],
    [5.5, 5, 6.4, 0.8],
  ] as const) {
    const position = new THREE.Vector3(bank.x - dir.x * back - side.x * toCrates * lat, bank.y + h, bank.z - dir.z * back - side.z * toCrates * lat);
    position.y = Math.max(position.y, field.height(position.x, position.z) + 3);
    cands.push({ position, bias });
  }
  return pick(field, cands, mid, keys, []);
}

/** Fässer oder Kisten: vom Ufer aus, beide Wege über den Fluss im Bild. */
export function riverView(layout: IslandLayout, field: Heightfield): Shot | null {
  const v = riverViewFull(layout, field);
  return v && { position: v.position, lookAt: v.lookAt };
}

/**
 * Sichtachse (Kamera → Motiv) bzw. Kamerafahrt als Schlauch: Radius `ra` an der Kamera, `rb` am
 * Motiv. `drop` = wie weit unter der Achse (je Meter Abstand zur Kamera) das Bild noch reicht –
 * Bäume, die niedriger bleiben, stören nicht.
 */
export interface Corridor {
  a: THREE.Vector3;
  b: THREE.Vector3;
  ra: number;
  rb: number;
  drop: number;
}

/** Alle Sichtachsen der Auftritte an Liane (inkl. Schwung zu jedem möglichen Landefeld) und Furt. */
export function stuntCorridors(layout: IslandLayout, field: Heightfield): Corridor[] {
  const out: Corridor[] = [];
  const view = (v: View) => {
    out.push({ a: v.position, b: v.lookAt, ra: 3.2, rb: 1.4, drop: 0.85 });
    for (const k of v.keys) out.push({ a: v.position, b: k, ra: 2.4, rb: 0.9, drop: 0.85 });
    // Bildränder (Vordergrund): dort darf auch nichts hineinragen
    for (const e of frameRays(field, v.position, v.lookAt)) out.push({ a: v.position, b: e, ra: 1, rb: 1.4, drop: 0 });
  };
  const vine = vineViewFull(layout, field);
  view(vine);
  const v = layout.plan.vineField;
  for (let k = 1; k <= 6; k++) {
    const t = layout.fields[v + k];
    if (!t || v + k >= layout.fields.length - 1) break;
    const sw = swingViewFull(layout, field, new THREE.Vector3(t.x, t.y, t.z));
    view(sw);
    // Kamerafahrt von der Liane zum Schwung
    out.push({ a: vine.position, b: sw.position, ra: 2.6, rb: 2.6, drop: 0 });
  }
  const river = riverViewFull(layout, field);
  if (river) view(river);
  return out;
}

/**
 * Steht etwas mit Oberkante `top` und Ausladung `reach` (Kronenradius) an (x, z) in einer
 * Sichtachse? Dann bleibt der Platz frei.
 */
export function inCorridor(cs: Corridor[], x: number, z: number, top: number, reach: number): boolean {
  for (const c of cs) {
    const abx = c.b.x - c.a.x;
    const abz = c.b.z - c.a.z;
    const l2 = abx * abx + abz * abz || 1e-9;
    const t = Math.max(0, Math.min(1, ((x - c.a.x) * abx + (z - c.a.z) * abz) / l2));
    const d = Math.hypot(x - (c.a.x + abx * t), z - (c.a.z + abz * t));
    if (d > c.ra + (c.rb - c.ra) * t + reach) continue;
    // unterer Bildrand an dieser Stelle (mit 1 m Puffer)
    const lineY = c.a.y + (c.b.y - c.a.y) * t;
    const low = lineY - 1 - c.drop * Math.sqrt(l2) * t;
    if (top > low) return true;
  }
  return false;
}
