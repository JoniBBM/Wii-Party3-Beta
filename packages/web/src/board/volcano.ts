/**
 * Vulkan: brodelnder Lavasee im Krater, ein glühender Lavastrom an der Nordflanke mit
 * Lavateich, Glutlicht und Rauch – alles wird mit steigendem Druck heller und unruhiger.
 */
import * as THREE from 'three';
import { CRATER, lavaFlowPoints } from './ground.ts';
import type { IslandLayout } from './layout.ts';
import type { Effects } from './particles.ts';
import type { Heightfield } from './terrain.ts';
import { GLSL_NOISE } from './worldfx.ts';

export interface VolcanoFx {
  group: THREE.Group;
  /** 0…1 – wie nahe am Ausbruch */
  setPressure: (p: number) => void;
  update: (t: number, dt: number) => void;
  erupt: () => void;
  craterTop: THREE.Vector3;
}

const LAVA_FRAG = /* glsl */ `
  uniform float uTime;
  uniform float uHeat;
  uniform float uFlow;
  varying vec2 vUv;
  varying vec3 vW;
  ${GLSL_NOISE}
  void main() {
    vec2 p = vW.xz * 1.6 + vec2(0.0, -uTime * uFlow);
    float n = fxNoise(p + uTime * 0.12) * 0.6 + fxNoise(p * 2.4 - uTime * 0.3) * 0.4;
    float crust = smoothstep(0.38, 0.62, n);
    float cracks = smoothstep(0.06, 0.0, abs(fxNoise(p * 1.3 + 4.0) - 0.5));
    vec3 hot = vec3(0.95, 0.22, 0.02);
    vec3 white = vec3(1.0, 0.62, 0.18);
    vec3 dark = vec3(0.1, 0.025, 0.015);
    vec3 col = mix(hot, dark, crust * (0.92 - uHeat * 0.5));
    col = mix(col, white, cracks * (1.0 - crust) * (0.5 + uHeat * 0.5));
    // erkaltete, dunkle Ränder (nur beim Strom, uv.x quer)
    float edge = uFlow > 0.3 ? smoothstep(0.55, 1.0, abs(vUv.x - 0.5) * 2.0) : 0.0;
    col = mix(col, vec3(0.12, 0.05, 0.03), edge * 0.85);
    float pulse = 0.85 + sin(uTime * 2.0 + vW.x) * 0.15;
    gl_FragColor = vec4(col * (1.0 + uHeat * 1.6) * pulse, 1.0);
  }
`;

const LAVA_VERT = /* glsl */ `
  uniform float uTime;
  uniform float uHeat;
  uniform float uBubble;
  varying vec2 vUv;
  varying vec3 vW;
  ${GLSL_NOISE}
  void main() {
    vUv = uv;
    vec4 w = modelMatrix * vec4(position, 1.0);
    float b = fxNoise(w.xz * 1.3 + uTime * 0.6) * fxNoise(w.xz * 0.7 - uTime * 0.4);
    w.y += b * uBubble * (0.15 + uHeat * 0.35);
    vW = w.xyz;
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`;

function lavaMaterial(flow: number, bubble: number) {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uHeat: { value: 0.3 }, uFlow: { value: flow }, uBubble: { value: bubble } },
    vertexShader: LAVA_VERT,
    fragmentShader: LAVA_FRAG,
    toneMapped: false,
  });
}

export function buildVolcano(layout: IslandLayout, effects: Effects, opts: { light: boolean; field?: Heightfield }): VolcanoFx {
  const v = layout.volcano;
  const group = new THREE.Group();

  // Lavasee im Krater (mit inneren Ringen, damit er brodeln kann)
  const lakeGeo = new THREE.RingGeometry(0, CRATER.lava + 0.25, 40, 8);
  lakeGeo.rotateX(-Math.PI / 2);
  const lakeMat = lavaMaterial(0.05, 1);
  const lake = new THREE.Mesh(lakeGeo, lakeMat);
  lake.position.set(v.x, CRATER.lavaY, v.z);
  group.add(lake);
  const mats = [lakeMat];

  // Lavastrom an der Nordflanke: Band, das dem Gelände folgt, endet in einem Lavateich
  if (opts.field) {
    const field = opts.field;
    const flow = lavaFlowPoints();
    const pts = flow.map((p) => new THREE.Vector3(p.x, field.height(p.x, p.z), p.z));
    const positions: number[] = [];
    const uvs: number[] = [];
    const idx: number[] = [];
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i]!;
      const q = pts[Math.min(pts.length - 1, i + 1)]!;
      const o = pts[Math.max(0, i - 1)]!;
      const dx = q.x - o.x;
      const dz = q.z - o.z;
      const l = Math.hypot(dx, dz) || 1;
      const w = flow[i]!.w;
      for (const side of [-1, 1]) {
        const x = p.x - (dz / l) * w * side;
        const z = p.z + (dx / l) * w * side;
        positions.push(x, Math.max(field.height(x, z), field.height(p.x, p.z)) + 0.12, z);
        uvs.push(side > 0 ? 1 : 0, i / pts.length);
      }
      if (i < pts.length - 1) {
        const k = i * 2;
        idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.setIndex(idx);
    const flowMat = lavaMaterial(0.6, 0);
    flowMat.polygonOffset = true;
    flowMat.polygonOffsetFactor = -2;
    group.add(new THREE.Mesh(geo, flowMat));
    mats.push(flowMat);
    const end = pts[pts.length - 1]!;
    const poolGeo = new THREE.CircleGeometry(1.5, 28);
    poolGeo.rotateX(-Math.PI / 2);
    const poolMat = lavaMaterial(0.08, 0);
    const pool = new THREE.Mesh(poolGeo, poolMat);
    pool.position.set(end.x, end.y + 0.09, end.z);
    group.add(pool);
    mats.push(poolMat);
    const poolLight = new THREE.PointLight('#ff6a1a', opts.light ? 8 : 0, 9, 1.8);
    poolLight.position.set(end.x, end.y + 1.2, end.z);
    group.add(poolLight);
  }

  const light = new THREE.PointLight('#ff6a1a', opts.light ? 30 : 0, 22, 1.6);
  light.position.set(v.x, CRATER.lavaY + 2.5, v.z);
  group.add(light);

  let pressure = 0;
  let shownPressure = 0;
  let smokeAcc = 0;
  let flash = 0;
  const craterTop = new THREE.Vector3(v.x, CRATER.lavaY + 0.6, v.z);

  return {
    group,
    craterTop,
    setPressure(p) {
      pressure = Math.max(0, Math.min(1, p));
    },
    update(t, dt) {
      shownPressure += (pressure - shownPressure) * Math.min(1, dt * 1.5);
      flash = Math.max(0, flash - dt * 0.6);
      const heat = Math.min(1, shownPressure + flash);
      for (const m of mats) {
        m.uniforms.uTime!.value = t;
        m.uniforms.uHeat!.value = heat;
      }
      if (opts.light) light.intensity = 18 + heat * 45 + Math.sin(t * 3) * 4;
      // Rauch: Rate steigt mit dem Druck
      smokeAcc += dt * (1.2 + shownPressure * 6);
      while (smokeAcc > 1) {
        smokeAcc -= 1;
        effects.volcanoSmoke(craterTop.x, craterTop.y + 1.2, craterTop.z, shownPressure);
      }
    },
    erupt() {
      effects.eruption(craterTop.x, craterTop.y + 1.5, craterTop.z);
      flash = 1;
      shownPressure = 1;
      pressure = 0;
    },
  };
}
