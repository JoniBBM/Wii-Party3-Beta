/**
 * Prozedurale Tiere als eine SkinnedMesh mit starrer Gewichtung: Jedes Körperteil hängt zu 100 %
 * an genau einem Knochen, alle Teile liegen in einer Geometrie mit Vertex-Farben → ein Draw-Call
 * je Tier. Bewegt wird nur über Knochen (Drehung, Versatz, Skalierung).
 *
 * Posen sind flache Zahlenreihen (8 Kanäle je Knochen) – so lassen sich Verhalten weich
 * überblenden, ohne dass schnelle Bewegungen (Kratzen, Flügelschlag) verwischen.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { worldMaterial } from './assets.ts';

export type Vec3 = [number, number, number];

/** Grundkörper in Einheitsgröße (wenige Segmente – die Tiere sind im Bild klein). */
export const SHAPE = {
  ball: new THREE.SphereGeometry(1, 14, 10),
  /** für flache oder kleine Teile (Flügel, Flossen, Hände) */
  ballLo: new THREE.SphereGeometry(1, 10, 7),
  bead: new THREE.SphereGeometry(1, 8, 6),
  /** Spitze zeigt nach +y, Grundfläche bei y = -0.5 */
  cone: new THREE.ConeGeometry(1, 1, 10),
  cylinder: new THREE.CylinderGeometry(1, 1, 1, 8),
  /** Halbkreis-Bogen (∩) in der xy-Ebene */
  arc: new THREE.TorusGeometry(1, 0.22, 5, 12, Math.PI),
};

const capsCache = new Map<string, THREE.BufferGeometry>();
/** Glied vom Gelenk (0,0,0) nach unten bis (0,-len,0); die runden Enden sitzen genau auf den Gelenken. */
export function limb(r: number, len: number, radial = 9): THREE.BufferGeometry {
  const key = `${r}|${len}|${radial}`;
  let g = capsCache.get(key);
  if (!g) {
    g = new THREE.CapsuleGeometry(r, len, 3, radial);
    g.translate(0, -len / 2, 0);
    capsCache.set(key, g);
  }
  return g;
}

/** Kanäle je Knochen: Drehung x, y, z · Versatz x, y, z · Skalierung · zusätzliche Skalierung in y */
export const CH = 8;

export interface Rigged {
  mesh: THREE.SkinnedMesh;
  bones: THREE.Bone[];
  /** Ruhelage der Knochen (relativ zum Elternknochen) */
  rest: THREE.Vector3[];
}

/**
 * Bauplan eines Tiers: Knochen (Ruhepose ohne Drehung) und starr angehängte Teile.
 * Die Geometrie wird einmal gebaut und von allen Exemplaren geteilt.
 */
export class RigSpec {
  private specs: { name: string; parent: number; pos: THREE.Vector3; order: THREE.EulerOrder }[] = [];
  private world: THREE.Vector3[] = [];
  private parts: THREE.BufferGeometry[] = [];
  private geo: THREE.BufferGeometry | null = null;
  private bounds = new THREE.Sphere();

  /** Knochen anlegen; Lage relativ zum Elternknochen. Gibt den Index zurück. */
  bone(name: string, parent: number, x: number, y: number, z: number, order: THREE.EulerOrder = 'XYZ'): number {
    const pos = new THREE.Vector3(x, y, z);
    this.specs.push({ name, parent, pos, order });
    this.world.push(parent >= 0 ? pos.clone().add(this.world[parent]!) : pos.clone());
    return this.specs.length - 1;
  }

  get count() {
    return this.specs.length;
  }

  /**
   * Teil starr an einen Knochen hängen. `at` ist relativ zur Ruhelage des Knochens.
   * `paint` kann die Farbe je Ecke (in Modellkoordinaten) bestimmen (Streifen, Flecken).
   */
  part(
    bone: number,
    geo: THREE.BufferGeometry,
    color: THREE.ColorRepresentation,
    at: Vec3 = [0, 0, 0],
    scale: Vec3 | number = 1,
    rot?: Vec3,
    paint?: (p: THREE.Vector3, c: THREE.Color) => void,
  ) {
    const g = geo.clone();
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
    if (!g.index) g.setIndex([...Array(g.attributes.position!.count).keys()]);
    const s = typeof scale === 'number' ? new THREE.Vector3(scale, scale, scale) : new THREE.Vector3(...scale);
    const m = new THREE.Matrix4().compose(
      new THREE.Vector3(...at).add(this.world[bone]!),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(...(rot ?? [0, 0, 0]))),
      s,
    );
    g.applyMatrix4(m);
    const pos = g.attributes.position as THREE.BufferAttribute;
    const n = pos.count;
    const col = new Float32Array(n * 3);
    const si = new Uint16Array(n * 4);
    const sw = new Float32Array(n * 4);
    const base = new THREE.Color(color);
    const c = new THREE.Color();
    const v = new THREE.Vector3();
    for (let i = 0; i < n; i++) {
      c.copy(base);
      if (paint) paint(v.fromBufferAttribute(pos, i), c);
      col[i * 3] = c.r;
      col[i * 3 + 1] = c.g;
      col[i * 3 + 2] = c.b;
      si[i * 4] = bone;
      sw[i * 4] = 1;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
    g.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
    this.parts.push(g);
    this.geo = null;
  }

  geometry(): THREE.BufferGeometry {
    if (!this.geo) {
      const g = mergeGeometries(this.parts, false);
      if (!g) throw new Error('Tier-Geometrie leer');
      g.computeBoundingSphere();
      this.bounds.copy(g.boundingSphere!);
      this.geo = g;
    }
    return this.geo;
  }

  /** Neues Exemplar: eigene Knochen, geteilte Geometrie, ein Draw-Call. */
  create(material: THREE.Material = creatureMaterial(), pad = 1.6): Rigged {
    const geo = this.geometry();
    const bones = this.specs.map((s) => {
      const b = new THREE.Bone();
      b.name = s.name;
      b.position.copy(s.pos);
      b.rotation.order = s.order;
      return b;
    });
    this.specs.forEach((s, i) => {
      if (s.parent >= 0) bones[s.parent]!.add(bones[i]!);
    });
    const mesh = new THREE.SkinnedMesh(geo, material);
    mesh.add(bones[0]!);
    mesh.updateMatrixWorld(true);
    mesh.bind(new THREE.Skeleton(bones));
    // Sichtbarkeitsprüfung mit großzügiger Kugel (Glieder bewegen sich weit aus der Ruhepose)
    mesh.boundingSphere = this.bounds.clone();
    mesh.boundingSphere.radius *= pad;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return { mesh, bones, rest: this.specs.map((s) => s.pos.clone()) };
  }
}

let shared: THREE.MeshStandardMaterial | null = null;
/** Gemeinsames Material aller prozeduralen Tiere (Farbe steckt in den Ecken). */
export function creatureMaterial(): THREE.MeshStandardMaterial {
  if (!shared) {
    shared = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.62, metalness: 0 });
    shared.name = 'creature';
    worldMaterial(shared);
  }
  return shared;
}

/** Ein bewegtes Tier in der Welt: wird nur im Blickfeld jedes Bild aktualisiert. */
export interface Agent {
  /** Lage für die Sichtprüfung (Weltkoordinaten = Lage in der Gruppe `animals`) */
  obj: THREE.Object3D;
  radius: number;
  update: (t: number, dt: number, ctx: AgentCtx) => void;
}

export interface AgentCtx {
  /** Kameraposition */
  cam: THREE.Vector3;
  /** gerade im Bild (oder nah an der Kamera) */
  visible: boolean;
}

// ---------------------------------------------------------------------------
// Posen
// ---------------------------------------------------------------------------
export type PoseFn = (p: Float32Array, t: number) => void;

export function neutral(p: Float32Array) {
  for (let o = 0; o < p.length; o += CH) {
    p[o] = p[o + 1] = p[o + 2] = p[o + 3] = p[o + 4] = p[o + 5] = 0;
    p[o + 6] = p[o + 7] = 1;
  }
}

/** Drehung eines Knochens setzen */
export const rot = (p: Float32Array, b: number, x: number, y: number, z: number) => {
  const o = b * CH;
  p[o] = x;
  p[o + 1] = y;
  p[o + 2] = z;
};
/** Drehung addieren */
export const addRot = (p: Float32Array, b: number, x: number, y: number, z: number) => {
  const o = b * CH;
  p[o] = p[o]! + x;
  p[o + 1] = p[o + 1]! + y;
  p[o + 2] = p[o + 2]! + z;
};
/** Versatz gegenüber der Ruhelage */
export const move = (p: Float32Array, b: number, x: number, y: number, z: number) => {
  const o = b * CH;
  p[o + 3] = x;
  p[o + 4] = y;
  p[o + 5] = z;
};
export const scale = (p: Float32Array, b: number, s: number, sy = 1) => {
  p[b * CH + 6] = s;
  p[b * CH + 7] = sy;
};

const smooth = (x: number) => x * x * (3 - 2 * x);

/** Überblendet weich zwischen Posen-Funktionen; beide laufen während der Blende weiter. */
export class Poser {
  readonly out: Float32Array;
  private a: Float32Array;
  private b: Float32Array;
  private snap: Float32Array;
  private from: PoseFn | null = null;
  private useSnap = false;
  private w = 1;
  private fade = 0.4;

  constructor(
    bones: number,
    private to: PoseFn,
  ) {
    this.out = new Float32Array(bones * CH);
    this.a = new Float32Array(bones * CH);
    this.b = new Float32Array(bones * CH);
    this.snap = new Float32Array(bones * CH);
    neutral(this.out);
  }

  get current() {
    return this.to;
  }

  play(fn: PoseFn, fade = 0.4) {
    if (fn === this.to) return;
    if (this.w < 1) {
      // mitten in einer Blende: vom aktuellen Stand aus weiter
      this.snap.set(this.out);
      this.useSnap = true;
    } else {
      this.from = this.to;
      this.useSnap = false;
    }
    this.to = fn;
    this.w = 0;
    this.fade = Math.max(1e-3, fade);
  }

  update(t: number, dt: number) {
    this.w = Math.min(1, this.w + dt / this.fade);
    neutral(this.b);
    this.to(this.b, t);
    if (this.w >= 1) {
      this.out.set(this.b);
      return;
    }
    if (this.useSnap) this.a.set(this.snap);
    else {
      neutral(this.a);
      this.from?.(this.a, t);
    }
    const k = smooth(this.w);
    const { a, b, out } = this;
    for (let i = 0; i < out.length; i++) out[i] = a[i]! + (b[i]! - a[i]!) * k;
  }
}

export function applyPose(r: Rigged, p: Float32Array) {
  const { bones, rest } = r;
  for (let i = 0; i < bones.length; i++) {
    const o = i * CH;
    const b = bones[i]!;
    const q = rest[i]!;
    b.rotation.set(p[o]!, p[o + 1]!, p[o + 2]!);
    b.position.set(q.x + p[o + 3]!, q.y + p[o + 4]!, q.z + p[o + 5]!);
    const s = p[o + 6]!;
    b.scale.set(s, s * p[o + 7]!, s);
  }
}

/** Zahl zwischen a und b */
export const mix = (a: number, b: number, k: number) => a + (b - a) * k;
/** weiche Stufe 0 → 1 */
export const ease = (x: number) => smooth(Math.min(1, Math.max(0, x)));
/** Winkel-Dämpfung (kürzester Weg) */
export function dampAngle(cur: number, want: number, rate: number, dt: number) {
  let d = want - cur;
  d = Math.atan2(Math.sin(d), Math.cos(d));
  return cur + d * (1 - Math.exp(-rate * dt));
}
