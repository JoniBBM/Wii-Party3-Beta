/**
 * Wetter, Jahreszeit und Festzeit auf dem Beamer (Insel, Blockwelt, Weltall): Himmelstönung, Nebel, Licht,
 * Regen/Schnee (auf der Grafikkarte animiert, folgt der Kamera), Blitze mit Donner, wachsende
 * Schneedecke auf allen nach oben zeigenden Flächen, Herbstlaub. Übergänge laufen weich.
 * Weltall: leuchtender Sporenregen, Kristallstaub, Ionensturm mit violetten Blitzen, Staubdunst,
 * Nebelschwaden; Jahreszeiten als Farbstimmungen (Frühling minzig, Herbst warm-magenta, Winter eisig).
 */
import * as THREE from 'three';
import type { Atmosphere, Theme } from '@insel/shared';
import type { BoardAudio } from './audio.ts';

/** Schnee auf Oberseiten: in bestehende Materialien einweben (Kette mit vorhandenem onBeforeCompile) */
export function snowify(material: THREE.Material, uSnow: { value: number }) {
  if ((material.userData as { snow?: boolean }).snow) return;
  (material.userData as { snow?: boolean }).snow = true;
  const prev = material.onBeforeCompile.bind(material);
  const prevKey = material.customProgramCacheKey.bind(material);
  material.onBeforeCompile = (shader, renderer) => {
    prev(shader, renderer);
    shader.uniforms.uSnow = uSnow;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying float vSnowUp;')
      .replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\nvSnowUp = normalize(mat3(modelMatrix) * objectNormal).y;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\n#define SNOW_FX\nuniform float uSnow;\nvarying float vSnowUp;')
      .replace(
        '#include <map_fragment>',
        '#include <map_fragment>\nfloat snowAmt = uSnow * smoothstep(0.55, 0.85, vSnowUp);\ndiffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.9, 0.94, 1.0) * (0.8 + 0.3 * dot(diffuseColor.rgb, vec3(0.3, 0.5, 0.2))), snowAmt);',
      );
  };
  material.customProgramCacheKey = () => `${prevKey()}|snow`;
  material.needsUpdate = true;
}

const PRECIP_VERT = /* glsl */ `
  attribute vec3 aSeed;
  uniform vec3 uCam;
  uniform float uTime;
  uniform float uSpeed;
  uniform float uSize;
  uniform float uScale;
  uniform float uDrift;
  varying float vAlpha;
  void main() {
    // Box um die Kamera; Position wandert mit der Zeit nach unten und wird umgebrochen
    vec3 box = vec3(70.0, 46.0, 70.0);
    vec3 p = aSeed;
    p.y = fract(p.y - uTime * uSpeed / box.y);
    p.x = fract(p.x + sin(uTime * 0.7 + aSeed.z * 30.0) * uDrift / box.x + uTime * uDrift * 0.15 / box.x);
    vec3 w = uCam + (p - 0.5) * box;
    vec4 mv = viewMatrix * vec4(w, 1.0);
    float d = -mv.z;
    // nah an der Kamera nicht riesig werden, sondern ausblenden
    gl_PointSize = min(14.0, uSize * uScale / max(0.5, d));
    vAlpha = smoothstep(46.0, 20.0, d) * smoothstep(1.5, 4.5, d);
    gl_Position = projectionMatrix * mv;
  }
`;

const precipFrag = (kind: 'rain' | 'snow', pixel: boolean) => /* glsl */ `
  uniform float uAmount;
  uniform vec3 uColor;
  varying float vAlpha;
  void main() {
    vec2 p = gl_PointCoord - 0.5;
    float a = ${
      kind === 'rain'
        ? pixel
          ? 'step(abs(p.x), 0.06) * step(abs(p.y), 0.5)'
          : 'smoothstep(0.08, 0.0, abs(p.x)) * smoothstep(0.5, 0.2, abs(p.y))'
        : pixel
          ? 'step(abs(p.x), 0.22) * step(abs(p.y), 0.22)'
          : 'smoothstep(0.5, 0.15, length(p))'
    };
    a *= uAmount * vAlpha;
    if (a < 0.02) discard;
    gl_FragColor = vec4(uColor, a * ${kind === 'rain' ? '0.55' : '0.95'});
    #include <colorspace_fragment>
  }
`;

function precipitation(kind: 'rain' | 'snow', count: number, pixel: boolean) {
  const geo = new THREE.BufferGeometry();
  const seeds = new Float32Array(count * 3);
  for (let i = 0; i < seeds.length; i++) seeds[i] = Math.random();
  geo.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 3));
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
  const uniforms = {
    uCam: { value: new THREE.Vector3() },
    uTime: { value: 0 },
    uSpeed: { value: kind === 'rain' ? 26 : 2.4 },
    uSize: { value: kind === 'rain' ? (pixel ? 1.4 : 1.1) : pixel ? 0.32 : 0.28 },
    uScale: { value: 800 },
    uDrift: { value: kind === 'rain' ? 0.4 : 2.2 },
    uAmount: { value: 0 },
    uColor: { value: new THREE.Color(kind === 'rain' ? (pixel ? '#5a7fd8' : '#b8c8dc') : '#ffffff') },
  };
  const mat = new THREE.ShaderMaterial({ vertexShader: PRECIP_VERT, fragmentShader: precipFrag(kind, pixel), uniforms, transparent: true, depthWrite: false });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  pts.renderOrder = 6;
  return { pts, uniforms, geo, mat };
}

const lerp = (a: number, b: number, k: number) => a + (b - a) * k;

type WaterFog = { uFogColor: { value: THREE.Color }; uFogNear: { value: number }; uFogFar: { value: number }; uDim: { value: number } };

export interface AtmosphereOptions {
  scene: THREE.Scene;
  sun: THREE.DirectionalLight;
  hemi: THREE.HemisphereLight;
  camera: THREE.Camera;
  theme: Theme;
  audio: BoardAudio;
  /** Insel-Wasser mit eigenem Dunst (ShaderMaterial mit uFogColor/uFogNear/uFogFar/uDim) */
  water?: THREE.Mesh;
  /** Himmel mit Sternen (Weltall): bei Nacht heller, bei Wolken schwächer */
  sky?: { setStars?: (k: number) => void; setClouds?: (k: number) => void };
}

/** Farben des Weltall-Wetters */
const SPACE = {
  cloud: new THREE.Color('#9a8fc8'),
  haze: new THREE.Color('#f0d0e4'),
  overlayTop: new THREE.Color('#6a4fa8'),
  bolt: new THREE.Color('#b77dff'),
  boltHemi: new THREE.Color('#b98cff'),
  spring: { sun: new THREE.Color('#f0fff2'), hemi: new THREE.Color('#c4ffe6'), fog: new THREE.Color('#b4f7e0') },
  autumn: { sun: new THREE.Color('#ffa874'), hemi: new THREE.Color('#ffc2d8'), fog: new THREE.Color('#f7bfd0') },
  winter: { sun: new THREE.Color('#dce9ff'), hemi: new THREE.Color('#cfe2ff'), fog: new THREE.Color('#cde0ff') },
};

export class AtmosphereFx {
  readonly group = new THREE.Group();
  readonly uSnow = { value: 0 };
  private target: Atmosphere = { weather: 'clear', season: 'summer', festive: 'off' };
  private cur = { cloud: 0, rain: 0, snow: 0, fog: 0, night: 0, autumn: 0, cover: 0 };
  private base: { fog: THREE.Color; near: number; far: number; bg: THREE.Color; sun: THREE.Color; sunI: number; hemiSky: THREE.Color; hemiGround: THREE.Color; hemiI: number; env: number; wNear: number; wFar: number };
  private overlay: THREE.Mesh;
  private overlayMat: THREE.ShaderMaterial;
  private rain: ReturnType<typeof precipitation>;
  private snow: ReturnType<typeof precipitation>;
  private flash = 0;
  private nextBolt = 6;
  private leaves: { m: THREE.MeshLambertMaterial | THREE.MeshStandardMaterial; base: THREE.Color }[] = [];
  private hideInSnow: THREE.Object3D[] = [];
  private tmp = new THREE.Color();
  private space: boolean;
  /** Weltall: sichtbarer Blitz (Ionensturm) */
  private bolt: THREE.Mesh | null = null;
  private season = { spring: 0, winter: 0 };

  constructor(private o: AtmosphereOptions) {
    const fog = o.scene.fog as THREE.Fog;
    const bg = o.scene.background instanceof THREE.Color ? o.scene.background.clone() : fog.color.clone();
    const wu = this.waterUniforms();
    this.base = {
      fog: fog.color.clone(),
      near: fog.near,
      far: fog.far,
      bg,
      sun: o.sun.color.clone(),
      sunI: o.sun.intensity,
      hemiSky: o.hemi.color.clone(),
      hemiGround: o.hemi.groundColor.clone(),
      hemiI: o.hemi.intensity,
      env: o.scene.environmentIntensity,
      wNear: wu?.uFogNear?.value ?? 140,
      wFar: wu?.uFogFar?.value ?? 420,
    };
    // Tönung des Himmels: Kuppel innerhalb der Himmelskuppel, färbt Himmel und Horizont
    this.overlayMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      transparent: true,
      depthWrite: false,
      fog: false,
      uniforms: { uTop: { value: new THREE.Color('#5d6670') }, uBottom: { value: new THREE.Color('#9aa3ab') }, uOpacity: { value: 0 } },
      vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader:
        'uniform vec3 uTop; uniform vec3 uBottom; uniform float uOpacity; varying vec3 vP; void main(){ float h = clamp(normalize(vP).y * 1.6 + 0.2, 0.0, 1.0); gl_FragColor = vec4(mix(uBottom, uTop, h), uOpacity);\n#include <colorspace_fragment>\n}',
    });
    this.overlay = new THREE.Mesh(new THREE.SphereGeometry(260, 32, 16), this.overlayMat);
    this.overlay.renderOrder = -5;
    this.overlay.frustumCulled = false;
    const pixel = o.theme === 'blocks';
    this.space = o.theme === 'space';
    if (this.space) {
      // Sporenregen: langsam schwebende, leuchtende Kügelchen; Kristallstaub: funkelnd, leicht
      this.rain = precipitation('snow', 6000, false);
      this.rain.uniforms.uSpeed.value = 5;
      this.rain.uniforms.uSize.value = 0.5;
      this.rain.uniforms.uDrift.value = 1.8;
      this.rain.uniforms.uColor.value.set('#8dffc4').multiplyScalar(1.6);
      this.snow = precipitation('snow', 6000, false);
      this.snow.uniforms.uSpeed.value = 1.6;
      this.snow.uniforms.uSize.value = 0.26;
      this.snow.uniforms.uDrift.value = 2.8;
      this.snow.uniforms.uColor.value.set('#eef6ff').multiplyScalar(1.5);
    } else {
      this.rain = precipitation('rain', 7000, pixel);
      this.snow = precipitation('snow', 5000, pixel);
    }
    this.group.add(this.overlay, this.rain.pts, this.snow.pts);
    this.group.name = 'atmosphere';
  }

  /** Ionensturm: gezackter, violett leuchtender Blitz vom Himmel bis zum Boden (neu bei jedem Einschlag) */
  private strike() {
    if (this.bolt) {
      this.bolt.geometry.dispose();
      this.bolt.removeFromParent();
    }
    // vor der Kamera (im Bild), seitlich zufällig versetzt
    const cam = this.o.camera.position;
    const fwd = this.o.camera.getWorldDirection(new THREE.Vector3()).setY(0);
    if (fwd.lengthSq() < 1e-4) fwd.set(0, 0, -1);
    fwd.normalize();
    const d = 30 + Math.random() * 30;
    const lat = (Math.random() - 0.5) * d * 0.9;
    const x = cam.x + fwd.x * d - fwd.z * lat;
    const z = cam.z + fwd.z * d + fwd.x * lat;
    const pts: THREE.Vector3[] = [];
    let px = x;
    let pz = z;
    for (let y = 70; y > -1; y -= 6) {
      pts.push(new THREE.Vector3(px, y, pz));
      px += (Math.random() - 0.5) * 5;
      pz += (Math.random() - 0.5) * 5;
    }
    const geo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.1), pts.length * 3, 0.34, 5, false);
    if (!this.boltMat) this.boltMat = new THREE.MeshBasicMaterial({ color: SPACE.bolt.clone().multiplyScalar(1.6), transparent: true, depthWrite: false, fog: false });
    this.bolt = new THREE.Mesh(geo, this.boltMat);
    this.bolt.frustumCulled = false;
    this.group.add(this.bolt);
  }
  private boltMat: THREE.MeshBasicMaterial | null = null;

  private waterUniforms(): WaterFog | null {
    const m = this.o.water?.material as THREE.ShaderMaterial | undefined;
    return m?.uniforms && 'uDim' in m.uniforms ? (m.uniforms as unknown as WaterFog) : null;
  }

  /** Materialien, die Schnee bekommen (Gelände, Blöcke) */
  addSnow(...mats: THREE.Material[]) {
    for (const m of mats) snowify(m, this.uSnow);
  }

  /** Laub, das sich im Herbst färbt */
  addLeaves(...mats: THREE.Material[]) {
    for (const m of mats) {
      const mm = m as THREE.MeshLambertMaterial;
      if (mm.color) this.leaves.push({ m: mm, base: mm.color.clone() });
    }
  }

  /** Objekte, die unter einer Schneedecke verschwinden (Gras, Blumen) */
  addHideInSnow(...objs: (THREE.Object3D | null | undefined)[]) {
    for (const o of objs) if (o) this.hideInSnow.push(o);
  }

  set(a: Atmosphere) {
    this.target = a;
  }

  setViewport(heightPx: number) {
    this.rain.uniforms.uScale.value = heightPx * 0.9;
    this.snow.uniforms.uScale.value = heightPx * 0.9;
  }

  update(t: number, dt: number) {
    const a = this.target;
    const w = a.weather;
    const goal = {
      cloud: w === 'cloudy' ? 0.55 : w === 'rain' ? 0.72 : w === 'storm' ? 0.92 : w === 'snow' ? 0.45 : w === 'fog' ? 0.35 : 0,
      rain: w === 'rain' ? 0.75 : w === 'storm' ? 1 : 0,
      snow: w === 'snow' ? 1 : 0,
      fog: w === 'fog' ? 1 : w === 'snow' ? 0.35 : w === 'rain' || w === 'storm' ? 0.25 : 0,
      night: a.festive === 'halloween' ? 1 : a.festive === 'christmas' ? 0.35 : 0,
      autumn: a.season === 'autumn' || a.festive === 'halloween' ? 1 : 0,
      // Schneedecke: im Winter und bei Schneefall; schmilzt sonst langsam
      cover: w === 'snow' || a.festive === 'christmas' ? 1 : a.season === 'winter' ? 0.7 : 0,
    };
    const k = Math.min(1, dt * 0.6);
    const c = this.cur;
    c.cloud = lerp(c.cloud, goal.cloud, k);
    c.rain = lerp(c.rain, goal.rain, k);
    c.snow = lerp(c.snow, goal.snow, k);
    c.fog = lerp(c.fog, goal.fog, k);
    c.night = lerp(c.night, goal.night, k);
    c.autumn = lerp(c.autumn, goal.autumn, k);
    c.cover = lerp(c.cover, goal.cover, Math.min(1, dt * (goal.cover > c.cover ? 0.08 : 0.12)));

    // Blitz
    if (w === 'storm') {
      this.nextBolt -= dt;
      if (this.nextBolt <= 0) {
        this.flash = 1;
        this.nextBolt = 5 + Math.random() * 9;
        const delay = 300 + Math.random() * 1400;
        this.o.audio.play('rumble', { volume: 0.9, delay: delay / 1000 });
        if (this.space) this.strike();
      }
    }
    this.flash = Math.max(0, this.flash - dt * 3.2);
    const bolt = this.flash > 0 ? (Math.sin(this.flash * 40) > 0 ? this.flash : this.flash * 0.3) : 0;
    if (this.space) return this.updateSpace(t, dt, bolt);

    // Farben und Licht
    const s = this.o.scene;
    const fog = s.fog as THREE.Fog;
    const gray = this.tmp.set('#8f99a3');
    const night = new THREE.Color('#2b1f40');
    fog.color.copy(this.base.fog).lerp(gray, c.cloud * 0.6).lerp(new THREE.Color('#d8dde2'), c.fog * 0.5).lerp(night, c.night * 0.75);
    // Dunst rückt näher, die Insel bleibt aber aus der Übersicht erkennbar
    fog.near = lerp(lerp(this.base.near, 25, c.fog), 60, c.night * 0.5);
    fog.far = Math.max(150, lerp(this.base.far, 190, Math.max(c.fog, c.night * 0.7, c.rain * 0.4)));
    const wu = this.waterUniforms();
    if (wu) {
      wu.uFogColor.value.copy(fog.color);
      wu.uFogNear.value = lerp(this.base.wNear, 25, Math.max(c.fog, c.night * 0.5));
      wu.uFogFar.value = Math.max(150, lerp(this.base.wFar, 200, Math.max(c.fog, c.night * 0.7, c.rain * 0.4)));
      wu.uDim.value = (1 - c.cloud * 0.35) * (1 - c.night * 0.6);
    }
    s.environmentIntensity = this.base.env * (1 - c.cloud * 0.45) * (1 - c.night * 0.7) + bolt * 0.6;
    if (s.background instanceof THREE.Color) s.background.copy(fog.color);
    this.overlayMat.uniforms.uOpacity!.value = Math.min(0.92, c.cloud * 0.75 + c.fog * 0.45 + c.night * 0.8) + bolt * 0.25;
    (this.overlayMat.uniforms.uTop!.value as THREE.Color).set('#59626c').lerp(new THREE.Color('#140c24'), c.night).lerp(new THREE.Color('#ffffff'), bolt * 0.5);
    (this.overlayMat.uniforms.uBottom!.value as THREE.Color).copy(fog.color);
    const sun = this.o.sun;
    sun.intensity = this.base.sunI * (1 - c.cloud * 0.72) * (1 - c.night * 0.65) * (1 - c.fog * 0.3);
    sun.color.copy(this.base.sun).lerp(new THREE.Color('#ffb070'), c.autumn * 0.25 + c.night * 0.6);
    const hemi = this.o.hemi;
    hemi.intensity = this.base.hemiI * (1 - c.night * 0.45) * (1 + c.cover * 0.15) + bolt * 2.5;
    hemi.color.copy(this.base.hemiSky).lerp(new THREE.Color('#9d8cff'), c.night * 0.6);
    hemi.groundColor.copy(this.base.hemiGround).lerp(new THREE.Color('#e8eef5'), c.cover * 0.6);

    // Niederschlag
    for (const [p, amt] of [
      [this.rain, c.rain],
      [this.snow, c.snow],
    ] as const) {
      p.uniforms.uTime.value = t;
      p.uniforms.uCam.value.copy(this.o.camera.position);
      p.uniforms.uAmount.value = amt;
      p.pts.visible = amt > 0.02;
    }
    this.uSnow.value = c.cover;
    for (const o of this.hideInSnow) o.visible = c.cover < 0.45;
    for (const l of this.leaves) l.m.color.copy(l.base).lerp(new THREE.Color('#e8913a'), c.autumn * 0.75);
  }

  /** Weltall: gleiche Übergänge, eigene Farben; Jahreszeiten als Farbstimmungen */
  private updateSpace(t: number, dt: number, bolt: number) {
    const a = this.target;
    const c = this.cur;
    const k = Math.min(1, dt * 0.6);
    const ss = this.season;
    ss.spring = lerp(ss.spring, a.season === 'spring' && a.festive === 'off' ? 1 : 0, k);
    ss.winter = lerp(ss.winter, a.season === 'winter' || a.festive === 'christmas' ? 1 : 0, k);
    const autumn = c.autumn * (1 - c.night);
    const s = this.o.scene;
    const fog = s.fog as THREE.Fog;
    fog.color
      .copy(this.base.fog)
      .lerp(SPACE.spring.fog, ss.spring * 0.55)
      .lerp(SPACE.autumn.fog, autumn * 0.65)
      .lerp(SPACE.winter.fog, ss.winter * 0.6)
      .lerp(SPACE.cloud, c.cloud * 0.55)
      .lerp(SPACE.haze, c.fog * 0.6)
      .lerp(new THREE.Color('#2b1f50'), c.night * 0.72);
    fog.near = lerp(lerp(this.base.near, 22, c.fog), 60, c.night * 0.5);
    fog.far = Math.max(150, lerp(this.base.far, 180, Math.max(c.fog, c.night * 0.7, c.rain * 0.4)));
    const wu = this.waterUniforms();
    if (wu) {
      wu.uFogColor.value.copy(fog.color);
      wu.uFogNear.value = lerp(this.base.wNear, 22, Math.max(c.fog, c.night * 0.5));
      wu.uFogFar.value = Math.max(150, lerp(this.base.wFar, 190, Math.max(c.fog, c.night * 0.7, c.rain * 0.4)));
      // Plasma leuchtet nachts weiter: kaum abdunkeln
      wu.uDim.value = (1 - c.cloud * 0.3) * (1 - c.night * 0.5);
    }
    s.environmentIntensity = this.base.env * (1 - c.cloud * 0.4) * (1 - c.night * 0.6) + bolt * 0.8;
    if (s.background instanceof THREE.Color) s.background.copy(fog.color);
    this.overlayMat.uniforms.uOpacity!.value = Math.min(0.9, c.cloud * 0.6 + c.fog * 0.5 + c.night * 0.72) + bolt * 0.3;
    (this.overlayMat.uniforms.uTop!.value as THREE.Color).copy(SPACE.overlayTop).lerp(new THREE.Color('#120a2e'), c.night).lerp(SPACE.bolt, bolt * 0.7);
    (this.overlayMat.uniforms.uBottom!.value as THREE.Color).copy(fog.color);
    const sun = this.o.sun;
    sun.intensity = this.base.sunI * (1 - c.cloud * 0.6) * (1 - c.night * 0.6) * (1 - c.fog * 0.3);
    sun.color
      .copy(this.base.sun)
      .lerp(SPACE.spring.sun, ss.spring * 0.6)
      .lerp(SPACE.autumn.sun, autumn * 0.65)
      .lerp(SPACE.winter.sun, ss.winter * 0.6)
      .lerp(new THREE.Color('#c9a8ff'), c.night * 0.6);
    const hemi = this.o.hemi;
    hemi.intensity = this.base.hemiI * (1 - c.night * 0.4) * (1 + c.cover * 0.12) + bolt * 3;
    hemi.color
      .copy(this.base.hemiSky)
      .lerp(SPACE.spring.hemi, ss.spring * 0.75)
      .lerp(SPACE.autumn.hemi, autumn * 0.8)
      .lerp(SPACE.winter.hemi, ss.winter * 0.75)
      .lerp(new THREE.Color('#9d8cff'), c.night * 0.6)
      .lerp(SPACE.boltHemi, Math.min(1, bolt));
    hemi.groundColor.copy(this.base.hemiGround).lerp(new THREE.Color('#e3e8ff'), c.cover * 0.5);
    this.o.sky?.setStars?.((1 - c.cloud * 0.8) * (1 - c.fog * 0.8) * (1 + c.night * 2.2));
    this.o.sky?.setClouds?.(c.cloud);
    // Ionenblitz sichtbar, solange es blitzt
    if (this.bolt) {
      this.bolt.visible = bolt > 0.05;
      if (this.boltMat) this.boltMat.opacity = Math.min(1, bolt * 1.6);
    }
    for (const [p, amt] of [
      [this.rain, c.rain],
      [this.snow, c.snow],
    ] as const) {
      p.uniforms.uTime.value = t;
      p.uniforms.uCam.value.copy(this.o.camera.position);
      p.uniforms.uAmount.value = amt;
      p.pts.visible = amt > 0.02;
    }
    this.uSnow.value = c.cover;
    for (const o of this.hideInSnow) o.visible = c.cover < 0.45;
  }

  dispose() {
    if (this.bolt) this.bolt.geometry.dispose();
    this.boltMat?.dispose();
    this.overlay.geometry.dispose();
    this.overlayMat.dispose();
    for (const p of [this.rain, this.snow]) {
      p.geo.dispose();
      p.mat.dispose();
    }
  }
}
