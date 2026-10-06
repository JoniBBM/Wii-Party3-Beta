/**
 * Ultra-Grafik: echte Materialien (CC0-Texturen unter /assets/ultra/) fürs Gelände – Sand, Gras,
 * Fels, Weg, Vulkangestein, Kiesel – als Texturfelder (eine Textur, sechs Ebenen), damit der
 * Shader mit drei Texturen auskommt. Fels und Vulkangestein werden von drei Seiten projiziert
 * (keine verzerrten Streifen an Klippen). Die Vertex-Farben der Insel bleiben die Grundfarbe;
 * die Texturen liefern Struktur, Relief (Normalen) und Rauheit.
 */
import * as THREE from 'three';
import { MAT } from './terrain.ts';
import { cloudShadowChunk } from './worldfx.ts';

const LAYERS: { key: keyof typeof MAT; dir: string; scale: number; tri: boolean }[] = [
  { key: 'sand', dir: 'sand', scale: 1.6, tri: false },
  { key: 'grass', dir: 'grass', scale: 1.8, tri: false },
  { key: 'rock', dir: 'cliff', scale: 3.2, tri: true },
  { key: 'path', dir: 'path', scale: 1.6, tri: false },
  { key: 'volcanic', dir: 'volcanic', scale: 3.0, tri: true },
  { key: 'pebbles', dir: 'pebbles', scale: 2.2, tri: false },
];

const SIZE = 1024;

export interface UltraTextures {
  albedo: THREE.DataArrayTexture;
  normal: THREE.DataArrayTexture;
  /** R = Umgebungsverdeckung, G = Rauheit */
  orm: THREE.DataArrayTexture;
  /** mittlere Farbe je Ebene (linear) – Textur wirkt als Struktur relativ dazu */
  mean: THREE.Vector3[];
  water: THREE.Texture;
}

async function pixels(url: string): Promise<Uint8ClampedArray> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  const bmp = await createImageBitmap(await res.blob(), { resizeWidth: SIZE, resizeHeight: SIZE, resizeQuality: 'high', colorSpaceConversion: 'none' });
  const canvas = new OffscreenCanvas(SIZE, SIZE);
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(bmp, 0, 0);
  bmp.close();
  return ctx.getImageData(0, 0, SIZE, SIZE).data;
}

function arrayTexture(data: Uint8Array, srgb: boolean) {
  const t = new THREE.DataArrayTexture(data, SIZE, SIZE, LAYERS.length);
  t.format = THREE.RGBAFormat;
  t.type = THREE.UnsignedByteType;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = 8;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.needsUpdate = true;
  return t;
}

const srgbToLinear = (v: number) => (v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));

let loading: Promise<UltraTextures> | null = null;

/** Texturen einmalig laden (erst, wenn Ultra gewählt wird). */
export function loadUltraTextures(): Promise<UltraTextures> {
  loading ??= (async () => {
    const layer = SIZE * SIZE * 4;
    const albedo = new Uint8Array(layer * LAYERS.length);
    const normal = new Uint8Array(layer * LAYERS.length);
    const orm = new Uint8Array(layer * LAYERS.length);
    const mean: THREE.Vector3[] = [];
    await Promise.all(
      LAYERS.map(async (l, i) => {
        const base = `/assets/ultra/${l.dir}`;
        const [a, n, r, o] = await Promise.all([pixels(`${base}/albedo.jpg`), pixels(`${base}/normal.jpg`), pixels(`${base}/rough.jpg`), pixels(`${base}/ao.jpg`).catch(() => null)]);
        albedo.set(a, layer * i);
        normal.set(n, layer * i);
        const off = layer * i;
        let sr = 0;
        let sg = 0;
        let sb = 0;
        for (let p = 0; p < SIZE * SIZE; p++) {
          orm[off + p * 4] = o ? o[p * 4]! : 255;
          orm[off + p * 4 + 1] = r[p * 4]!;
          orm[off + p * 4 + 2] = 0;
          orm[off + p * 4 + 3] = 255;
          if ((p & 15) === 0) {
            sr += srgbToLinear(a[p * 4]! / 255);
            sg += srgbToLinear(a[p * 4 + 1]! / 255);
            sb += srgbToLinear(a[p * 4 + 2]! / 255);
          }
        }
        const k = (SIZE * SIZE) / 16;
        mean[i] = new THREE.Vector3(sr / k, sg / k, sb / k);
      }),
    );
    const water = await new THREE.TextureLoader().loadAsync('/assets/ultra/water/normal.jpg');
    water.wrapS = water.wrapT = THREE.RepeatWrapping;
    water.anisotropy = 8;
    return { albedo: arrayTexture(albedo, true), normal: arrayTexture(normal, false), orm: arrayTexture(orm, false), mean, water };
  })();
  loading.catch(() => (loading = null));
  return loading;
}

/**
 * Gelände-Material für Ultra: wie das normale (Vertex-Farben, Wolkenschatten, Glut), dazu
 * Texturstruktur, Normalen und Rauheit je nach Materialanteil.
 */
export function createUltraTerrainMaterial(base: THREE.MeshStandardMaterial, tex: UltraTextures): THREE.MeshStandardMaterial {
  const m = base.clone();
  const scales = LAYERS.map((l) => 1 / l.scale);
  const tri = LAYERS.map((l) => (l.tri ? 1 : 0));
  const baseCompile = base.onBeforeCompile;
  m.onBeforeCompile = (shader, renderer) => {
    baseCompile.call(base, shader, renderer);
    cloudShadowChunk(shader);
    shader.uniforms.uAlb = { value: tex.albedo };
    shader.uniforms.uNor = { value: tex.normal };
    shader.uniforms.uOrm = { value: tex.orm };
    shader.uniforms.uMean = { value: tex.mean };
    shader.uniforms.uScale = { value: scales };
    shader.uniforms.uTri = { value: tri };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec4 matA;\nattribute vec2 matB;\nvarying vec4 vMatA;\nvarying vec2 vMatB;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvMatA = matA;\nvMatB = matB;');
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        precision highp sampler2DArray;
        uniform sampler2DArray uAlb;
        uniform sampler2DArray uNor;
        uniform sampler2DArray uOrm;
        uniform vec3 uMean[6];
        uniform float uScale[6];
        uniform float uTri[6];
        varying vec4 vMatA;
        varying vec2 vMatB;
        vec3 ultraAlb; vec3 ultraN; vec2 ultraOrm; float ultraW;
        vec3 unpackN(vec3 c) { return c * 2.0 - 1.0; }
        void ultraSample(vec3 p, vec3 wn) {
          float w[6] = float[6](vMatA.x, vMatA.y, vMatA.z, vMatA.w, vMatB.x, vMatB.y);
          vec3 tw = pow(abs(wn), vec3(4.0));
          tw /= (tw.x + tw.y + tw.z);
          ultraAlb = vec3(0.0); ultraN = vec3(0.0); ultraOrm = vec2(0.0); ultraW = 0.0;
          for (int i = 0; i < 6; i++) {
            float wi = w[i];
            if (wi < 0.03) continue;
            float s = uScale[i];
            float fi = float(i);
            vec3 a; vec3 n; vec2 o;
            if (uTri[i] > 0.5) {
              vec3 ax = texture(uAlb, vec3(p.zy * s, fi)).rgb;
              vec3 ay = texture(uAlb, vec3(p.xz * s, fi)).rgb;
              vec3 az = texture(uAlb, vec3(p.xy * s, fi)).rgb;
              a = ax * tw.x + ay * tw.y + az * tw.z;
              vec3 nx = unpackN(texture(uNor, vec3(p.zy * s, fi)).rgb);
              vec3 ny = unpackN(texture(uNor, vec3(p.xz * s, fi)).rgb);
              vec3 nz = unpackN(texture(uNor, vec3(p.xy * s, fi)).rgb);
              // Normalen je Projektion ins Weltsystem (UDN-Mischung)
              nx = vec3(nx.xy + wn.zy, abs(nx.z) * wn.x);
              ny = vec3(ny.xy + wn.xz, abs(ny.z) * wn.y);
              nz = vec3(nz.xy + wn.xy, abs(nz.z) * wn.z);
              n = normalize(nx.zyx * tw.x + ny.xzy * tw.y + nz.xyz * tw.z);
              o = texture(uOrm, vec3(p.xz * s, fi)).rg * tw.y + texture(uOrm, vec3(p.zy * s, fi)).rg * tw.x + texture(uOrm, vec3(p.xy * s, fi)).rg * tw.z;
            } else {
              vec2 uv = p.xz * s;
              a = texture(uAlb, vec3(uv, fi)).rgb;
              vec3 t = unpackN(texture(uNor, vec3(uv, fi)).rgb);
              n = normalize(vec3(t.x + wn.x, abs(t.z) * wn.y, t.y + wn.z));
              o = texture(uOrm, vec3(uv, fi)).rg;
            }
            // Struktur relativ zur Mitte der Textur – die Inselfarbe bleibt erhalten
            ultraAlb += clamp(a / max(uMean[i], vec3(0.02)), 0.25, 2.4) * wi;
            ultraN += n * wi;
            ultraOrm += o * wi;
            ultraW += wi;
          }
          if (ultraW > 0.0) {
            ultraAlb /= ultraW; ultraN = normalize(ultraN); ultraOrm /= ultraW;
          }
        }`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        ultraSample(vFxWorld, normalize(vFxNormal));
        float ultraK = clamp(ultraW, 0.0, 1.0);
        diffuseColor.rgb *= mix(vec3(1.0), ultraAlb, ultraK * 0.9);`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
        // nasser Kiesel glänzt, Sand und Gras bleiben matt
        float wet = vMatB.y * smoothstep(1.2, 0.0, vFxWorld.y - 0.6);
        roughnessFactor = mix(roughnessFactor, ultraOrm.g * (1.0 - wet * 0.55), ultraK);`,
      )
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
        if (ultraW > 0.0) normal = normalize(mix(normal, normalize((viewMatrix * vec4(ultraN, 0.0)).xyz), ultraK * 0.85));`,
      )
      .replace(
        '#include <aomap_fragment>',
        `#include <aomap_fragment>
        reflectedLight.indirectDiffuse *= mix(1.0, ultraOrm.r, ultraK * 0.85);
        reflectedLight.directDiffuse *= mix(1.0, 0.55 + ultraOrm.r * 0.45, ultraK);`,
      );
  };
  m.customProgramCacheKey = () => 'insel-terrain-ultra';
  return m;
}
