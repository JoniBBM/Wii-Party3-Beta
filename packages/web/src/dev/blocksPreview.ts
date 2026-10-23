/** Entwicklungs-Vorschau der Blockwelt (blocks-preview.html): Atlas, Welt, Mobs, Figuren, Nether. */
import { blockAtlas, BLOCK_TILES } from '../board/blocks/atlas.ts';

const params = new URLSearchParams(location.search);
const view = params.get('view') ?? 'atlas';
const hud = document.getElementById('hud')!;

if (view === 'atlas') {
  document.body.style.overflow = 'auto';
  document.body.style.background = '#2b2b2b';
  const a = blockAtlas();
  const wrap = document.createElement('div');
  wrap.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fill,140px);gap:14px;padding:40px 16px;';
  for (const t of BLOCK_TILES) {
    const cell = document.createElement('div');
    cell.style.cssText = 'color:#ddd;font:12px monospace;text-align:center';
    const img = document.createElement('img');
    img.src = a.dataUrl(t);
    img.style.cssText = 'width:128px;height:128px;image-rendering:pixelated;display:block;margin:0 auto 4px;background:#555';
    cell.append(img, t);
    wrap.append(cell);
  }
  document.body.append(wrap);
  hud.textContent = `${BLOCK_TILES.length} Kacheln`;
}

// --- 3D-Vorschau: Figuren und Mobs auf einer Grasfläche -------------------------------------
async function view3d() {
  const THREE = await import('three');
  const { OrbitControls } = await import('three/addons/controls/OrbitControls.js');
  const { createBlockFigure } = await import('../figure/figureBlocks.ts');
  const { buildMob, MOB_KINDS } = await import('../board/blocks/mobs.ts');
  const { FIGURE_ACCESSORIES, FIGURE_HAIR_STYLES, FIGURE_EYES, FIGURE_MOUTHS, TEAM_COLOR_KEYS } = await import('@insel/shared');
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(devicePixelRatio);
  renderer.setSize(innerWidth, innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  document.body.append(renderer.domElement);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#8fb8ff');
  const camera = new THREE.PerspectiveCamera(40, innerWidth / innerHeight, 0.1, 200);
  camera.position.set(0, 3.2, 9);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 0.9, 0);
  scene.add(new THREE.HemisphereLight('#ffffff', '#557744', 1.2));
  const sun = new THREE.DirectionalLight('#ffffff', 2.2);
  sun.position.set(-6, 10, 8);
  sun.castShadow = true;
  scene.add(sun);
  const a = blockAtlas();
  const [u0, v0, u1, v1] = a.uv('grass_top');
  const ground = new THREE.PlaneGeometry(20, 20, 1, 1);
  const tex = a.texture.clone();
  tex.needsUpdate = true;
  const g = new THREE.Mesh(ground, new THREE.MeshLambertMaterial({ color: '#7fbf4e' }));
  g.rotation.x = -Math.PI / 2;
  g.receiveShadow = true;
  scene.add(g);
  void u0, v0, u1, v1;
  const rigs: { update: (t: number, dt: number) => void; setMode?: (m: never) => void }[] = [];
  if (view === 'figures') {
    const modes = ['idle', 'walk', 'cheer', 'wave', 'dance', 'jump', 'sad', 'swim'];
    for (let i = 0; i < 10; i++) {
      const fig = createBlockFigure(
        {
          skin: i % 6,
          hairStyle: FIGURE_HAIR_STYLES[i % FIGURE_HAIR_STYLES.length]!,
          hairColor: (i * 3) % 10,
          eyes: FIGURE_EYES[i % FIGURE_EYES.length]!,
          mouth: FIGURE_MOUTHS[i % FIGURE_MOUTHS.length]!,
          accessory: FIGURE_ACCESSORIES[i % FIGURE_ACCESSORIES.length]!,
          body: i % 4 === 1 ? 'round' : i % 4 === 2 ? 'tall' : 'normal',
          pants: i % 6,
        },
        TEAM_COLOR_KEYS[i % TEAM_COLOR_KEYS.length]!,
      );
      fig.root.position.set((i % 5) * 1.6 - 3.2, 0, Math.floor(i / 5) * -2.2);
      fig.setMode((params.get('mode') ?? modes[i % modes.length]) as never);
      scene.add(fig.root);
      rigs.push(fig);
    }
  } else {
    MOB_KINDS.forEach((k, i) => {
      const m = buildMob(k);
      m.root.position.set((i % 6) * 2.2 - 5.5, k === 'bat' ? 1.5 : 0, Math.floor(i / 6) * -3);
      scene.add(m.root);
    });
    camera.position.set(0, 4, 12);
  }
  hud.textContent = view;
  const clock = new THREE.Clock();
  renderer.setAnimationLoop(() => {
    const t = clock.getElapsedTime();
    for (const r of rigs) r.update(t, 0.016);
    controls.update();
    renderer.render(scene, camera);
  });
}
if (view === 'figures' || view === 'mobs') void view3d();
