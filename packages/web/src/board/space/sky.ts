/**
 * Himmel des Alien-Planeten: Tag mit violettem Zenit und türkisem Horizont (hell genug für den
 * Beamer), funkelnde Sterne und ein zarter Nebel/Galaxienband oben, rosa-weiße Sonne, ein großer
 * Ringplanet und zwei Monde, ziehende Nebelschwaden und schwebende Felsinseln mit Kristallen am
 * Horizont. Alles prozedural (keine Texturen, kein HDRI).
 */
import * as THREE from 'three';
import { rand } from '../noise.ts';
import type { Sky } from '../sky.ts';
import { GLSL_NOISE } from '../worldfx.ts';
import { SPACE_SKY } from './palette.ts';

/** Richtungen der Himmelskörper (für Licht, Fest-Deko, Kamera-Ideen) */
export const SPACE_SKY_BODIES = {
  ring: new THREE.Vector3(0.42, 0.3, -1).normalize(),
  moonA: new THREE.Vector3(-0.85, 0.36, -0.62).normalize(),
  moonB: new THREE.Vector3(0.95, 0.58, -0.18).normalize(),
};

const DOME_FRAG = /* glsl */ `
  uniform vec3 uZenith;
  uniform vec3 uMid;
  uniform vec3 uHorizon;
  uniform vec3 uSunDir;
  uniform vec3 uSunColor;
  uniform float uTime;
  uniform float uStars;
  uniform float uNebula;
  varying vec3 vDir;
  ${GLSL_NOISE}
  float hash3(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
  /** Sterne: je Zelle eines Rasters auf der Kugel höchstens einer, mit Funkeln */
  float starLayer(vec3 d, float scale, float density) {
    vec3 q = d * scale;
    vec3 c = floor(q);
    float h = hash3(c);
    if (h < density) return 0.0;
    vec3 o = vec3(hash3(c + 1.7), hash3(c + 9.1), hash3(c + 4.3)) * 0.7 + 0.15;
    float dist = length(q - c - o);
    float tw = 0.65 + 0.35 * sin(uTime * (1.5 + h * 3.0) + h * 40.0);
    return smoothstep(0.24, 0.0, dist) * tw * (0.8 + (h - density) / (1.0 - density) * 2.2);
  }
  void main() {
    vec3 d = normalize(vDir);
    float h = max(d.y, 0.0);
    // Verlauf: Horizont türkis → lavendel → violetter Zenit
    vec3 col = mix(uHorizon, uMid, smoothstep(0.0, 0.32, h));
    col = mix(col, uZenith, smoothstep(0.25, 0.95, h));
    // Nebel / Galaxienband (schräg über den Himmel), oben deutlicher
    vec3 bandN = normalize(vec3(0.35, 0.25, 0.9));
    float band = exp(-pow(dot(d, bandN) * 3.2, 2.0));
    vec2 np = vec2(atan(d.z, d.x) * 2.2, d.y * 4.0);
    float neb = fxFbm(np * 1.3 + 4.0) * 0.65 + fxFbm(np * 3.1 - 2.0) * 0.35;
    float up = smoothstep(0.12, 0.6, h);
    col += mix(vec3(1.0, 0.45, 0.8), vec3(0.35, 0.95, 1.0), fxNoise(np * 0.8 + 7.0)) * smoothstep(0.38, 0.8, neb) * band * up * uNebula;
    // Sterne (oben sichtbar, zum Horizont hin im Dunst)
    float stars = starLayer(d, 120.0, 0.985) + starLayer(d, 230.0, 0.99) * 0.7;
    col += vec3(1.0, 0.97, 1.0) * stars * up * uStars * (0.9 + band * 0.8);
    // Sonne: Scheibe, Glanz, weiter Schein
    float sun = max(dot(d, normalize(uSunDir)), 0.0);
    col += uSunColor * (smoothstep(0.9993, 0.9996, sun) * 3.5 + pow(sun, 260.0) * 1.2 + pow(sun, 18.0) * 0.22 + pow(sun, 3.0) * 0.06);
    // unter dem Horizont: Dunstfarbe
    col = mix(col, uHorizon, smoothstep(0.0, -0.08, d.y));
    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

/** Planet mit Streifen (Breitengrad + Rauschen), beleuchtet von der Sonne, mit hellem Rand */
const PLANET_VERT = /* glsl */ `
  varying vec3 vLocal;
  varying vec3 vN;
  varying vec3 vView;
  void main() {
    vLocal = position;
    vN = normalize(mat3(modelMatrix) * normal);
    vec4 w = modelMatrix * vec4(position, 1.0);
    vView = normalize(cameraPosition - w.xyz);
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`;
const PLANET_FRAG = /* glsl */ `
  uniform vec3 uA;
  uniform vec3 uB;
  uniform vec3 uC;
  uniform vec3 uSunDir;
  uniform vec3 uRim;
  uniform float uBands;
  uniform float uCraters;
  varying vec3 vLocal;
  varying vec3 vN;
  varying vec3 vView;
  ${GLSL_NOISE}
  void main() {
    vec3 p = normalize(vLocal);
    float lat = p.y * uBands + fxNoise(p.xz * 3.0) * 1.2 + fxNoise(p.xy * 7.0) * 0.35;
    float b = sin(lat) * 0.5 + 0.5;
    vec3 col = mix(uA, uB, smoothstep(0.25, 0.75, b));
    col = mix(col, uC, smoothstep(0.78, 0.95, fxNoise(vec2(lat * 0.7, atan(p.z, p.x) * 2.0))) * 0.7);
    // Krater (Monde)
    if (uCraters > 0.0) {
      float cr = fxNoise(p.xy * 6.0 + p.z * 3.0) * 0.6 + fxNoise(p.zy * 13.0) * 0.4;
      col *= 1.0 - smoothstep(0.6, 0.75, cr) * 0.35 * uCraters;
      col *= 1.0 + smoothstep(0.55, 0.6, cr) * (1.0 - smoothstep(0.6, 0.66, cr)) * 0.3 * uCraters;
    }
    float light = max(dot(normalize(vN), normalize(uSunDir)), 0.0);
    col *= 0.32 + light * 0.95;
    float rim = pow(1.0 - max(dot(normalize(vN), vView), 0.0), 3.0);
    col += uRim * rim * 0.6;
    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

function puffTexture(): THREE.CanvasTexture {
  const s = 128;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const g = c.getContext('2d')!;
  const grd = g.createRadialGradient(s * 0.5, s * 0.45, s * 0.05, s * 0.5, s * 0.5, s * 0.5);
  grd.addColorStop(0, 'rgba(255,255,255,0.95)');
  grd.addColorStop(0.5, 'rgba(255,250,255,0.6)');
  grd.addColorStop(1, 'rgba(255,240,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, s, s);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * Umgebungslicht (Spiegelungen, indirektes Licht) aus dem Himmelsverlauf – statt des Insel-HDRI:
 * oben violett, Horizont türkis, unten violetter Boden, dazu ein heller Fleck in Sonnenrichtung.
 */
export function spaceEnvironment(renderer: THREE.WebGLRenderer, sunDir = new THREE.Vector3(-44, 46, 36)): THREE.Texture {
  const scene = new THREE.Scene();
  const sun = sunDir.clone().normalize();
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    uniforms: { uZenith: { value: SPACE_SKY.zenith }, uMid: { value: SPACE_SKY.mid }, uHorizon: { value: SPACE_SKY.horizon }, uSun: { value: sun } },
    vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: /* glsl */ `
      uniform vec3 uZenith; uniform vec3 uMid; uniform vec3 uHorizon; uniform vec3 uSun; varying vec3 vDir;
      void main() {
        vec3 d = normalize(vDir);
        vec3 col = mix(uHorizon, uMid, smoothstep(0.0, 0.35, d.y));
        col = mix(col, uZenith, smoothstep(0.3, 1.0, d.y));
        col = mix(col, vec3(0.32, 0.24, 0.55), smoothstep(0.0, -0.4, d.y));
        col += vec3(1.0, 0.95, 0.98) * pow(max(dot(d, uSun), 0.0), 24.0) * 2.0;
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(10, 32, 16), mat);
  scene.add(dome);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromScene(scene, 0.02).texture;
  pmrem.dispose();
  dome.geometry.dispose();
  mat.dispose();
  return env;
}

export function createSpaceSky(sunDir: THREE.Vector3): Sky & { setStars: (k: number) => void; setClouds: (k: number) => void } {
  const group = new THREE.Group();
  group.name = 'space-sky';
  const disposables: { dispose(): void }[] = [];
  const own = <T extends { dispose(): void }>(x: T) => (disposables.push(x), x);
  const sun = sunDir.clone().normalize();

  // Himmelskuppel
  const domeMat = own(
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        uZenith: { value: SPACE_SKY.zenith.clone() },
        uMid: { value: SPACE_SKY.mid.clone() },
        uHorizon: { value: SPACE_SKY.horizon.clone() },
        uSunDir: { value: sun.clone() },
        uSunColor: { value: SPACE_SKY.sun.clone() },
        uTime: { value: 0 },
        uStars: { value: 1 },
        uNebula: { value: 0.45 },
      },
      vertexShader: /* glsl */ `
        varying vec3 vDir;
        void main() {
          vDir = normalize((modelMatrix * vec4(position, 0.0)).xyz);
          vec4 p = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0);
          gl_Position = p.xyww;
        }
      `,
      fragmentShader: DOME_FRAG,
    }),
  );
  const dome = new THREE.Mesh(own(new THREE.SphereGeometry(900, 48, 24)), domeMat);
  dome.renderOrder = -10;
  dome.frustumCulled = false;
  group.add(dome);

  const planetMat = (a: string, b: string, c: string, rim: string, bands: number, craters: number) =>
    own(
      new THREE.ShaderMaterial({
        fog: false,
        uniforms: {
          uA: { value: new THREE.Color(a) },
          uB: { value: new THREE.Color(b) },
          uC: { value: new THREE.Color(c) },
          uRim: { value: new THREE.Color(rim) },
          uSunDir: { value: sun.clone() },
          uBands: { value: bands },
          uCraters: { value: craters },
        },
        vertexShader: PLANET_VERT,
        fragmentShader: PLANET_FRAG,
      }),
    );

  // Ringplanet (groß, im Norden über dem Meer)
  const ringPlanet = new THREE.Group();
  ringPlanet.position.copy(SPACE_SKY_BODIES.ring).multiplyScalar(400);
  const body = new THREE.Mesh(own(new THREE.IcosahedronGeometry(42, 4)), planetMat('#ffb27a', '#f07ab8', '#fff0c8', '#ffd0f0', 9, 0));
  ringPlanet.add(body);
  const ringGeo = own(new THREE.RingGeometry(56, 92, 96, 1));
  const ringMat = own(
    new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      fog: false,
      uniforms: { uSunDir: { value: sun.clone() } },
      vertexShader: 'varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: /* glsl */ `
        varying vec2 vP;
        void main() {
          float r = (length(vP) - 56.0) / 36.0;
          float bands = 0.55 + 0.45 * sin(r * 38.0) * sin(r * 11.0 + 1.3);
          float a = smoothstep(0.0, 0.06, r) * smoothstep(1.0, 0.9, r) * (0.35 + bands * 0.55);
          a *= 1.0 - smoothstep(0.42, 0.46, r) * (1.0 - smoothstep(0.5, 0.54, r)) * 0.85;
          vec3 col = mix(vec3(1.0, 0.86, 0.7), vec3(0.95, 0.7, 1.0), r);
          gl_FragColor = vec4(col * 1.05, a * 0.85);
          #include <colorspace_fragment>
        }
      `,
    }),
  );
  const ring = new THREE.Mesh(ringGeo, ringMat);
  ring.rotation.set(-Math.PI / 2 + 0.38, 0.25, 0.32);
  ring.renderOrder = -4;
  ringPlanet.add(ring);
  ringPlanet.rotation.z = 0.2;
  group.add(ringPlanet);

  // Zwei Monde: groß, lila mit Kratern – klein, türkis
  const moonA = new THREE.Mesh(own(new THREE.IcosahedronGeometry(17, 3)), planetMat('#e2d6ff', '#b9a8f0', '#ffffff', '#f4ecff', 2.5, 1));
  moonA.position.copy(SPACE_SKY_BODIES.moonA).multiplyScalar(380);
  group.add(moonA);
  const moonB = new THREE.Mesh(own(new THREE.IcosahedronGeometry(8.5, 2)), planetMat('#8ff5e6', '#4fc7d8', '#e8fffb', '#d8fff8', 3.5, 0.8));
  moonB.position.copy(SPACE_SKY_BODIES.moonB).multiplyScalar(360);
  group.add(moonB);

  // Nebelschwaden statt Haufenwolken (flach, zart rosa/lila)
  const R = rand(919);
  const tex = own(puffTexture());
  const wispMats = ['#ffe6f6', '#efe2ff', '#e2fbff'].map((c) => own(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, fog: true, color: c, opacity: 0.75 })));
  const wisps = new THREE.Group();
  for (let c = 0; c < 11; c++) {
    const cloud = new THREE.Group();
    const a = (c / 11) * Math.PI * 2 + R() * 0.5;
    const r = 120 + R() * 160;
    cloud.position.set(Math.cos(a) * r, 58 + R() * 30, Math.sin(a) * r);
    const puffs = 7 + Math.floor(R() * 6);
    const size = 12 + R() * 12;
    const m = wispMats[c % wispMats.length]!;
    for (let i = 0; i < puffs; i++) {
      const sp = new THREE.Sprite(m);
      const u = (i / (puffs - 1) - 0.5) * 2;
      const s = size * (0.8 + (1 - Math.abs(u)) * 0.6 + R() * 0.3);
      sp.position.set(u * size * 2.4 + (R() - 0.5) * 5, (1 - Math.abs(u)) * size * 0.18 + R() * 2, (R() - 0.5) * size * 0.9);
      sp.scale.set(s * 1.5, s * 0.5, 1);
      cloud.add(sp);
    }
    wisps.add(cloud);
  }
  group.add(wisps);

  // Schwebende Felsinseln mit Kristallen am Horizont – ohne Dunst (sonst Scherenschnitte in
  // Dunstfarbe vor dem Himmel), dafür blass gefärbt wie ferne Berge; schlechtes Wetter tönt sie
  // über die Himmelstönung (atmosphere.ts) mit ab
  const rockMat = own(new THREE.MeshStandardMaterial({ color: '#b7a8ea', roughness: 1, flatShading: true, fog: false }));
  const topMat = own(new THREE.MeshStandardMaterial({ color: '#9fe8da', roughness: 1, flatShading: true, fog: false }));
  const crystalMat = own(new THREE.MeshStandardMaterial({ color: '#b8fff4', emissive: new THREE.Color('#3ce8d0'), emissiveIntensity: 0.7, roughness: 0.3, flatShading: true, fog: false }));
  const pinkMat = own(new THREE.MeshStandardMaterial({ color: '#ffc8ee', emissive: new THREE.Color('#ff5fc8'), emissiveIntensity: 0.5, roughness: 0.3, flatShading: true, fog: false }));
  const floaters: { o: THREE.Object3D; y: number; ph: number }[] = [];
  const spots = [
    [-250, -230, 24, 18],
    [300, -170, 30, 24],
    [-340, 70, 20, 14],
    [230, 270, 16, 12],
    [40, -360, 34, 30],
    [-160, -330, 14, 36],
  ] as const;
  for (const [x, z, w, y] of spots) {
    const g = new THREE.Group();
    const under = new THREE.Mesh(own(new THREE.ConeGeometry(w, w * 1.3, 7, 2)), rockMat);
    under.rotation.x = Math.PI;
    under.position.y = -w * 0.65;
    const p = under.geometry.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) p.setX(i, p.getX(i) * (0.8 + R() * 0.4));
    under.geometry.computeVertexNormals();
    const top = new THREE.Mesh(own(new THREE.CylinderGeometry(w * 1.02, w * 0.98, w * 0.16, 7)), topMat);
    g.add(under, top);
    for (let k = 0; k < 5; k++) {
      const h = w * (0.4 + R() * 0.7);
      const c = new THREE.Mesh(own(new THREE.ConeGeometry(w * 0.12 + R() * w * 0.08, h, 5)), k % 3 === 0 ? pinkMat : crystalMat);
      const a = R() * Math.PI * 2;
      const r = R() * w * 0.6;
      c.position.set(Math.cos(a) * r, h / 2, Math.sin(a) * r);
      c.rotation.set((R() - 0.5) * 0.5, 0, (R() - 0.5) * 0.5);
      g.add(c);
    }
    g.position.set(x, y, z);
    g.rotation.y = R() * Math.PI;
    group.add(g);
    floaters.push({ o: g, y, ph: R() * 6 });
  }

  let stars = 1;
  return {
    group,
    setStars(k) {
      stars = k;
    },
    /** Bewölkt: Nebelschwaden dichter und lila, Nebelband am Himmel deutlicher */
    setClouds(k) {
      domeMat.uniforms.uNebula!.value = 0.45 + k * 0.7;
      for (const m of wispMats) m.opacity = 0.75 + k * 0.25;
      wisps.scale.setScalar(1 + k * 0.35);
    },
    update(t, dt) {
      domeMat.uniforms.uTime!.value = t;
      domeMat.uniforms.uStars!.value = stars;
      wisps.rotation.y += dt * 0.003;
      ringPlanet.rotation.y += dt * 0.004;
      for (const f of floaters) f.o.position.y = f.y + Math.sin(t * 0.25 + f.ph) * 1.5;
    },
    dispose() {
      for (const d of disposables) d.dispose();
    },
  };
}
