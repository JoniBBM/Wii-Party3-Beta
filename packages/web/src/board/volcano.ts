/** Vulkan: brodelnder Lavasee im Krater, Glühen, Rauch je nach Druck. */
import * as THREE from 'three';
import type { IslandLayout } from './layout.ts';
import type { Effects } from './particles.ts';

export interface VolcanoFx {
  group: THREE.Group;
  /** 0…1 – wie nahe am Ausbruch */
  setPressure: (p: number) => void;
  update: (t: number, dt: number) => void;
  erupt: () => void;
  craterTop: THREE.Vector3;
}

export function buildVolcano(layout: IslandLayout, effects: Effects, opts: { light: boolean }): VolcanoFx {
  const v = layout.volcano;
  const group = new THREE.Group();
  const lavaY = v.height - 1.95;
  const geo = new THREE.CircleGeometry(v.craterRadius * 0.82, 48);
  geo.rotateX(-Math.PI / 2);
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uHeat: { value: 0.3 } },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform float uHeat;
      varying vec2 vUv;
      float hash(vec2 p) { return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5); }
      float vnoise(vec2 p) {
        vec2 i = floor(p); vec2 f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
      }
      void main() {
        vec2 p = (vUv - 0.5) * 6.0;
        float n = vnoise(p + vec2(uTime * 0.25, uTime * 0.1)) * 0.6 + vnoise(p * 2.3 - uTime * 0.4) * 0.4;
        float cracks = smoothstep(0.42, 0.5, n) * smoothstep(0.62, 0.5, n);
        vec3 crust = vec3(0.35, 0.05, 0.02);
        vec3 hot = vec3(1.0, 0.45, 0.05);
        vec3 white = vec3(1.0, 0.9, 0.5);
        vec3 col = mix(hot, crust, smoothstep(0.35, 0.75, n) * (1.0 - uHeat * 0.6));
        col = mix(col, white, cracks * (0.4 + uHeat * 0.6));
        float pulse = 0.85 + sin(uTime * 2.0) * 0.15 * (0.5 + uHeat);
        gl_FragColor = vec4(col * (1.4 + uHeat * 1.6) * pulse, 1.0);
      }
    `,
    toneMapped: false,
  });
  const lava = new THREE.Mesh(geo, mat);
  lava.position.set(v.x, lavaY, v.z);
  group.add(lava);

  const light = new THREE.PointLight('#ff6a1a', opts.light ? 30 : 0, 22, 1.6);
  light.position.set(v.x, v.height + 1.5, v.z);
  group.add(light);

  let pressure = 0;
  let shownPressure = 0;
  let smokeAcc = 0;
  const craterTop = new THREE.Vector3(v.x, v.height - 0.6, v.z);

  return {
    group,
    craterTop,
    setPressure(p) {
      pressure = Math.max(0, Math.min(1, p));
    },
    update(t, dt) {
      shownPressure += (pressure - shownPressure) * Math.min(1, dt * 1.5);
      mat.uniforms.uTime!.value = t;
      mat.uniforms.uHeat!.value = shownPressure;
      if (opts.light) light.intensity = 18 + shownPressure * 40 + Math.sin(t * 3) * 4;
      // Rauch: Rate steigt mit dem Druck
      smokeAcc += dt * (1.2 + shownPressure * 6);
      while (smokeAcc > 1) {
        smokeAcc -= 1;
        effects.volcanoSmoke(craterTop.x, craterTop.y, craterTop.z, shownPressure);
      }
    },
    erupt() {
      effects.eruption(craterTop.x, craterTop.y + 0.5, craterTop.z);
      shownPressure = 1;
      pressure = 0;
    },
  };
}
