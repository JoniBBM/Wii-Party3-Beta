/**
 * Wasser: Meer mit Wellen, durchsichtigem Flachwasser (man sieht Sand, Seegras und Lichtnetze),
 * Brandung und Schaumlinien, Sonnenglitzern; der Fluss als fließendes Band mit Stromschnellen;
 * der Wasserfall als stürzender Vorhang mit Gischt.
 */
import * as THREE from 'three';
import { RIVER, RIVER_LIP, RIVER_POOL } from '@insel/shared';
import { riverLevelAt, type FordBasin } from './layout.ts';
import { TERRAIN_SIZE } from './terrain.ts';
import { fx, GLSL_FX, GLSL_NOISE } from './worldfx.ts';

const OCEAN_VERTEX = /* glsl */ `
  uniform float uTime;
  uniform sampler2D uHeight;
  uniform float uTerrainSize;
  varying vec3 vWorld;
  varying vec3 vNormalW;
  varying float vWave;

  vec3 gerstner(vec2 dir, float steep, float len, float speed, vec3 p, inout vec3 tangent, inout vec3 binormal) {
    float k = 6.28318 / len;
    float c = sqrt(9.8 / k) * speed;
    vec2 d = normalize(dir);
    float f = k * (dot(d, p.xz) - c * uTime);
    float a = steep / k;
    tangent += vec3(-d.x * d.x * steep * sin(f), d.x * steep * cos(f), -d.x * d.y * steep * sin(f));
    binormal += vec3(-d.x * d.y * steep * sin(f), d.y * steep * cos(f), -d.y * d.y * steep * sin(f));
    return vec3(d.x * a * cos(f), a * sin(f), d.y * a * cos(f));
  }

  float groundAt(vec2 xz) {
    vec2 uv = xz / uTerrainSize + 0.5;
    vec2 e = min(uv, 1.0 - uv);
    float inside = smoothstep(0.0, 0.1, min(e.x, e.y));
    return mix(-9.0, texture2D(uHeight, clamp(uv, 0.0, 1.0)).r, inside);
  }

  void main() {
    vec3 p = (modelMatrix * vec4(position, 1.0)).xyz;
    float depth = max(0.0, -groundAt(p.xz));
    // Im flachen Wasser (Lagune, Strand) kaum Wellen
    float calm = smoothstep(0.4, 5.0, depth);
    float steepK = mix(0.25, 1.0, calm);
    vec3 tangent = vec3(1.0, 0.0, 0.0);
    vec3 binormal = vec3(0.0, 0.0, 1.0);
    vec3 offset = vec3(0.0);
    offset += gerstner(vec2(1.0, 0.6), 0.1 * steepK, 17.0, 0.5, p, tangent, binormal);
    offset += gerstner(vec2(-0.4, 1.0), 0.08 * steepK, 11.0, 0.55, p, tangent, binormal);
    offset += gerstner(vec2(0.7, -0.9), 0.06 * steepK, 7.0, 0.65, p, tangent, binormal);
    offset *= mix(0.15, 1.0, calm);
    p += offset;
    vWave = offset.y;
    vNormalW = normalize(cross(binormal, tangent));
    vWorld = p;
    gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
  }
`;

const OCEAN_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform sampler2D uHeight;
  uniform float uTerrainSize;
  uniform vec3 uShallow;
  uniform vec3 uMid;
  uniform vec3 uDeep;
  uniform vec3 uFar;
  uniform vec3 uSky;
  uniform vec3 uSunDir;
  uniform vec3 uSunColor;
  uniform vec3 uFogColor;
  uniform float uFogNear;
  uniform float uFogFar;
  uniform float uUltra;
  uniform sampler2D uWaterNormal;
  varying vec3 vWorld;
  varying vec3 vNormalW;
  varying float vWave;
  ${GLSL_NOISE}
  ${GLSL_FX}

  float groundAt(vec2 xz) {
    vec2 uv = xz / uTerrainSize + 0.5;
    vec2 e = min(uv, 1.0 - uv);
    float inside = smoothstep(0.0, 0.1, min(e.x, e.y));
    return mix(-9.0, texture2D(uHeight, clamp(uv, 0.0, 1.0)).r, inside);
  }

  void main() {
    float depth = max(0.0, vWorld.y - groundAt(vWorld.xz));

    // Farbe nach Tiefe: Lagunentürkis → Blau → Tiefblau
    vec3 col = mix(uShallow, uMid, smoothstep(0.3, 2.2, depth));
    col = mix(col, uDeep, smoothstep(2.2, 7.0, depth));
    col = mix(col, uFar, smoothstep(8.0, 14.0, depth));

    // feine Kräuselung
    vec2 q = vWorld.xz * 0.5;
    float r1 = fxNoise(q + uTime * vec2(0.32, 0.18));
    float r2 = fxNoise(q * 2.3 - uTime * vec2(0.22, 0.41));
    float ripple = r1 * 0.55 + r2 * 0.45;
    vec3 n = normalize(vNormalW + vec3(ripple - 0.5, 0.0, fxNoise(q * 1.7 + 3.0 + uTime * 0.3) - 0.5) * 0.22);
    if (uUltra > 0.5) {
      // Ultra: echte Wellen-Normalen in zwei Größen, gegeneinander ziehend
      vec3 a = texture2D(uWaterNormal, vWorld.xz * 0.045 + uTime * vec2(0.012, 0.007)).rgb * 2.0 - 1.0;
      vec3 b = texture2D(uWaterNormal, vWorld.xz * 0.13 - uTime * vec2(0.009, 0.016)).rgb * 2.0 - 1.0;
      vec3 c = texture2D(uWaterNormal, vWorld.xz * 0.38 + uTime * vec2(0.021, -0.013)).rgb * 2.0 - 1.0;
      vec2 d = (a.xy * 0.5 + b.xy * 0.35 + c.xy * 0.2) * mix(0.35, 1.0, smoothstep(0.2, 2.5, depth));
      n = normalize(vNormalW + vec3(d.x, 0.0, d.y) * 0.9);
    }

    vec3 view = normalize(cameraPosition - vWorld);
    float fresnel = pow(1.0 - max(dot(n, view), 0.0), 4.0);
    col = mix(col, uSky, fresnel * 0.6);

    // Wolkenschatten auf dem Wasser
    float shade = fxCloudShade(vWorld.xz);
    col *= mix(0.82, 1.0, shade);

    // Sonnenglanz + Glitzern
    vec3 h = normalize(uSunDir + view);
    float spec = pow(max(dot(n, h), 0.0), 260.0);
    if (uUltra > 0.5) {
      // Wellenkämme heller und grüner (Licht scheint durch), breiterer Sonnenpfad
      col = mix(col, uShallow * 1.15, smoothstep(0.02, 0.16, vWave) * 0.35 * smoothstep(1.0, 4.0, depth));
      spec = spec * 1.4 + pow(max(dot(n, h), 0.0), 40.0) * 0.12;
    }
    float glint = step(0.985, fxNoise(vWorld.xz * 6.0 + uTime * 1.7)) * pow(max(dot(n, h), 0.0), 18.0);
    col += uSunColor * (spec * 1.8 + glint * 2.4) * shade;

    // Schaum: Wasserlinie, rollende Brandungslinien (nur wo der Grund ansteigt), seltene Schaumkronen
    float rise = 0.0;
    if (depth < 1.4) {
      float gx = groundAt(vWorld.xz + vec2(0.6, 0.0)) - groundAt(vWorld.xz - vec2(0.6, 0.0));
      float gz = groundAt(vWorld.xz + vec2(0.0, 0.6)) - groundAt(vWorld.xz - vec2(0.0, 0.6));
      rise = smoothstep(0.04, 0.22, length(vec2(gx, gz)));
    }
    float edge = 1.0 - smoothstep(0.0, 0.16, depth);
    float shore = (1.0 - smoothstep(0.05, 1.3, depth)) * rise;
    float bands = sin(depth * 7.5 - uTime * 1.9 + ripple * 2.5) * 0.5 + 0.5;
    float foamNoise = fxNoise(vWorld.xz * 1.8 + uTime * 0.2);
    float foam = shore * smoothstep(0.62, 0.95, bands) * smoothstep(0.25, 0.7, foamNoise);
    foam = max(foam, edge * (0.65 + 0.35 * foamNoise));

    col = mix(col, vec3(1.0), clamp(foam, 0.0, 1.0) * 0.88);

    // Durchsicht im flachen Wasser
    float alpha = mix(0.5, 0.97, smoothstep(0.05, 3.2, depth));
    alpha = max(alpha, fresnel * 0.9);
    alpha = max(alpha, foam * 0.95);

    // Dunst zum Horizont
    float dist = length(cameraPosition - vWorld);
    float fog = smoothstep(uFogNear, uFogFar, dist);
    col = mix(col, uFogColor, fog);
    alpha = mix(alpha, 1.0, fog);

    gl_FragColor = vec4(col, alpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

const FLAT_NORMAL = new THREE.DataTexture(new Uint8Array([128, 128, 255, 255]), 1, 1);
FLAT_NORMAL.needsUpdate = true;

export interface Water {
  mesh: THREE.Mesh;
  update: (t: number) => void;
  setSun: (dir: THREE.Vector3, color: THREE.Color) => void;
  /** Ultra-Grafik: echte Wellen-Normalen (null = aus) */
  setUltra: (normal: THREE.Texture | null) => void;
  dispose: () => void;
}

export function createWater(heightTex: THREE.Texture, opts: { segments: number; fog: THREE.Color; fogNear: number; fogFar: number }): Water {
  // Fein unterteilt nur im Inselbereich wäre schöner; ein Raster genügt bei dieser Auflösung
  // Raster zur Mitte hin verdichtet: feine Wellen an der Insel, grob am Horizont
  const geo = new THREE.PlaneGeometry(2, 2, opts.segments, opts.segments);
  const gp = geo.attributes.position as THREE.BufferAttribute;
  const warp = (u: number) => Math.sign(u) * (0.12 * Math.abs(u) + 0.88 * u * u) * 560;
  for (let i = 0; i < gp.count; i++) gp.setXY(i, warp(gp.getX(i)), warp(gp.getY(i)));
  geo.rotateX(-Math.PI / 2);
  geo.computeBoundingSphere();
  const material = new THREE.ShaderMaterial({
    vertexShader: OCEAN_VERTEX,
    fragmentShader: OCEAN_FRAGMENT,
    transparent: true,
    uniforms: {
      uTime: { value: 0 },
      uHeight: { value: heightTex },
      uTerrainSize: { value: TERRAIN_SIZE },
      uShallow: { value: new THREE.Color('#3fe3d2') },
      uMid: { value: new THREE.Color('#25c3d6') },
      uDeep: { value: new THREE.Color('#1688cc') },
      uFar: { value: new THREE.Color('#145fae') },
      uSky: { value: new THREE.Color('#c6e9ff') },
      uSunDir: { value: new THREE.Vector3(0.5, 0.7, 0.3).normalize() },
      uSunColor: { value: new THREE.Color('#fff2d6') },
      uFogColor: { value: opts.fog.clone() },
      uFogNear: { value: opts.fogNear },
      uFogFar: { value: opts.fogFar },
      uUltra: { value: 0 },
      uWaterNormal: { value: FLAT_NORMAL },
      uFxTime: fx.uTime,
      uFxCloud: fx.uCloud,
      uFxDrift: fx.uCloudDrift,
    },
  });
  const mesh = new THREE.Mesh(geo, material);
  mesh.renderOrder = 1;
  mesh.name = 'water';
  return {
    mesh,
    update(t) {
      material.uniforms.uTime!.value = t;
    },
    setSun(dir, color) {
      (material.uniforms.uSunDir!.value as THREE.Vector3).copy(dir).normalize();
      (material.uniforms.uSunColor!.value as THREE.Color).copy(color);
    },
    setUltra(normal) {
      material.uniforms.uUltra!.value = normal ? 1 : 0;
      material.uniforms.uWaterNormal!.value = normal ?? FLAT_NORMAL;
    },
    dispose() {
      geo.dispose();
      material.dispose();
    },
  };
}

// ---------------------------------------------------------------------------
// Fluss
// ---------------------------------------------------------------------------
const RIVER_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform sampler2D uHeight;
  uniform float uTerrainSize;
  uniform vec3 uSunDir;
  varying vec2 vUv;
  varying vec3 vWorld;
  varying float vSlope;
  ${GLSL_NOISE}
  ${GLSL_FX}

  void main() {
    vec2 tuv = vWorld.xz / uTerrainSize + 0.5;
    float ground = texture2D(uHeight, tuv).r;
    float depth = vWorld.y - ground;
    if (depth < -0.02) discard;
    float speed = 0.9 + vSlope * 9.0;
    // Strömung: Rauschen, das flussabwärts gezogen wird
    vec2 fuv = vec2(vUv.x * 3.0, vUv.y * 0.9 - uTime * speed);
    float flow = fxNoise(fuv) * 0.6 + fxNoise(fuv * 2.7 + 3.1) * 0.4;
    float streak = smoothstep(0.62, 0.86, fxNoise(vec2(vUv.x * 9.0, vUv.y * 2.2 - uTime * speed * 1.4)));
    vec3 shallow = vec3(0.42, 0.86, 0.80);
    vec3 deep = vec3(0.07, 0.48, 0.62);
    vec3 col = mix(shallow, deep, smoothstep(0.05, 0.9, depth));
    col = mix(col, col * 1.18, flow);
    // Stromschnellen + Ufer schäumen
    float rapids = smoothstep(0.02, 0.09, vSlope);
    float bank = 1.0 - smoothstep(0.0, 0.08, depth);
    float foam = max(streak * (0.2 + rapids * 0.7), bank * (0.3 + 0.4 * flow));
    foam = max(foam, rapids * smoothstep(0.4, 0.8, flow));
    col = mix(col, vec3(0.97, 1.0, 1.0), clamp(foam, 0.0, 1.0) * 0.85);
    // Wolkenschatten + etwas Himmelsglanz
    col *= mix(0.84, 1.0, fxCloudShade(vWorld.xz));
    vec3 view = normalize(cameraPosition - vWorld);
    float fres = pow(1.0 - max(view.y, 0.0), 3.0);
    col = mix(col, vec3(0.8, 0.92, 1.0), fres * 0.35);
    float alpha = mix(0.45, 0.94, smoothstep(0.02, 0.7, depth));
    alpha = max(alpha, foam * 0.9);
    gl_FragColor = vec4(col, alpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

const RIVER_VERTEX = /* glsl */ `
  attribute float slope;
  varying vec2 vUv;
  varying vec3 vWorld;
  varying float vSlope;
  void main() {
    vUv = uv;
    vSlope = slope;
    vec4 w = modelMatrix * vec4(position, 1.0);
    vWorld = w.xyz;
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`;

interface RiverSample {
  x: number;
  z: number;
  y: number;
  w: number;
  slope: number;
}

/** Fluss-Mittellinie dicht abgetastet (mit Wasserspiegel und Gefälle), ohne den Fall selbst. */
function sampleRiver(from: number, to: number): RiverSample[] {
  const out: RiverSample[] = [];
  for (let i = from; i < to; i++) {
    const a = RIVER[i]!;
    const b = RIVER[i + 1]!;
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    const steps = Math.max(2, Math.ceil(len / 0.35));
    for (let k = 0; k < steps; k++) {
      const f = k / steps;
      const p0 = RIVER[Math.max(0, i - 1)]!;
      const p3 = RIVER[Math.min(RIVER.length - 1, i + 2)]!;
      const cr = (q0: number, q1: number, q2: number, q3: number) => {
        const t2 = f * f;
        const t3 = t2 * f;
        return 0.5 * (2 * q1 + (-q0 + q2) * f + (2 * q0 - 5 * q1 + 4 * q2 - q3) * t2 + (-q0 + 3 * q1 - 3 * q2 + q3) * t3);
      };
      out.push({ x: cr(p0.x, a.x, b.x, p3.x), z: cr(p0.z, a.z, b.z, p3.z), y: riverLevelAt(i, f), w: a.w + (b.w - a.w) * f, slope: Math.max(0, (a.y - b.y) / len) });
    }
  }
  const last = RIVER[to]!;
  out.push({ x: last.x, z: last.z, y: last.y, w: last.w, slope: 0 });
  return out;
}

function riverRibbon(samples: RiverSample[], material: THREE.ShaderMaterial): THREE.Mesh {
  const positions: number[] = [];
  const uvs: number[] = [];
  const slopes: number[] = [];
  const indices: number[] = [];
  let v = 0;
  for (let i = 0; i < samples.length; i++) {
    const p = samples[i]!;
    const a = samples[Math.max(0, i - 1)]!;
    const b = samples[Math.min(samples.length - 1, i + 1)]!;
    const tx = b.x - a.x;
    const tz = b.z - a.z;
    const l = Math.hypot(tx, tz) || 1;
    const sx = -tz / l;
    const sz = tx / l;
    const w = p.w + 0.7;
    if (i > 0) v += Math.hypot(p.x - samples[i - 1]!.x, p.z - samples[i - 1]!.z);
    positions.push(p.x + sx * w, p.y + 0.02, p.z + sz * w, p.x - sx * w, p.y + 0.02, p.z - sz * w);
    uvs.push(0, v, 1, v);
    slopes.push(p.slope, p.slope);
    if (i < samples.length - 1) {
      const k = i * 2;
      indices.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setAttribute('slope', new THREE.Float32BufferAttribute(slopes, 1));
  geo.setIndex(indices);
  const mesh = new THREE.Mesh(geo, material);
  mesh.renderOrder = 2;
  return mesh;
}

export interface RiverFx {
  group: THREE.Group;
  update: (t: number, dt: number) => void;
  dispose: () => void;
  /** Fußpunkt des Wasserfalls (für Gischt/Geräusch) */
  fallBase: THREE.Vector3;
}

export function createRiver(heightTex: THREE.Texture, opts: { mist: boolean; creek?: { x: number; y: number; z: number; w: number }[]; basin?: FordBasin | null }): RiverFx {
  const group = new THREE.Group();
  group.name = 'river';
  const material = new THREE.ShaderMaterial({
    vertexShader: RIVER_VERTEX,
    fragmentShader: RIVER_FRAGMENT,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    uniforms: {
      uTime: { value: 0 },
      uHeight: { value: heightTex },
      uTerrainSize: { value: TERRAIN_SIZE },
      uSunDir: { value: new THREE.Vector3(0.5, 0.7, 0.3).normalize() },
      uFxTime: fx.uTime,
      uFxCloud: fx.uCloud,
      uFxDrift: fx.uCloudDrift,
    },
  });
  // Oberlauf (Quelle → Kante) und Unterlauf (Becken → Mündung)
  const upper = sampleRiver(0, RIVER_LIP).filter((p) => p.y > 0);
  group.add(riverRibbon(upper, material));
  // Unterlauf; an der Furt gerade und breit (Becken für Fässer und Kisten)
  const lower = sampleRiver(RIVER_POOL, RIVER.length - 1).filter((p) => p.y > 0.14);
  const bn = opts.basin;
  if (bn) {
    for (const p of lower) {
      const dx = p.x - bn.x;
      const dz = p.z - bn.z;
      const u = dx * bn.along.x + dz * bn.along.z;
      const v = dx * bn.across.x + dz * bn.across.z;
      const k = Math.max(0, Math.min(1, (bn.halfAlong + 2.2 - Math.abs(u)) / 2.2));
      if (k <= 0) continue;
      const e = k * k * (3 - 2 * k);
      // Mittellinie auf die Beckenachse ziehen, Breite bis an den Beckenrand
      p.x -= bn.across.x * v * e;
      p.z -= bn.across.z * v * e;
      p.w = p.w + (Math.max(p.w, bn.halfAcross - 0.45) - p.w) * e;
      p.y = p.y + (bn.y - p.y) * e;
      p.slope *= 1 - e * 0.8;
    }
  }
  group.add(riverRibbon(lower, material));
  // Bach hinter der Liane (schmal, mit Gefälle → schnellere Strömung im Shader)
  const creek = opts.creek ?? [];
  if (creek.length > 2) {
    const samples: RiverSample[] = creek.map((p, i) => {
      const q = creek[Math.min(creek.length - 1, i + 1)]!;
      const len = Math.hypot(q.x - p.x, q.z - p.z) || 1;
      return { x: p.x, z: p.z, y: p.y, w: Math.max(0.05, p.w - 0.5), slope: Math.min(0.6, Math.max(0, (p.y - q.y) / len) * 2 + 0.05) };
    });
    group.add(riverRibbon(samples, material));
  }

  // Wasserfall: Vorhang von der Kante ins Becken
  const lip = RIVER[RIVER_LIP]!;
  const poolP = RIVER[RIVER_POOL]!;
  const len = Math.hypot(poolP.x - lip.x, poolP.z - lip.z);
  const fall = 1 - (poolP.w * 0.92) / len;
  const dir = new THREE.Vector3(poolP.x - lip.x, 0, poolP.z - lip.z).normalize();
  const side = new THREE.Vector3(-dir.z, 0, dir.x);
  const top = new THREE.Vector3(lip.x + (poolP.x - lip.x) * fall, lip.y + 0.03, lip.z + (poolP.z - lip.z) * fall);
  const drop = lip.y - poolP.y;
  const width = 1.9;
  const fallGeo = new THREE.PlaneGeometry(1, 1, 10, 28);
  const fp = fallGeo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < fp.count; i++) {
    const u = fp.getX(i); // −0.5 … 0.5
    const vv = 0.5 - fp.getY(i); // 0 oben … 1 unten
    const out = 0.25 + Math.sqrt(vv) * 0.75 + Math.sin(u * 9 + vv * 4) * 0.04;
    const w = width * (1 + vv * 0.25);
    fp.setXYZ(i, top.x + side.x * u * w + dir.x * out, top.y - vv * drop, top.z + side.z * u * w + dir.z * out);
  }
  fallGeo.computeVertexNormals();
  const fallMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    uniforms: { uTime: { value: 0 } },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      varying vec2 vUv;
      ${GLSL_NOISE}
      void main() {
        float y = 1.0 - vUv.y;
        float streak = fxNoise(vec2(vUv.x * 14.0, y * 3.0 - uTime * 3.2)) * 0.6 + fxNoise(vec2(vUv.x * 31.0, y * 6.0 - uTime * 4.4)) * 0.4;
        vec3 col = mix(vec3(0.55, 0.85, 0.92), vec3(1.0), smoothstep(0.35, 0.8, streak) * 0.85 + y * 0.25);
        float edge = smoothstep(0.0, 0.14, vUv.x) * smoothstep(1.0, 0.86, vUv.x);
        float a = (0.62 + streak * 0.38) * edge * smoothstep(0.0, 0.04, vUv.y);
        gl_FragColor = vec4(col * 1.1, a);
        #include <colorspace_fragment>
      }
    `,
  });
  const fallMesh = new THREE.Mesh(fallGeo, fallMat);
  fallMesh.renderOrder = 3;
  group.add(fallMesh);
  const fallBase = new THREE.Vector3(top.x + dir.x * 1.0, poolP.y, top.z + dir.z * 1.0);

  // Schaumteppich am Fuß des Wasserfalls
  const foamGeo = new THREE.CircleGeometry(1.7, 40);
  foamGeo.rotateX(-Math.PI / 2);
  const foamMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: { uTime: { value: 0 } },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      varying vec2 vUv;
      ${GLSL_NOISE}
      void main() {
        vec2 c = vUv - 0.5;
        float r = length(c) * 2.0;
        float n = fxNoise(c * 9.0 + vec2(0.0, -uTime * 1.5)) * 0.5 + fxNoise(c * 17.0 - uTime * 0.8) * 0.5;
        float a = smoothstep(1.0, 0.2, r) * smoothstep(0.3, 0.7, n + (1.0 - r) * 0.4);
        gl_FragColor = vec4(vec3(1.0), a * 0.9);
        #include <colorspace_fragment>
      }
    `,
  });
  const foam = new THREE.Mesh(foamGeo, foamMat);
  foam.position.set(fallBase.x, poolP.y + 0.05, fallBase.z);
  foam.renderOrder = 4;
  group.add(foam);

  // Gischt: aufsteigende, verwehende Tröpfchen
  const MIST = opts.mist ? 160 : 60;
  const mistGeo = new THREE.BufferGeometry();
  const seeds = new Float32Array(MIST * 4);
  for (let i = 0; i < MIST; i++) {
    seeds[i * 4] = Math.random();
    seeds[i * 4 + 1] = Math.random();
    seeds[i * 4 + 2] = Math.random();
    seeds[i * 4 + 3] = Math.random();
  }
  mistGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MIST * 3), 3));
  mistGeo.setAttribute('seed', new THREE.BufferAttribute(seeds, 4));
  mistGeo.boundingSphere = new THREE.Sphere(fallBase.clone(), 8);
  const mistMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: { uTime: { value: 0 }, uBase: { value: fallBase }, uScale: { value: 600 } },
    vertexShader: /* glsl */ `
      attribute vec4 seed;
      uniform float uTime;
      uniform vec3 uBase;
      uniform float uScale;
      varying float vA;
      void main() {
        float life = fract(seed.x + uTime * (0.18 + seed.y * 0.12));
        float a = seed.z * 6.2831;
        float r = 0.3 + life * (1.2 + seed.w * 1.6);
        vec3 p = uBase + vec3(cos(a) * r, life * (1.0 + seed.y * 2.6) - 0.1, sin(a) * r);
        vA = sin(life * 3.1416) * (0.35 + seed.w * 0.4);
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_PointSize = (0.6 + seed.y * 1.2) * (0.6 + life) * uScale / -mv.z;
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      varying float vA;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        float a = smoothstep(0.5, 0.0, d) * vA;
        gl_FragColor = vec4(vec3(1.0), a * 0.55);
        #include <colorspace_fragment>
      }
    `,
  });
  const mist = new THREE.Points(mistGeo, mistMat);
  mist.frustumCulled = false;
  mist.renderOrder = 5;
  group.add(mist);

  return {
    group,
    fallBase,
    update(t) {
      material.uniforms.uTime!.value = t;
      fallMat.uniforms.uTime!.value = t;
      foamMat.uniforms.uTime!.value = t;
      mistMat.uniforms.uTime!.value = t;
    },
    dispose() {
      group.traverse((o) => {
        const m = o as THREE.Mesh;
        m.geometry?.dispose();
        (m.material as THREE.Material | undefined)?.dispose();
      });
    },
  };
}
