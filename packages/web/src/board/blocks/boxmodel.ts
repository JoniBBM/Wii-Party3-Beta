/**
 * Kastenmodelle der Blockwelt: Figuren, Tiere und Mobs aus Quadern, jeder Quader mit eigener
 * Pixel-Haut (Klappschnitt wie bei Blockspiel-Skins: oben/unten über der Seitenreihe).
 * Maße in Pixeln; 16 Pixel = 1 Block.
 */
import * as THREE from 'three';
import { Pixels } from './pixels.ts';

export type Face = 'front' | 'back' | 'left' | 'right' | 'top' | 'bottom';
/** Malt eine Fläche (lokale Pixel: x nach rechts, y nach unten – „von außen gesehen“) */
export type FacePainter = (face: Face, p: Pixels) => void;

export interface BoxSpec {
  name: string;
  /** Breite (x), Höhe (y), Tiefe (z) in Pixeln */
  size: [number, number, number];
  /** Drehpunkt relativ zum Drehpunkt des Elternteils (Pixel) */
  pivot: [number, number, number];
  /** untere-linke-hintere Ecke des Quaders relativ zum eigenen Drehpunkt (Pixel) */
  from: [number, number, number];
  paint: FacePainter;
  /** etwas aufblähen (Haare/Hut-Schicht), in Pixeln */
  inflate?: number;
  /** Fläche mit Transparenz (Netz, Haar-Schicht) */
  cutout?: boolean;
  children?: BoxSpec[];
}

interface Region {
  x: number;
  y: number;
}

/** Fertiges Modell: Wurzelgruppe + benannte Gelenke zum Animieren */
export interface BoxModel {
  root: THREE.Group;
  parts: Record<string, THREE.Object3D>;
  material: THREE.Material;
  texture: THREE.Texture;
  dispose(): void;
}

const PX = 1 / 16;

/** Platz im Hautbild: [d,w,d,w] breit, d+h hoch (oben: top/bottom, unten: Seiten) */
function regionSize([w, h, d]: [number, number, number]) {
  return { w: 2 * d + 2 * w, h: d + h };
}

function collect(spec: BoxSpec, out: BoxSpec[] = []): BoxSpec[] {
  out.push(spec);
  for (const c of spec.children ?? []) collect(c, out);
  return out;
}

export interface BoxModelOptions {
  /** Material-Variante: matt (Standard) oder selbstleuchtend (Glut, Nether-Geister) */
  emissive?: number;
  shadows?: boolean;
}

export function buildBoxModel(spec: BoxSpec, opts: BoxModelOptions = {}): BoxModel {
  const all = collect(spec);
  // einfache Reihen-Packung der Hautbereiche
  const width = 128;
  const regions = new Map<BoxSpec, Region>();
  let x = 0;
  let y = 0;
  let row = 0;
  for (const b of all) {
    const r = regionSize(b.size);
    if (x + r.w > width) {
      x = 0;
      y += row;
      row = 0;
    }
    regions.set(b, { x, y });
    x += r.w;
    row = Math.max(row, r.h);
  }
  const height = Math.max(16, 2 ** Math.ceil(Math.log2(y + row)));
  const skin = new Pixels(width, height);

  for (const b of all) {
    const { x: rx, y: ry } = regions.get(b)!;
    const [w, h, d] = b.size;
    const faces: [Face, number, number, number, number][] = [
      ['top', rx + d, ry, w, d],
      ['bottom', rx + d + w, ry, w, d],
      ['right', rx, ry + d, d, h],
      ['front', rx + d, ry + d, w, h],
      ['left', rx + d + w, ry + d, d, h],
      ['back', rx + 2 * d + w, ry + d, w, h],
    ];
    for (const [face, fx, fy, fw, fh] of faces) {
      if (fw <= 0 || fh <= 0) continue;
      const local = new Pixels(fw, fh);
      b.paint(face, local);
      local.blit(skin, fx, fy);
    }
  }

  const texture = skin.toTexture();
  texture.generateMipmaps = false;
  texture.minFilter = THREE.NearestFilter;
  const anyCutout = all.some((b) => b.cutout);
  const material = new THREE.MeshLambertMaterial({
    map: texture,
    alphaTest: anyCutout ? 0.5 : 0,
    transparent: false,
    side: anyCutout ? THREE.DoubleSide : THREE.FrontSide,
    ...(opts.emissive ? { emissive: new THREE.Color(0xffffff), emissiveMap: texture, emissiveIntensity: opts.emissive } : {}),
  });

  const parts: Record<string, THREE.Object3D> = {};
  const geometries: THREE.BufferGeometry[] = [];

  const make = (b: BoxSpec): THREE.Object3D => {
    const joint = new THREE.Group();
    joint.name = b.name;
    joint.position.set(b.pivot[0] * PX, b.pivot[1] * PX, b.pivot[2] * PX);
    const [w, h, d] = b.size;
    const inf = (b.inflate ?? 0) * PX;
    const geo = new THREE.BoxGeometry(w * PX + inf * 2, h * PX + inf * 2, d * PX + inf * 2);
    setBoxUv(geo, regions.get(b)!, b.size, width, height);
    geo.translate((b.from[0] + w / 2) * PX, (b.from[1] + h / 2) * PX, (b.from[2] + d / 2) * PX);
    geometries.push(geo);
    const mesh = new THREE.Mesh(geo, material);
    mesh.castShadow = opts.shadows !== false;
    mesh.receiveShadow = false;
    mesh.name = `${b.name}-mesh`;
    joint.add(mesh);
    parts[b.name] = joint;
    for (const c of b.children ?? []) joint.add(make(c));
    return joint;
  };
  const root = new THREE.Group();
  root.add(make(spec));
  return {
    root,
    parts,
    material,
    texture,
    dispose() {
      for (const g of geometries) g.dispose();
      material.dispose();
      texture.dispose();
    },
  };
}

/**
 * BoxGeometry-Flächen in three: +x, −x, +y, −y, +z, −z (je 4 Ecken: oben-links, oben-rechts,
 * unten-links, unten-rechts von außen gesehen). Vorne = +z (Blick zur Kamera).
 */
function setBoxUv(geo: THREE.BoxGeometry, r: Region, [w, h, d]: [number, number, number], tw: number, th: number) {
  const uv = geo.getAttribute('uv') as THREE.BufferAttribute;
  const rect = (x: number, y: number, rw: number, rh: number, flipX = false, flipY = false) => {
    let u0 = x / tw;
    let u1 = (x + rw) / tw;
    let v0 = 1 - y / th;
    let v1 = 1 - (y + rh) / th;
    if (flipX) [u0, u1] = [u1, u0];
    if (flipY) [v0, v1] = [v1, v0];
    // Reihenfolge: oben-links, oben-rechts, unten-links, unten-rechts
    return [u0, v0, u1, v0, u0, v1, u1, v1];
  };
  const faces = [
    rect(r.x + d + w, r.y + d, d, h), // +x: linke Seite der Figur (von vorne gesehen rechts im Bild) → „left“
    rect(r.x, r.y + d, d, h), // −x → „right“
    rect(r.x + d, r.y, w, d), // +y → „top“
    rect(r.x + d + w, r.y, w, d, false, true), // −y → „bottom“
    rect(r.x + d, r.y + d, w, h), // +z → „front“
    rect(r.x + 2 * d + w, r.y + d, w, h), // −z → „back“
  ];
  for (let f = 0; f < 6; f++) for (let i = 0; i < 4; i++) uv.setXY(f * 4 + i, faces[f]![i * 2]!, faces[f]![i * 2 + 1]!);
  uv.needsUpdate = true;
}
