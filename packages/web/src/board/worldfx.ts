/**
 * Gemeinsame Shader-Bausteine für die ganze Welt: eine Zeit-Uniform, ziehende Wolkenschatten,
 * Lichtnetze (Kaustiken) auf dem Meeresgrund, Detailrauschen und Glühen (Lava).
 * Wird per onBeforeCompile in Standard-Materialien eingehängt.
 */
import type * as THREE from 'three';

export const fx = {
  uTime: { value: 0 },
  /** Stärke der Wolkenschatten (0 = aus) */
  uCloud: { value: 1 },
  /** Windrichtung der Wolken (Meter pro Sekunde) */
  uCloudDrift: { value: [1.1, 0.45] as [number, number] },
};

export const GLSL_NOISE = /* glsl */ `
  float fxHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float fxNoise(vec2 p) {
    vec2 i = floor(p); vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(fxHash(i), fxHash(i + vec2(1.0, 0.0)), u.x), mix(fxHash(i + vec2(0.0, 1.0)), fxHash(i + vec2(1.0, 1.0)), u.x), u.y);
  }
  float fxFbm(vec2 p) {
    float s = 0.0; float a = 0.5;
    for (int i = 0; i < 4; i++) { s += a * fxNoise(p); p = p * 2.03 + 17.1; a *= 0.5; }
    return s;
  }
  /** Lichtnetz am Meeresgrund */
  float fxCaustic(vec2 p, float t) {
    float c = 0.0;
    for (int k = 0; k < 2; k++) {
      vec2 q = p * (0.75 + float(k) * 0.45) + vec2(t * 0.35, -t * 0.27) * (k == 0 ? 1.0 : -1.0);
      vec2 i = floor(q); vec2 f = fract(q);
      float d1 = 8.0; float d2 = 8.0;
      for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
        vec2 g = vec2(float(x), float(y));
        vec2 o = vec2(fxHash(i + g), fxHash(i + g + 31.7));
        o = 0.5 + 0.45 * sin(t * 0.9 + 6.2831 * o);
        float d = length(g + o - f);
        if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) { d2 = d; }
      }
      c += pow(1.0 - smoothstep(0.0, 0.35, d2 - d1), 3.0);
    }
    return c * 0.5;
  }
`;

/** Uniforms + Wolkenschatten (braucht GLSL_NOISE davor). */
export const GLSL_FX = /* glsl */ `
  uniform float uFxTime;
  uniform float uFxCloud;
  uniform vec2 uFxDrift;
  /** 1 = Sonne, kleiner = Wolkenschatten */
  float fxCloudShade(vec2 p) {
    vec2 q = (p - uFxDrift * uFxTime) * 0.016;
    float n = fxFbm(q + 3.7);
    return mix(1.0, 0.5, smoothstep(0.5, 0.72, n) * uFxCloud);
  }
`;

type Shader = Parameters<NonNullable<THREE.Material['onBeforeCompile']>>[0];

function bindUniforms(shader: Shader) {
  shader.uniforms.uFxTime = fx.uTime;
  shader.uniforms.uFxCloud = fx.uCloud;
  shader.uniforms.uFxDrift = fx.uCloudDrift;
}

/** Wolkenschatten auf beliebigen Standard-Materialien (Bäume, Häuser, Felsen). */
export function cloudShadowChunk(shader: Shader) {
  bindUniforms(shader);
  if (!shader.vertexShader.includes('varying vec3 vFxWorld;')) {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vFxWorld;')
      .replace(
        '#include <project_vertex>',
        `#include <project_vertex>
        {
          vec4 fxw = vec4(transformed, 1.0);
          #ifdef USE_INSTANCING
            fxw = instanceMatrix * fxw;
          #endif
          vFxWorld = (modelMatrix * fxw).xyz;
        }`,
      );
  }
  if (!shader.fragmentShader.includes('varying vec3 vFxWorld;')) {
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vFxWorld;\n${GLSL_NOISE}\n${GLSL_FX}`)
      .replace(
        '#include <lights_fragment_end>',
        `#include <lights_fragment_end>
        reflectedLight.directDiffuse *= fxCloudShade(vFxWorld.xz);
        reflectedLight.directSpecular *= fxCloudShade(vFxWorld.xz);`,
      );
  }
}

/**
 * Gelände: Detailrauschen, Kaustiken unter Wasser, Wolkenschatten, Glühen aus dem
 * Vertex-Attribut `glow` (Lavarisse, Kraterboden).
 */
export function patchTerrainMaterial(material: THREE.MeshStandardMaterial) {
  material.onBeforeCompile = (shader) => {
    cloudShadowChunk(shader);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float glow;\nvarying float vGlow;\nvarying vec3 vFxNormal;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGlow = glow;\nvFxNormal = normalize(mat3(modelMatrix) * objectNormal);');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vGlow;\nvarying vec3 vFxNormal;')
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        {
          // feines Detail, damit große Flächen nicht glatt wirken
          float dn = fxNoise(vFxWorld.xz * 2.7) * 0.6 + fxNoise(vFxWorld.xz * 9.0) * 0.4;
          diffuseColor.rgb *= 0.9 + dn * 0.2;
          // Felswände: Gesteinsschichten und Klüfte statt verzerrter Farbstreifen
          vec3 wn = normalize(vFxNormal);
          float wall = smoothstep(0.78, 0.45, wn.y);
          if (wall > 0.0) {
            vec2 side = abs(wn.x) > abs(wn.z) ? vFxWorld.zy : vFxWorld.xy;
            float layers = fxNoise(vec2(side.x * 0.35, side.y * 2.6)) * 0.55 + fxNoise(vec2(side.x * 1.4, side.y * 7.0)) * 0.3 + fxNoise(side * 4.0) * 0.15;
            float cracks = smoothstep(0.05, 0.0, abs(fxNoise(vec2(side.x * 0.8, side.y * 0.18)) - 0.5)) * smoothstep(0.55, 0.75, fxNoise(side * 0.3));
            diffuseColor.rgb *= mix(1.0, (0.72 + layers * 0.55) * (1.0 - cracks * 0.3), wall);
          }
          // Lichtnetze am Meeresgrund (nur im flachen Wasser)
          float under = smoothstep(0.15, -0.35, vFxWorld.y) * smoothstep(-4.5, -0.6, vFxWorld.y);
          if (under > 0.0) diffuseColor.rgb += vec3(0.75, 0.95, 1.0) * fxCaustic(vFxWorld.xz, uFxTime) * under * 0.55;
        }`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        totalEmissiveRadiance += vec3(1.0, 0.32, 0.06) * vGlow * (2.2 + 0.8 * sin(uFxTime * 2.3 + vFxWorld.x * 0.7 + vFxWorld.z * 0.4));`,
      );
  };
  material.customProgramCacheKey = () => 'insel-terrain';
}
