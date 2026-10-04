/**
 * 3D-Würfel als Overlay vor der Insel: rollt ins Bild, taumelt und bleibt mit der
 * gewürfelten Zahl zur Kamera liegen. Bonuswürfel golden mit Zahlen.
 */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { ease, type Tweens } from './tweens.ts';

/** Würfelwerte je Seite in der Reihenfolge +x, -x, +y, -y, +z, -z (gegenüber = 7). */
const D6_FACES = [3, 4, 1, 6, 2, 5];
const NORMALS = [
  new THREE.Vector3(1, 0, 0),
  new THREE.Vector3(-1, 0, 0),
  new THREE.Vector3(0, 1, 0),
  new THREE.Vector3(0, -1, 0),
  new THREE.Vector3(0, 0, 1),
  new THREE.Vector3(0, 0, -1),
];

const PIPS: Record<number, [number, number][]> = {
  1: [[0.5, 0.5]],
  2: [[0.28, 0.28], [0.72, 0.72]],
  3: [[0.26, 0.26], [0.5, 0.5], [0.74, 0.74]],
  4: [[0.28, 0.28], [0.72, 0.28], [0.28, 0.72], [0.72, 0.72]],
  5: [[0.27, 0.27], [0.73, 0.27], [0.5, 0.5], [0.27, 0.73], [0.73, 0.73]],
  6: [[0.28, 0.25], [0.72, 0.25], [0.28, 0.5], [0.72, 0.5], [0.28, 0.75], [0.72, 0.75]],
};

function faceTexture(value: number, kind: 'pips' | 'number', bg: string, fg: string): THREE.CanvasTexture {
  const s = 256;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const g = c.getContext('2d')!;
  g.fillStyle = bg;
  g.fillRect(0, 0, s, s);
  g.fillStyle = fg;
  if (kind === 'pips') {
    for (const [x, y] of PIPS[value] ?? []) {
      g.beginPath();
      g.arc(x * s, y * s, s * 0.09, 0, Math.PI * 2);
      g.fill();
    }
  } else {
    g.font = `800 ${s * 0.62}px Fredoka, Nunito, sans-serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(String(value), s / 2, s * 0.54);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

class Die {
  mesh: THREE.Mesh;
  values: number[];
  constructor(kind: 'main' | 'bonus', sides = 6, rolled = 1) {
    const geo = new RoundedBoxGeometry(1, 1, 1, 5, 0.16);
    // Bonuswürfel: gewürfelte Zahl liegt sicher auf einer Seite (auch W8–W12)
    this.values = kind === 'main' ? D6_FACES : D6_FACES.map((_, i) => ((rolled - 1 + i) % sides) + 1);
    const mats = this.values.map(
      (v) =>
        new THREE.MeshPhysicalMaterial({
          map: faceTexture(v, kind === 'main' ? 'pips' : 'number', kind === 'main' ? '#fbfbfd' : '#ffd84d', kind === 'main' ? '#1b2a36' : '#7a4b00'),
          roughness: 0.3,
          clearcoat: 0.8,
          clearcoatRoughness: 0.15,
        }),
    );
    this.mesh = new THREE.Mesh(geo, mats);
    this.mesh.visible = false;
  }
  /** Quaternion, bei dem die Seite mit `value` zur Kamera (+z) zeigt. */
  targetQuat(value: number): THREE.Quaternion {
    let idx = this.values.indexOf(value);
    if (idx < 0) idx = 0;
    const q = new THREE.Quaternion().setFromUnitVectors(NORMALS[idx]!, new THREE.Vector3(0, 0, 1));
    const roll = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), (Math.random() - 0.5) * 0.5);
    return roll.multiply(q);
  }
  dispose() {
    this.mesh.geometry.dispose();
    for (const m of this.mesh.material as THREE.MeshPhysicalMaterial[]) {
      m.map?.dispose();
      m.dispose();
    }
  }
}

export class DiceOverlay {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(28, 1, 0.1, 50);
  private main = new Die('main');
  private bonus: Die | null = null;
  visible = false;

  constructor(private tweens: Tweens) {
    this.camera.position.set(0, 0, 11);
    this.scene.add(new THREE.AmbientLight('#ffffff', 1.4));
    const key = new THREE.DirectionalLight('#ffffff', 2.4);
    key.position.set(3, 5, 8);
    this.scene.add(key);
    this.scene.add(this.main.mesh);
  }

  resize(aspect: number) {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  async roll(main: number, bonus: number, bonusSides: number, onImpact?: () => void) {
    if (this.bonus) {
      this.scene.remove(this.bonus.mesh);
      this.bonus.dispose();
      this.bonus = null;
    }
    if (bonus > 0) {
      this.bonus = new Die('bonus', bonusSides, bonus);
      this.scene.add(this.bonus.mesh);
    }
    this.visible = true;
    const dice = [{ die: this.main, value: main, x: bonus ? -1.05 : 0 }, ...(this.bonus ? [{ die: this.bonus, value: bonus, x: 1.05 }] : [])];
    const top = this.camera.aspect > 1 ? 1.15 : 0.6;
    const anims = dice.map(({ die, value, x }, i) => {
      const m = die.mesh;
      m.visible = true;
      m.scale.setScalar(1);
      const target = die.targetQuat(value);
      const axis = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
      const spinQ = new THREE.Quaternion();
      const startQ = new THREE.Quaternion().setFromAxisAngle(axis, Math.random() * 6);
      const from = new THREE.Vector3(x - 4 + i * 1.5, top + 3.5, -2);
      const to = new THREE.Vector3(x, top, 0);
      let impacted = false;
      return this.tweens.run(1.35, (t) => {
        // Position: Flugbahn mit zwei Hüpfern
        const b = ease.outBounce(t);
        m.position.lerpVectors(from, to, Math.min(1, t * 1.3));
        m.position.y = from.y + (to.y - from.y) * b;
        // Drehung: erst wild, dann zur Zielseite
        const spinT = Math.min(1, t / 0.72);
        spinQ.setFromAxisAngle(axis, (1 - ease.out(spinT)) * 14);
        const tumbling = startQ.clone().multiply(spinQ);
        m.quaternion.copy(tumbling).slerp(target, ease.inOut(Math.max(0, (t - 0.35) / 0.65)));
        if (!impacted && t > 0.28) {
          impacted = true;
          if (i === 0) onImpact?.();
        }
      }, ease.linear);
    });
    await Promise.all(anims);
    // kurzes „Pop“
    await this.tweens.run(0.25, (t) => {
      for (const { die } of dice) die.mesh.scale.setScalar(1 + Math.sin(t * Math.PI) * 0.18);
    });
  }

  async hide(after = 0.9) {
    await this.tweens.wait(after * 1000);
    const meshes = [this.main.mesh, ...(this.bonus ? [this.bonus.mesh] : [])];
    await this.tweens.run(0.3, (t) => {
      for (const m of meshes) m.scale.setScalar(Math.max(0.001, 1 - t));
    }, ease.in);
    for (const m of meshes) m.visible = false;
    this.visible = false;
  }
}
