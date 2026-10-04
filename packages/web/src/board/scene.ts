/**
 * Die 3D-Insel für den Beamer: Renderer, Licht, Himmel, Gelände, Meer, Deko, Felder,
 * Vulkan, Figuren, Kamera, Würfel und Nachbearbeitung – in zwei Qualitätsstufen.
 */
import * as THREE from 'three';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';
import { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import {
  BloomEffect,
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
import type { Effect, GameState } from '@insel/shared';
import { windUniforms } from './assets.ts';
import { BoardAudio } from './audio.ts';
import { CameraRig } from './camera.ts';
import { DiceOverlay } from './dice3d.ts';
import { Director, type Caption } from './director.ts';
import { buildFields, type FieldMeshes } from './fields.ts';
import { buildLayout, type IslandLayout } from './layout.ts';
import { Effects } from './particles.ts';
import { Pieces } from './pieces.ts';
import { buildProps } from './props.ts';
import { buildHeightfield, buildTerrainMesh, heightTexture, riverLevel } from './terrain.ts';
import { Tweens } from './tweens.ts';
import { buildVolcano, type VolcanoFx } from './volcano.ts';
import { createRiver, createWater, type Water } from './water.ts';

export type Quality = 'beauty' | 'fast';

const PRESETS = {
  beauty: { pixelRatio: 2, shadow: 4096, terrain: 256, water: 180, density: 1, post: true },
  fast: { pixelRatio: 1, shadow: 1536, terrain: 150, water: 72, density: 0.5, post: false },
} as const;

const HORIZON = new THREE.Color('#bfe3f7');

export interface BoardSceneOptions {
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
  director!: Director;
  private water!: Water;
  private composer: EffectComposer | null = null;
  private ao: N8AOPostPass | null = null;
  private labels: CSS2DRenderer;
  private sun!: THREE.DirectionalLight;
  private raf = 0;
  private clock = new THREE.Clock();
  private ro: ResizeObserver;
  private disposed = false;
  private captionListeners = new Set<(c: Caption | null) => void>();
  private lastState: GameState | null = null;
  readonly quality: Quality;

  private constructor(
    private container: HTMLElement,
    opts: BoardSceneOptions,
    audio: BoardAudio,
  ) {
    this.quality = opts.quality;
    this.audio = audio;
    const preset = PRESETS[opts.quality];
    this.renderer = new THREE.WebGLRenderer({
      antialias: !preset.post,
      powerPreference: 'high-performance',
      stencil: false,
      depth: true,
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, preset.pixelRatio));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = preset.post ? THREE.NoToneMapping : THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.domElement.className = 'block size-full';
    container.appendChild(this.renderer.domElement);

    this.labels = new CSS2DRenderer();
    this.labels.domElement.className = 'pointer-events-none absolute inset-0';
    container.appendChild(this.labels.domElement);

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
    this.scene.fog = new THREE.Fog(HORIZON, 110, 330);
    const hemi = new THREE.HemisphereLight('#dff2ff', '#86b06a', 0.9);
    this.scene.add(hemi);
    this.sun = new THREE.DirectionalLight('#fff1d6', 3.1);
    this.sun.position.set(38, 55, 26);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(preset.shadow, preset.shadow);
    const sc = this.sun.shadow.camera;
    sc.left = sc.bottom = -40;
    sc.right = sc.top = 40;
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
      this.scene.environmentIntensity = 0.55;
      this.scene.background = hdr;
      this.scene.backgroundIntensity = 0.95;
      this.scene.backgroundRotation.y = 1.2;
      pmrem.dispose();
    } catch {
      this.scene.background = HORIZON;
    }

    // Gelände & Wasser
    progress(0.25, 'Insel wird geformt …');
    await nextFrame();
    const field = buildHeightfield(layout, preset.terrain);
    this.scene.add(buildTerrainMesh(layout, field));
    this.water = createWater(heightTexture(field), { segments: preset.water, fog: HORIZON, fogNear: 110, fogFar: 330 });
    this.water.setSun(this.sun.position, this.sun.color);
    this.scene.add(this.water.mesh);
    this.scene.add(createRiver(layout.river, riverLevel, (t) => 1.2 + t * 1.6));

    // Felder
    progress(0.45, 'Spielfelder werden gelegt …');
    this.fields = buildFields(layout);
    this.fields.setFields(layout.fields.map((_, i) => (i === 0 ? 'start' : i === layout.fields.length - 1 ? 'goal' : 'normal')));
    this.scene.add(this.fields.group);

    // Deko
    progress(0.55, 'Palmen werden gepflanzt …');
    try {
      this.scene.add(await buildProps(layout, field, { density: preset.density }));
    } catch (e) {
      console.warn('Deko konnte nicht geladen werden', e);
    }

    progress(0.85, 'Vulkan wird angeheizt …');
    this.scene.add(this.effects.group);
    this.volcano = buildVolcano(layout, this.effects, { light: true });
    this.scene.add(this.volcano.group);

    // Figuren, Kamera, Würfel, Regie
    this.pieces = new Pieces(layout, this.fields, this.tweens, {
      onStep: (_id, f) => {
        const onBridge = Math.hypot(layout.fields[f]!.x - layout.bridge.x, layout.fields[f]!.z - layout.bridge.z) < layout.bridge.length * 0.6;
        this.audio.step(onBridge);
      },
      onLand: (_id, f) => {
        const spot = layout.fields[f]!;
        this.effects.dust(spot.x, this.fields.topY[f]!, spot.z);
      },
    });
    this.scene.add(this.pieces.group);
    this.rig = new CameraRig(this.camera, layout);
    this.dice = new DiceOverlay(this.tweens);
    this.director = new Director(this, (c) => {
      for (const fn of this.captionListeners) fn(c);
    });

    if (preset.post) this.setupPost();
    this.resize();
    this.rig.jump();
    progress(1, 'Fertig!');
    this.loop();
  }

  private setupPost() {
    const composer = new EffectComposer(this.renderer, { frameBufferType: THREE.HalfFloatType, multisampling: 4 });
    composer.addPass(new RenderPass(this.scene, this.camera));
    try {
      const ao = new N8AOPostPass(this.scene, this.camera, 1, 1);
      ao.configuration.aoRadius = 2.2;
      ao.configuration.distanceFalloff = 1.2;
      ao.configuration.intensity = 2.2;
      ao.configuration.halfRes = true;
      ao.setQualityMode('Medium');
      composer.addPass(ao);
      this.ao = ao;
    } catch (e) {
      console.warn('Ambient Occlusion nicht verfügbar', e);
    }
    const bloom = new BloomEffect({ luminanceThreshold: 0.92, luminanceSmoothing: 0.2, intensity: 0.9, mipmapBlur: true, radius: 0.7 });
    const tilt = new TiltShiftEffect({ offset: 0.05, rotation: 0, focusArea: 0.78, feather: 0.3, kernelSize: 1 });
    const vignette = new VignetteEffect({ offset: 0.32, darkness: 0.38 });
    const tone = new ToneMappingEffect({ mode: ToneMappingMode.ACES_FILMIC });
    composer.addPass(new EffectPass(this.camera, bloom, tilt, vignette, tone));
    composer.addPass(new EffectPass(this.camera, new SMAAEffect()));
    this.composer = composer;
  }

  onCaption(fn: (c: Caption | null) => void) {
    this.captionListeners.add(fn);
    return () => this.captionListeners.delete(fn);
  }

  private resize() {
    const w = this.container.clientWidth || 1;
    const h = this.container.clientHeight || 1;
    this.renderer.setSize(w, h, false);
    this.labels.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.composer?.setSize(w, h);
    this.dice?.resize(w / h);
    this.effects.setScale(h * this.renderer.getPixelRatio());
  }

  private loop = () => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.loop);
    const dt = Math.min(0.05, this.clock.getDelta());
    const t = this.clock.elapsedTime;
    windUniforms.uWindTime.value = t;
    this.tweens.update(dt);
    this.pieces.update(t, dt);
    this.fields.update(t);
    this.volcano.update(t, dt);
    this.effects.update(dt);
    this.water.update(t);
    this.rig.update(dt);
    this.pieces.updateTags(this.camera);
    if (this.composer) this.composer.render(dt);
    else this.renderer.render(this.scene, this.camera);
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
    this.labels.render(this.scene, this.camera);
  };

  /** Neuer Spielzustand vom Server. */
  setState(state: GameState) {
    const prev = this.lastState;
    this.lastState = state;
    this.fields.setFields(state.config.board.fields);
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
    this.composer?.dispose();
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
    this.labels.domElement.remove();
  }
}

function nextFrame() {
  return new Promise<void>((r) => requestAnimationFrame(() => r()));
}
