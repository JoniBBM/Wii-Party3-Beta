/**
 * Spielfelder der Blockwelt: farbige Woll-Platten (am Blockraster ausgerichtet) mit Pixel-Symbol
 * obendrauf; Start als Smaragd-, Ziel als Goldplatte. Hervorhebung als Auswahlrahmen.
 */
import * as THREE from 'three';
import { FIELD_INFO, FIELD_TYPES, type FieldType } from '@insel/shared';
import type { FieldMeshes } from '../fields.ts';
import type { IslandLayout } from '../layout.ts';
import { BLOCK } from './world.ts';
import { hex, mix, Pixels, rngFor, shade, type RGB } from './pixels.ts';

const T = 16;
const SLAB = BLOCK * 0.5;

type Icon = (p: Pixels) => void;
const W = '#ffffff';
const K = '#1b1b1b';

/** Pixel-Symbole je Feldart (eigene Zeichnungen) */
const ICONS: Partial<Record<FieldType, Icon>> = {
  start(p) {
    p.rect(4, 2, 1, 12, '#6b4a2a');
    p.rect(5, 2, 7, 5, '#e8e8e8');
    p.rect(5, 3, 7, 1, '#3fae4f');
    p.rect(5, 5, 7, 1, '#3fae4f');
  },
  goal(p) {
    // Diamant
    const d = '#7ff0e8';
    p.rect(5, 3, 6, 1, d);
    p.rect(4, 4, 8, 2, '#4fd8d0');
    p.rect(5, 6, 6, 2, d);
    p.rect(6, 8, 4, 2, '#4fd8d0');
    p.rect(7, 10, 2, 2, d);
    p.set(6, 4, W);
    p.set(5, 5, W);
  },
  catapult_forward(p) {
    for (let y = 3; y < 9; y++) p.rect(8 - (y - 3), y, 1 + (y - 3) * 2, 1, W);
    p.rect(6, 9, 4, 5, W);
  },
  catapult_backward(p) {
    p.rect(6, 2, 4, 5, W);
    for (let y = 7; y < 13; y++) p.rect(3 + (y - 7), y, 10 - (y - 7) * 2, 1, W);
  },
  swap(p) {
    p.rect(3, 4, 9, 2, W);
    p.rect(10, 2, 1, 6, W);
    p.rect(11, 3, 1, 4, W);
    p.rect(4, 10, 9, 2, W);
    p.rect(5, 8, 1, 6, W);
    p.rect(4, 9, 1, 4, W);
  },
  barrier(p) {
    for (let i = 0; i < 16; i++) {
      p.set(i, i, W);
      p.set(15 - i, i, W);
      p.set(8, i, W);
      p.set(i, 8, W);
    }
    for (const r of [3, 6]) for (let a = 0; a < 32; a++) p.set(Math.round(8 + Math.cos((a / 32) * Math.PI * 2) * r), Math.round(8 + Math.sin((a / 32) * Math.PI * 2) * r), W);
  },
  minigame(p) {
    // Notenblock-Note
    p.rect(10, 2, 2, 9, W);
    p.rect(11, 2, 3, 2, W);
    p.rect(6, 9, 5, 4, W);
  },
  volcano(p) {
    p.rect(5, 6, 6, 8, '#ffd34d');
    p.rect(6, 3, 4, 3, '#ffb13b');
    p.rect(7, 1, 2, 2, '#fff2a1');
    p.rect(6, 9, 4, 4, '#fff2a1');
  },
  skull(p) {
    p.rect(3, 2, 10, 9, W);
    p.rect(5, 11, 6, 3, W);
    p.rect(5, 5, 2, 3, K);
    p.rect(9, 5, 2, 3, K);
    p.set(8, 9, K);
    p.set(6, 12, K);
    p.set(9, 12, K);
  },
  river(p) {
    p.rect(4, 2, 8, 12, '#a8763f');
    p.rect(4, 4, 8, 1, '#5a5a5a');
    p.rect(4, 11, 8, 1, '#5a5a5a');
    p.rect(6, 2, 1, 12, '#8a5f30');
  },
  vine(p) {
    for (let y = 1; y < 15; y++) p.set(7 + Math.round(Math.sin(y * 0.8)), y, '#2f6a1f');
    for (let y = 3; y < 15; y += 3) p.rect(4 + (y % 2) * 6, y, 3, 2, '#4f8f33');
  },
  cave(p) {
    p.rect(2, 5, 12, 4, K);
    p.rect(6, 4, 4, 6, K);
    p.set(6, 6, '#ff4040');
    p.set(9, 6, '#ff4040');
  },
  crater(p) {
    p.rect(3, 4, 10, 8, K);
    p.rect(4, 3, 8, 10, K);
    p.rect(6, 7, 4, 2, '#ff7a1f');
  },
};

function baseColor(type: FieldType): RGB {
  if (type === 'start') return hex('#3fbf6a');
  if (type === 'goal') return hex('#f5c518');
  if (type === 'normal') return hex('#7f9fd0');
  return hex(FIELD_INFO[type].color);
}

/** Wolle (Fasern) in einer Farbe; Ziel als Goldblock mit Glanzkanten */
function paintTile(p: Pixels, type: FieldType, top: boolean) {
  const c = baseColor(type);
  const rng = rngFor(`field-${type}-${top}`);
  for (let y = 0; y < T; y++)
    for (let x = 0; x < T; x++) {
      if (type === 'goal' || type === 'start') {
        const edge = x === 0 || y === 0 || x === T - 1 || y === T - 1;
        p.set(x, y, edge ? shade(c, 0.75) : (x + y) % 7 === 0 ? mix(c, [255, 255, 255], 0.45) : shade(c, 0.95 + rng.next() * 0.1));
      } else {
        const fiber = (x + y * 2 + Math.floor(rng.next() * 2)) % 4 === 0 ? 0.88 : 1;
        p.set(x, y, shade(c, (top ? 1 : 0.86) * fiber * (0.95 + rng.next() * 0.08)));
      }
    }
  if (top) {
    const icon = ICONS[type];
    if (icon) {
      const ip = new Pixels(T, T);
      icon(ip);
      // Symbol mit dunklem Schatten nach rechts unten
      for (let y = 0; y < T; y++)
        for (let x = 0; x < T; x++) if (ip.alpha(x, y) && !ip.alpha(Math.min(T - 1, x + 1), Math.min(T - 1, y + 1))) p.set(Math.min(T - 1, x + 1), Math.min(T - 1, y + 1), shade(c, 0.55));
      for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) if (ip.alpha(x, y)) p.set(x, y, ip.get(x, y));
    }
  }
}

export function buildBlockFields(layout: IslandLayout, topAt: (x: number, z: number) => number): FieldMeshes {
  const group = new THREE.Group();
  group.name = 'fields';
  const n = layout.fields.length;
  const types = [...FIELD_TYPES];
  // Atlas: je Feldart oben + Seite
  const atlas = new Pixels(T * 2, T * types.length);
  types.forEach((t, i) => {
    for (const [col, top] of [
      [0, true],
      [1, false],
    ] as const) {
      const tile = new Pixels(T, T);
      paintTile(tile, t, top);
      tile.blit(atlas, col * T, i * T);
    }
  });
  const tex = atlas.toTexture();
  tex.generateMipmaps = false;
  tex.minFilter = THREE.NearestFilter;
  const mat = new THREE.MeshLambertMaterial({ map: tex });
  const glowMat = new THREE.MeshLambertMaterial({ map: tex, emissive: new THREE.Color('#ffffff'), emissiveMap: tex, emissiveIntensity: 0.25 });

  const uvFor = (type: FieldType, top: boolean): [number, number, number, number] => {
    const i = types.indexOf(type);
    const u0 = (top ? 0 : T) / atlas.w;
    const u1 = u0 + T / atlas.w;
    const v1 = 1 - (i * T) / atlas.h;
    const v0 = v1 - T / atlas.h;
    return [u0, v0, u1, v1];
  };

  /** Plattengröße in Blöcken: Start groß (viele Figuren), Ziel etwas größer */
  const r = layout.fieldRadius;
  const cells = Math.max(2, Math.round((2 * r) / BLOCK));
  const topY: number[] = [];
  const radii: number[] = [];
  const pads: THREE.Mesh[] = [];
  const geoCache = new Map<string, THREE.BoxGeometry>();
  const geoFor = (type: FieldType, size: number, h: number) => {
    const k = `${type}|${size}|${h}`;
    let g = geoCache.get(k);
    if (!g) {
      g = new THREE.BoxGeometry(size, h, size);
      const uv = g.getAttribute('uv') as THREE.BufferAttribute;
      const top = uvFor(type, true);
      const side = uvFor(type, false);
      for (let f = 0; f < 6; f++) {
        const [u0, v0, u1, v1] = f === 2 ? top : side;
        // Seiten: nur ein Streifen der Kachel (Platte ist halb so hoch wie breit)
        const vv0 = f === 2 || f === 3 ? v0 : v1 - (v1 - v0) * Math.min(1, h / size);
        const quad = [u0, v1, u1, v1, u0, vv0, u1, vv0];
        for (let i = 0; i < 4; i++) uv.setXY(f * 4 + i, quad[i * 2]!, quad[i * 2 + 1]!);
      }
      uv.needsUpdate = true;
      geoCache.set(k, g);
    }
    return g;
  };

  const snap = (v: number, even: boolean) => (even ? Math.round(v / BLOCK) * BLOCK : (Math.floor(v / BLOCK) + 0.5) * BLOCK);
  const sizes: number[] = [];
  const centers: { x: number; z: number; y: number }[] = [];
  layout.fields.forEach((f, i) => {
    const c = i === 0 ? Math.max(cells + 2, 4) : i === n - 1 ? cells + 1 : cells;
    const even = c % 2 === 0;
    const x = snap(f.x, even);
    const z = snap(f.z, even);
    const size = c * BLOCK;
    // auf dem höchsten Block unter der Platte aufliegen (Brücke/Furt: auf Weghöhe)
    let base = -Infinity;
    for (let a = 0; a < c; a++)
      for (let b = 0; b < c; b++) base = Math.max(base, topAt(x - size / 2 + (a + 0.5) * BLOCK, z - size / 2 + (b + 0.5) * BLOCK));
    if (f.bridge || f.ford) base = f.y - SLAB * 0.5;
    sizes.push(size);
    centers.push({ x, z, y: base });
    topY.push(base + SLAB);
    radii.push(size * 0.45);
  });

  const setFields = (fields: FieldType[]) => {
    for (const p of pads) p.removeFromParent();
    pads.length = 0;
    layout.fields.forEach((f, i) => {
      if (f.ford) return; // Fässer/Kisten baut der Auftritt am Fluss
      const type = fields[i] ?? 'normal';
      const m = new THREE.Mesh(geoFor(type, sizes[i]!, SLAB), type === 'goal' || type === 'start' ? glowMat : mat);
      const c = centers[i]!;
      m.position.set(c.x, c.y + SLAB / 2, c.z);
      m.castShadow = true;
      m.receiveShadow = true;
      group.add(m);
      pads.push(m);
    });
  };

  // Auswahlrahmen aus 12 Balken
  const frame = new THREE.Group();
  const barMat = new THREE.MeshBasicMaterial({ color: '#ffffff', toneMapped: false, transparent: true, opacity: 0.95 });
  const bar = new THREE.BoxGeometry(1, 1, 1);
  const bars: THREE.Mesh[] = [];
  for (let i = 0; i < 12; i++) {
    const b = new THREE.Mesh(bar, barMat);
    bars.push(b);
    frame.add(b);
  }
  frame.visible = false;
  frame.renderOrder = 4;
  group.add(frame);
  const placeFrame = (size: number, h: number) => {
    const t = 0.06;
    const s = size / 2 + 0.03;
    let k = 0;
    for (const y of [0, h])
      for (const sgn of [-1, 1]) {
        bars[k]!.scale.set(size + 0.12, t, t);
        bars[k++]!.position.set(0, y, sgn * s);
        bars[k]!.scale.set(t, t, size + 0.12);
        bars[k++]!.position.set(sgn * s, y, 0);
      }
    for (const sx of [-1, 1])
      for (const sz of [-1, 1]) {
        bars[k]!.scale.set(t, h, t);
        bars[k++]!.position.set(sx * s, h / 2, sz * s);
      }
  };

  return {
    group,
    topY,
    setFields,
    radiusOf: (i) => radii[i] ?? r,
    highlight(index, color) {
      if (index === null || !layout.fields[index]) {
        frame.visible = false;
        return;
      }
      const c = centers[index]!;
      placeFrame(sizes[index]!, SLAB + BLOCK * 0.6);
      frame.position.set(c.x, c.y, c.z);
      barMat.color.set(color ?? '#ffffff');
      frame.visible = true;
    },
    update(t) {
      if (frame.visible) barMat.opacity = 0.6 + Math.sin(t * 5) * 0.35;
    },
  };
}
