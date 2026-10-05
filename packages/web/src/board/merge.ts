/**
 * Statische Einzel-Meshes (Planken, Pfosten, Seile, Fässer, Säulen …) nach Material
 * zusammenfassen – aus hunderten Draw-Calls werden wenige. Bewegte Objekte
 * (userData.dynamic) und instanzierte Meshes bleiben unangetastet.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export function mergeStatic(root: THREE.Object3D): THREE.Group {
  root.updateMatrixWorld(true);
  const rootInv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const buckets = new Map<THREE.Material, { geos: THREE.BufferGeometry[]; meshes: THREE.Mesh[]; cast: boolean }>();
  const skip = new Set<THREE.Object3D>();
  root.traverse((o) => {
    if (o.userData.dynamic) o.traverse((c) => skip.add(c));
  });
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || skip.has(m) || (m as THREE.InstancedMesh).isInstancedMesh || (m as THREE.SkinnedMesh).isSkinnedMesh) return;
    if (Array.isArray(m.material)) return;
    const mat = m.material;
    if ((mat as THREE.ShaderMaterial).isShaderMaterial || mat.transparent) return;
    const g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
    // nur die Attribute, die alle Materialien brauchen
    for (const name of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(name)) g.deleteAttribute(name);
    if (!g.attributes.normal) g.computeVertexNormals();
    g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(rootInv, m.matrixWorld));
    let b = buckets.get(mat);
    if (!b) buckets.set(mat, (b = { geos: [], meshes: [], cast: false }));
    b.geos.push(g);
    b.meshes.push(m);
    b.cast ||= m.castShadow;
  });
  const merged = new THREE.Group();
  merged.name = 'merged-static';
  for (const [mat, b] of buckets) {
    // Attribut-Sätze vereinheitlichen (uv/color nur, wenn alle sie haben)
    const keys = ['uv', 'color'].filter((k) => b.geos.every((g) => g.attributes[k]));
    for (const g of b.geos) for (const k of ['uv', 'color']) if (!keys.includes(k) && g.attributes[k]) g.deleteAttribute(k);
    const geo = b.geos.length > 1 ? mergeGeometries(b.geos, false) : null;
    for (const g of b.geos) if (g !== geo) g.dispose();
    // nicht zusammenfassbar (oder nur ein Teil) → Originale behalten
    if (!geo) continue;
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = b.cast;
    mesh.receiveShadow = true;
    merged.add(mesh);
    for (const m of b.meshes) m.removeFromParent();
  }
  root.add(merged);
  return merged;
}
