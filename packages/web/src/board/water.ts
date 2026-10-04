/**
 * Stilisiertes Meer: Wellen im Vertex-Shader, Farbe nach Wassertiefe (Türkis → Tiefblau),
 * Schaumlinien an der Küste, Glanz der Sonne und Fresnel-Spiegelung des Himmels.
 */
import * as THREE from 'three';
import { TERRAIN_SIZE } from './terrain.ts';

const vertex = /* glsl */ `
  uniform float uTime;
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

  void main() {
    vec3 p = (modelMatrix * vec4(position, 1.0)).xyz;
    vec3 tangent = vec3(1.0, 0.0, 0.0);
    vec3 binormal = vec3(0.0, 0.0, 1.0);
    vec3 offset = vec3(0.0);
    offset += gerstner(vec2(1.0, 0.6), 0.09, 14.0, 0.55, p, tangent, binormal);
    offset += gerstner(vec2(-0.4, 1.0), 0.07, 9.0, 0.6, p, tangent, binormal);
    offset += gerstner(vec2(0.7, -0.9), 0.05, 5.5, 0.7, p, tangent, binormal);
    offset += gerstner(vec2(-1.0, -0.2), 0.04, 3.2, 0.8, p, tangent, binormal);
    // Nahe der Insel flacher (Brandung über Schaum, nicht über Wellenhöhe)
    float fade = smoothstep(18.0, 40.0, length(p.xz));
    offset *= mix(0.35, 1.0, fade);
    p += offset;
    vWave = offset.y;
    vNormalW = normalize(cross(binormal, tangent));
    vWorld = p;
    gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
  }
`;

const fragment = /* glsl */ `
  uniform float uTime;
  uniform sampler2D uHeight;
  uniform float uTerrainSize;
  uniform vec3 uShallow;
  uniform vec3 uDeep;
  uniform vec3 uFar;
  uniform vec3 uSky;
  uniform vec3 uSunDir;
  uniform vec3 uSunColor;
  uniform vec3 uFogColor;
  uniform float uFogNear;
  uniform float uFogFar;
  varying vec3 vWorld;
  varying vec3 vNormalW;
  varying float vWave;

  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float vnoise(vec2 p) {
    vec2 i = floor(p); vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
  }

  void main() {
    vec2 uv = vWorld.xz / uTerrainSize + 0.5;
    // weicher Übergang am Rand der Geländefläche (kein sichtbares Quadrat)
    vec2 edge = min(uv, 1.0 - uv);
    float inside = smoothstep(0.0, 0.12, min(edge.x, edge.y));
    float ground = mix(-9.0, texture2D(uHeight, clamp(uv, 0.0, 1.0)).r, inside);
    float depth = clamp(vWorld.y - ground, 0.0, 12.0);

    // Farbe nach Tiefe
    vec3 col = mix(uShallow, uDeep, smoothstep(0.2, 4.5, depth));
    col = mix(col, uFar, smoothstep(5.0, 11.0, depth));

    // feine Kräuselung
    vec2 q = vWorld.xz * 0.45;
    float ripple = vnoise(q + uTime * 0.35) * 0.5 + vnoise(q * 2.3 - uTime * 0.5) * 0.5;
    vec3 n = normalize(vNormalW + vec3(ripple - 0.5, 0.0, vnoise(q * 1.7 + 3.0 + uTime * 0.3) - 0.5) * 0.18);

    vec3 view = normalize(cameraPosition - vWorld);
    float fresnel = pow(1.0 - max(dot(n, view), 0.0), 4.0);
    col = mix(col, uSky, fresnel * 0.55);

    // Sonnenglanz
    vec3 h = normalize(uSunDir + view);
    float spec = pow(max(dot(n, h), 0.0), 220.0);
    col += uSunColor * spec * 1.6;

    // Schaum an der Küste: pulsierende Linien
    float shore = 1.0 - smoothstep(0.0, 0.9, depth);
    float bands = sin(depth * 9.0 - uTime * 2.2 + ripple * 3.0) * 0.5 + 0.5;
    float foam = shore * smoothstep(0.55, 0.95, bands + ripple * 0.35);
    foam = max(foam, (1.0 - smoothstep(0.0, 0.18, depth)) * 0.95);
    // Schaumkronen auf hohen Wellen
    foam = max(foam, smoothstep(0.16, 0.28, vWave) * ripple * 0.6);
    col = mix(col, vec3(1.0), clamp(foam, 0.0, 1.0) * 0.9);

    // Nebel zur Horizontlinie
    float dist = length(cameraPosition - vWorld);
    col = mix(col, uFogColor, smoothstep(uFogNear, uFogFar, dist));

    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

export interface Water {
  mesh: THREE.Mesh;
  update: (t: number) => void;
  setSun: (dir: THREE.Vector3, color: THREE.Color) => void;
  dispose: () => void;
}

export function createWater(heightTex: THREE.Texture, opts: { segments: number; fog: THREE.Color; fogNear: number; fogFar: number }): Water {
  const geo = new THREE.PlaneGeometry(420, 420, opts.segments, opts.segments);
  geo.rotateX(-Math.PI / 2);
  const material = new THREE.ShaderMaterial({
    vertexShader: vertex,
    fragmentShader: fragment,
    uniforms: {
      uTime: { value: 0 },
      uHeight: { value: heightTex },
      uTerrainSize: { value: TERRAIN_SIZE },
      uShallow: { value: new THREE.Color('#5fe0d8') },
      uDeep: { value: new THREE.Color('#1f9ccf') },
      uFar: { value: new THREE.Color('#1b6fb5') },
      uSky: { value: new THREE.Color('#bfe6ff') },
      uSunDir: { value: new THREE.Vector3(0.5, 0.7, 0.3).normalize() },
      uSunColor: { value: new THREE.Color('#fff2d6') },
      uFogColor: { value: opts.fog.clone() },
      uFogNear: { value: opts.fogNear },
      uFogFar: { value: opts.fogFar },
    },
  });
  const mesh = new THREE.Mesh(geo, material);
  mesh.position.y = 0;
  mesh.receiveShadow = false;
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
    dispose() {
      geo.dispose();
      material.dispose();
    },
  };
}

/** Fluss als Band mit fließendem Wasser. */
export function createRiver(points: { x: number; z: number }[], levelAt: (t: number) => number, widthAt: (t: number) => number): THREE.Mesh {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(p.x, 0, p.z)));
  const segs = 80;
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const p = curve.getPointAt(t);
    const tan = curve.getTangentAt(t);
    const side = new THREE.Vector3(-tan.z, 0, tan.x).normalize();
    const w = widthAt(t) + 0.35;
    const y = levelAt(t);
    positions.push(p.x + side.x * w, y, p.z + side.z * w, p.x - side.x * w, y, p.z - side.z * w);
    uvs.push(0, t * 12, 1, t * 12);
    if (i < segs) {
      const a = i * 2;
      indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  const material = new THREE.ShaderMaterial({
    transparent: true,
    side: THREE.DoubleSide,
    depthWrite: false,
    uniforms: { uTime: { value: 0 } },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      varying vec2 vUv;
      float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
      float vnoise(vec2 p) {
        vec2 i = floor(p); vec2 f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
      }
      void main() {
        float edge = smoothstep(0.0, 0.1, vUv.x) * smoothstep(1.0, 0.9, vUv.x);
        float flow = vnoise(vec2(vUv.x * 6.0, vUv.y * 3.0 - uTime * 1.6));
        float streak = smoothstep(0.62, 0.8, vnoise(vec2(vUv.x * 14.0, vUv.y * 8.0 - uTime * 2.4)));
        vec3 col = mix(vec3(0.09, 0.5, 0.72), vec3(0.24, 0.72, 0.86), flow);
        col = mix(col, vec3(0.85, 0.96, 1.0), streak * 0.45);
        col = mix(vec3(0.9, 0.97, 1.0), col, edge);
        gl_FragColor = vec4(col, mix(0.7, 0.92, edge));
        #include <colorspace_fragment>
      }
    `,
  });
  const mesh = new THREE.Mesh(geo, material);
  mesh.name = 'river';
  mesh.onBeforeRender = () => {
    material.uniforms.uTime!.value = performance.now() / 1000;
  };
  return mesh;
}
