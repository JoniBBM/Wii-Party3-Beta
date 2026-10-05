/**
 * Laden der Modelle (Kenney, Quaternius u. a.) und Umwandeln in instanzierte Meshes.
 * Alle Materialien bekommen Wolkenschatten, Pflanzen zusätzlich Wind.
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { cloudShadowChunk } from './worldfx.ts';

const loader = new GLTFLoader();
const cache = new Map<string, Promise<THREE.Group>>();

/** Kenney-Farben (türkis/pastell) in satte, natürliche Inseltöne umfärben. */
const RECOLOR: Record<string, string> = {
  grass: '#4f9e37',
  leafsGreen: '#3f9634',
  leafsDark: '#2a7731',
  leafsFall: '#c9a43a',
  stone: '#a8a197',
  stoneDark: '#7b746c',
  dirt: '#b9895f',
  dirtDark: '#8a6446',
  woodBark: '#8a5a3a',
  wood: '#b07a4f',
  woodDark: '#6c4930',
  woodInner: '#e8cfa8',
  sand: '#e9cf91',
  water: '#4fc3d9',
};

export function loadModel(path: string): Promise<THREE.Group> {
  let p = cache.get(path);
  if (!p) {
    p = loader.loadAsync(`/assets/models/${path}.glb`).then((g) => {
      g.scene.userData.animations = g.animations;
      const recolor = path.startsWith('nature/');
      g.scene.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh) return;
        m.castShadow = true;
        m.receiveShadow = true;
        // Skelett-Modelle haben winzige Grundgeometrie → Sichtbarkeitsprüfung wäre falsch
        if ((m as THREE.SkinnedMesh).isSkinnedMesh) m.frustumCulled = false;
        for (const mat of Array.isArray(m.material) ? m.material : [m.material]) {
          const std = mat as THREE.MeshStandardMaterial;
          if (recolor) {
            const c = RECOLOR[std.name];
            if (c && std.color) std.color.set(c);
          }
          std.roughness = Math.max(0.75, std.roughness ?? 1);
          std.metalness = 0;
          // Blätter mit Alphatextur: ausstanzen statt mischen (keine Sortierfehler, wirft Schatten)
          if (std.transparent && std.map) {
            std.transparent = false;
            std.alphaTest = 0.45;
            std.depthWrite = true;
            std.side = THREE.DoubleSide;
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
// Wind + Wolkenschatten (Vertex-/Fragment-Shader-Erweiterung, gemeinsame Zeit)
// ---------------------------------------------------------------------------
export const windUniforms = { uWindTime: { value: 0 }, uWindStrength: { value: 1 } };
const patched = new WeakSet<THREE.Material>();

/** Wolkenschatten für ein Material, optional mit Wind (Stärke ~ Höhe über dem Boden). */
export function worldMaterial(material: THREE.Material, wind = 0) {
  if (patched.has(material)) return;
  patched.add(material);
  material.onBeforeCompile = (shader) => {
    if (wind > 0) {
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
            float gust = 0.75 + 0.25 * sin(uWindTime * 0.37 + wp.x * 0.05);
            float sway = sin(uWindTime * 1.6 + phase) * 0.6 + sin(uWindTime * 2.7 + phase * 1.7) * 0.4;
            transformed.x += sway * h * ${wind.toFixed(3)} * uWindStrength * gust;
            transformed.z += cos(uWindTime * 1.3 + phase) * h * ${(wind * 0.6).toFixed(3)} * uWindStrength * gust;
          }`,
        );
    }
    cloudShadowChunk(shader);
  };
  material.customProgramCacheKey = () => `world-${wind}`;
}

/** Ältere Schnittstelle: Wind (mit Wolkenschatten). */
export function addWind(material: THREE.Material, amount = 0.06) {
  worldMaterial(material, amount);
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
  /** zweite Neigungsachse */
  tiltZ?: number;
}

export interface InstanceOptions {
  targetHeight?: number;
  castShadow?: boolean;
  wind?: number;
  /** Materialfarben nach Materialname überschreiben */
  colors?: Record<string, string>;
  /** alle Farben multiplizieren */
  tint?: string;
  /** Helligkeit/Farbton je Exemplar leicht variieren (0 = aus) */
  vary?: number;
}

const LEAFY = /leaf|leaves|palm|bush|grass|plant|flower|fern|bamboo|monstera|tiny_treats|atlas|crop|moss/i;

const prepared = new Map<string, THREE.Material>();

function prepareMaterial(mat: THREE.Material, partName: string, opts: InstanceOptions): THREE.Material {
  const leafyKey = LEAFY.test(mat.name + ' ' + partName);
  const key = `${mat.uuid}|${opts.colors?.[mat.name] ?? ''}|${opts.tint ?? ''}|${opts.wind && leafyKey ? opts.wind : 0}`;
  const hit = prepared.get(key);
  if (hit) return hit;
  const c = mat.clone() as THREE.MeshStandardMaterial;
  prepared.set(key, c);
  const override = opts.colors?.[mat.name];
  if (override && c.color) c.color.set(override);
  if (opts.tint && c.color) c.color.multiply(new THREE.Color(opts.tint));
  const leafy = LEAFY.test(mat.name + ' ' + partName);
  worldMaterial(c, opts.wind && leafy ? opts.wind : 0);
  return c;
}

/**
 * Erzeugt aus einem Modell (mehrere Teil-Meshes) instanzierte Meshes – ein Draw-Call
 * pro Teil statt pro Baum.
 */
export function instanceModel(model: THREE.Object3D, placements: Placement[], opts: InstanceOptions = {}): THREE.Group {
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
    const mats = materials.map((mat) => prepareMaterial(mat, part.name, opts));
    const inst = new THREE.InstancedMesh(part.geometry, mats.length === 1 ? mats[0]! : mats, placements.length);
    inst.castShadow = opts.castShadow ?? true;
    inst.receiveShadow = true;
    placements.forEach((p, i) => {
      euler.set(p.tilt ?? 0, p.rotY, p.tiltZ ?? (p.tilt ?? 0) * 0.5);
      q.setFromEuler(euler);
      s.setScalar(p.scale * norm);
      pos.set(p.x, p.y, p.z);
      m.compose(pos, q, s).multiply(local);
      inst.setMatrixAt(i, m);
    });
    inst.instanceMatrix.needsUpdate = true;
    if (opts.vary) {
      const c = new THREE.Color();
      placements.forEach((p, i) => {
        // deterministisch je Standort, damit alle Teile eines Baums gleich getönt sind
        const h = Math.sin(p.x * 12.9898 + p.z * 78.233) * 43758.5453;
        const r = h - Math.floor(h);
        const k = 1 - opts.vary! + r * opts.vary! * 2;
        c.setRGB(k * (0.96 + r * 0.08), k, k * (0.92 + (1 - r) * 0.1));
        inst.setColorAt(i, c);
      });
      if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
    }
    inst.computeBoundingSphere();
    group.add(inst);
  }
  return group;
}

/** Einzelnes Modell platzieren (Klon, Materialien eigen, damit Farben überschrieben werden können). */
export function placeModel(model: THREE.Object3D, p: Placement, targetHeight?: number, opts: InstanceOptions = {}): THREE.Object3D {
  const clone = model.clone(true);
  clone.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.material = Array.isArray(mesh.material) ? mesh.material.map((mm) => prepareMaterial(mm, mesh.name, opts)) : prepareMaterial(mesh.material, mesh.name, opts);
  });
  const norm = targetHeight ? targetHeight / modelHeight(model) : 1;
  clone.position.set(p.x, p.y, p.z);
  clone.rotation.set(p.tilt ?? 0, p.rotY, p.tiltZ ?? 0);
  clone.scale.setScalar(p.scale * norm);
  return clone;
}
