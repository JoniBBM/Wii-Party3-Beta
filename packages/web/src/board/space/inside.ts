/**
 * Inneres des Alien-Vulkans: Kristallhöhle mit Plasma-See (gleiche Schnittstelle und Kameras wie
 * VolcanoInside – Route, Plätze, Regie-Besuch). Die Höhle der Insel wird umgefärbt und umgebaut:
 * violetter Fels mit leuchtenden Kristalladern, türkis-magenta Plasma statt Lava, Plasmafälle,
 * Tropfsteine werden zu leuchtenden Kristallen, der Strafweg führt über schwebende Kristallinseln,
 * der Ausgang ist ein Teleporter-Feld, durch die Deckenöffnung kommt man aus einem Wurmloch.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { VolcanoInside, type InsideQuality } from '../inside.ts';
import { noise2, rand } from '../noise.ts';
import type { Particle, ParticleSystem } from '../particles.ts';
import { GLSL_NOISE } from '../worldfx.ts';

/** Maße wie in inside.ts (Höhle, Route, Platten, Portal) */
const CAVE = { rx: 70, rz: 54 };
const ROUTE_Z = -12;
const PLATE_R = 1.25;
const PLATE_H = 0.24;
const PORTAL_R = 1.9;
/** Länge des Kragen-Felds im Seeshader (MAX_COLLARS in inside.ts) */
const MAX_COLLARS = 24;
const ISLAND_CRYSTALS = 8;

/** Kristallfarben: Türkis, Magenta, Violett, Limette (Grundfarbe; das Leuchten folgt ihr) */
const CRYSTAL_COLORS = ['#4fe9ff', '#ff5ad8', '#9a7bff', '#b8ff5a', '#5fffd0'].map((c) => new THREE.Color(c));

// ---------------------------------------------------------------------------
// Shader
// ---------------------------------------------------------------------------
/** Plasma-See: türkis leuchtende Strömung mit magenta Adern, dunkelviolette Schollen treiben darauf */
const PLASMA_FRAG = /* glsl */ `
  uniform float uTime;
  uniform vec4 uCollars[${MAX_COLLARS}];
  uniform int uCollarCount;
  uniform vec4 uFall;
  uniform vec4 uFall2;
  uniform vec4 uBurst;
  varying vec3 vW;
  #include <common>
  #include <fog_pars_fragment>
  ${GLSL_NOISE}
  vec2 pzHash2(vec2 p) {
    p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
    return fract(sin(p) * 43758.5453);
  }
  vec2 pzCell(vec2 p, float t) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    float d1 = 8.0;
    float d2 = 8.0;
    float id = 0.0;
    for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
      vec2 g = vec2(float(x), float(y));
      vec2 o = pzHash2(i + g);
      vec2 oo = 0.5 + 0.46 * sin(t * (0.5 + o.y) + 6.2831 * o);
      float d = length(g + oo - f);
      if (d < d1) { d2 = d1; d1 = d; id = o.x; } else if (d < d2) { d2 = d; }
    }
    return vec2(d2 - d1, id);
  }
  void main() {
    vec2 p = vW.xz;
    vec2 warp = vec2(fxNoise(p * 0.03 + 1.3), fxNoise(p * 0.03 + 7.9)) - 0.5;
    vec2 q = p + warp * 12.0 - vec2(0.0, uTime * 0.35);
    float pool = smoothstep(0.5, 0.66, fxFbm(q * 0.035 + 3.1));
    float collar = 0.0;
    for (int k = 0; k < ${MAX_COLLARS}; k++) {
      if (k >= uCollarCount) break;
      vec4 c = uCollars[k];
      float d = length(p - c.xy) - c.z;
      collar = max(collar, exp(-max(d, 0.0) * 1.4) * c.w);
    }
    vec2 fd = (p - uFall.xy) / vec2(uFall.z, uFall.z * 0.7);
    float fall = exp(-dot(fd, fd)) * uFall.w;
    vec2 fd2 = (p - uFall2.xy) / vec2(uFall2.z, uFall2.z * 0.7);
    fall = max(fall, exp(-dot(fd2, fd2)) * uFall2.w);
    float burst = 0.0;
    float bt = uTime - uBurst.z;
    if (bt > 0.0 && bt < 2.4) {
      float r = length(p - uBurst.xy);
      burst = exp(-pow((r - bt * 5.0) * 1.3, 2.0)) * (1.0 - bt / 2.4) * uBurst.w + exp(-r * 0.8) * max(0.0, 1.0 - bt * 1.5) * uBurst.w;
    }
    float hot = clamp(pool + collar + fall + burst, 0.0, 1.0);
    // Farbe der Strömung: meist Türkis, in Schlieren Magenta
    float hue = smoothstep(0.42, 0.68, fxNoise(q * 0.045 + 11.0 + uTime * 0.03));
    vec3 cyan = vec3(0.04, 0.52, 0.62);
    vec3 pink = vec3(0.72, 0.08, 0.62);
    vec2 qw = q + (vec2(fxNoise(q * 0.11 + 2.0), fxNoise(q * 0.11 + 9.0)) - 0.5) * 7.0;
    vec2 c1 = pzCell(qw * vec2(0.17, 0.21), uTime * 0.12);
    float e = c1.x;
    float aa = fwidth(e) + 0.003;
    float gap = 0.04 + c1.y * 0.035 + hot * 0.5;
    float crust = smoothstep(gap - aa, gap + aa, e) * (1.0 - smoothstep(0.55, 0.9, hot));
    float flick = fxNoise(q * 0.35 + uTime * 0.5);
    vec3 plasma = mix(cyan, pink, hue) * (0.6 + flick * 0.35 + hot * 0.18);
    // Schollen: dunkles Violett, Ränder glimmen in der Farbe darunter
    float cellHeat = smoothstep(0.7, 1.0, c1.y);
    vec3 crustCol = mix(vec3(0.035, 0.02, 0.08), vec3(0.08, 0.04, 0.15), fxNoise(q * 1.2));
    crustCol += mix(cyan, pink, hue) * 0.6 * (cellHeat * 0.3 + exp(-e * 10.0) * 0.6 + hot * 0.3);
    vec3 col = mix(plasma, crustCol, crust);
    // heller Kern in den Fugen
    col += mix(vec3(0.25, 0.85, 0.95), vec3(0.95, 0.25, 0.85), hue) * (1.0 - crust) * smoothstep(gap, 0.0, e) * (1.0 - pool * 0.6);
    #ifdef LAVA_DETAIL
      vec2 c2 = pzCell(qw * 0.62 + 7.0, uTime * 0.2);
      float aa2 = fwidth(c2.x) + 0.003;
      float fine = 1.0 - smoothstep(0.018 - aa2, 0.035 + aa2, c2.x);
      fine *= crust * smoothstep(0.45, 0.7, fxNoise(q * 0.07 + 5.0)) * (1.0 - smoothstep(0.05, 0.2, aa2));
      col += mix(cyan, pink, hue) * 1.1 * fine;
    #endif
    // Weißglut an den Plasmafällen und bei Einschlägen
    col += vec3(0.55, 0.75, 0.9) * (fall * fall * 1.3 + burst * 1.3);
    col *= 0.93 + 0.07 * sin(uTime * 1.7 + p.x * 0.2 + p.y * 0.13);
    #ifdef USE_FOG
      #ifdef FOG_EXP2
        float fogF = 1.0 - exp(-fogDensity * fogDensity * vFogDepth * vFogDepth);
      #else
        float fogF = smoothstep(fogNear, fogFar, vFogDepth);
      #endif
      col = mix(col, fogColor, fogF * 0.6);
    #endif
    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
  }
`;

/** Plasmafall an der Rückwand: türkis mit weißem Kern, magenta Ränder */
const FALL_FRAG = /* glsl */ `
  uniform float uTime;
  varying vec2 vUv;
  varying vec3 vW;
  #include <common>
  #include <fog_pars_fragment>
  ${GLSL_NOISE}
  void main() {
    float m = vUv.y;
    float speed = 6.0 + m * 0.45;
    vec2 sp = vec2(vUv.x * 7.0, m * 0.32 - uTime * speed * 0.32);
    float streak = fxNoise(vec2(sp.x * 1.6, sp.y * 0.6)) * 0.6 + fxNoise(vec2(sp.x * 4.1, sp.y * 1.4 + 3.0)) * 0.4;
    float edge = abs(vUv.x - 0.5) * 2.0;
    float ragged = edge + (fxNoise(vec2(sp.y * 1.3, vUv.x * 5.0)) - 0.5) * 0.4;
    ragged = max(ragged, 1.0 - m * 0.55 + (fxNoise(vec2(vUv.x * 9.0, uTime * 0.6)) - 0.5) * 0.9);
    if (ragged > 0.97) discard;
    float core = 1.0 - smoothstep(0.15, 0.95, ragged);
    vec3 col = mix(vec3(0.75, 0.12, 0.7), vec3(0.15, 0.8, 0.95), core);
    col = mix(col, vec3(0.75, 1.1, 1.25), core * streak * 0.5);
    col *= 0.65 + core * 0.4 + streak * 0.25;
    col *= smoothstep(0.0, 2.5, m) * 0.7 + 0.3;
    col += vec3(0.25, 0.6, 0.7) * smoothstep(4.0, 0.0, vW.y);
    #ifdef USE_FOG
      #ifdef FOG_EXP2
        float fogF = 1.0 - exp(-fogDensity * fogDensity * vFogDepth * vFogDepth);
      #else
        float fogF = smoothstep(fogNear, fogFar, vFogDepth);
      #endif
      col = mix(col, fogColor, fogF * 0.5);
    #endif
    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
  }
`;

/** Teleporter-Scheibe: Ringe laufen zur Mitte, türkis-weißer Kern */
const TELE_FRAG = /* glsl */ `
  uniform float uTime;
  uniform float uFlash;
  varying vec2 vUv;
  void main() {
    vec2 p = vUv * 2.0 - 1.0;
    float r = length(p);
    if (r > 1.0) discard;
    float a = atan(p.y, p.x);
    float rings = smoothstep(0.55, 1.0, sin(r * 22.0 + uTime * 6.0));
    float spokes = smoothstep(0.7, 1.0, sin(a * 6.0 - uTime * 1.5)) * smoothstep(0.25, 0.9, r);
    vec3 deep = vec3(0.02, 0.04, 0.12);
    vec3 cyan = vec3(0.2, 1.3, 1.7) * (1.0 + uFlash * 2.0);
    vec3 col = mix(deep, cyan, rings * (0.35 + 0.65 * r) + spokes * 0.35);
    col += vec3(0.9, 1.8, 2.2) * exp(-r * 4.5) * (1.4 + uFlash * 4.0);
    col += vec3(0.8, 0.3, 1.6) * smoothstep(0.82, 0.95, r) * (1.0 - smoothstep(0.95, 1.0, r)) * 1.4;
    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
  }
`;

/** Teleporter-Strahl: aufsteigende Ringe */
const TELE_FUNNEL_FRAG = /* glsl */ `
  uniform float uTime;
  uniform float uFlash;
  varying vec2 vUv;
  varying vec3 vN;
  varying vec3 vV;
  void main() {
    float facing = 0.4 + 0.6 * abs(dot(normalize(vN), normalize(vV)));
    float bands = smoothstep(0.6, 1.0, sin(vUv.y * 18.0 - uTime * 5.0)) + smoothstep(0.8, 1.0, sin(vUv.x * 6.2831 * 4.0 + uTime * 2.0)) * 0.3;
    float fade = pow(1.0 - vUv.y, 1.5) * smoothstep(0.0, 0.1, vUv.y);
    vec3 col = vec3(0.2, 1.1, 1.5) * (0.08 + bands * 0.9) * fade * facing * (1.0 + uFlash * 2.5);
    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
  }
`;

const DISC_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

/** Wurmloch in der Deckenöffnung: Spiralarme um einen hellen Kern */
const WORMHOLE_FRAG = /* glsl */ `
  uniform float uTime;
  varying vec2 vUv;
  void main() {
    vec2 p = vUv * 2.0 - 1.0;
    float r = length(p);
    if (r > 1.0) discard;
    float a = atan(p.y, p.x);
    float s1 = sin(a * 3.0 + log(r + 0.05) * 6.0 + uTime * 2.2);
    float s2 = sin(a * 5.0 + log(r + 0.05) * 10.0 + uTime * 3.1 + 1.3);
    float arms = smoothstep(-0.2, 0.9, s1) * 0.7 + smoothstep(0.4, 1.0, s2) * 0.4;
    vec3 col = mix(vec3(0.5, 0.15, 1.3), vec3(0.25, 1.3, 1.7), arms * (1.0 - r * 0.5));
    col *= 0.6 + arms;
    col += vec3(1.6, 1.8, 2.2) * exp(-r * 5.0) * 1.8;
    col *= 1.0 - smoothstep(0.88, 1.0, r) * 0.6;
    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
  }
`;

// ---------------------------------------------------------------------------
// Bausteine
// ---------------------------------------------------------------------------
/** Sechskant-Kristall mit Spitze: Fuß bei y = 0, Spitze bei y = 1, Radius 1 */
function crystalGeo() {
  const g = new THREE.LatheGeometry([new THREE.Vector2(0, 0), new THREE.Vector2(0.85, 0), new THREE.Vector2(1, 0.12), new THREE.Vector2(0.88, 0.68), new THREE.Vector2(0, 1)], 6);
  const n = g.toNonIndexed();
  g.dispose();
  n.deleteAttribute('uv');
  n.computeVertexNormals();
  return n;
}

/** Kristall-Material: leuchtet in der Farbe je Instanz, an den Kanten heller */
function crystalMaterial() {
  const m = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.22, metalness: 0.15, flatShading: true });
  m.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace(
      '#include <emissivemap_fragment>',
      `#include <emissivemap_fragment>
      #ifdef USE_COLOR
        {
          float rim = 1.0 - abs(dot(normalize(vViewPosition), normal));
          totalEmissiveRadiance += vColor.rgb * (0.45 + 1.1 * rim * rim);
        }
      #endif`,
    );
  };
  m.customProgramCacheKey = () => 'space-inside-crystal';
  return m;
}

/** Schwebende Felsinsel unter einer Feldplatte: oben flach, unten spitz, verbeult (mit Vertex-Farben) */
function islandGeo(r: number, depth: number, seed: number) {
  // von der Spitze unten bis zur Mitte oben (Flächen zeigen nach außen)
  const prof: [number, number][] = [
    [0, -depth],
    [r * 0.3, -depth * 0.88],
    [r * 0.66, -depth * 0.62],
    [r * 0.95, -depth * 0.32],
    [r * 1.06, -0.22],
    [r * 0.98, 0],
    [0, 0.02],
  ];
  const g = new THREE.LatheGeometry(prof.map(([x, y]) => new THREE.Vector2(x, y)), 9);
  const p = g.getAttribute('position');
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    const z = p.getZ(i);
    if (y > -0.05) continue;
    const k = 1 + noise2(x * 1.3 + seed, z * 1.3 + y * 0.8) * 0.22;
    p.setXYZ(i, x * k, y + noise2(x * 2.1 - seed, z * 2.1) * 0.12, z * k);
  }
  const n = g.toNonIndexed();
  g.dispose();
  n.deleteAttribute('uv');
  n.computeVertexNormals();
  const pos = n.getAttribute('position');
  const col = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const v = 0.75 + (noise2(pos.getX(i) * 0.9 + seed, pos.getZ(i) * 0.9 + pos.getY(i)) * 0.5 + 0.5) * 0.55;
    col[i * 3] = 0.075 * v;
    col[i * 3 + 1] = 0.058 * v;
    col[i * 3 + 2] = 0.07 * v;
  }
  n.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return n;
}

const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const TMP = { m: new THREE.Matrix4(), e: new THREE.Euler(), q: new THREE.Quaternion(), p: new THREE.Vector3(), s: new THREE.Vector3() };

/** Farben der Partikel umlenken: Glut → Plasma (Türkis/Magenta), Rauch → Violett, Grün → Türkis */
function recolor(ps: ParticleSystem, fn: (p: Particle, i: number) => void) {
  const emit = ps.emit.bind(ps);
  ps.emit = (n, init) => emit(n, (p, i) => {
    init(p, i);
    fn(p, i);
  });
}

export class SpaceInside extends VolcanoInside {
  // `declare`: setPath läuft schon im Konstruktor der Grundklasse – Felder mit Vorgabe kämen zu spät
  declare private crystalGeom: THREE.BufferGeometry | undefined;
  declare private crystalMat: THREE.MeshStandardMaterial | undefined;
  declare private islandCrystals: THREE.InstancedMesh | undefined;
  declare private tele: THREE.Group | undefined;
  declare private mine: { geos: THREE.BufferGeometry[]; mats: THREE.Material[]; texs: THREE.Texture[] } | undefined;
  declare private shards: { mesh: THREE.InstancedMesh; items: { p: THREE.Vector3; s: number; ph: number; spin: THREE.Vector3 }[] } | undefined;
  declare private pylonLights: THREE.Mesh[] | undefined;

  constructor(opts: { length: number; shout: number; quality: InsideQuality }) {
    super(opts);
    this.restyle();
  }

  /** eigene Geometrien, Materialien und Texturen (gibt dispose frei) */
  private get res() {
    return (this.mine ??= { geos: [], mats: [], texs: [] });
  }

  private crystals() {
    this.crystalGeom ??= crystalGeo();
    this.crystalMat ??= crystalMaterial();
    if (!this.res.geos.includes(this.crystalGeom)) this.res.geos.push(this.crystalGeom);
    if (!this.res.mats.includes(this.crystalMat)) this.res.mats.push(this.crystalMat);
    return { geo: this.crystalGeom, mat: this.crystalMat };
  }

  // =========================================================================
  // Umfärben: Licht, Fels, Plasma, Kristalle, Wurmloch, Teleporter, Partikel
  // =========================================================================
  private restyle() {
    const s = this.scene;
    s.name = 'alien-hoehle';
    s.background = new THREE.Color('#120a26');
    if (s.fog instanceof THREE.Fog) s.fog.color.set('#1d1240');
    // Umgebung für Spiegelungen: oben violetter Fels, unten türkises Plasma
    const env = (() => {
      const c = document.createElement('canvas');
      c.width = 512;
      c.height = 256;
      const g = c.getContext('2d')!;
      const grd = g.createLinearGradient(0, 0, 0, 256);
      grd.addColorStop(0, '#0c0718');
      grd.addColorStop(0.42, '#22144a');
      grd.addColorStop(0.55, '#3b1f7a');
      grd.addColorStop(0.65, '#1fb8c8');
      grd.addColorStop(1, '#9ff6ff');
      g.fillStyle = grd;
      g.fillRect(0, 0, 512, 256);
      const t = new THREE.CanvasTexture(c);
      t.mapping = THREE.EquirectangularReflectionMapping;
      t.colorSpace = THREE.SRGBColorSpace;
      return t;
    })();
    this.res.texs.push(env);
    s.environment = env;
    s.environmentIntensity = 0.45;

    // Licht: kühles Licht aus dem Wurmloch, Plasma leuchtet türkis und magenta
    this.hemi.color.set('#4a3f8a');
    this.hemi.groundColor.set('#22c6d6');
    this.hemi.intensity = 0.8;
    this.key.color.set('#d4d6ff');
    this.fallLight.color.set('#2ee6ff');
    this.fall2Light.color.set('#ff4fd8');
    this.lavaLights.forEach((l, k) => l.color.set(k % 2 ? '#c24dff' : '#38dcff'));
    this.portalLight.color.set('#3ee8ff');

    // Fels: violett getönt, Adern leuchten türkis/magenta statt Glut
    const rock = this.rockMat;
    rock.color.setRGB(2.3, 1.9, 3.5);
    rock.onBeforeCompile = (sh) => this.crystalRock(sh);
    rock.customProgramCacheKey = () => 'space-inside-rock';

    // Plasma-See und Plasmafälle
    this.lavaMat.fragmentShader = PLASMA_FRAG;
    this.lavaMat.needsUpdate = true;
    this.fallMat.fragmentShader = FALL_FRAG;
    this.fallMat.needsUpdate = true;

    // Tropfsteine werden Kristalle (hängend und aus dem Plasma ragend), jede Instanz eigene Farbe
    const { geo, mat } = this.crystals();
    const stal = this.stalactites;
    const oldGeo = stal.geometry;
    stal.geometry = geo;
    stal.material = mat;
    oldGeo.dispose();
    const rng = rand(311);
    const c = new THREE.Color();
    for (let i = 0; i < stal.instanceMatrix.count; i++) stal.setColorAt(i, c.copy(CRYSTAL_COLORS[Math.floor(rng() * CRYSTAL_COLORS.length)]!).multiplyScalar(0.55 + rng() * 0.35));
    if (stal.instanceColor) stal.instanceColor.needsUpdate = true;

    // Kristallgruppen an den Wänden (hinten und an den Seiten; vorne bleibt die Sicht frei)
    this.buildWallCrystals();
    // schwebende Kristallsplitter hoch in der Höhle
    this.buildShards();

    // Deckenöffnung: Wurmloch statt Himmel, kühles Licht im Schacht
    const sky = this.skyDisc;
    (sky.material as THREE.Material).dispose();
    sky.material = new THREE.ShaderMaterial({ uniforms: { uTime: this.time }, vertexShader: DISC_VERT, fragmentShader: WORMHOLE_FRAG, side: THREE.DoubleSide, fog: false });
    (this.skyHalo.material as THREE.MeshBasicMaterial).color.setRGB(0.9, 0.7, 1.6);
    (this.shaftMat.uniforms.uColor!.value as THREE.Color).setRGB(0.55, 0.75, 1.35);
    (this.moteMat.uniforms.uColA!.value as THREE.Color).setRGB(0.9, 1.7, 2.0);
    (this.moteMat.uniforms.uColB!.value as THREE.Color).setRGB(0.8, 0.5, 1.6);

    // Plasma-Funken statt Glut
    (this.emberMat.uniforms.uColA!.value as THREE.Color).setRGB(0.5, 2.2, 2.5);
    (this.emberMat.uniforms.uColB!.value as THREE.Color).setRGB(1.6, 0.3, 1.5);

    // Teleporter statt grünem Portal
    this.vortexMat.fragmentShader = TELE_FRAG;
    this.vortexMat.needsUpdate = true;
    this.funnelMat.fragmentShader = TELE_FUNNEL_FRAG;
    this.funnelMat.needsUpdate = true;
    const rim = this.portalGroup.children[1] as THREE.Mesh | undefined;
    if (rim) (rim.material as THREE.MeshBasicMaterial).color.setRGB(0.3, 1.6, 2.2);
    // kreisende Runensteine werden kleine Kristalle
    const runes = this.runes;
    const runeGeo = new THREE.OctahedronGeometry(0.24, 0);
    runeGeo.scale(0.7, 1.5, 0.7);
    runes.geometry.dispose();
    runes.geometry = runeGeo;
    const runeMat = runes.material as THREE.MeshStandardMaterial;
    runeMat.color.set('#20304a');
    runeMat.emissive.setRGB(0.25, 1.2, 1.6);

    // Partikel: Glut → Plasma, Rauch → violetter Dunst, grüne Sterne → türkis
    recolor(this.glow, (p, i) => {
      if (p.r > 1.2 && p.b < 0.6) {
        const k = (p.r + p.g) / 2.6;
        if (i % 3 === 0) Object.assign(p, { r: 1.8 * k, g: 0.4 * k, b: 1.7 * k });
        else Object.assign(p, { r: 0.35 * k, g: 1.6 * k, b: 1.9 * k });
      } else if (p.g > 1.5 && p.r < 1) Object.assign(p, { r: 0.4, g: 1.8, b: 2.3 });
    });
    recolor(this.smoke, (p) => Object.assign(p, { r: p.r * 0.75 + 0.05, g: p.g * 0.7 + 0.05, b: p.r * 1.5 + 0.1 }));
    recolor(this.stars, (p) => {
      if (p.g > 1.4 && p.r < 1.2) Object.assign(p, { r: 0.5, g: 1.8, b: 2.3 });
    });
  }

  /** Fels mit leuchtenden Kristalladern (wie der Basalt, aber kühle Farben) */
  private crystalRock(sh: THREE.WebGLProgramParametersWithUniforms) {
    sh.uniforms.uTime = this.time;
    sh.uniforms.uHot = { value: this.hotSpots };
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vRockW;').replace(
      '#include <project_vertex>',
      `#include <project_vertex>
      {
        vec4 rw = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          rw = instanceMatrix * rw;
        #endif
        vRockW = (modelMatrix * rw).xyz;
      }`,
    );
    sh.fragmentShader = sh.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform float uTime;
        uniform vec4 uHot[3];
        varying vec3 vRockW;
        ${GLSL_NOISE}
        vec2 skHash2(vec2 p) {
          p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
          return fract(sin(p) * 43758.5453);
        }
        float skEdge(vec2 p) {
          vec2 i = floor(p);
          vec2 f = fract(p);
          float d1 = 8.0;
          float d2 = 8.0;
          for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
            vec2 g = vec2(float(x), float(y));
            float d = length(g + skHash2(i + g) * 0.9 + 0.05 - f);
            if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) { d2 = d; }
          }
          return d2 - d1;
        }
        float skJoint;
        float skMask;
        float skHue;`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        {
          vec3 rn = abs(normalize(cross(dFdx(vRockW), dFdy(vRockW))));
          vec2 uvp = rn.y > max(rn.x, rn.z) ? vRockW.xz : (rn.x > rn.z ? vRockW.zy * vec2(1.0, 0.55) : vRockW.xy * vec2(1.0, 0.55));
          vec2 jp = uvp * 0.42 + (vec2(fxNoise(uvp * 0.3), fxNoise(uvp * 0.3 + 5.0)) - 0.5) * 0.8;
          float e = skEdge(jp);
          float aa = fwidth(e) + 0.004;
          skJoint = 1.0 - smoothstep(0.035 - aa, 0.06 + aa, e);
          skMask = smoothstep(0.4, 0.58, fxNoise(vRockW.xz * 0.05 + vRockW.y * 0.045 + 3.0));
          skHue = smoothstep(0.35, 0.65, fxNoise(vRockW.xz * 0.03 - vRockW.y * 0.02 + 17.0));
          diffuseColor.rgb *= (1.0 - skJoint * 0.5) * (0.8 + fxNoise(uvp * 1.3) * 0.4);
        }`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        {
          vec3 vein = mix(vec3(0.15, 1.3, 1.6), vec3(1.5, 0.25, 1.4), skHue);
          float crack = skJoint * skMask;
          float low = pow(smoothstep(7.0, 0.0, vRockW.y), 2.0);
          float spot = 0.0;
          for (int k = 0; k < 3; k++) {
            float d = length(vRockW - uHot[k].xyz) / max(0.01, uHot[k].w);
            spot = max(spot, exp(-d * d * 1.5));
          }
          float heat = max(low, spot);
          float pulse = 0.75 + 0.25 * sin(uTime * 1.3 + vRockW.x * 0.3 + vRockW.z * 0.25);
          totalEmissiveRadiance += vein * crack * (0.06 + heat * 0.9) * pulse;
          // Saum an der Plasmakante
          float rim = smoothstep(1.6, -0.2, vRockW.y);
          totalEmissiveRadiance += vec3(0.1, 0.55, 0.65) * (rim * rim * 0.6 + spot * spot * 0.2);
        }`,
      );
  }

  /** Kristallgruppen am Fuß der Wände: hinten und seitlich, nicht im Blick der Kamera */
  private buildWallCrystals() {
    const { geo, mat } = this.crystals();
    const rng = rand(4711);
    const items: THREE.Matrix4[] = [];
    const colors: THREE.Color[] = [];
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    for (let c = 0; c < 22; c++) {
      const a = -Math.PI + (c / 22) * Math.PI * 2 + rng() * 0.2;
      // vorne (Kameraseite, +z) frei lassen
      if (Math.sin(a) > 0.2) continue;
      const e = 0.8 + rng() * 0.1;
      const cx = Math.cos(a) * CAVE.rx * e;
      const cz = Math.sin(a) * CAVE.rz * e;
      const col = CRYSTAL_COLORS[c % CRYSTAL_COLORS.length]!;
      const n = 4 + Math.floor(rng() * 4);
      for (let k = 0; k < n; k++) {
        const big = k === 0;
        const h = big ? 6 + rng() * 6 : 2 + rng() * 4;
        const r = h * (0.13 + rng() * 0.05);
        const x = cx + (rng() - 0.5) * 5;
        const z = cz + (rng() - 0.5) * 5;
        // leicht nach innen und zufällig geneigt
        const dir = new THREE.Vector3(-x * 0.004 + (rng() - 0.5) * 0.5, 1, -z * 0.005 + (rng() - 0.5) * 0.5).normalize();
        q.setFromUnitVectors(up, dir);
        items.push(new THREE.Matrix4().compose(new THREE.Vector3(x, -1.2, z), q, new THREE.Vector3(r, h + 1.2, r)));
        colors.push(col.clone().multiplyScalar(0.6 + rng() * 0.35));
      }
    }
    const im = new THREE.InstancedMesh(geo, mat, items.length);
    items.forEach((m, i) => {
      im.setMatrixAt(i, m);
      im.setColorAt(i, colors[i]!);
    });
    im.name = 'kristallgruppen';
    im.frustumCulled = false;
    im.castShadow = true;
    this.scene.add(im);
  }

  /** Kristallsplitter, die langsam hoch oben in der Höhle schweben und sich drehen */
  private buildShards() {
    const { geo, mat } = this.crystals();
    const rng = rand(99);
    const items: { p: THREE.Vector3; s: number; ph: number; spin: THREE.Vector3 }[] = [];
    for (let i = 0; i < 16; i++) {
      const a = rng() * Math.PI * 2;
      const e = 0.3 + rng() * 0.45;
      items.push({ p: new THREE.Vector3(Math.cos(a) * CAVE.rx * e, 13 + rng() * 11, ROUTE_Z - 8 + Math.sin(a) * CAVE.rz * e * 0.6 - 6), s: 0.5 + rng() * 0.8, ph: rng() * 6, spin: new THREE.Vector3(rng() - 0.5, rng() + 0.3, rng() - 0.5) });
    }
    const mesh = new THREE.InstancedMesh(geo, mat, items.length);
    items.forEach((it, i) => mesh.setColorAt(i, CRYSTAL_COLORS[i % CRYSTAL_COLORS.length]!.clone().multiplyScalar(0.8)));
    mesh.name = 'kristallsplitter';
    mesh.frustumCulled = false;
    this.scene.add(mesh);
    this.shards = { mesh, items };
  }

  // =========================================================================
  // Route: schwebende Kristallinseln statt Basaltsäulen, Teleporter-Plattform am Ende
  // =========================================================================
  override setPath(length: number, shout: number) {
    super.setPath(length, shout);
    this.buildIslands();
  }

  private buildIslands() {
    const { geo, mat } = this.crystals();
    const geos: THREE.BufferGeometry[] = [];
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    const crystalM: THREE.Matrix4[] = [];
    const crystalC: THREE.Color[] = [];
    const add = (top: THREE.Vector3, r: number, i: number, big: boolean) => {
      // unter der Plattenoberseite; schwebt mindestens 0,6 m über dem Plasma
      const y = top.y - PLATE_H - 0.06;
      const depth = Math.max(0.8, Math.min(big ? 3.4 : 2.7, y - 0.6));
      const g = islandGeo(r, depth, i * 3.7 + 1.3);
      g.rotateY(i * 0.9);
      g.translate(top.x, y, top.z);
      geos.push(g);
      // Kristalle wachsen schräg nach außen und unten aus der Insel
      const n = big ? ISLAND_CRYSTALS : 5;
      for (let k = 0; k < n; k++) {
        const a = (k / n) * Math.PI * 2 + i * 1.3;
        const down = 0.35 + ((k * 3 + i) % 4) * 0.18;
        const dir = new THREE.Vector3(Math.cos(a), -down, Math.sin(a)).normalize();
        q.setFromUnitVectors(up, dir);
        const len = 0.6 + ((k * 7 + i * 3) % 5) * 0.16;
        const at = new THREE.Vector3(top.x + Math.cos(a) * r * 0.75, y - depth * (0.2 + (k % 3) * 0.12), top.z + Math.sin(a) * r * 0.75);
        crystalM.push(m.clone().compose(at, q, new THREE.Vector3(len * 0.22, len, len * 0.22)));
        crystalC.push(CRYSTAL_COLORS[(k + i) % CRYSTAL_COLORS.length]!.clone().multiplyScalar(0.75));
      }
      // ein Kristall hängt unten an der Spitze
      q.setFromUnitVectors(up, new THREE.Vector3(0, -1, 0));
      crystalM.push(m.clone().compose(new THREE.Vector3(top.x, y - depth + 0.25, top.z), q, new THREE.Vector3(0.22, 0.9, 0.22)));
      crystalC.push(CRYSTAL_COLORS[i % CRYSTAL_COLORS.length]!.clone().multiplyScalar(0.8));
    };
    this.plates.forEach((pl, i) => add(pl.top, pl.radius * 1.12, i, false));
    // Teleporter-Plattform: größere Insel unter dem Portal
    const pt = this.portal;
    add(new THREE.Vector3(pt.x, pt.y + 0.2, pt.z), PORTAL_R * 1.12, 99, true);
    const old = this.pillars.geometry;
    this.pillars.geometry = mergeGeometries(geos, false) ?? new THREE.BufferGeometry();
    for (const g of geos) g.dispose();
    old.dispose();

    // Kristalle an den Inseln
    let im = this.islandCrystals;
    if (!im || im.instanceMatrix.count < crystalM.length) {
      if (im) {
        im.removeFromParent();
        im.dispose();
      }
      im = new THREE.InstancedMesh(geo, mat, Math.max(crystalM.length, 200));
      im.name = 'insel-kristalle';
      im.frustumCulled = false;
      im.castShadow = true;
      this.scene.add(im);
      this.islandCrystals = im;
    }
    crystalM.forEach((mm, i) => {
      im.setMatrixAt(i, mm);
      im.setColorAt(i, crystalC[i]!);
    });
    im.count = crystalM.length;
    im.instanceMatrix.needsUpdate = true;
    if (im.instanceColor) im.instanceColor.needsUpdate = true;

    this.buildTeleporter();
  }

  /** Teleporter-Technik um das Portal: Metallring, Sockel mit Leuchtkante, drei Strahlermasten */
  private buildTeleporter() {
    if (this.tele) {
      this.tele.removeFromParent();
      this.tele.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
    }
    const g = new THREE.Group();
    g.name = 'teleporter';
    const pt = this.portal;
    g.position.set(pt.x, pt.y - 0.04, pt.z);
    const metal = new THREE.MeshStandardMaterial({ color: '#cfd6e2', roughness: 0.35, metalness: 0.6 });
    const dark = new THREE.MeshStandardMaterial({ color: '#2e3446', roughness: 0.45, metalness: 0.55 });
    const glowC = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.3, 1.7, 2.2), toneMapped: false });
    const glowM = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.9, 0.4, 1.8), toneMapped: false });
    this.res.mats.push(metal, dark, glowC, glowM);
    const add = (geo: THREE.BufferGeometry, mt: THREE.Material, x: number, y: number, z: number, shadow = true) => {
      const me = new THREE.Mesh(geo, mt);
      me.position.set(x, y, z);
      me.castShadow = shadow;
      me.receiveShadow = true;
      g.add(me);
      return me;
    };
    // Sockel: dunkle Scheibe mit Leuchtkante, darauf der Strudel des Portals
    add(new THREE.CylinderGeometry(PORTAL_R * 1.02, PORTAL_R * 1.1, 0.34, 40), dark, 0, -0.19, 0);
    add(new THREE.TorusGeometry(PORTAL_R * 1.04, 0.05, 6, 56).rotateX(Math.PI / 2), glowC, 0, -0.02, 0, false);
    add(new THREE.TorusGeometry(PORTAL_R + 0.1, 0.12, 10, 56).rotateX(Math.PI / 2), metal, 0, 0.03, 0);
    // drei Strahlermasten mit blinkenden Spitzen
    const lights: THREE.Mesh[] = [];
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * Math.PI * 2 + 0.3;
      const x = Math.cos(a) * (PORTAL_R + 0.45);
      const z = Math.sin(a) * (PORTAL_R + 0.45);
      add(new THREE.CylinderGeometry(0.1, 0.16, 1.9, 8), metal, x, 0.8, z);
      add(new THREE.ConeGeometry(0.16, 0.35, 8).rotateX(Math.PI), dark, x, 1.85, z);
      lights.push(add(new THREE.SphereGeometry(0.13, 12, 8), k % 2 ? glowM : glowC, x, 1.95, z, false));
    }
    this.pylonLights = lights;
    this.scene.add(g);
    this.tele = g;
  }

  override update(t: number, dt: number, camera: THREE.Camera) {
    super.update(t, dt, camera);
    // Kristallsplitter schweben und drehen sich
    const sh = this.shards;
    if (sh) {
      const { m, e, q, p, s } = TMP;
      sh.items.forEach((it, i) => {
        e.set(it.spin.x * t * 0.4 + it.ph, it.spin.y * t * 0.5, it.spin.z * t * 0.3);
        q.setFromEuler(e);
        p.set(it.p.x + Math.sin(t * 0.13 + it.ph) * 1.5, it.p.y + Math.sin(t * 0.4 + it.ph) * 0.8, it.p.z + Math.cos(t * 0.11 + it.ph) * 1.2);
        sh.mesh.setMatrixAt(i, m.compose(p, q, s.set(it.s * 0.3, it.s * 1.4, it.s * 0.3)));
      });
      sh.mesh.instanceMatrix.needsUpdate = true;
    }
    if (this.pylonLights) this.pylonLights.forEach((l, k) => (l.visible = (t * 1.2 + k / 3) % 1 < 0.6));
    // ab und zu steigen Plasmablasen aus dem See (Farben über recolor)
    if (Math.random() < dt * 2) {
      const x = rnd(-CAVE.rx, CAVE.rx) * 0.6;
      const z = rnd(-CAVE.rz, CAVE.rz) * 0.5 + ROUTE_Z;
      if (this.heightAt(x, z) < 0.5) this.stars.emit(2, (p) => Object.assign(p, { x, y: 0.2, z, vy: rnd(0.8, 1.6), maxLife: rnd(1.2, 2), size: rnd(0.25, 0.4), sizeEnd: 0.05, r: 0.5, g: 1.8, b: 2.3, alpha: 1, spin: rnd(-2, 2) }));
    }
  }

  override dispose() {
    const mine = this.mine;
    if (mine) {
      for (const g of mine.geos) g.dispose();
      for (const m of mine.mats) m.dispose();
      for (const t of mine.texs) t.dispose();
    }
    this.tele?.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
    this.islandCrystals?.dispose();
    this.shards?.mesh.dispose();
    for (const n of ['kristallgruppen']) (this.scene.getObjectByName(n) as THREE.InstancedMesh | undefined)?.dispose();
    super.dispose();
  }
}
