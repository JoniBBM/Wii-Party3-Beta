/**
 * Grasteppich: tausende Grasbüschel als eine instanzierte Geometrie, die sich im Wind wiegen
 * und die Farbe des Geländes darunter übernehmen.
 */
import * as THREE from 'three';
import { VOLCANO } from '@insel/shared';
import { worldMaterial } from './assets.ts';
import { rand } from './noise.ts';
import type { Heightfield } from './terrain.ts';

function clumpGeometry(blades: number, seed: number): THREE.BufferGeometry {
  const R = rand(seed);
  const pos: number[] = [];
  const col: number[] = [];
  const nrm: number[] = [];
  const idx: number[] = [];
  const SEG = 2;
  for (let b = 0; b < blades; b++) {
    const a = R() * Math.PI * 2;
    const r = R() * 0.16;
    const ox = Math.cos(a) * r;
    const oz = Math.sin(a) * r;
    const h = 0.2 + R() * 0.24;
    const w = 0.04 + R() * 0.025;
    const face = R() * Math.PI;
    const fx = Math.cos(face);
    const fz = Math.sin(face);
    const bend = (R() - 0.3) * 0.22;
    const base = pos.length / 3;
    for (let s = 0; s <= SEG; s++) {
      const t = s / SEG;
      const width = w * (1 - t * 0.85);
      const y = h * t;
      const lean = bend * t * t;
      for (const side of [-1, 1]) {
        pos.push(ox + fx * width * side + Math.cos(a) * lean, y, oz + fz * width * side + Math.sin(a) * lean);
        const shade = 0.45 + t * 0.65;
        col.push(shade, shade, shade);
        nrm.push(0, 1, 0);
      }
    }
    for (let s = 0; s < SEG; s++) {
      const k = base + s * 2;
      idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  geo.setIndex(idx);
  return geo;
}

export function buildGrass(
  field: Heightfield,
  colorAt: (x: number, z: number, out: THREE.Color) => THREE.Color,
  opts: { count: number; pathClear: number },
): THREE.InstancedMesh {
  const geo = clumpGeometry(6, 11);
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, side: THREE.DoubleSide });
  worldMaterial(mat, 0.42);
  const mesh = new THREE.InstancedMesh(geo, mat, opts.count);
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  mesh.name = 'grass';
  const R = rand(9191);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  const p = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  const c = new THREE.Color();
  const half = field.size / 2 - 2;
  let n = 0;
  for (let tries = 0; tries < opts.count * 14 && n < opts.count; tries++) {
    const x = (R() * 2 - 1) * half;
    const z = (R() * 2 - 1) * half;
    const h = field.height(x, z);
    if (h < 1.25) continue;
    if (field.slope(x, z) > 0.32) continue;
    if (field.pathDistance(x, z) < opts.pathClear) continue;
    if (field.riverDistance(x, z) < 0.5 || field.gorgeDistance(x, z) < 1.2) continue;
    const dv = Math.hypot(x - VOLCANO.x, z - VOLCANO.z);
    if (dv < 16 && h > 8) continue;
    colorAt(x, z, c);
    // nur auf grünem Boden (kein Sand, Fels, Asche)
    if (!(c.g > c.r * 1.12 && c.g > c.b * 1.5)) continue;
    const k = 0.8 + R() * 0.3;
    c.multiplyScalar(k);
    q.setFromAxisAngle(up, R() * Math.PI * 2);
    const sc = 0.65 + R() * 0.5;
    s.set(sc, sc * (0.8 + R() * 0.5), sc);
    p.set(x, h - 0.03, z);
    m.compose(p, q, s);
    mesh.setMatrixAt(n, m);
    mesh.setColorAt(n, c);
    n++;
  }
  mesh.count = n;
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.computeBoundingSphere();
  return mesh;
}
