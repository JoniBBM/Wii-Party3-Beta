/**
 * Namensschilder über den Figuren – in WebGL statt als HTML-Elemente: Sprites in einer eigenen
 * kleinen Szene, die nach der Nachbearbeitung gezeichnet wird (keine Unschärfe, kein Bloom,
 * immer gleich groß auf dem Bildschirm). Spart das Durchlaufen der ganzen Szene je Bild.
 */
import * as THREE from 'three';

interface Tag {
  sprite: THREE.Sprite;
  canvas: HTMLCanvasElement;
  texture: THREE.CanvasTexture;
  key: string;
  aspect: number;
  active: boolean;
}

/** Höhe eines Schildes als Anteil der Bildhöhe */
const HEIGHT = 0.034;
const ACTIVE = 1.35;

let fontReady: Promise<unknown> | null = null;
function waitFont() {
  fontReady ??= document.fonts?.load('600 64px Fredoka').catch(() => null) ?? Promise.resolve();
  return fontReady;
}

/** Farbe mit Weiß aufhellen (Canvas kennt kein color-mix). */
function lighten(hex: string, k: number) {
  const c = new THREE.Color(hex).lerp(new THREE.Color('#ffffff'), k);
  return `#${c.getHexString()}`;
}

function draw(canvas: HTMLCanvasElement, name: string, color: string, dark: string): number {
  const ctx = canvas.getContext('2d')!;
  const font = '600 64px Fredoka, "Nunito", sans-serif';
  ctx.font = font;
  const textW = Math.ceil(ctx.measureText(name).width);
  const h = 104;
  const w = Math.min(1024, textW + 76);
  canvas.width = w;
  canvas.height = h;
  ctx.font = font;
  // Schatten, weißer Rand, Verlauf in Teamfarbe
  const r = 44;
  const path = () => {
    ctx.beginPath();
    ctx.roundRect(8, 8, w - 16, h - 20, r);
  };
  ctx.shadowColor = 'rgba(0,0,0,0.3)';
  ctx.shadowBlur = 10;
  ctx.shadowOffsetY = 4;
  ctx.fillStyle = '#ffffff';
  path();
  ctx.fill();
  ctx.shadowColor = 'transparent';
  const g = ctx.createLinearGradient(0, 14, 0, h - 18);
  g.addColorStop(0, lighten(color, 0.22));
  g.addColorStop(0.55, color);
  g.addColorStop(1, dark);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.roundRect(15, 15, w - 30, h - 34, r - 7);
  ctx.fill();
  // Text
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = 'rgba(0,0,0,0.3)';
  ctx.shadowBlur = 2;
  ctx.shadowOffsetY = 2;
  ctx.fillText(name, w / 2, h / 2 - 4);
  return w / h;
}

export class NameTags {
  readonly scene = new THREE.Scene();
  private tags = new Map<string, Tag>();
  visible = true;

  /** Schild anlegen oder aktualisieren. */
  set(id: string, name: string, color: string, dark: string) {
    const key = `${name}|${color}|${dark}`;
    let tag = this.tags.get(id);
    if (tag && tag.key === key) return;
    if (!tag) {
      const canvas = document.createElement('canvas');
      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.minFilter = THREE.LinearMipmapLinearFilter;
      texture.anisotropy = 4;
      const material = new THREE.SpriteMaterial({ map: texture, sizeAttenuation: false, depthTest: false, depthWrite: false, transparent: true, toneMapped: false });
      const sprite = new THREE.Sprite(material);
      sprite.center.set(0.5, 0);
      sprite.renderOrder = 10;
      this.scene.add(sprite);
      tag = { sprite, canvas, texture, key: '', aspect: 3, active: false };
      this.tags.set(id, tag);
    }
    const t = tag;
    t.key = key;
    const paint = () => {
      t.aspect = draw(t.canvas, name, color, dark);
      t.texture.needsUpdate = true;
    };
    paint();
    // Schrift ggf. nachladen und neu zeichnen
    void waitFont().then(() => t.key === key && paint());
  }

  remove(id: string) {
    const t = this.tags.get(id);
    if (!t) return;
    this.scene.remove(t.sprite);
    t.texture.dispose();
    t.sprite.material.dispose();
    this.tags.delete(id);
  }

  setActive(id: string | null) {
    for (const [k, t] of this.tags) t.active = k === id;
  }

  /** Position (Welt) und Sichtbarkeit je Bild setzen. */
  place(id: string, pos: THREE.Vector3, show: boolean, time: number) {
    const t = this.tags.get(id);
    if (!t) return;
    t.sprite.visible = this.visible && show;
    if (!t.sprite.visible) return;
    t.sprite.position.copy(pos);
    const k = t.active ? ACTIVE : 1;
    // Bildschirmhöhe ≈ scale × 1,3 bei 42° Blickwinkel
    const h = (HEIGHT / 1.3) * k;
    t.sprite.scale.set(h * t.aspect, h, 1);
    if (t.active) t.sprite.position.y += 0.18 + Math.sin(time * 4) * 0.08;
  }

  hideAll() {
    for (const t of this.tags.values()) t.sprite.visible = false;
  }

  dispose() {
    for (const id of [...this.tags.keys()]) this.remove(id);
  }
}
