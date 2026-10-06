/**
 * Die 3D-Insel für den Beamer: Renderer, Licht, Himmel, Gelände, Meer, Deko, Felder,
 * Vulkan, Figuren, Kamera, Würfel und Nachbearbeitung – in zwei Qualitätsstufen.
 */
import * as THREE from 'three';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';
import {
  BloomEffect,
  BrightnessContrastEffect,
  DepthOfFieldEffect,
  HueSaturationEffect,
  EffectComposer,
  EffectPass,
  RenderPass,
  SMAAEffect,
  TiltShiftEffect,
  ToneMappingEffect,
  ToneMappingMode,
  VignetteEffect,
} from 'postprocessing';
import { N8AOPostPass } from 'n8ao';
import type { Effect, GameState, RenderQuality, Resolution } from '@insel/shared';
import { windUniforms } from './assets.ts';
import { BoardAudio } from './audio.ts';
import { CameraRig } from './camera.ts';
import { Ceremony } from './ceremony.ts';
import { Commentator } from './commentator.ts';
import { attachManualCamera } from './manual.ts';
import { DiceOverlay } from './dice3d.ts';
import { Director, type Caption } from './director.ts';
import { buildFields, type FieldMeshes } from './fields.ts';
import { VolcanoInside } from './inside.ts';
import { buildLayout, type IslandLayout } from './layout.ts';
import { Effects } from './particles.ts';
import { Pieces } from './pieces.ts';
import { Stunts } from './stunts.ts';
import { buildProps, type Props } from './props.ts';
import { buildGrass } from './grass.ts';
import { createAmbient, type Ambient } from './ambient.ts';
import { buildAnimals, type AnimalWorld } from './animals.ts';
import { buildHeightfield, buildTerrainMesh, heightTexture, terrainColorSampler } from './terrain.ts';
import { Tweens } from './tweens.ts';
import { buildVolcano, type VolcanoFx } from './volcano.ts';
import { createUltraTerrainMaterial, loadUltraTextures } from './ultra.ts';
import { createRiver, createWater, type RiverFx, type Water } from './water.ts';
import { fx } from './worldfx.ts';
import { createSky, type Sky } from './sky.ts';

export type Quality = RenderQuality;

interface Preset {
  /** höchstens so viele Bildpunkte je CSS-Pixel */
  pixelRatio: number;
  shadow: number;
  /** Schattenkarte nur jedes n-te Bild neu zeichnen */
  shadowEvery: number;
  ao: boolean;
  bloom: boolean;
  tilt: boolean;
  /** Anteil der Grasbüschel */
  grass: number;
  /** Ultra: echte Materialien, Tiefenschärfe, Wellen-Normalen, feinere Umgebungsverdeckung */
  ultra?: boolean;
}

/** Laufzeit-Stufen: lassen sich ohne Neuaufbau der Insel umschalten. */
const PRESETS: Record<Quality, Preset> = {
  ultra: { pixelRatio: 2, shadow: 4096, shadowEvery: 1, ao: true, bloom: true, tilt: false, grass: 1, ultra: true },
  high: { pixelRatio: 2, shadow: 4096, shadowEvery: 1, ao: true, bloom: true, tilt: true, grass: 0.55 },
  balanced: { pixelRatio: 1.25, shadow: 2048, shadowEvery: 2, ao: false, bloom: true, tilt: true, grass: 0.33 },
  eco: { pixelRatio: 1, shadow: 1024, shadowEvery: 3, ao: false, bloom: false, tilt: false, grass: 0.17 },
};

/** Aufbau (einmalig): Geländeauflösung, Wasser, Dichte der Deko (Gras: Ultra nutzt alles). */
const BUILD = { terrain: 384, water: 260, density: 1, grass: 36000 };

const HORIZON = new THREE.Color('#bfe3f7');

/** Nur zum Messen: ?perf=nomsaa,noao,nograss,nopost,shadow2048 */
const PERF = new Set((new URLSearchParams(location.search).get('perf') ?? '').split(','));

export interface BoardSceneOptions {
  /** Anfangsstufe; später mit setQuality umschaltbar */
  quality: Quality;
  fieldCount: number;
  onProgress?: (p: number, label: string) => void;
}

export class BoardScene {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(42, 1, 0.5, 600);
  readonly tweens = new Tweens();
  readonly effects = new Effects();
  readonly audio: BoardAudio;
  rig!: CameraRig;
  layout!: IslandLayout;
  fields!: FieldMeshes;
  pieces!: Pieces;
  volcano!: VolcanoFx;
  dice!: DiceOverlay;
  stunts!: Stunts;
  ceremony!: Ceremony;
  director!: Director;
  readonly commentator: Commentator;
  private detachManual: (() => void) | null = null;
  private water!: Water;
  private river!: RiverFx;
  private sky!: Sky;
  private props: Props | null = null;
  private ambient: Ambient | null = null;
  private animals: AnimalWorld | null = null;
  private composer: EffectComposer | null = null;
  private grass: THREE.InstancedMesh | null = null;
  private terrain: THREE.Mesh | null = null;
  private terrainBase: THREE.Material | null = null;
  private terrainUltra: THREE.Material | null = null;
  private envBase: THREE.Texture | null = null;
  private envUltra: THREE.Texture | null = null;
  private dof: DepthOfFieldEffect | null = null;
  private grassFull = 0;
  private frame = 0;
  private shadowEvery = 1;
  /** Bildrate (gleitend über ~2 s) */
  fps = 60;
  private fpsFrames = 0;
  private fpsSince = performance.now();
  /** Renderauflösung aus der Regie (auto = je Grafikstufe) */
  private resolution: Resolution = 'auto';
  private sun!: THREE.DirectionalLight;
  private raf = 0;
  private timer = new THREE.Timer();
  private ro: ResizeObserver;
  private disposed = false;
  private captionListeners = new Set<(c: Caption | null) => void>();
  private fadeListeners = new Set<(on: boolean) => void>();
  private lastState: GameState | null = null;
  /** Welche Welt gerade zu sehen ist (Insel oder Vulkan-Inneres) */
  view: 'island' | 'inside' = 'island';
  /** Vulkan-Inneres als eigene Szene (erst angelegt, wenn die Regel aktiv ist) */
  inside: VolcanoInside | null = null;
  private insideKey = '';
  private islandHeightAt: ((x: number, z: number) => number) | null = null;
  private islandBlockers: Parameters<CameraRig['setBlockers']>[0] = [];
  private islandSight: Pieces['lineOfSight'] = null;
  onViewChange: ((v: 'island' | 'inside') => void) | null = null;
  quality: Quality;

  private constructor(
    private container: HTMLElement,
    opts: BoardSceneOptions,
    audio: BoardAudio,
  ) {
    this.quality = opts.quality;
    this.audio = audio;
    this.commentator = new Commentator(audio);
    const preset = PRESETS[opts.quality];
    // Kantenglättung übernimmt SMAA in der Nachbearbeitung (läuft in jeder Stufe)
    this.renderer = new THREE.WebGLRenderer({
      antialias: false,
      powerPreference: 'high-performance',
      stencil: false,
      depth: true,
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, preset.pixelRatio));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.shadowMap.autoUpdate = false;
    this.shadowEvery = preset.shadowEvery;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.domElement.className = 'block size-full';
    container.appendChild(this.renderer.domElement);


    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(container);
  }

  static async create(container: HTMLElement, opts: BoardSceneOptions, audio: BoardAudio): Promise<BoardScene> {
    const s = new BoardScene(container, opts, audio);
    await s.build(opts);
    return s;
  }

  private async build(opts: BoardSceneOptions) {
    const preset = PRESETS[opts.quality];
    const progress = opts.onProgress ?? (() => {});
    progress(0.05, 'Insel wird vermessen …');
    this.layout = buildLayout(opts.fieldCount);
    const layout = this.layout;

    // Licht
    this.scene.fog = new THREE.Fog(HORIZON, 140, 420);
    const hemi = new THREE.HemisphereLight('#dff2ff', '#86b06a', 0.9);
    this.scene.add(hemi);
    this.sun = new THREE.DirectionalLight('#fff1d6', 3.1);
    this.sun.position.set(-44, 46, 36);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(preset.shadow, preset.shadow);
    const sc = this.sun.shadow.camera;
    sc.left = sc.bottom = -58;
    sc.right = sc.top = 58;
    sc.near = 10;
    sc.far = 160;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.04;
    this.sun.shadow.radius = 3;
    this.scene.add(this.sun, this.sun.target);

    // Himmel (HDRI als Hintergrund und Umgebungslicht)
    progress(0.12, 'Himmel wird aufgezogen …');
    try {
      const hdr = await new HDRLoader().loadAsync('/assets/hdri/sky.hdr');
      hdr.mapping = THREE.EquirectangularReflectionMapping;
      const pmrem = new THREE.PMREMGenerator(this.renderer);
      const env = pmrem.fromEquirectangular(hdr).texture;
      this.scene.environment = env;
      this.envBase = env;
      this.scene.environmentIntensity = 0.55;
      hdr.dispose();
      pmrem.dispose();
    } catch {
      /* ohne Umgebungslicht geht es auch */
    }
    this.scene.background = HORIZON;
    this.sky = createSky({ horizon: HORIZON, sunDir: this.sun.position, clouds: 16 });
    this.scene.add(this.sky.group);

    // Gelände & Wasser
    progress(0.25, 'Insel wird geformt …');
    await nextFrame();
    const field = buildHeightfield(layout, BUILD.terrain);
    let hTexCache: THREE.DataTexture | null = null;
    const heightTex0 = () => (hTexCache ??= heightTexture(field));
    const terrain = buildTerrainMesh(layout, field);
    this.terrain = terrain;
    this.terrainBase = terrain.material as THREE.Material;
    this.scene.add(terrain);
    this.water = createWater(heightTex0(), { segments: BUILD.water, fog: HORIZON, fogNear: 140, fogFar: 420 });
    this.water.setSun(this.sun.position, this.sun.color);
    this.scene.add(this.water.mesh);
    const hTex = heightTex0();
    this.river = createRiver(hTex, { mist: true, creek: layout.creek, basin: layout.fordBasin });
    this.scene.add(this.river.group);

    // Felder
    progress(0.45, 'Spielfelder werden gelegt …');
    this.fields = buildFields(layout);
    this.fields.setFields(layout.fields.map((_, i) => (i === 0 ? 'start' : i === layout.fields.length - 1 ? 'goal' : 'normal')));
    this.scene.add(this.fields.group);

    // Deko
    progress(0.55, 'Palmen werden gepflanzt …');
    try {
      if (!new URLSearchParams(location.search).has('noprops')) {
        this.props = await buildProps(layout, field, { density: BUILD.density });
        this.scene.add(this.props.group);
        this.ambient = createAmbient(this.props.fires, this.props.smokes);
        this.scene.add(this.ambient.group);
      }
      if (!new URLSearchParams(location.search).has('noanimals')) {
        progress(0.7, 'Tiere ziehen ein …');
        try {
          this.animals = await buildAnimals({
            layout,
            field,
            canopies: this.props?.canopies ?? [],
            flowers: this.props?.flowers ?? [],
            perches: this.props?.perches ?? [],
            detail: 1,
            splash: (x, y, z, big) => this.effects.splash(x, y, z, big),
          });
          this.scene.add(this.animals.group);
        } catch (e) {
          console.warn('Tiere konnten nicht geladen werden', e);
        }
      }
      progress(0.75, 'Gras wächst …');
      await nextFrame();
      if (!PERF.has('nograss')) {
        this.grass = buildGrass(field, terrainColorSampler(terrain, BUILD.terrain), { count: BUILD.grass, pathClear: layout.fieldRadius * 1.3 });
        this.grassFull = this.grass.count;
        this.grass.count = Math.round(this.grassFull * preset.grass);
        this.scene.add(this.grass);
      }
    } catch (e) {
      console.warn('Deko konnte nicht geladen werden', e);
    }

    progress(0.85, 'Vulkan wird angeheizt …');
    this.scene.add(this.effects.group);
    this.volcano = buildVolcano(layout, this.effects, { light: true, field });
    this.scene.add(this.volcano.group);

    // Figuren, Kamera, Würfel, Regie
    this.pieces = new Pieces(layout, this.fields, this.tweens, {
      onStep: (_id, f) => {
        const spot = layout.fields[f]!;
        this.audio.step(spot.bridge || spot.ford || f === 0);
      },
      heightAt: (x, z) => field.height(x, z),
      onLand: (_id, f) => {
        const spot = layout.fields[f]!;
        this.effects.dust(spot.x, this.fields.topY[f]!, spot.z);
      },
    });
    this.scene.add(this.pieces.group);
    this.stunts = new Stunts(layout, field, this.pieces, this.tweens, this.effects, this.audio);
    this.scene.add(this.stunts.group);
    this.rig = new CameraRig(this.camera, layout);
    this.islandHeightAt = (x, z) => field.height(x, z);
    this.rig.heightAt = this.islandHeightAt;
    this.islandBlockers = [...(this.props?.blockers ?? []), ...this.stunts.blockers];
    this.rig.setBlockers(this.islandBlockers);
    this.rig.canopies = [...(this.props?.canopies ?? []), ...this.stunts.crowns];
    this.stunts.shotPicker = (target, dist, height, prefer) => this.rig.clearShot(target, dist, height, prefer);
    this.islandSight = (from, to) => this.rig.occlusion(from, to, true) < 0.08;
    this.pieces.lineOfSight = this.islandSight;
    this.pieces.isShown = (p) => this.pieces.isInside(p.teamId) === (this.view === 'inside');
    this.ceremony = new Ceremony(this.pieces, this.tweens, this.effects, this.audio, this.rig);
    this.scene.add(this.ceremony.group);
    this.detachManual = attachManualCamera(this.renderer.domElement, this.rig);
    this.dice = new DiceOverlay(this.tweens);
    this.director = new Director(this, (c) => {
      for (const fn of this.captionListeners) fn(c);
    });

    if (!PERF.has('nopost')) this.setupPost(preset);
    this.applyUltra(!!preset.ultra);
    this.resize();
    this.rig.jump();
    progress(1, 'Fertig!');
    this.loop();
  }

  /** Nachbearbeitung je nach Stufe (neu aufgebaut beim Umschalten). */
  private setupPost(p: Preset) {
    this.composer?.dispose();
    const composer = new EffectComposer(this.renderer, { frameBufferType: THREE.HalfFloatType, multisampling: PERF.has('msaa') ? 4 : 0 });
    const world = this.viewScene;
    composer.addPass(new RenderPass(world, this.camera));
    if (p.ao && !PERF.has('noao'))
      try {
        const ao = new N8AOPostPass(world, this.camera, 1, 1);
        ao.configuration.aoRadius = 2.2;
        ao.configuration.distanceFalloff = 1.2;
        ao.configuration.intensity = 2.2;
        ao.configuration.halfRes = !p.ultra;
        ao.setQualityMode(p.ultra ? 'High' : 'Medium');
        composer.addPass(ao);
      } catch (e) {
        console.warn('Ambient Occlusion nicht verfügbar', e);
      }
    const effects: ConstructorParameters<typeof EffectPass>[1][] = [];
    if (p.bloom) effects.push(new BloomEffect({ luminanceThreshold: p.ultra ? 0.88 : 0.92, luminanceSmoothing: 0.2, intensity: p.ultra ? 1.05 : 0.9, mipmapBlur: true, radius: p.ultra ? 0.78 : 0.7, levels: p.ultra ? 9 : 8 }));
    if (p.tilt) effects.push(new TiltShiftEffect({ offset: 0.05, rotation: 0, focusArea: 0.78, feather: 0.3, kernelSize: 1 }));
    this.dof = null;
    if (p.ultra) {
      // echte Tiefenschärfe: scharf, wohin die Kamera schaut; Hintergrund weich
      const dof = new DepthOfFieldEffect(this.camera, { focusDistance: 20, focusRange: 16, bokehScale: 2.2, resolutionScale: 0.5 });
      dof.target = this.rig.focusPoint;
      this.dof = dof;
      effects.push(dof);
    }
    effects.push(
      new VignetteEffect({ offset: 0.32, darkness: 0.38 }),
      new ToneMappingEffect({ mode: ToneMappingMode.ACES_FILMIC }),
      new HueSaturationEffect({ saturation: p.ultra ? 0.12 : 0.08 }),
      new BrightnessContrastEffect({ contrast: p.ultra ? 0.09 : 0.06 }),
    );
    composer.addPass(new EffectPass(this.camera, ...effects));
    composer.addPass(new EffectPass(this.camera, new SMAAEffect()));
    this.composer = composer;
  }

  /** Ultra-Grafik an/aus: Gelände-Materialien, Wellen, schärferes Umgebungslicht (lädt beim ersten Mal). */
  private applyUltra(on: boolean) {
    if (!on) {
      if (this.terrain && this.terrainBase) this.terrain.material = this.terrainBase;
      this.water.setUltra(null);
      if (this.envBase) this.scene.environment = this.envBase;
      this.renderer.toneMappingExposure = 1;
      return;
    }
    void loadUltraTextures()
      .then(async (tex) => {
        if (this.disposed || !PRESETS[this.quality].ultra) return;
        if (this.terrain && this.terrainBase) {
          this.terrainUltra ??= createUltraTerrainMaterial(this.terrainBase as THREE.MeshStandardMaterial, tex);
          this.terrain.material = this.terrainUltra;
        }
        this.water.setUltra(tex.water);
        this.renderer.shadowMap.needsUpdate = true;
        if (!this.envUltra) {
          const hdr = await new HDRLoader().loadAsync('/assets/ultra/hdri/sky_2k.hdr');
          hdr.mapping = THREE.EquirectangularReflectionMapping;
          const pmrem = new THREE.PMREMGenerator(this.renderer);
          this.envUltra = pmrem.fromEquirectangular(hdr).texture;
          hdr.dispose();
          pmrem.dispose();
        }
        if (PRESETS[this.quality].ultra && !this.disposed) this.scene.environment = this.envUltra;
      })
      .catch((e: unknown) => console.warn('Ultra-Grafik konnte nicht geladen werden', e));
  }

  /** Szene, die gerade gezeigt wird. */
  private get viewScene(): THREE.Scene {
    return this.view === 'inside' && this.inside ? this.inside.scene : this.scene;
  }

  /** Vulkan-Inneres anlegen bzw. an die Regeln (Länge, Ausgangsfeld) anpassen. */
  private ensureInside(rules: GameState['config']['rules']) {
    const r = rules.inside;
    if (!r?.enabled && !this.inside) return;
    const length = r?.length ?? 9;
    const shout = r?.shout ?? 4;
    const key = `${length}|${shout}`;
    if (!this.inside) {
      this.inside = new VolcanoInside({ length, shout, quality: this.quality });
      const inside = this.inside;
      this.pieces.inside = { root: inside.scene, spot: (st, i, n) => inside.spot(st, i, n), facing: (st) => inside.facing(st) };
    } else if (key !== this.insideKey) this.inside.setPath(length, shout);
    this.insideKey = key;
  }

  /** Zwischen Insel und Vulkan-Innerem umschalten (harter Schnitt). */
  setView(v: 'island' | 'inside') {
    if (v === 'inside' && !this.inside) return;
    if (v === this.view) return;
    this.view = v;
    // freie Kamera (Maus/Fernsteuerung) gilt nur für die alte Welt
    this.rig.endManual();
    if (v === 'inside') {
      const inside = this.inside!;
      this.rig.heightAt = (x, z) => inside.heightAt(x, z);
      this.rig.setBlockers([]);
      this.pieces.lineOfSight = null;
    } else {
      this.rig.heightAt = this.islandHeightAt;
      this.rig.setBlockers(this.islandBlockers);
      this.pieces.lineOfSight = this.islandSight;
    }
    if (!PERF.has('nopost')) this.setupPost(PRESETS[this.quality]);
    this.renderer.shadowMap.needsUpdate = true;
    this.audio.setScene(v);
    this.onViewChange?.(v);
  }

  /** Grafikstufe live umschalten (Auflösung, Schatten, Nachbearbeitung, Gras). */
  setQuality(q: Quality) {
    if (q === this.quality) return;
    this.quality = q;
    const p = PRESETS[q];
    this.applyPixelRatio();
    if (this.sun.shadow.mapSize.x !== p.shadow) {
      this.sun.shadow.mapSize.set(p.shadow, p.shadow);
      this.sun.shadow.map?.dispose();
      this.sun.shadow.map = null;
    }
    this.shadowEvery = p.shadowEvery;
    this.renderer.shadowMap.needsUpdate = true;
    this.inside?.setQuality(q);
    this.applyUltra(!!p.ultra);
    if (this.grass) this.grass.count = Math.round(this.grassFull * p.grass);
    if (!PERF.has('nopost')) this.setupPost(p);
    this.resize();
    this.fpsFrames = 0;
    this.fpsSince = performance.now();
  }

  /** Schwarzblende (für harte Schnitte, z. B. Insel ↔ Vulkan) – die Oberfläche zeichnet sie. */
  onFade(fn: (on: boolean) => void): () => void {
    this.fadeListeners.add(fn);
    return () => void this.fadeListeners.delete(fn);
  }

  /** Kurz abblenden, umschalten (`cut`: Ansicht, Kamera …), wieder aufblenden. */
  async fadeCut(cut: () => void, hold = 140) {
    const wait = (ms: number) => new Promise<void>((r) => window.setTimeout(r, ms));
    // überlappende Blenden (Regie + Spielerklärung) – erst aufblenden, wenn die letzte fertig ist
    if (this.fades++ === 0) for (const fn of this.fadeListeners) fn(true);
    try {
      await wait(this.fadeListeners.size ? 280 : 0);
      if (this.disposed) return;
      cut();
      this.rig.jump();
      await wait(hold);
    } finally {
      if (--this.fades === 0 && !this.disposed) for (const fn of this.fadeListeners) fn(false);
    }
  }
  private fades = 0;

  onCaption(fn: (c: Caption | null) => void) {
    this.captionListeners.add(fn);
    return () => this.captionListeners.delete(fn);
  }

  /** Auflösung live ändern (Regie → Beamer). */
  setResolution(r: Resolution) {
    if (r === this.resolution) return;
    this.resolution = r;
    this.resize();
  }

  /** Bildpunkte je CSS-Pixel aus Grafikstufe bzw. gewählter Auflösung. */
  private applyPixelRatio() {
    const h = this.container.clientHeight || window.innerHeight || 1;
    const r = this.resolution;
    const pr = r === 'auto' ? Math.min(window.devicePixelRatio, PRESETS[this.quality].pixelRatio) : r === 'native' ? window.devicePixelRatio : Number(r) / h;
    const clamped = Math.max(0.35, Math.min(3, pr));
    if (Math.abs(this.renderer.getPixelRatio() - clamped) > 0.001) this.renderer.setPixelRatio(clamped);
  }

  /** Tatsächliche Renderauflösung (für die Regie). */
  get renderSize() {
    const v = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    return { width: v.x, height: v.y };
  }

  private resize() {
    const w = this.container.clientWidth || 1;
    const h = this.container.clientHeight || 1;
    this.applyPixelRatio();
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.composer?.setSize(w, h);
    this.dice?.resize(w / h);
    this.effects.setScale(h * this.renderer.getPixelRatio());
    this.ambient?.setScale((h * this.renderer.getPixelRatio()) / (2 * Math.tan((this.camera.fov * Math.PI) / 360)));
    this.renderer.shadowMap.needsUpdate = true;
  }

  private loop = () => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.loop);
    this.timer.update();
    const dt = Math.min(0.05, this.timer.getDelta());
    const t = this.timer.getElapsed();
    windUniforms.uWindTime.value = t;
    fx.uTime.value = t;
    this.tweens.update(dt);
    this.pieces.update(t, dt);
    this.stunts.update(t, dt, this.camera);
    this.ceremony.update(t, dt);
    this.effects.update(dt);
    if (this.view === 'inside' && this.inside) this.inside.update(t, dt, this.camera);
    else {
      this.fields.update(t);
      this.volcano.update(t, dt);
      this.water.update(t);
      this.river.update(t, dt);
      this.sky.update(t, dt);
      this.props?.update(t, dt);
      this.ambient?.update(t);
      this.animals?.update(t, dt, this.camera);
    }
    this.rig.update(dt);
    this.pieces.updateTags(this.camera, t);
    // Schatten nicht in jedem Bild neu zeichnen (Sonne steht still; bewegte Dinge sind langsam)
    if (++this.frame % this.shadowEvery === 0) this.renderer.shadowMap.needsUpdate = true;
    const now = performance.now();
    this.fpsFrames++;
    if (now - this.fpsSince >= 2000) {
      this.fps = (this.fpsFrames * 1000) / (now - this.fpsSince);
      this.fpsFrames = 0;
      this.fpsSince = now;
    }
    if (this.composer) this.composer.render(dt);
    else this.renderer.render(this.viewScene, this.camera);
    // Namensschilder ohne Nachbearbeitung über der Insel (der Würfel liegt darüber)
    if (this.pieces.tags.visible) {
      const auto = this.renderer.autoClear;
      this.renderer.autoClear = false;
      this.renderer.clearDepth();
      this.renderer.render(this.pieces.tags.scene, this.camera);
      this.renderer.autoClear = auto;
    }
    if (this.dice.visible) {
      const auto = this.renderer.autoClear;
      this.renderer.autoClear = false;
      this.renderer.clearDepth();
      const tm = this.renderer.toneMapping;
      this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
      this.renderer.render(this.dice.scene, this.dice.camera);
      this.renderer.toneMapping = tm;
      this.renderer.autoClear = auto;
    }
  };

  /** Neuer Spielzustand vom Server. */
  setState(state: GameState) {
    const prev = this.lastState;
    this.lastState = state;
    const rules = state.config.rules;
    // Ausgeschaltete Inselgefahren wie normale Felder zeigen
    this.fields.setFields(
      state.config.board.fields.map((f) =>
        (f === 'river' && rules.river?.enabled === false) ||
        (f === 'crater' && rules.crater?.enabled === false) ||
        (f === 'vine' && rules.vine?.enabled === false) ||
        (f === 'cave' && (rules.cave?.enabled === false || rules.inside?.enabled === false))
          ? 'normal'
          : f === 'skull' && rules.inside?.enabled === false
            ? 'normal'
            : f,
      ),
    );
    this.ensureInside(rules);
    this.pieces.sync(state.teams);
    const v = state.config.rules.volcano;
    this.volcano.setPressure(v.enabled ? state.volcano.pressure / Math.max(1, v.threshold) : 0);
    if (!prev || prev.id !== state.id) {
      this.pieces.snap(Object.fromEntries(state.teams.map((t) => [t.id, t.position])));
    }
    this.director.onState(state);
  }

  get state() {
    return this.lastState;
  }

  pushEffects(effects: Effect[]) {
    this.director.enqueue(effects);
  }

  setTagsVisible(on: boolean) {
    this.pieces.setTagsVisible(on);
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.ro.disconnect();
    this.director.dispose();
    this.commentator.dispose();
    this.detachManual?.();
    this.ceremony.stop();
    this.stunts.dispose();
    this.composer?.dispose();
    this.inside?.dispose();
    this.water.dispose();
    this.effects.dispose();
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
      const mat = m.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
      else mat?.dispose();
    });
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.renderer.domElement.remove();
    this.pieces.tags.dispose();
  }
}

function nextFrame() {
  return new Promise<void>((r) => requestAnimationFrame(() => r()));
}
