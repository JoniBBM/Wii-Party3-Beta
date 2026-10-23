/** Bausteine für Block-Objekte: Quader mit Atlas-Kacheln je Fläche, gekreuzte Flächen. */
import * as THREE from 'three';
import { blockAtlas, type Tile } from './atlas.ts';
import { BLOCK } from './world.ts';

export type Faces = Tile | { top: Tile; side: Tile; bottom?: Tile };

const matCache = new Map<string, THREE.Material>();
export function atlasMat(kind: 'solid' | 'cutout' | 'glow' = 'solid'): THREE.Material {
  let m = matCache.get(kind);
  if (!m) {
    const map = blockAtlas().texture;
    m =
      kind === 'glow'
        ? new THREE.MeshBasicMaterial({ map, toneMapped: false })
        : new THREE.MeshLambertMaterial({ map, alphaTest: kind === 'cutout' ? 0.4 : 0, side: kind === 'cutout' ? THREE.DoubleSide : THREE.FrontSide });
    matCache.set(kind, m);
  }
  return m;
}

/** Quader mit Atlas-Kacheln je Fläche (BoxGeometry: +x, −x, +y, −y, +z, −z) */
export function boxGeo(w: number, h: number, d: number, faces: Faces): THREE.BoxGeometry {
  const g = new THREE.BoxGeometry(w, h, d);
  const atlas = blockAtlas();
  const f = typeof faces === 'string' ? { top: faces, side: faces, bottom: faces } : { bottom: faces.top, ...faces };
  const uv = g.getAttribute('uv') as THREE.BufferAttribute;
  for (let face = 0; face < 6; face++) {
    const tile = face === 2 ? f.top : face === 3 ? f.bottom! : f.side;
    const [u0, v0, u1, v1] = atlas.uv(tile);
    for (let i = 0; i < 4; i++) {
      const k = face * 4 + i;
      uv.setXY(k, uv.getX(k) ? u1 : u0, uv.getY(k) ? v1 : v0);
    }
  }
  return g;
}

export function cube(faces: Faces, size = BLOCK, kind: 'solid' | 'cutout' | 'glow' = 'solid') {
  const m = new THREE.Mesh(boxGeo(size, size, size, faces), atlasMat(kind));
  m.castShadow = kind !== 'glow';
  m.receiveShadow = true;
  return m;
}

/** gekreuzte Flächen (Ranke, Pflanzen) */
export function cross(tile: Tile, w: number, h: number) {
  const g = new THREE.Group();
  const [u0, v0, u1, v1] = blockAtlas().uv(tile);
  for (const a of [0, Math.PI / 2]) {
    const geo = new THREE.PlaneGeometry(w, h);
    const uv = geo.getAttribute('uv') as THREE.BufferAttribute;
    for (let i = 0; i < 4; i++) uv.setXY(i, uv.getX(i) ? u1 : u0, uv.getY(i) ? v1 : v0);
    const m = new THREE.Mesh(geo, atlasMat('cutout'));
    m.rotation.y = a;
    g.add(m);
  }
  return g;
}

