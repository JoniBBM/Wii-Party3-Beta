/**
 * Kameraführung wie bei einer TV-Übertragung: Rundflug im Leerlauf, Verfolgung des aktiven
 * Teams (Vulkan im Hintergrund), Nahaufnahmen bei Ereignissen, Wackeln beim Ausbruch.
 *
 * Sauber: weiche Bewegungen (gedämpfte Feder statt Sprüngen), nie unter dem Gelände, und die
 * Sichtlinie zum Motiv wird laufend geprüft – verdecken Berg, Bäume oder Gebäude das Bild,
 * schwenkt die Kamera seitlich bzw. steigt etwas höher.
 *
 * „Ruhig“ (Standard) bewegt sich gemächlicher als „lebhaft“. Mit Maus, Touch oder aus der
 * Regie lässt sich die Kamera jederzeit frei führen; nach einer Weile ohne Eingabe übernimmt
 * wieder die Automatik.
 */
import * as THREE from 'three';
import type { CameraStyle } from '@insel/shared';
import type { IslandLayout } from './layout.ts';

export type CameraMode =
  | { kind: 'overview'; tour?: boolean }
  | { kind: 'follow'; target: () => THREE.Vector3 | null; distance?: number; height?: number; side?: number }
  | { kind: 'focus'; position: THREE.Vector3; lookAt: THREE.Vector3 }
  | { kind: 'free' };

/** Sichthindernis als senkrechter Zylinder (Baum, Turm, Gebäude). */
export interface Blocker {
  x: number;
  z: number;
  r: number;
  top: number;
}

export interface CameraStats {
  frames: number;
  /** kleinster Abstand Kamera–Gelände */
  minClearance: number;
  /** Bilder, in denen das Motiv deutlich verdeckt war */
  occludedFrames: number;
  /** größte Drehgeschwindigkeit der Blickrichtung (rad/s) */
  maxTurnRate: number;
  /** größte Beschleunigung der Kamera (m/s², aus der tatsächlichen Bahn) */
  maxAccel: number;
  /** Modus beim kleinsten Bodenabstand */
  minClearanceMode?: string;
  lowFrames?: number;
  /** auffällige Momente (Drehrate > 2,5 rad/s) */
  spikes: { frame: number; mode: string; turn: number; stiff: number }[];
  /** verdeckte Bilder je Kameramodus */
  occludedBy?: Record<string, number>;
}

const UP = new THREE.Vector3(0, 1, 0);

/** Kritisch gedämpfte Feder (wie SmoothDamp): sanftes Anfahren und Abbremsen, kein Überschwingen. */
function smoothDamp(cur: THREE.Vector3, target: THREE.Vector3, vel: THREE.Vector3, smoothTime: number, dt: number) {
  const st = Math.max(0.0001, smoothTime);
  const omega = 2 / st;
  const x = omega * dt;
  const exp = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
  const change = cur.clone().sub(target);
  const temp = vel.clone().addScaledVector(change, omega).multiplyScalar(dt);
  vel.sub(temp.clone().multiplyScalar(omega)).multiplyScalar(exp);
  const out = target.clone().add(change.add(temp).multiplyScalar(exp));
  // nicht über das Ziel hinausschießen
  if (target.clone().sub(cur).dot(out.clone().sub(target)) > 0) {
    out.copy(target);
    vel.set(0, 0, 0);
  }
  cur.copy(out);
}

/** Frei geführte Kamera: Kugelkoordinaten um einen Drehpunkt. */
export interface ManualView {
  pivot: THREE.Vector3;
  yaw: number;
  pitch: number;
  dist: number;
  /** Sekunden bis zur Rückkehr zur Automatik (Infinity = bleibt frei) */
  hold: number;
}

const STYLES: Record<CameraStyle, { turn: number; turnAccel: number; smooth: number; tourLen: number; orbit: number }> = {
  calm: { turn: 0.95, turnAccel: 2.2, smooth: 1.45, tourLen: 16, orbit: 0.022 },
  lively: { turn: 1.5, turnAccel: 3.5, smooth: 1, tourLen: 11, orbit: 0.035 },
};

export class CameraRig {
  mode: CameraMode = { kind: 'overview' };
  style: CameraStyle = 'calm';
  /** frei geführt (Maus/Touch/Regie) – die Automatik wartet solange */
  manual: ManualView | null = null;
  /** Meldet Wechsel zwischen frei und automatisch */
  onManualChange: ((manual: boolean) => void) | null = null;
  private autoStiffness = 1.8;
  private pos = new THREE.Vector3(30, 26, 52);
  private look = new THREE.Vector3(0, 4, 0);
  /** Punkt, auf den die Kamera gerade schaut (z. B. für die Schärfe) */
  get focusPoint() {
    return this.look;
  }
  private vel = new THREE.Vector3();
  private lookVel = new THREE.Vector3();
  private wantPos = new THREE.Vector3();
  private wantLook = new THREE.Vector3();
  private orbit = 0.35;
  private shakeAmp = 0;
  private shakeTime = 0;
  private tourTime = 0;
  /** Ausweichen: Drehung um das Motiv und zusätzliche Höhe (aktuell / Ziel) */
  private adj = { a: 0, h: 0 };
  private adjWant = { a: 0, h: 0 };
  private adjTimer = 0;
  /** Anheben während der Fahrt, wenn die aktuelle Sicht verdeckt ist (Tempel, Palmen …) */
  private travelLift = 0;
  private travelLiftWant = 0;
  private lastDir = new THREE.Vector3(0, 0, -1);
  /** tatsächliche Blickrichtung (Drehrate begrenzt) */
  private viewDir = new THREE.Vector3(0, -0.5, -1).normalize();
  private turnRate = 0;
  /** was im Bild sein soll (Figur bzw. Blickpunkt) */
  private subject = new THREE.Vector3();
  /** Glättung (höher = schneller) */
  stiffness = 1.8;
  /** Geländehöhe – die Kamera fliegt nie durch Berge */
  heightAt: ((x: number, z: number) => number) | null = null;
  private blockers: Blocker[] = [];
  private grid = new Map<number, Blocker[]>();
  readonly stats: CameraStats = { frames: 0, minClearance: Infinity, occludedFrames: 0, maxTurnRate: 0, maxAccel: 0, spikes: [], lowFrames: 0 };
  private prevPos = new THREE.Vector3();
  private prevStep = new THREE.Vector3();

  constructor(
    readonly camera: THREE.PerspectiveCamera,
    private layout: IslandLayout,
  ) {
    camera.position.copy(this.pos);
    camera.lookAt(this.look);
  }

  set(mode: CameraMode, stiffness = 1.8) {
    const changed = mode.kind !== this.mode.kind || mode !== this.mode;
    this.mode = mode;
    this.autoStiffness = stiffness;
    if (!this.manual) this.stiffness = stiffness;
    if (changed) this.adjTimer = 0;
  }

  /** Freie Kamera ab der aktuellen Ansicht beginnen. */
  beginManual(hold = 30): ManualView {
    if (!this.manual) {
      const d = this.pos.clone().sub(this.look);
      const dist = Math.max(4, d.length());
      this.manual = {
        pivot: this.look.clone(),
        yaw: Math.atan2(d.x, d.z),
        pitch: Math.asin(Math.max(-1, Math.min(1, d.y / dist))),
        dist,
        hold,
      };
      this.onManualChange?.(true);
    }
    this.manual.hold = hold;
    return this.manual;
  }

  /** Eingabe der freien Kamera (Drehen, Neigen, Zoomen, Verschieben). */
  /** Gesperrt (z. B. während der Spielerklärung): Maus, Tastatur und Fernsteuerung bewegen nichts */
  locked = false;

  nudge(d: { yaw?: number; pitch?: number; zoom?: number; panX?: number; panZ?: number }, hold = 30) {
    if (this.locked) return;
    const m = this.beginManual(hold);
    m.yaw += d.yaw ?? 0;
    m.pitch = Math.max(0.08, Math.min(1.45, m.pitch + (d.pitch ?? 0)));
    m.dist = Math.max(3.5, Math.min(150, m.dist * Math.exp(d.zoom ?? 0)));
    if (d.panX || d.panZ) {
      // seitlich und nach vorn relativ zur Blickrichtung, im Verhältnis zum Abstand
      const right = new THREE.Vector3(Math.cos(m.yaw), 0, -Math.sin(m.yaw));
      const fwd = new THREE.Vector3(-Math.sin(m.yaw), 0, -Math.cos(m.yaw));
      const k = Math.max(2, m.dist) * 0.9;
      m.pivot.addScaledVector(right, (d.panX ?? 0) * k).addScaledVector(fwd, (d.panZ ?? 0) * k);
      m.pivot.x = Math.max(-80, Math.min(80, m.pivot.x));
      m.pivot.z = Math.max(-80, Math.min(80, m.pivot.z));
      m.pivot.y = Math.max(0, this.heightAt?.(m.pivot.x, m.pivot.z) ?? 0) + 1;
    }
  }

  /** Feste Einstellung der freien Kamera (z. B. „Vulkan“ aus der Regie). */
  manualShot(shot: { position: THREE.Vector3; lookAt: THREE.Vector3 }, hold = 40) {
    if (this.locked) return;
    const d = shot.position.clone().sub(shot.lookAt);
    const dist = Math.max(4, d.length());
    const had = !!this.manual;
    this.manual = { pivot: shot.lookAt.clone(), yaw: Math.atan2(d.x, d.z), pitch: Math.asin(Math.max(-1, Math.min(1, d.y / dist))), dist, hold };
    if (!had) this.onManualChange?.(true);
  }

  /** Zurück zur Automatik. */
  endManual() {
    if (!this.manual) return;
    this.manual = null;
    this.stiffness = this.autoStiffness;
    this.adjTimer = 0;
    this.onManualChange?.(false);
  }

  /** Sichthindernisse (Bäume, Gebäude) für die Sichtprüfung. */
  setBlockers(list: Blocker[]) {
    this.blockers = list;
    this.grid.clear();
    const C = 6;
    for (const b of list) {
      for (let cx = Math.floor((b.x - b.r) / C); cx <= Math.floor((b.x + b.r) / C); cx++)
        for (let cz = Math.floor((b.z - b.r) / C); cz <= Math.floor((b.z + b.r) / C); cz++) {
          const k = cx * 9973 + cz;
          const arr = this.grid.get(k);
          if (arr) arr.push(b);
          else this.grid.set(k, [b]);
        }
    }
  }

  shake(amount: number, seconds: number) {
    this.shakeAmp = Math.max(this.shakeAmp, amount);
    this.shakeTime = Math.max(this.shakeTime, seconds);
  }

  /** Anteil der Sichtlinie von `from` nach `to`, der von Gelände oder Hindernissen verdeckt ist. */
  occlusion(from: THREE.Vector3, to: THREE.Vector3, terrainOnly = false): number {
    let blocked = 0;
    let n = 0;
    const p = new THREE.Vector3();
    for (let t = 0.03; t <= 0.92; t += 0.06) {
      n++;
      p.lerpVectors(from, to, t);
      if (this.heightAt && p.y < this.heightAt(p.x, p.z) + 0.2) {
        blocked++;
        continue;
      }
      if (terrainOnly) continue;
      const cell = this.grid.get(Math.floor(p.x / 6) * 9973 + Math.floor(p.z / 6));
      if (cell)
        for (const b of cell) {
          if (p.y < b.top && Math.hypot(p.x - b.x, p.z - b.z) < b.r) {
            blocked++;
            break;
          }
        }
    }
    return blocked / Math.max(1, n);
  }

  private insideBlocker(p: THREE.Vector3): boolean {
    const cell = this.grid.get(Math.floor(p.x / 6) * 9973 + Math.floor(p.z / 6));
    return !!cell?.some((b) => p.y < b.top + 0.8 && Math.hypot(p.x - b.x, p.z - b.z) < b.r + 1);
  }

  private clearance(p: THREE.Vector3): number {
    return this.heightAt ? p.y - Math.max(0, this.heightAt(p.x, p.z)) : p.y;
  }

  /** Kamera um das Motiv drehen bzw. anheben. */
  private applyAdj(base: THREE.Vector3, look: THREE.Vector3, a: number, h: number): THREE.Vector3 {
    return base.clone().sub(look).applyAxisAngle(UP, a).add(look).addScaledVector(UP, h);
  }

  /** Freie Position suchen; bevorzugt kleine Änderungen gegenüber der bisherigen Wahl. */
  private chooseAdj(base: THREE.Vector3, look: THREE.Vector3) {
    const ok = (a: number, h: number) => {
      const p = this.applyAdj(base, look, a, h);
      return this.clearance(p) > 1.5 && !this.insideBlocker(p) && this.occlusion(p, this.subject) === 0 && this.occlusion(p, look) < 0.1;
    };
    if (ok(this.adjWant.a, this.adjWant.h)) {
      // zurück in die Grundstellung, sobald die frei ist
      if ((this.adjWant.a !== 0 || this.adjWant.h !== 0) && ok(0, 0)) this.adjWant = { a: 0, h: 0 };
      return;
    }
    for (const h of [0, 2.5, 5, 9])
      for (const a of [0, 0.35, -0.35, 0.7, -0.7, 1.05, -1.05, 1.5, -1.5, 2.2, -2.2, Math.PI]) {
        if (ok(a, h)) {
          this.adjWant = { a, h };
          return;
        }
      }
    this.adjWant = { a: 0, h: 10 };
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
      [V(-6, 10, 33), V(-13, 9, 31), V(-27, 2, 19), V(-26, 2, 17)],
      [V(14, 10, 31), V(8, 11, 33), V(-3, 4, 15), V(-2, 5, 14)],
      [V(-80, 58, 50), V(-88, 56, 10), V(0, 4, -4), V(0, 4, -6)],
      [V(30, 10, 4), V(27, 12, 8), V(14, 5, -8), V(18, 3, -5)],
      [V(30, 13, -2), V(34, 15, -6), V(42, 8, -14), V(43, 7, -12)],
      [V(v.x + 12, v.height + 9, v.z + 14), V(v.x + 4, v.height + 10, v.z + 17), V(v.x, v.height - 2, v.z), V(v.x, v.height - 2.5, v.z)],
      [V(10, 60, -90), V(-30, 56, -86), V(0, 4, -4), V(0, 4, -4)],
      [V(-24, 15, -14), V(-26, 16, -8), V(-36, 5, -18), V(-35, 5, -14)],
      [V(36, 11, 40), V(24, 10, 40), V(29, 0, 26), V(27, 0, 24)],
    ];
    const len = STYLES[this.style].tourLen;
    const i = Math.floor(t / len) % shots.length;
    const u = (t % len) / len;
    const [p0, p1, l0, l1] = shots[i]!;
    const pos = p0.clone().lerp(p1, u);
    // Hochformat: etwas weiter weg
    if (this.camera.aspect < 1.2) pos.sub(l0).multiplyScalar(1.25).add(l0);
    return { position: pos, lookAt: l0.clone().lerp(l1, u) };
  }

  update(dt: number) {
    const m = this.mode;
    const st = STYLES[this.style];
    const man = this.manual;
    if (man) {
      man.hold -= dt;
      if (man.hold <= 0) this.endManual();
    }
    if (m.kind === 'free' && !this.manual) return;
    if (this.manual) {
      const mv = this.manual;
      const cp = Math.cos(mv.pitch);
      this.wantPos.set(mv.pivot.x + Math.sin(mv.yaw) * cp * mv.dist, mv.pivot.y + Math.sin(mv.pitch) * mv.dist, mv.pivot.z + Math.cos(mv.yaw) * cp * mv.dist);
      this.wantLook.copy(mv.pivot);
      this.subject.copy(mv.pivot);
    } else if (m.kind === 'free') {
      return;
    } else if (m.kind === 'overview') {
      this.orbit += dt * st.orbit;
      this.tourTime += dt;
      const h = m.tour ? this.tour(this.tourTime) : this.hero();
      this.wantPos.copy(h.position);
      this.wantLook.copy(h.lookAt);
      this.subject.copy(h.lookAt);
    } else if (m.kind === 'follow') {
      const t = m.target();
      if (t) {
        // Kamera außen vor der Figur, leicht erhöht – im Hintergrund der Vulkan
        const v = this.layout.volcano;
        const outward = new THREE.Vector3(t.x - v.x, 0, t.z - v.z);
        if (outward.lengthSq() < 1) outward.set(0, 0, 1);
        outward.normalize();
        const side = new THREE.Vector3(-outward.z, 0, outward.x).multiplyScalar(m.side ?? 3);
        const dist = m.distance ?? 9.5;
        const height = m.height ?? 11.5;
        this.wantPos.set(t.x + outward.x * dist + side.x, t.y + height, t.z + outward.z * dist + side.z);
        this.wantLook.set(t.x - outward.x * 2, t.y + 1, t.z - outward.z * 2);
        this.subject.set(t.x, t.y + 0.9, t.z);
      }
    } else {
      this.wantPos.copy(m.position);
      this.wantLook.copy(m.lookAt);
      this.subject.copy(m.lookAt);
    }

    // Sichtlinie prüfen (nicht jedes Bild) und weich ausweichen – nicht bei freier Kamera
    this.adjTimer -= dt;
    if (this.manual) this.adjWant = { a: 0, h: 0 };
    else if (this.adjTimer <= 0) {
      this.adjTimer = 0.35;
      this.chooseAdj(this.wantPos, this.wantLook);
      // Unterwegs verdeckt? Dann über das Hindernis hinweg fahren, bis die Sicht frei ist
      const moving = this.pos.distanceTo(this.wantPos) > 3;
      this.travelLiftWant = moving && this.occlusion(this.pos, this.subject) > 0.2 ? Math.min(9, this.travelLiftWant + 3) : 0;
    }
    this.travelLift += (this.travelLiftWant - this.travelLift) * (1 - Math.exp(-dt * 1.8));
    const k = 1 - Math.exp(-dt * 2.5);
    this.adj.a += (this.adjWant.a - this.adj.a) * k;
    this.adj.h += (this.adjWant.h - this.adj.h) * k;
    const target = this.applyAdj(this.wantPos, this.wantLook, this.adj.a, this.adj.h);
    target.y += this.travelLift;
    // Weite Fahrten im Bogen: erst steigen, über die Insel, dann absenken (wie ein Kamerakran)
    const travel = Math.hypot(target.x - this.pos.x, target.z - this.pos.z);
    if (travel > 12 && dt > 0 && !this.manual) {
      let ridge = 0;
      if (this.heightAt)
        for (let f = 0.1; f < 1; f += 0.15) ridge = Math.max(ridge, this.heightAt(this.pos.x + (target.x - this.pos.x) * f, this.pos.z + (target.z - this.pos.z) * f));
      const lift = Math.min(24, (travel - 12) * 0.35) + Math.max(0, ridge + 6 - Math.min(this.pos.y, target.y));
      target.y += lift * Math.min(1, (travel - 12) / 10);
    }

    // große Sprünge (anderes Motiv, andere Seite) langsamer und ohne Peitschenschwenk
    const base = this.manual ? 0.22 : (1.1 / Math.max(0.05, this.stiffness)) * st.smooth;
    const far = this.manual ? 1 : Math.min(2.2, Math.max(1, this.pos.distanceTo(target) / 18));
    const cur = this.look.clone().sub(this.pos).normalize();
    const want = this.wantLook.clone().sub(target).normalize();
    const turn = this.manual ? 1 : Math.min(1.6, Math.max(1, cur.angleTo(want) / 1.2));
    const smooth = base * Math.max(far, turn);
    if (dt <= 0) {
      this.pos.copy(target);
      this.look.copy(this.wantLook);
    } else {
      smoothDamp(this.pos, target, this.vel, smooth, dt);
      smoothDamp(this.look, this.wantLook, this.lookVel, smooth * 0.9, dt);
    }
    if (this.heightAt) {
      // auch auf dem Weg dorthin über dem Gelände bleiben
      let ground = this.heightAt(this.pos.x, this.pos.z);
      for (const f of [0.35, 0.7]) {
        const x = this.pos.x + (target.x - this.pos.x) * f;
        const z = this.pos.z + (target.z - this.pos.z) * f;
        ground = Math.max(ground, this.heightAt(x, z) - 1.5);
      }
      const base = Math.max(0, ground);
      const min = base + 2.2;
      if (this.pos.y < min) {
        this.pos.y += (min - this.pos.y) * Math.min(1, dt * 6);
        if (this.vel.y < 0) this.vel.y = 0;
      }
      // harte Untergrenze: nie näher als 1,2 m an Boden oder Wasser
      const here = Math.max(0, this.heightAt(this.pos.x, this.pos.z));
      if (this.pos.y < here + 1.2) this.pos.y = here + 1.2;
    }
    // Blickrichtung mit begrenzter, weich anlaufender Drehrate (kein Peitschenschwenk)
    const desired = this.look.clone().sub(this.pos).normalize();
    if (dt <= 0) {
      this.viewDir.copy(desired);
      this.turnRate = 0;
    } else {
      const ang = this.viewDir.angleTo(desired);
      const maxTurn = this.manual ? 4 : st.turn;
      const want = Math.min(maxTurn, ang * 3.2);
      this.turnRate = want < this.turnRate ? want : Math.min(want, this.turnRate + (this.manual ? 12 : st.turnAccel) * dt);
      const step = Math.min(ang, this.turnRate * dt);
      if (ang > 1e-5) {
        const axis = new THREE.Vector3().crossVectors(this.viewDir, desired);
        if (axis.lengthSq() < 1e-10) axis.set(0, 1, 0);
        this.viewDir.applyAxisAngle(axis.normalize(), step).normalize();
      }
    }
    this.camera.position.copy(this.pos);
    if (this.shakeTime > 0) {
      this.shakeTime -= dt;
      const a = this.shakeAmp * Math.min(1, this.shakeTime);
      this.camera.position.x += (Math.random() - 0.5) * a;
      this.camera.position.y += (Math.random() - 0.5) * a;
      this.camera.position.z += (Math.random() - 0.5) * a;
      if (this.shakeTime <= 0) this.shakeAmp = 0;
    }
    this.camera.lookAt(this.camera.position.clone().add(this.viewDir));

    // Messwerte (für die Kameraprüfung)
    if (dt > 0) {
      const s = this.stats;
      s.frames++;
      const cl = this.clearance(this.pos);
      if (cl < s.minClearance) {
        s.minClearance = cl;
        s.minClearanceMode = this.mode.kind;
      }
      if (cl < 2 && s.lowFrames !== undefined) s.lowFrames++;
      if (s.frames % 6 === 0 && this.occlusion(this.pos, this.subject) > 0.25) {
        s.occludedFrames += 6;
        const key = this.manual ? 'manual' : this.pos.distanceTo(this.wantPos) > 3 ? `${this.mode.kind}-fahrt` : this.mode.kind;
        s.occludedBy = s.occludedBy ?? {};
        s.occludedBy[key] = (s.occludedBy[key] ?? 0) + 6;
      }
      const dir = this.viewDir.clone();
      const turn = dir.angleTo(this.lastDir) / dt;
      if (s.frames > 5) {
        s.maxTurnRate = Math.max(s.maxTurnRate, turn);
        if (turn > 2.5 && s.spikes.length < 40) s.spikes.push({ frame: s.frames, mode: this.mode.kind, turn: Math.round(turn * 100) / 100, stiff: this.stiffness });
        // Beschleunigung aus der Bahn (Geschwindigkeit je Bild), nur bei normalen Bildzeiten
        const v = this.pos.clone().sub(this.prevPos).divideScalar(dt);
        if (dt > 0.008 && dt < 0.05) s.maxAccel = Math.max(s.maxAccel, v.clone().sub(this.prevStep).length() / dt);
        this.prevStep.copy(v);
      }
      this.prevPos.copy(this.pos);
      this.lastDir.copy(dir);
    }
  }

  /** Kamera sofort an Zielposition (z. B. beim ersten Bild). */
  jump() {
    this.update(0);
    this.viewDir.copy(this.look).sub(this.pos).normalize();
    this.vel.set(0, 0, 0);
    this.lookVel.set(0, 0, 0);
    this.camera.position.copy(this.pos);
    this.camera.lookAt(this.look);
  }

  /** Baumkronen (Palmen) – für freie Sicht bei Nahaufnahmen */
  canopies: THREE.Vector3[] = [];

  /**
   * Freie Sicht auf einen Punkt: probiert 16 Richtungen in zwei Höhen und nimmt die mit den
   * wenigsten Hindernissen (Gelände, Gebäude, Baumkronen); bei Gleichstand die bevorzugte Richtung.
   */
  clearShot(target: THREE.Vector3, dist = 8, height = 5, prefer?: THREE.Vector3) {
    const preferA = prefer ? Math.atan2(prefer.z, prefer.x) : null;
    const seg = new THREE.Line3();
    const q = new THREE.Vector3();
    let best: { position: THREE.Vector3; lookAt: THREE.Vector3 } | null = null;
    let bestScore = Infinity;
    const look = target.clone().setY(target.y + 0.8);
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2;
      for (const h of [height, height * 1.6]) {
        const position = new THREE.Vector3(target.x + Math.cos(a) * dist, target.y + h, target.z + Math.sin(a) * dist);
        let score = this.occlusion(position, look) * 12;
        if (this.insideBlocker(position)) score += 20;
        if (this.heightAt && position.y < this.heightAt(position.x, position.z) + 1.2) score += 20;
        score += this.crowding(position, look);
        seg.set(position, look);
        for (const c of this.canopies) {
          if (Math.abs(c.x - target.x) > dist + 4 || Math.abs(c.z - target.z) > dist + 4) continue;
          const d = seg.closestPointToPoint(c, true, q).distanceTo(c);
          if (d < 2.6) score += (2.6 - d) * 1.5;
          // Kamera mitten in einer Krone
          if (position.distanceTo(c) < 3) score += 12;
        }
        if (preferA !== null) score += (1 - Math.cos(a - preferA)) * 0.8;
        if (h > height) score += 0.5;
        if (score < bestScore) {
          bestScore = score;
          best = { position, lookAt: look };
        }
      }
    }
    return best!;
  }

  /**
   * Gelände dicht neben der Blickachse (z. B. die Vulkanflanke) füllt sonst als unscharfe Wand
   * ein Drittel des Bildes: Strahlen schräg links/rechts der Blickrichtung prüfen.
   */
  private crowding(position: THREE.Vector3, look: THREE.Vector3): number {
    if (!this.heightAt) return 0;
    const dir = look.clone().sub(position).normalize();
    const up = new THREE.Vector3(0, 1, 0);
    let score = 0;
    for (const side of [-0.42, 0.42]) {
      const d = dir.clone().applyAxisAngle(up, side);
      for (const t of [2.5, 5]) {
        const p = position.clone().addScaledVector(d, t);
        if (this.heightAt(p.x, p.z) > p.y - 0.4) score += 4;
      }
    }
    return score;
  }

  /** Seitlicher Blick auf ein Feld (z. B. Fässer in der Furt); `outside` = von der Bergseite weg. */
  fieldShot(index: number, dist = 7, height = 4.5, outside = false) {
    const f = this.layout.fields[index]!;
    let side = f.heading - Math.PI / 2;
    if (outside) {
      // Kamera auf die vom Vulkan abgewandte Seite
      const v = this.layout.volcano;
      const ox = Math.cos(side);
      const oz = Math.sin(side);
      if (ox * (f.x - v.x) + oz * (f.z - v.z) < 0) side += Math.PI;
    }
    return {
      position: new THREE.Vector3(f.x + Math.cos(side) * dist, f.y + height, f.z + Math.sin(side) * dist),
      lookAt: new THREE.Vector3(f.x, f.y + 0.6, f.z),
    };
  }

  /**
   * Großaufnahme einer Figur von vorn (für die Reaktion nach dem Zug): von der Vulkan-
   * abgewandten Seite, leicht erhöht. Liefert auch den Punkt, zu dem die Figur schauen soll.
   */
  portraitShot(at: THREE.Vector3, dist = 4.6) {
    const v = this.layout.volcano;
    const out = new THREE.Vector3(at.x - v.x, 0, at.z - v.z);
    if (out.lengthSq() < 1) out.set(0, 0, 1);
    out.normalize().applyAxisAngle(UP, 0.35);
    const position = new THREE.Vector3(at.x + out.x * dist, at.y + 1.9, at.z + out.z * dist);
    // nicht im Hang verschwinden
    if (this.heightAt) position.y = Math.max(position.y, this.heightAt(position.x, position.z) + 1.6);
    return { position, lookAt: new THREE.Vector3(at.x, at.y + 0.95, at.z) };
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

  get blockerCount() {
    return this.blockers.length;
  }

  /** Wie stark ist das Motiv gerade verdeckt? (für Tests) */
  currentOcclusion() {
    return this.occlusion(this.pos, this.subject);
  }
}
