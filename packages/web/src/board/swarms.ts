/**
 * Fischschwärme und Schmetterlinge als InstancedMesh: ein Draw-Call je Schwarm bzw. für alle
 * Schmetterlinge. Bahn, Schwimm-Wackeln und Flügelschlag rechnet der Vertex-Shader aus der
 * gemeinsamen Weltzeit (fx.uTime) – auf der CPU kostet das nichts.
 */
import * as THREE from 'three';
import { RigSpec, SHAPE } from './rig.ts';
import { cloudShadowChunk, fx } from './worldfx.ts';

/** Statische Geometrie mit Vertex-Farben aus Grundkörpern (Bauplan mit nur einem Knochen). */
function solid(build: (s: RigSpec, root: number) => void): THREE.BufferGeometry {
  const s = new RigSpec();
  const root = s.bone('root', -1, 0, 0, 0);
  build(s, root);
  const g = s.geometry().clone();
  g.deleteAttribute('skinIndex');
  g.deleteAttribute('skinWeight');
  g.computeBoundingSphere();
  return g;
}

// ---------------------------------------------------------------------------
// Fische
// ---------------------------------------------------------------------------
export type FishKind = 'clown' | 'tang' | 'yellow';

const fishGeos = new Map<FishKind, THREE.BufferGeometry>();

/** Fisch der Länge 1 (Kopf bei z = +0,5, Schwanz bei −0,5). */
function fishGeometry(kind: FishKind): THREE.BufferGeometry {
  const hit = fishGeos.get(kind);
  if (hit) return hit;
  const body = kind === 'clown' ? '#ff7a1a' : kind === 'tang' ? '#2f6fe0' : '#ffd52e';
  const fin = kind === 'clown' ? '#ff8f2e' : kind === 'tang' ? '#ffd23a' : '#fff1a0';
  const tall = kind === 'clown' ? 0.19 : 0.25;
  const white = new THREE.Color('#ffffff');
  const black = new THREE.Color('#1a1414');
  const dark = new THREE.Color('#14244f');
  const paint = (p: THREE.Vector3, c: THREE.Color) => {
    if (kind === 'clown') {
      // drei weiße Bänder mit schwarzem Rand
      for (const z of [0.27, 0.02, -0.27]) {
        const d = Math.abs(p.z - z);
        if (d < 0.045) c.copy(white);
        else if (d < 0.065) c.copy(black);
      }
    } else if (kind === 'tang') {
      // dunkles Band über dem Rücken
      if (p.y > 0.06 && p.y < 0.17 + p.z * 0.1 && p.z > -0.3 && p.z < 0.25) c.copy(dark);
    }
  };
  const g = solid((s, r) => {
    s.part(r, SHAPE.ballLo, body, [0, 0, 0.04], [0.12, tall, 0.38], undefined, paint);
    // Schwanzflosse (gegabelt) und Rückenflosse
    for (const a of [1, -1]) s.part(r, SHAPE.bead, fin, [0, 0.07 * a, -0.42], [0.018, 0.13, 0.08], [0.6 * a, 0, 0], paint);
    s.part(r, SHAPE.ballLo, fin, [0, tall * 0.85, -0.04], [0.014, 0.1, 0.2], [0.25, 0, 0], kind === 'clown' ? paint : undefined);
    s.part(r, SHAPE.bead, fin, [0, -tall * 0.8, -0.08], [0.012, 0.07, 0.12], [-0.3, 0, 0]);
    for (const side of [1, -1]) {
      s.part(r, SHAPE.bead, fin, [0.1 * side, -0.05, 0.12], [0.06, 0.012, 0.05], [0, 0.6 * side, -0.4 * side]);
      s.part(r, SHAPE.bead, '#ffffff', [0.085 * side, 0.05, 0.28], 0.042);
      s.part(r, SHAPE.bead, '#111111', [0.105 * side, 0.05, 0.29], 0.026);
    }
  });
  fishGeos.set(kind, g);
  return g;
}

let fishMat: THREE.MeshStandardMaterial | null = null;

function fishMaterial(): THREE.MeshStandardMaterial {
  if (fishMat) return fishMat;
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.45, metalness: 0 });
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uFxTime = fx.uTime;
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform float uFxTime;
        attribute vec4 aSwim;   // Phase, Bahnradius, Höhenversatz, Größe
        attribute vec4 aSchool; // Mitte x, y, z, Winkelgeschwindigkeit (Vorzeichen = Richtung)`,
      )
      .replace(
        '#include <beginnormal_vertex>',
        `#include <beginnormal_vertex>
        float swA = aSwim.x + uFxTime * aSchool.w;
        float swDir = aSchool.w >= 0.0 ? 1.0 : -1.0;
        float swR = aSwim.y * (1.0 + 0.2 * sin(uFxTime * 0.7 + aSwim.x * 3.0));
        vec2 swFwd = vec2(-sin(swA), cos(swA)) * swDir;
        mat3 swRot = mat3(vec3(swFwd.y, 0.0, -swFwd.x), vec3(0.0, 1.0, 0.0), vec3(swFwd.x, 0.0, swFwd.y));
        float swPh = uFxTime * 12.0 + aSwim.x * 7.0;
        objectNormal = swRot * objectNormal;`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        {
          // Schwimm-Wackeln: Welle läuft zum Schwanz hin stärker
          float k = smoothstep(0.25, -0.5, position.z);
          transformed.x += sin(swPh - position.z * 5.0) * (0.025 + 0.15 * k);
          vec3 c = vec3(aSchool.x + cos(swA) * swR, aSchool.y + aSwim.z + sin(uFxTime * 1.7 + aSwim.x) * 0.05, aSchool.z + sin(swA) * swR);
          transformed = swRot * (transformed * aSwim.w) + c;
        }`,
      );
  };
  m.customProgramCacheKey = () => 'insel-fish';
  fishMat = m;
  return m;
}

export interface School {
  x: number;
  y: number;
  z: number;
  /** Bahnradius */
  r: number;
  kind: FishKind;
  count: number;
  /** Fischlänge in Metern */
  size: number;
}

/** Ein Schwarm = ein InstancedMesh; die Bahn rechnet der Shader. */
export function buildSchool(s: School, R: () => number): THREE.InstancedMesh {
  const base = fishGeometry(s.kind);
  const geo = new THREE.BufferGeometry();
  for (const [k, v] of Object.entries(base.attributes)) geo.setAttribute(k, v);
  geo.setIndex(base.index);
  const swim = new Float32Array(s.count * 4);
  const school = new Float32Array(s.count * 4);
  const dir = R() < 0.5 ? 1 : -1;
  const speed = (0.3 + R() * 0.15) * dir;
  for (let i = 0; i < s.count; i++) {
    swim[i * 4] = (i / s.count) * Math.PI * 2 + R() * 0.5;
    swim[i * 4 + 1] = s.r * (0.6 + R() * 0.5);
    swim[i * 4 + 2] = (R() - 0.5) * 0.25;
    swim[i * 4 + 3] = s.size * (0.85 + R() * 0.3);
    school.set([s.x, s.y, s.z, speed * (0.95 + R() * 0.1)], i * 4);
  }
  geo.setAttribute('aSwim', new THREE.InstancedBufferAttribute(swim, 4));
  geo.setAttribute('aSchool', new THREE.InstancedBufferAttribute(school, 4));
  const mesh = new THREE.InstancedMesh(geo, fishMaterial(), s.count);
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.boundingSphere = new THREE.Sphere(new THREE.Vector3(s.x, s.y, s.z), s.r * 1.4 + s.size + 0.5);
  mesh.name = 'fish';
  return mesh;
}

// ---------------------------------------------------------------------------
// Schmetterlinge
// ---------------------------------------------------------------------------
let butterflyGeo: THREE.BufferGeometry | null = null;

/** Schmetterling (Spannweite ~0,35): Körper entlang z, Flügel in der xz-Ebene. */
function butterflyGeometry(): THREE.BufferGeometry {
  if (butterflyGeo) return butterflyGeo;
  const edge = new THREE.Color('#2a1d1a');
  const spot = new THREE.Color('#fff8ee');
  const paint = (p: THREE.Vector3, c: THREE.Color) => {
    const d = Math.hypot(p.x, p.z);
    if (d > 0.15) c.copy(edge);
    else if (d > 0.115 && d < 0.13) c.copy(spot);
  };
  butterflyGeo = solid((s, r) => {
    s.part(r, SHAPE.bead, '#2a2220', [0, 0, 0], [0.014, 0.014, 0.065]);
    s.part(r, SHAPE.bead, '#2a2220', [0, 0.004, 0.07], 0.016);
    for (const side of [1, -1]) {
      s.part(r, SHAPE.ballLo, '#ffffff', [0.085 * side, 0, 0.03], [0.085, 0.004, 0.06], [0, -0.35 * side, 0], paint);
      s.part(r, SHAPE.ballLo, '#ffffff', [0.065 * side, -0.002, -0.04], [0.065, 0.004, 0.048], [0, 0.45 * side, 0], paint);
      s.part(r, SHAPE.cone, '#2a2220', [0.018 * side, 0.02, 0.1], [0.003, 0.06, 0.003], [1.1, 0, -0.3 * side]);
    }
  });
  return butterflyGeo;
}

let butterflyMat: THREE.MeshStandardMaterial | null = null;

function butterflyMaterial(): THREE.MeshStandardMaterial {
  if (butterflyMat) return butterflyMat;
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0 });
  m.onBeforeCompile = (shader) => {
    cloudShadowChunk(shader);
    shader.uniforms.uFxTime = fx.uTime;
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform float uFxTime;
        attribute vec4 aFly; // Phase, Größe, Flugradius, -`,
      )
      .replace(
        '#include <beginnormal_vertex>',
        `#include <beginnormal_vertex>
        float bfT = uFxTime + aFly.x * 10.0;
        // ab und zu auf einer Blüte ausruhen
        float bfRest = smoothstep(0.55, 0.85, sin(uFxTime * 0.11 + aFly.x * 7.0));
        float bfR = aFly.z;
        vec3 bfOff = vec3(sin(bfT * 0.7) * bfR + sin(bfT * 1.9 + aFly.x) * 0.3, 0.3 + abs(sin(bfT * 2.2)) * 0.5, cos(bfT * 0.6) * bfR);
        bfOff = mix(bfOff, vec3(cos(aFly.x * 5.0) * 0.4, -0.08, sin(aFly.x * 5.0) * 0.4), bfRest);
        vec2 bfV = vec2(0.7 * bfR * cos(bfT * 0.7) + 0.57 * cos(bfT * 1.9 + aFly.x), -0.6 * bfR * sin(bfT * 0.6));
        float bfYaw = mix(atan(bfV.x, bfV.y), aFly.x * 6.2831, bfRest);
        float bfC = cos(bfYaw); float bfS = sin(bfYaw);
        mat3 bfRot = mat3(vec3(bfC, 0.0, -bfS), vec3(0.0, 1.0, 0.0), vec3(bfS, 0.0, bfC));
        // Flügelschlag: schnell im Flug, langsames Öffnen und Schließen beim Sitzen
        float bfFlap = mix(0.25 + sin(bfT * 19.0) * 0.95, 0.7 + sin(bfT * 1.4) * 0.55, bfRest);
        float bfWing = step(0.016, abs(position.x));
        float bfA = bfFlap * sign(position.x) * bfWing;
        mat3 bfFlapM = mat3(vec3(cos(bfA), sin(bfA), 0.0), vec3(-sin(bfA), cos(bfA), 0.0), vec3(0.0, 0.0, 1.0));
        objectNormal = bfRot * (bfFlapM * objectNormal);`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        transformed = bfRot * (bfFlapM * transformed) * aFly.y + bfOff + vec3(0.0, sin(bfT * 19.0) * 0.012 * (1.0 - bfRest), 0.0);`,
      );
  };
  m.customProgramCacheKey = () => 'insel-butterfly';
  butterflyMat = m;
  return m;
}

const BUTTERFLY_COLORS = ['#ff8a1c', '#3d8bff', '#ffd23a', '#ff5fa2', '#9b6bff', '#38d0c8', '#ffffff'];

/** Alle Schmetterlinge in einem InstancedMesh, je einer kreist über einem Blumenbeet. */
export function buildButterflies(spots: THREE.Vector3[], R: () => number, flight = 1.4): THREE.InstancedMesh {
  const base = butterflyGeometry();
  const geo = new THREE.BufferGeometry();
  for (const [k, v] of Object.entries(base.attributes)) geo.setAttribute(k, v);
  geo.setIndex(base.index);
  const n = spots.length;
  const fly = new Float32Array(n * 4);
  const mesh = new THREE.InstancedMesh(geo, butterflyMaterial(), n);
  const m = new THREE.Matrix4();
  const c = new THREE.Color();
  spots.forEach((p, i) => {
    fly.set([R() * 10, 0.85 + R() * 0.35, flight * (0.7 + R() * 0.5), 0], i * 4);
    m.makeTranslation(p.x, p.y, p.z);
    mesh.setMatrixAt(i, m);
    mesh.setColorAt(i, c.set(BUTTERFLY_COLORS[Math.floor(R() * BUTTERFLY_COLORS.length)]!));
  });
  geo.setAttribute('aFly', new THREE.InstancedBufferAttribute(fly, 4));
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.computeBoundingSphere();
  mesh.boundingSphere!.radius += flight * 1.3 + 1;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.name = 'butterflies';
  return mesh;
}
