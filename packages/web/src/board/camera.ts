/**
 * Kameraführung wie bei einer TV-Übertragung: ruhige Rundfahrt um die Insel im Leerlauf,
 * Verfolgung des aktiven Teams, Nahaufnahmen bei Ereignissen, Wackeln beim Ausbruch.
 */
import * as THREE from 'three';
import type { IslandLayout } from './layout.ts';

export type CameraMode =
  | { kind: 'overview'; tour?: boolean }
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
  /** Geländehöhe – die Kamera fliegt nie durch Berge */
  heightAt: ((x: number, z: number) => number) | null = null;

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

  /** Blick auf die ganze Insel (für Startbild/Lobby). */
  hero() {
    const aspect = this.camera.aspect;
    const d = aspect < 1.2 ? 104 : 84;
    return { position: new THREE.Vector3(Math.sin(this.orbit) * d, d * 0.55, Math.cos(this.orbit) * d), lookAt: new THREE.Vector3(0, 4, -2) };
  }

  /**
   * Rundflug im Leerlauf: abwechselnd Gesamtansicht und langsame Fahrten an Schauplätzen
   * vorbei (Hafen, Pyramide, Wasserfall, Leuchtturm, Krater, Steinköpfe, Lagune).
   */
  private tour(t: number): { position: THREE.Vector3; lookAt: THREE.Vector3 } {
    const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
    const v = this.layout.volcano;
    const shots: [THREE.Vector3, THREE.Vector3, THREE.Vector3, THREE.Vector3][] = [
      // [Kamera von, Kamera nach, Blick von, Blick nach]
      [V(70, 52, 70), V(30, 56, 88), V(0, 4, -2), V(-2, 4, -4)],
      [V(-6, 9, 32), V(-14, 8, 30), V(-27, 2, 19), V(-26, 2, 17)],
      [V(14, 9, 30), V(8, 10, 32), V(-3, 4, 15), V(-2, 5, 14)],
      [V(-80, 58, 50), V(-88, 56, 10), V(0, 4, -4), V(0, 4, -6)],
      [V(30, 9, 4), V(27, 11, 8), V(14, 5, -8), V(18, 3, -5)],
      [V(30, 12, -2), V(34, 14, -6), V(42, 8, -14), V(43, 7, -12)],
      [V(v.x + 12, v.height + 9, v.z + 14), V(v.x + 4, v.height + 10, v.z + 17), V(v.x, v.height - 2, v.z), V(v.x, v.height - 2.5, v.z)],
      [V(10, 60, -90), V(-30, 56, -86), V(0, 4, -4), V(0, 4, -4)],
      [V(-24, 14, -14), V(-26, 15, -8), V(-36, 5, -18), V(-35, 5, -14)],
      [V(36, 10, 40), V(24, 9, 40), V(29, 0, 26), V(27, 0, 24)],
    ];
    const len = 11;
    const i = Math.floor(t / len) % shots.length;
    const u = (t % len) / len;
    const [p0, p1, l0, l1] = shots[i]!;
    const aspect = this.camera.aspect;
    const pos = p0.clone().lerp(p1, u);
    // Hochformat: etwas weiter weg
    if (aspect < 1.2) pos.sub(l0).multiplyScalar(1.25).add(l0);
    return { position: pos, lookAt: l0.clone().lerp(l1, u) };
  }

  private tourTime = 0;

  update(dt: number) {
    const m = this.mode;
    if (m.kind === 'free') return;
    if (m.kind === 'overview') {
      this.orbit += dt * 0.035;
      this.tourTime += dt;
      const h = m.tour ? this.tour(this.tourTime) : this.hero();
      this.wantPos.copy(h.position);
      this.wantLook.copy(h.lookAt);
    } else if (m.kind === 'follow') {
      const t = m.target();
      if (t) {
        // Kamera außen vor der Figur, leicht erhöht – im Hintergrund der Vulkan
        const v = this.layout.volcano;
        const outward = new THREE.Vector3(t.x - v.x, 0, t.z - v.z);
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
    if (this.heightAt) {
      // auch auf dem Weg dorthin über dem Gelände bleiben
      let ground = this.heightAt(this.pos.x, this.pos.z);
      for (const f of [0.35, 0.7]) {
        const x = this.pos.x + (this.wantPos.x - this.pos.x) * f;
        const z = this.pos.z + (this.wantPos.z - this.pos.z) * f;
        ground = Math.max(ground, this.heightAt(x, z) - 1.5);
      }
      const min = Math.max(0, ground) + 2.2;
      if (this.pos.y < min) this.pos.y += (min - this.pos.y) * Math.min(1, dt * 6);
    }
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

  /** Seitlicher Blick auf ein Feld (z. B. Fässer in der Furt). */
  fieldShot(index: number, dist = 7, height = 4.5) {
    const f = this.layout.fields[index]!;
    const side = f.heading - Math.PI / 2;
    return {
      position: new THREE.Vector3(f.x + Math.cos(side) * dist, f.y + height, f.z + Math.sin(side) * dist),
      lookAt: new THREE.Vector3(f.x, f.y + 0.6, f.z),
    };
  }

  /** Blick schräg von oben in den Krater (von der Seite des Kraterfelds). */
  craterShot() {
    const v = this.layout.volcano;
    const f = this.layout.fields[this.layout.craterField]!;
    const out = Math.atan2(f.z - v.z, f.x - v.x);
    return {
      position: new THREE.Vector3(v.x + Math.cos(out + 0.5) * 11, v.height + 7.5, v.z + Math.sin(out + 0.5) * 11),
      lookAt: new THREE.Vector3(v.x, v.height - 2.6, v.z),
    };
  }

  volcanoShot() {
    const v = this.layout.volcano;
    return {
      position: new THREE.Vector3(v.x + 26, v.height + 10, v.z + 30),
      lookAt: new THREE.Vector3(v.x, v.height - 1, v.z),
    };
  }
}
