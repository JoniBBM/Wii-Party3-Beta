/** Laden der CC0-Modelle (Kenney) und Umwandeln in instanzierte Meshes. */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const loader = new GLTFLoader();
const cache = new Map<string, Promise<THREE.Group>>();

/** Kenney-Farben (türkis/pastell) in satte, natürliche Inseltöne umfärben. */
const RECOLOR: Record<string, string> = {
  grass: '#63c24b',
  leafsGreen: '#4cb440',
  leafsDark: '#2f8f3c',
  stone: '#a8a197',
  stoneDark: '#7b746c',
  dirt: '#b9895f',
  woodBark: '#8a5a3a',
  wood: '#b07a4f',
  woodDark: '#6c4930',
  woodInner: '#e8cfa8',
};

export function loadModel(path: string): Promise<THREE.Group> {
  let p = cache.get(path);
  if (!p) {
    p = loader.loadAsync(`/assets/models/${path}.glb`).then((g) => {
      const recolor = path.startsWith('nature/');
      g.scene.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh) {
          m.castShadow = true;
          m.receiveShadow = true;
          if (recolor) {
            for (const mat of Array.isArray(m.material) ? m.material : [m.material]) {
              const std = mat as THREE.MeshStandardMaterial;
              const c = RECOLOR[std.name];
              if (c && std.color) std.color.set(c);
              std.roughness = 0.85;
            }
          }
        }
      });
      return g.scene;
    });
    cache.set(path, p);
  }
  return p;
}

export async function loadModels(paths: string[]): Promise<Map<string, THREE.Group>> {
  const out = new Map<string, THREE.Group>();
  const results = await Promise.allSettled(paths.map(async (p) => [p, await loadModel(p)] as const));
  for (const r of results) if (r.status === 'fulfilled') out.set(r.value[0], r.value[1]);
  return out;
}

/** Höhe des Modells (für Normierung auf Zielhöhe). */
export function modelHeight(model: THREE.Object3D): number {
  const box = new THREE.Box3().setFromObject(model);
  return Math.max(0.001, box.max.y - box.min.y);
}

// ---------------------------------------------------------------------------
// Wind: Blätter wiegen sich (Vertex-Shader-Erweiterung, eine gemeinsame Zeit-Uniform)
// ---------------------------------------------------------------------------
export const windUniforms = { uWindTime: { value: 0 }, uWindStrength: { value: 1 } };
const windPatched = new WeakSet<THREE.Material>();

export function addWind(material: THREE.Material, amount = 0.06) {
  if (windPatched.has(material)) return;
  windPatched.add(material);
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uWindTime = windUniforms.uWindTime;
    shader.uniforms.uWindStrength = windUniforms.uWindStrength;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uWindTime;\nuniform float uWindStrength;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        {
          vec4 wp = vec4(transformed, 1.0);
          #ifdef USE_INSTANCING
            wp = instanceMatrix * wp;
          #endif
          float phase = wp.x * 0.35 + wp.z * 0.27;
          float h = max(0.0, transformed.y);
          float sway = sin(uWindTime * 1.6 + phase) * 0.6 + sin(uWindTime * 2.7 + phase * 1.7) * 0.4;
          transformed.x += sway * h * ${amount.toFixed(3)} * uWindStrength;
          transformed.z += cos(uWindTime * 1.3 + phase) * h * ${(amount * 0.6).toFixed(3)} * uWindStrength;
        }`,
      );
  };
  material.customProgramCacheKey = () => `wind-${amount}`;
}

// ---------------------------------------------------------------------------
// Instanzierung
// ---------------------------------------------------------------------------
export interface Placement {
  x: number;
  y: number;
  z: number;
  rotY: number;
  scale: number;
  tilt?: number;
}

/**
 * Erzeugt aus einem Modell (mehrere Teil-Meshes) instanzierte Meshes – ein Draw-Call
 * pro Teil statt pro Baum.
 */
export function instanceModel(
  model: THREE.Object3D,
  placements: Placement[],
  opts: { targetHeight?: number; castShadow?: boolean; wind?: number } = {},
): THREE.Group {
  const group = new THREE.Group();
  if (!placements.length) return group;
  model.updateMatrixWorld(true);
  const norm = opts.targetHeight ? opts.targetHeight / modelHeight(model) : 1;
  const parts: THREE.Mesh[] = [];
  model.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) parts.push(o as THREE.Mesh);
  });
  const rootInv = new THREE.Matrix4().copy(model.matrixWorld).invert();
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  const pos = new THREE.Vector3();
  const euler = new THREE.Euler();
  for (const part of parts) {
    const local = new THREE.Matrix4().multiplyMatrices(rootInv, part.matrixWorld);
    const materials = Array.isArray(part.material) ? part.material : [part.material];
    const mats = materials.map((mat) => {
      const c = mat.clone();
      if (opts.wind && /leaf|leaves|palm|bush|grass|plant|flower/i.test(mat.name + part.name)) addWind(c, opts.wind);
      return c;
    });
    const inst = new THREE.InstancedMesh(part.geometry, mats.length === 1 ? mats[0]! : mats, placements.length);
    inst.castShadow = opts.castShadow ?? true;
    inst.receiveShadow = true;
    placements.forEach((p, i) => {
      euler.set(p.tilt ?? 0, p.rotY, (p.tilt ?? 0) * 0.5);
      q.setFromEuler(euler);
      s.setScalar(p.scale * norm);
      pos.set(p.x, p.y, p.z);
      m.compose(pos, q, s).multiply(local);
      inst.setMatrixAt(i, m);
    });
    inst.instanceMatrix.needsUpdate = true;
    inst.computeBoundingSphere();
    group.add(inst);
  }
  return group;
}

/** Einzelnes Modell platzieren (Klon). */
export function placeModel(model: THREE.Object3D, p: Placement, targetHeight?: number): THREE.Object3D {
  const clone = model.clone(true);
  const norm = targetHeight ? targetHeight / modelHeight(model) : 1;
  clone.position.set(p.x, p.y, p.z);
  clone.rotation.set(p.tilt ?? 0, p.rotY, 0);
  clone.scale.setScalar(p.scale * norm);
  return clone;
}
