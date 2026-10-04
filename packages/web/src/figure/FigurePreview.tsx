/** 3D-Vorschau einer Figur (drehbar) und statische Schnappschüsse für Listen. */
import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import type { FigureConfig, TeamColorKey } from '@insel/shared';
import { createFigure, type FigureMode } from './figure3d.ts';

function studio(scene: THREE.Scene) {
  scene.add(new THREE.HemisphereLight('#eaf6ff', '#c7d9a8', 1.6));
  const key = new THREE.DirectionalLight('#fff4e0', 2.2);
  key.position.set(2.5, 4, 3.5);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.camera.near = 0.5;
  key.shadow.camera.far = 12;
  key.shadow.radius = 4;
  scene.add(key);
  const rim = new THREE.DirectionalLight('#9fd8ff', 1.2);
  rim.position.set(-3, 2, -3);
  scene.add(rim);
}

export function FigurePreview({
  figure,
  color,
  mode = 'idle',
  className = '',
  height = 260,
}: {
  figure: FigureConfig;
  color: TeamColorKey;
  mode?: FigureMode;
  className?: string;
  height?: number;
}) {
  const host = useRef<HTMLDivElement>(null);
  const api = useRef<{ set: (f: FigureConfig, c: TeamColorKey, m: FigureMode) => void } | null>(null);

  useEffect(() => {
    const el = host.current!;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    el.appendChild(renderer.domElement);
    renderer.domElement.style.touchAction = 'pan-y';

    const scene = new THREE.Scene();
    studio(scene);
    const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
    camera.position.set(0, 1.25, 4.1);
    camera.lookAt(0, 0.82, 0);

    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(0.9, 48),
      new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.9 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);

    const pivot = new THREE.Group();
    scene.add(pivot);
    let rig = createFigure(figure, color, { base: false });
    pivot.add(rig.root);
    rig.setMode(mode);

    let rotY = 0.35;
    let vel = 0;
    let dragging = false;
    let lastX = 0;
    const down = (e: PointerEvent) => {
      dragging = true;
      lastX = e.clientX;
      renderer.domElement.setPointerCapture(e.pointerId);
    };
    const move = (e: PointerEvent) => {
      if (!dragging) return;
      vel = (e.clientX - lastX) * 0.012;
      rotY += vel;
      lastX = e.clientX;
    };
    const up = () => (dragging = false);
    renderer.domElement.addEventListener('pointerdown', down);
    renderer.domElement.addEventListener('pointermove', move);
    renderer.domElement.addEventListener('pointerup', up);
    renderer.domElement.addEventListener('pointercancel', up);

    const resize = () => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(el);
    resize();

    const clock = new THREE.Clock();
    let raf = 0;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const dt = Math.min(0.05, clock.getDelta());
      if (!dragging) {
        vel *= 0.94;
        rotY += vel + dt * 0.25;
      }
      pivot.rotation.y = rotY;
      rig.update(clock.elapsedTime, dt);
      renderer.render(scene, camera);
    };
    loop();

    api.current = {
      set(f, c, m) {
        pivot.remove(rig.root);
        rig.dispose();
        rig = createFigure(f, c, { base: false });
        rig.setMode(m);
        pivot.add(rig.root);
      },
    };

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      rig.dispose();
      renderer.dispose();
      renderer.domElement.remove();
      api.current = null;
    };
    // Nur einmal aufbauen; Änderungen kommen über api.set
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    api.current?.set(figure, color, mode);
  }, [figure, color, mode]);

  return <div ref={host} className={`relative w-full cursor-grab active:cursor-grabbing ${className}`} style={{ height }} />;
}

// ---------------------------------------------------------------------------
// Schnappschüsse (ein gemeinsamer Offscreen-Renderer, Ergebnis wird gecacht)
// ---------------------------------------------------------------------------
let snapRenderer: THREE.WebGLRenderer | null = null;
let snapScene: THREE.Scene | null = null;
let snapCamera: THREE.PerspectiveCamera | null = null;
const snapCache = new Map<string, string>();

export function figureSnapshot(figure: FigureConfig, color: TeamColorKey, size = 160): string {
  const key = `${JSON.stringify(figure)}|${color}|${size}`;
  const hit = snapCache.get(key);
  if (hit) return hit;
  if (!snapRenderer) {
    snapRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    snapRenderer.toneMapping = THREE.ACESFilmicToneMapping;
    snapRenderer.outputColorSpace = THREE.SRGBColorSpace;
    snapScene = new THREE.Scene();
    studio(snapScene);
    snapCamera = new THREE.PerspectiveCamera(26, 1, 0.1, 50);
    snapCamera.position.set(0.55, 1.45, 2.6);
    snapCamera.lookAt(0, 1.08, 0);
  }
  snapRenderer.setPixelRatio(1);
  snapRenderer.setSize(size, size, false);
  const rig = createFigure(figure, color, { base: false });
  rig.root.rotation.y = 0.25;
  snapScene!.add(rig.root);
  snapRenderer.render(snapScene!, snapCamera!);
  const url = snapRenderer.domElement.toDataURL('image/png');
  snapScene!.remove(rig.root);
  rig.dispose();
  snapCache.set(key, url);
  return url;
}

/** Kopf-und-Schultern-Bild der Teamfigur. */
export function FigureAvatar({ figure, color, size = 48, className = '' }: { figure: FigureConfig; color: TeamColorKey; size?: number; className?: string }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    const id = requestAnimationFrame(() => setSrc(figureSnapshot(figure, color, 192)));
    return () => cancelAnimationFrame(id);
  }, [figure, color]);
  return (
    <span className={`inline-block shrink-0 overflow-hidden rounded-full bg-gradient-to-b from-sky-100 to-white ${className}`} style={{ width: size, height: size }}>
      {src && <img src={src} alt="" className="size-full object-cover" draggable={false} />}
    </span>
  );
}
