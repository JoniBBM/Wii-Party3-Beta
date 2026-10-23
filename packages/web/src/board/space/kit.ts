/**
 * Bausteine für den Alien-Planeten: Materialien (mit Wolkenschatten), Leuchten für Modelle
 * (helle, satte Stellen glühen von selbst), Kristalle und Pilze als eigene Geometrien.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { worldMaterial } from '../assets.ts';
import { cloudShadowChunk } from '../worldfx.ts';

const matCache = new Map<string, THREE.MeshStandardMaterial>();

/** Standard-Material (gecacht), optional leuchtend. */
export function mat(color: string, o: { rough?: number; emissive?: string; glow?: number; flat?: boolean; metal?: number } = {}): THREE.MeshStandardMaterial {
  const key = `${color}|${o.rough ?? 0.8}|${o.emissive ?? ''}|${o.glow ?? 0}|${o.flat ? 1 : 0}|${o.metal ?? 0}`;
  let m = matCache.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, roughness: o.rough ?? 0.8, metalness: o.metal ?? 0, flatShading: o.flat ?? false });
    if (o.emissive) {
      m.emissive.set(o.emissive);
      m.emissiveIntensity = o.glow ?? 1.4;
    }
    worldMaterial(m);
    matCache.set(key, m);
  }
  return m;
}

/** Leuchtendes Grundmaterial (ohne Licht, wird vom Bloom erfasst). */
export function glowMat(color: string, k = 1.6): THREE.MeshBasicMaterial {
  const key = `glow|${color}|${k}`;
  let m = matCache.get(key) as unknown as THREE.MeshBasicMaterial | undefined;
  if (!m) {
    m = new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(k), toneMapped: true });
    matCache.set(key, m as unknown as THREE.MeshStandardMaterial);
  }
  return m;
}

/**
 * Helle, kräftig gefärbte Stellen eines Modells (Blütenkugeln, Spiralen) leuchten von selbst –
 * dunkle Stiele und Fels nicht. Kette mit vorhandenem onBeforeCompile (Wind, Wolkenschatten).
 */
export function glowify(material: THREE.Material, strength: number) {
  const ud = material.userData as { glowify?: number };
  if (ud.glowify) return;
  ud.glowify = strength;
  const prev = material.onBeforeCompile.bind(material);
  const prevKey = material.customProgramCacheKey.bind(material);
  material.onBeforeCompile = (shader, renderer) => {
    prev(shader, renderer);
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <emissivemap_fragment>',
      `#include <emissivemap_fragment>
      {
        vec3 dc = diffuseColor.rgb;
        float hi = max(dc.r, max(dc.g, dc.b));
        float sat = hi - min(dc.r, min(dc.g, dc.b));
        totalEmissiveRadiance += dc * smoothstep(0.18, 0.55, hi) * smoothstep(0.12, 0.4, sat) * ${strength.toFixed(2)};
      }`,
    );
  };
  material.customProgramCacheKey = () => `${prevKey()}|glow${strength}`;
  material.needsUpdate = true;
}

/** Materialfarben einer Gruppe aufhellen (einmal je Material; dunkle Modelle wirken sonst schwarz). */
export function brighten(root: THREE.Object3D, k: number) {
  root.traverse((o) => {
    const m = (o as THREE.Mesh).material;
    if (!m) return;
    for (const mm of Array.isArray(m) ? m : [m]) {
      const std = mm as THREE.MeshStandardMaterial;
      if (std.userData.bright || !std.color) continue;
      std.userData.bright = k;
      std.color.multiplyScalar(k);
    }
  });
}

/** Alle Materialien einer Gruppe leuchten lassen (siehe glowify). */
export function glowifyAll(root: THREE.Object3D, strength: number) {
  root.traverse((o) => {
    const m = (o as THREE.Mesh).material;
    if (!m) return;
    for (const mm of Array.isArray(m) ? m : [m]) glowify(mm, strength);
  });
}

/**
 * Instanz-Farbe als Eigenleuchten (Kristalle, Pilzhüte, Felder): `glow` = Anteil der Farbe,
 * `pulse` lässt jede Instanz leicht unterschiedlich pulsieren (gemeinsame Zeit-Uniform).
 */
export const glowTime = { value: 0 };
export function instanceGlow(material: THREE.MeshStandardMaterial, glow: number, pulse = 0) {
  material.onBeforeCompile = (shader) => {
    cloudShadowChunk(shader);
    shader.uniforms.uGlowTime = glowTime;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying float vGlowPhase;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        #ifdef USE_INSTANCING
          vGlowPhase = instanceMatrix[3].x * 0.37 + instanceMatrix[3].z * 0.23;
        #else
          vGlowPhase = 0.0;
        #endif`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uGlowTime;\nvarying float vGlowPhase;')
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        totalEmissiveRadiance += diffuseColor.rgb * ${glow.toFixed(2)} * (1.0 + ${pulse.toFixed(2)} * sin(uGlowTime * 1.7 + vGlowPhase));`,
      );
  };
  material.customProgramCacheKey = () => `instance-glow-${glow}-${pulse}`;
}

/** Ein Kristall: sechseckiges Prisma mit Spitze (Fuß bei y = 0, Höhe 1, Radius ~0.18). */
export function crystalGeometry(): THREE.BufferGeometry {
  const prism = new THREE.CylinderGeometry(0.17, 0.2, 0.72, 6, 1);
  prism.translate(0, 0.36, 0);
  const tip = new THREE.ConeGeometry(0.17, 0.28, 6, 1);
  tip.translate(0, 0.86, 0);
  const g = mergeGeometries([prism.toNonIndexed(), tip.toNonIndexed()])!;
  g.computeVertexNormals();
  return g;
}

/** Kristallgruppe: mehrere schräge Kristalle zu einer Geometrie (Höhe ~1, Fuß bei y = 0). */
export function crystalCluster(seed: number, n = 5): THREE.BufferGeometry {
  let s = seed * 9301 + 49297;
  const R = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  const parts: THREE.BufferGeometry[] = [];
  const one = crystalGeometry();
  for (let i = 0; i < n; i++) {
    const g = one.clone();
    const big = i === 0;
    const h = big ? 1 : 0.4 + R() * 0.45;
    const w = big ? 1.25 : 0.7 + R() * 0.5;
    g.scale(w, h, w);
    const tilt = big ? (R() - 0.5) * 0.2 : 0.35 + R() * 0.45;
    const a = R() * Math.PI * 2;
    g.rotateZ(tilt);
    g.rotateY(a);
    if (!big) g.translate(Math.cos(a) * 0.12, 0, Math.sin(a) * 0.12);
    parts.push(g);
  }
  const out = mergeGeometries(parts)!;
  out.computeVertexNormals();
  return out;
}

/** Leuchtpilz: Stiel + Hut (Hut als eigene Gruppe in der Geometrie: Index 0 Stiel, 1 Hut). */
export function mushroomGeometry(): THREE.BufferGeometry {
  const stem = new THREE.CylinderGeometry(0.07, 0.1, 0.5, 7).toNonIndexed();
  stem.translate(0, 0.25, 0);
  const cap = new THREE.SphereGeometry(0.3, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2).toNonIndexed();
  cap.scale(1, 0.6, 1);
  cap.translate(0, 0.46, 0);
  const g = mergeGeometries([stem, cap], true)!;
  g.computeVertexNormals();
  return g;
}

/** Fels (unregelmäßiger Klotz, für Meeresspitzen und Bögen) */
export function rockGeometry(r: number, h: number, R: () => number, sides = 7): THREE.BufferGeometry {
  const geo = new THREE.CylinderGeometry(r * 0.55, r, h, sides, 4);
  const p = geo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const k = 0.75 + R() * 0.5;
    p.setXYZ(i, p.getX(i) * k, p.getY(i) + h / 2, p.getZ(i) * k);
  }
  geo.computeVertexNormals();
  return geo;
}

/**
 * Modelle mittig auf ihren Fußpunkt setzen (manche Teile liegen in der Datei verschoben) –
 * einmal je geladenem Modell, damit Platzierung und Stapeln (Rakete) genau stimmen.
 */
export function centerModels(models: Map<string, THREE.Group>) {
  const box = new THREE.Box3();
  const c = new THREE.Vector3();
  for (const [name, m] of models) {
    if (!name.startsWith('space/') || m.userData.centered) continue;
    m.userData.centered = true;
    m.updateMatrixWorld(true);
    box.setFromObject(m).getCenter(c);
    // Fußpunkt auf y = 0 (Dach-Teile wie Antenne/Radar liegen sonst eine Etage zu hoch)
    const lift = box.min.y;
    for (const child of m.children) {
      child.position.x -= c.x;
      child.position.z -= c.z;
      child.position.y -= lift;
    }
    m.updateMatrixWorld(true);
  }
}

let haloTex: THREE.CanvasTexture | null = null;
/** Weicher, runder Lichtschein (für Sprites: Antriebe, Meteore) */
export function haloTexture(): THREE.CanvasTexture {
  if (haloTex) return haloTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.35, 'rgba(255,255,255,0.55)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  haloTex = new THREE.CanvasTexture(c);
  return haloTex;
}

/** Einzelnes Mesh mit Schatten an Position. */
export function mesh(geo: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  const me = new THREE.Mesh(geo, m);
  me.position.set(x, y, z);
  me.castShadow = true;
  me.receiveShadow = true;
  return me;
}
