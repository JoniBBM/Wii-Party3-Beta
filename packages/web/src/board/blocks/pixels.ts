/**
 * Kleiner Pixel-Maler für die Blockwelt: Texturen werden zur Laufzeit Pixel für Pixel gezeichnet
 * (16×16 wie im Minecraft-Stil) – eigene Gestaltung, keine fremden Bilddateien.
 */
import * as THREE from 'three';
import { seededRng, type Rng } from '@insel/shared';

export type RGB = [number, number, number];

export function hex(c: string): RGB {
  const n = parseInt(c.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function shade([r, g, b]: RGB, f: number): RGB {
  return [Math.min(255, Math.round(r * f)), Math.min(255, Math.round(g * f)), Math.min(255, Math.round(b * f))];
}

export function mix(a: RGB, b: RGB, t: number): RGB {
  return [Math.round(a[0] + (b[0] - a[0]) * t), Math.round(a[1] + (b[1] - a[1]) * t), Math.round(a[2] + (b[2] - a[2]) * t)];
}

/** Rechteckige Pixelfläche mit RGBA-Puffer */
export class Pixels {
  readonly data: Uint8ClampedArray;
  constructor(
    readonly w: number,
    readonly h: number,
  ) {
    this.data = new Uint8ClampedArray(w * h * 4);
  }

  set(x: number, y: number, c: RGB | string, a = 255) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const [r, g, b] = typeof c === 'string' ? hex(c) : c;
    const i = (y * this.w + x) * 4;
    this.data[i] = r;
    this.data[i + 1] = g;
    this.data[i + 2] = b;
    this.data[i + 3] = a;
  }

  get(x: number, y: number): RGB {
    const i = (Math.max(0, Math.min(this.h - 1, y)) * this.w + Math.max(0, Math.min(this.w - 1, x))) * 4;
    return [this.data[i]!, this.data[i + 1]!, this.data[i + 2]!];
  }

  alpha(x: number, y: number): number {
    return this.data[(y * this.w + x) * 4 + 3]!;
  }

  rect(x: number, y: number, w: number, h: number, c: RGB | string, a = 255) {
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) this.set(i, j, c, a);
  }

  /** Fläche mit zufällig gestreuten Farben einer Palette füllen (Gewichte optional) */
  speckle(x: number, y: number, w: number, h: number, palette: (RGB | string)[], rng: Rng, weights?: number[]) {
    const ws = weights ?? palette.map(() => 1);
    const sum = ws.reduce((a, b) => a + b, 0);
    for (let j = y; j < y + h; j++)
      for (let i = x; i < x + w; i++) {
        let r = rng.next() * sum;
        let k = 0;
        while (k < ws.length - 1 && (r -= ws[k]!) > 0) k++;
        this.set(i, j, palette[k]!);
      }
  }

  /** In ein anderes Pixelbild kopieren (z. B. Kachel in den Atlas) */
  blit(target: Pixels, tx: number, ty: number) {
    for (let y = 0; y < this.h; y++)
      for (let x = 0; x < this.w; x++) {
        const i = (y * this.w + x) * 4;
        const j = ((ty + y) * target.w + tx + x) * 4;
        for (let k = 0; k < 4; k++) target.data[j + k] = this.data[i + k]!;
      }
  }

  toCanvas(): HTMLCanvasElement {
    const c = document.createElement('canvas');
    c.width = this.w;
    c.height = this.h;
    c.getContext('2d')!.putImageData(new ImageData(this.data.slice(), this.w, this.h), 0, 0);
    return c;
  }

  /** Scharfe Pixel ohne Verwischen (NearestFilter), sRGB */
  toTexture(): THREE.CanvasTexture {
    const t = new THREE.CanvasTexture(this.toCanvas());
    t.magFilter = THREE.NearestFilter;
    t.minFilter = THREE.NearestMipmapLinearFilter;
    t.colorSpace = THREE.SRGBColorSpace;
    t.generateMipmaps = true;
    return t;
  }

  toDataUrl(): string {
    return this.toCanvas().toDataURL('image/png');
  }
}

export function rngFor(name: string, salt = 0): Rng {
  let h = 2166136261 ^ salt;
  for (let i = 0; i < name.length; i++) h = Math.imul(h ^ name.charCodeAt(i), 16777619);
  return seededRng((h >>> 0) % 2_000_000_000 || 1);
}
