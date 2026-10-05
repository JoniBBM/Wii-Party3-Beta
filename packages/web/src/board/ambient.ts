/**
 * Kleine Dauer-Effekte als je ein einziger Draw-Call: Flammen (Fackeln, Lagerfeuer),
 * Rauch und Dampf (Feuer, Fumarolen am Vulkan). Partikel werden im Shader aus Zeit
 * und Zufallswert berechnet – kein Aufwand pro Bild auf der CPU.
 */
import * as THREE from 'three';

export interface Emitter {
  x: number;
  y: number;
  z: number;
  /** Partikel für diesen Emitter */
  count: number;
  /** Größe in Metern */
  size: number;
  /** Aufstiegshöhe über die Lebensdauer */
  rise: number;
  /** seitliche Streuung */
  spread: number;
  /** Lebensdauer in Sekunden */
  life: number;
}

const VERT = /* glsl */ `
  attribute vec3 origin;
  attribute vec4 seed;
  attribute vec4 cfg; // size, rise, spread, life
  uniform float uTime;
  uniform float uScale;
  uniform vec2 uWind;
  varying float vLife;
  varying float vSeed;
  void main() {
    float life = fract(seed.x + uTime / cfg.w);
    vLife = life;
    vSeed = seed.y;
    float a = seed.z * 6.2831;
    float r = cfg.z * (0.3 + life) * seed.w;
    vec3 p = origin + vec3(cos(a) * r, life * cfg.y, sin(a) * r);
    p.xz += uWind * life * life * cfg.y;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_PointSize = cfg.x * SIZE_CURVE * uScale / -mv.z;
    gl_Position = projectionMatrix * mv;
  }
`;

function system(emitters: Emitter[], opts: { additive: boolean; sizeCurve: string; frag: string; renderOrder: number }) {
  const total = emitters.reduce((n, e) => n + e.count, 0);
  const origin = new Float32Array(total * 3);
  const seed = new Float32Array(total * 4);
  const cfg = new Float32Array(total * 4);
  let k = 0;
  for (const e of emitters) {
    for (let i = 0; i < e.count; i++, k++) {
      origin.set([e.x, e.y, e.z], k * 3);
      seed.set([i / e.count + Math.random() * 0.15, Math.random(), Math.random(), 0.4 + Math.random() * 0.6], k * 4);
      cfg.set([e.size, e.rise, e.spread, e.life], k * 4);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(total * 3), 3));
  geo.setAttribute('origin', new THREE.BufferAttribute(origin, 3));
  geo.setAttribute('seed', new THREE.BufferAttribute(seed, 4));
  geo.setAttribute('cfg', new THREE.BufferAttribute(cfg, 4));
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: opts.additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    uniforms: { uTime: { value: 0 }, uScale: { value: 800 }, uWind: { value: new THREE.Vector2(0.35, 0.15) } },
    vertexShader: VERT.replace('SIZE_CURVE', opts.sizeCurve),
    fragmentShader: opts.frag,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  points.renderOrder = opts.renderOrder;
  return { points, mat };
}

export interface Ambient {
  group: THREE.Group;
  update: (t: number) => void;
  setScale: (pxPerUnit: number) => void;
  dispose: () => void;
}

export function createAmbient(fires: Emitter[], smokes: Emitter[]): Ambient {
  const group = new THREE.Group();
  group.name = 'ambient';
  const parts: { points: THREE.Points; mat: THREE.ShaderMaterial }[] = [];
  if (fires.length) {
    const f = system(fires, {
      additive: true,
      sizeCurve: '(1.0 - vLife * 0.75)',
      renderOrder: 7,
      frag: /* glsl */ `
        varying float vLife;
        varying float vSeed;
        void main() {
          vec2 c = gl_PointCoord - 0.5;
          float d = length(c * vec2(1.0, 0.8));
          float a = smoothstep(0.5, 0.0, d) * (1.0 - vLife);
          vec3 col = mix(vec3(1.0, 0.85, 0.35), vec3(1.0, 0.3, 0.05), vLife + vSeed * 0.2);
          gl_FragColor = vec4(col * 1.6 * a, a);
        }
      `,
    });
    parts.push(f);
    group.add(f.points);
  }
  if (smokes.length) {
    const s = system(smokes, {
      additive: false,
      sizeCurve: '(0.35 + vLife * 1.1)',
      renderOrder: 6,
      frag: /* glsl */ `
        varying float vLife;
        varying float vSeed;
        void main() {
          float d = length(gl_PointCoord - 0.5);
          float a = smoothstep(0.5, 0.1, d) * sin(vLife * 3.1416) * 0.42;
          vec3 col = mix(vec3(0.96), vec3(0.78, 0.8, 0.84), vSeed);
          gl_FragColor = vec4(col, a);
          #include <colorspace_fragment>
        }
      `,
    });
    parts.push(s);
    group.add(s.points);
  }
  return {
    group,
    update(t) {
      for (const p of parts) p.mat.uniforms.uTime!.value = t;
    },
    setScale(px) {
      for (const p of parts) p.mat.uniforms.uScale!.value = px;
    },
    dispose() {
      for (const p of parts) {
        p.points.geometry.dispose();
        p.mat.dispose();
      }
    },
  };
}
