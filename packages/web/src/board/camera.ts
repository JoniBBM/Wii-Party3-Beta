/**
 * Kameraführung wie bei einer TV-Übertragung: ruhige Rundfahrt um die Insel im Leerlauf,
 * Verfolgung des aktiven Teams, Nahaufnahmen bei Ereignissen, Wackeln beim Ausbruch.
 */
import * as THREE from 'three';
import type { IslandLayout } from './layout.ts';

export type CameraMode =
  | { kind: 'overview' }
  | { kind: 'follow'; target: () => THREE.Vector3 | null; distance?: number; height?: number; side?: number }
  | { kind: 'focus'; position: THREE.Vector3; lookAt: THREE.Vector3 }
  | { kind: 'free' };

export class CameraRig {
  mode: CameraMode = { kind: 'overview' };
  private pos = new THREE.Vector3(30, 26, 52);
  private look = new THREE.Vector3(0, 4, 0);
  private wantPos = new THREE.Vector3();
  private wantLook = new THREE.Vector3();
  private orbit = 0.35;
  private shakeAmp = 0;
  private shakeTime = 0;
  /** Glättung (höher = schneller) */
  stiffness = 1.8;

  constructor(
    readonly camera: THREE.PerspectiveCamera,
    private layout: IslandLayout,
  ) {
    camera.position.copy(this.pos);
    camera.lookAt(this.look);
  }

  set(mode: CameraMode, stiffness = 1.8) {
    this.mode = mode;
    this.stiffness = stiffness;
  }

  shake(amount: number, seconds: number) {
    this.shakeAmp = Math.max(this.shakeAmp, amount);
    this.shakeTime = Math.max(this.shakeTime, seconds);
  }

  /** Blick vom Hafen auf die ganze Insel (für Startbild/Lobby). */
  hero() {
    const aspect = this.camera.aspect;
    const d = aspect < 1.2 ? 78 : 62;
    return { position: new THREE.Vector3(Math.sin(this.orbit) * d, d * 0.55, Math.cos(this.orbit) * d), lookAt: new THREE.Vector3(0, 4.5, 0) };
  }

  update(dt: number) {
    const m = this.mode;
    if (m.kind === 'free') return;
    if (m.kind === 'overview') {
      this.orbit += dt * 0.035;
      const h = this.hero();
      this.wantPos.copy(h.position);
      this.wantLook.copy(h.lookAt);
    } else if (m.kind === 'follow') {
      const t = m.target();
      if (t) {
        // Kamera zwischen Figur und Inselrand, leicht erhöht – Blick zur Inselmitte hin
        const outward = new THREE.Vector3(t.x, 0, t.z);
        if (outward.lengthSq() < 1) outward.set(0, 0, 1);
        outward.normalize();
        const side = new THREE.Vector3(-outward.z, 0, outward.x).multiplyScalar(m.side ?? 3);
        const dist = m.distance ?? 10.5;
        const height = m.height ?? 10;
        this.wantPos.set(t.x + outward.x * dist + side.x, t.y + height, t.z + outward.z * dist + side.z);
        this.wantLook.set(t.x - outward.x * 2, t.y + 1, t.z - outward.z * 2);
      }
    } else {
      this.wantPos.copy(m.position);
      this.wantLook.copy(m.lookAt);
    }
    const k = 1 - Math.exp(-this.stiffness * dt);
    this.pos.lerp(this.wantPos, k);
    this.look.lerp(this.wantLook, k * 1.3 > 1 ? 1 : k * 1.3);
    this.camera.position.copy(this.pos);
    if (this.shakeTime > 0) {
      this.shakeTime -= dt;
      const a = this.shakeAmp * Math.min(1, this.shakeTime);
      this.camera.position.x += (Math.random() - 0.5) * a;
      this.camera.position.y += (Math.random() - 0.5) * a;
      this.camera.position.z += (Math.random() - 0.5) * a;
      if (this.shakeTime <= 0) this.shakeAmp = 0;
    }
    this.camera.lookAt(this.look);
  }

  /** Kamera sofort an Zielposition (z. B. beim ersten Bild). */
  jump() {
    this.update(0);
    this.pos.copy(this.wantPos);
    this.look.copy(this.wantLook);
    this.camera.position.copy(this.pos);
    this.camera.lookAt(this.look);
  }

  volcanoShot() {
    const v = this.layout.volcano;
    return {
      position: new THREE.Vector3(v.x + 26, v.height + 10, v.z + 30),
      lookAt: new THREE.Vector3(v.x, v.height - 1, v.z),
    };
  }
}
