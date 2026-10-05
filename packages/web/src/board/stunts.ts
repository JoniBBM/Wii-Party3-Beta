/**
 * Auftritte der Sonderfelder auf dem Beamer:
 * Liane am Riesenbaum (schwingen und abspringen), Lavahöhle (hineinfallen, Fledermäuse,
 * am Vulkanfuß herausrutschen), Sprungfeder (Katapult vorwärts), Flugzeug mit Strickleiter
 * und Fallschirm (Katapult rückwärts), UFO mit Traktorstrahl (Platztausch),
 * Minispiel-Bühne mit Scheinwerfern und Dampf-Geysir (Vulkanfeld).
 */
import * as THREE from 'three';
import { FIELD_INFO, VOLCANO } from '@insel/shared';
import { worldMaterial } from './assets.ts';
import type { BoardAudio } from './audio.ts';
import type { IslandLayout } from './layout.ts';
import type { Effects } from './particles.ts';
import type { Pieces } from './pieces.ts';
import type { Heightfield } from './terrain.ts';
import { ease, type Tweens } from './tweens.ts';

const matCache = new Map<string, THREE.MeshStandardMaterial>();
const shared = new WeakSet<THREE.Material>();

/** Vorübergehendes Objekt samt Geometrien, eigenen Materialien und Texturen freigeben. */
function disposeTree(o: THREE.Object3D) {
  o.traverse((c) => {
    const m = c as THREE.Mesh;
    m.geometry?.dispose();
    const mats = Array.isArray(m.material) ? m.material : m.material ? [m.material] : [];
    for (const mt of mats) {
      if (shared.has(mt)) continue;
      ((mt as THREE.MeshBasicMaterial).map as THREE.Texture | null)?.dispose();
      mt.dispose();
    }
  });
}
function mat(color: string, o: { rough?: number; metal?: number; emissive?: string; flat?: boolean } = {}) {
  const key = `${color}|${o.rough ?? 0.7}|${o.metal ?? 0}|${o.emissive ?? ''}|${o.flat ? 1 : 0}`;
  let m = matCache.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, roughness: o.rough ?? 0.7, metalness: o.metal ?? 0, flatShading: o.flat ?? false });
    if (o.emissive) {
      m.emissive.set(o.emissive);
      m.emissiveIntensity = 1.5;
    }
    worldMaterial(m);
    matCache.set(key, m);
    shared.add(m);
  }
  return m;
}

function mesh(geo: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0, shadow = true) {
  const me = new THREE.Mesh(geo, m);
  me.position.set(x, y, z);
  me.castShadow = shadow;
  me.receiveShadow = true;
  return me;
}

/** Beendet einen Auftritt, wenn zwischendurch Rückgängig gedrückt wurde. */
class Aborted extends Error {}

export class Stunts {
  readonly group = new THREE.Group();
  /** vorübergehende Objekte (UFO, Flugzeug, Feder …) – werden bei Abbruch entfernt */
  private temps = new Set<THREE.Object3D>();
  private updaters = new Set<(t: number, dt: number) => void>();

  // Liane
  private liana: THREE.Group | null = null;
  private lianaAxis = new THREE.Vector3(1, 0, 0);
  private lianaLen = 5;
  private lianaAngle = 0;
  private lianaTarget = 0;
  private lianaVel = 0;
  private hanging: string | null = null;
  private swinging = false;
  // Lavahöhle
  private hole: THREE.Vector3 | null = null;
  private holeFront: THREE.Vector3 | null = null;
  private mouth: { pos: THREE.Vector3; inner: THREE.Vector3 } | null = null;
  // Minispiel-Bühne
  private stage: THREE.Group | null = null;

  constructor(
    private layout: IslandLayout,
    private field: Heightfield,
    private pieces: Pieces,
    private tweens: Tweens,
    private effects: Effects,
    private audio: BoardAudio,
  ) {
    this.group.name = 'stunts';
    this.buildVineTree();
    this.buildCave();
  }

  private guard(epoch: number) {
    if (this.pieces.epochNow !== epoch) throw new Aborted();
  }

  private temp<T extends THREE.Object3D>(o: T): T {
    this.temps.add(o);
    this.group.add(o);
    return o;
  }

  private drop(o: THREE.Object3D | null) {
    if (!o) return;
    this.temps.delete(o);
    o.removeFromParent();
    disposeTree(o);
  }

  /** Nach Rückgängig: alles Vorübergehende entfernen. */
  abortAll() {
    for (const o of this.temps) {
      o.removeFromParent();
      disposeTree(o);
    }
    this.temps.clear();
    this.updaters.clear();
    this.hanging = null;
    this.swinging = false;
    this.ufoTarget = null;
    this.lianaTarget = 0;
    this.stageOff(true);
  }

  private async run(fn: (epoch: number) => Promise<void>) {
    const epoch = this.pieces.epochNow;
    try {
      await fn(epoch);
    } catch (e) {
      if (!(e instanceof Aborted)) throw e;
    }
  }

  // =========================================================================
  // Liane am Riesenbaum
  // =========================================================================
  private vineFrame() {
    const f = this.layout.fields[this.layout.plan.vineField]!;
    const dir = new THREE.Vector3(Math.cos(f.heading), 0, Math.sin(f.heading));
    const side = new THREE.Vector3(-dir.z, 0, dir.x);
    return { f, dir, side };
  }

  private buildVineTree() {
    const { f, dir, side } = this.vineFrame();
    // Liane hängt so, dass die Figur gut einen Meter über dem Boden baumelt
    const pivot = new THREE.Vector3(f.x, f.y + this.lianaLen + 2.9, f.z);
    // Baum neben dem Weg auf der Seite mit mehr Platz (höher gelegen = weg vom Strand)
    const sx = this.field.height(f.x + side.x * 4, f.z + side.z * 4) >= this.field.height(f.x - side.x * 4, f.z - side.z * 4) ? 1 : -1;
    this.treeSide = sx;
    const tx = f.x + side.x * sx * 4.6 - dir.x * 0.6;
    const tz = f.z + side.z * sx * 4.6 - dir.z * 0.6;
    const ty = this.field.height(tx, tz);
    const tree = new THREE.Group();
    const bark = mat('#7a5232', { flat: true });
    const trunkH = pivot.y - ty + 1.2;
    tree.add(mesh(new THREE.CylinderGeometry(0.5, 0.85, trunkH, 9), bark, tx, ty + trunkH / 2, tz));
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2 + 0.4;
      const root = mesh(new THREE.ConeGeometry(0.35, 1.6, 6), bark, tx + Math.cos(a) * 0.7, ty + 0.4, tz + Math.sin(a) * 0.7);
      root.rotation.set(Math.sin(a) * 0.9, 0, -Math.cos(a) * 0.9);
      tree.add(root);
    }
    // Ast über den Weg bis zur Aufhängung der Liane
    const top = new THREE.Vector3(tx, pivot.y + 0.35, tz);
    const branchLen = top.distanceTo(pivot) + 0.6;
    const branch = mesh(new THREE.CylinderGeometry(0.2, 0.38, branchLen, 7), bark);
    branch.position.copy(top).lerp(pivot, 0.5);
    branch.lookAt(pivot);
    branch.rotateX(Math.PI / 2);
    tree.add(branch);
    // Blätterdach aus Kugeln
    const leaves = [mat('#3f9634', { flat: true }), mat('#2f7f33', { flat: true }), mat('#5aae3f', { flat: true })];
    const crown = [
      [0, 1.3, 0, 1.9],
      [1.3, 0.7, 0.6, 1.5],
      [-1.1, 0.8, -0.5, 1.6],
      [0.2, 0.5, -1.3, 1.4],
      [-0.3, 2.0, 0.4, 1.3],
    ];
    crown.forEach(([dx, dy, dz, r], i) => tree.add(mesh(new THREE.IcosahedronGeometry(r!, 1), leaves[i % 3]!, tx + dx!, top.y + dy!, tz + dz!)));
    tree.add(mesh(new THREE.IcosahedronGeometry(1.0, 1), leaves[1]!, pivot.x + side.x * sx * 0.4, pivot.y + 0.55, pivot.z + side.z * sx * 0.4));
    // Liane: dreht sich um die Aufhängung, Achse quer zur Laufrichtung
    const liana = new THREE.Group();
    liana.position.copy(pivot);
    const ropeMat = mat('#5d7a2a', { rough: 1 });
    liana.add(mesh(new THREE.CylinderGeometry(0.085, 0.1, this.lianaLen, 7), ropeMat, 0, -this.lianaLen / 2, 0));
    const leafGeo = new THREE.SphereGeometry(0.22, 6, 4);
    leafGeo.scale(1, 0.35, 1.6);
    for (let k = 1; k < 9; k++) {
      const leaf = mesh(leafGeo, leaves[k % 3]!, (k % 2 ? 0.12 : -0.12), -k * (this.lianaLen / 9), 0, false);
      leaf.rotation.set(0.6, k, 0.4);
      liana.add(leaf);
    }
    liana.add(mesh(new THREE.TorusGeometry(0.16, 0.05, 6, 12), ropeMat, 0, -this.lianaLen - 0.08, 0));
    this.lianaAxis.set(dir.z, 0, -dir.x).normalize();
    this.group.add(tree, liana);
    this.liana = liana;
    this.blockers.push({ x: tx, z: tz, r: 2.4, top: pivot.y + 2.6 });
  }

  /** Sichthindernisse für die Kamera (Riesenbaum) */
  readonly blockers: { x: number; z: number; r: number; top: number }[] = [];

  private treeSide = 1;

  /** Kamera für die Liane: von der baumabgewandten Seite, leicht von hinten. */
  vineShot() {
    const { f, dir, side } = this.vineFrame();
    const s = -this.treeSide;
    return {
      position: new THREE.Vector3(f.x + side.x * s * 9 - dir.x * 4, f.y + 5.5, f.z + side.z * s * 9 - dir.z * 4),
      lookAt: new THREE.Vector3(f.x + dir.x * 2, f.y + 2, f.z + dir.z * 2),
    };
  }

  /** Kamera für den Schwung: seitlich, so dass Liane und Landefeld im Bild sind. */
  swingShot(to: THREE.Vector3) {
    const { f } = this.vineFrame();
    const a = new THREE.Vector3(f.x, f.y + 1.5, f.z);
    const mid = a.clone().lerp(to, 0.5);
    const d = new THREE.Vector3(to.x - a.x, 0, to.z - a.z);
    const len = Math.max(2, d.length());
    d.normalize();
    const perp = new THREE.Vector3(-d.z, 0, d.x);
    const ref = this.vineShot().position;
    const sign = Math.sign(perp.dot(ref.clone().sub(a))) || 1;
    // von hinten-oben über die Liane hinweg in Flugrichtung (der Weg hinter der Liane ist frei)
    return {
      position: a.clone().addScaledVector(d, -6).addScaledVector(perp, sign * 3).add(new THREE.Vector3(0, 7.5 + len * 0.3, 0)),
      lookAt: mid.clone().add(new THREE.Vector3(0, -0.5, 0)),
    };
  }

  /** Untere Spitze der Liane in Weltkoordinaten. */
  private lianaTip(): THREE.Vector3 {
    const l = this.liana!;
    l.updateMatrixWorld(true);
    return new THREE.Vector3(0, -this.lianaLen - 0.1, 0).applyMatrix4(l.matrixWorld);
  }

  private setLianaAngle(a: number) {
    if (!this.liana) return;
    this.lianaAngle = a;
    this.liana.quaternion.setFromAxisAngle(this.lianaAxis, a);
  }

  /** Figur hängt (nach Neuverbindung) an der Liane bzw. nicht mehr. */
  syncVine(teamId: string | null) {
    if (teamId && teamId === this.hanging) {
      this.pieces.grab(teamId);
      return;
    }
    if (teamId === this.hanging) return;
    if (this.hanging && this.hanging !== teamId) this.pieces.release(this.hanging, this.pieces.positionOf(this.hanging), 'idle', false);
    this.hanging = null;
    if (!teamId) return;
    const g = this.pieces.grab(teamId);
    if (!g) return;
    this.hanging = teamId;
    g.rig.setMode('fly');
  }

  vineGrab(teamId: string) {
    return this.run(async (epoch) => {
      const g = this.pieces.grab(teamId);
      if (!g) return;
      const { dir } = this.vineFrame();
      g.holder.rotation.set(0, Math.atan2(dir.x, dir.z), 0);
      g.rig.setMode('jump');
      const a = g.holder.position.clone();
      const b = this.lianaTip().sub(new THREE.Vector3(0, g.rig.height * 0.85, 0));
      await this.tweens.run(0.55, (t) => {
        g.holder.position.lerpVectors(a, b, t);
        g.holder.position.y += Math.sin(t * Math.PI) * 0.5;
      }, ease.out);
      this.guard(epoch);
      g.rig.setMode('fly');
      this.hanging = teamId;
      this.audio.play('pop', { volume: 0.5 });
    });
  }

  vineSwing(teamId: string, to: number) {
    return this.run(async (epoch) => {
      const g = this.pieces.grab(teamId);
      if (!g) return;
      this.hanging = teamId;
      this.swinging = true;
      // ausholen …
      const a0 = this.lianaAngle;
      await this.tweens.run(0.55, (t) => this.setLianaAngle(a0 + (0.55 - a0) * t), ease.inOut);
      this.guard(epoch);
      this.audio.play('whoosh-up');
      // … nach vorne schwingen
      await this.tweens.run(0.7, (t) => this.setLianaAngle(0.55 - 1.65 * t), ease.inOut);
      this.guard(epoch);
      // loslassen und im Bogen zum Zielfeld fliegen
      this.swinging = false;
      this.hanging = null;
      this.lianaTarget = 0;
      this.lianaVel = 0.6;
      const from = g.holder.position.clone();
      const target = this.pieces.slotOn(teamId, to);
      const r0 = g.holder.rotation.y;
      const yaw = Math.atan2(target.x - from.x, target.z - from.z);
      g.rig.setMode('fly');
      await this.tweens.run(1.15, (t) => {
        g.holder.position.lerpVectors(from, target, t);
        g.holder.position.y += Math.sin(t * Math.PI) * (2 + from.distanceTo(target) * 0.12);
        g.holder.rotation.y = r0 + (yaw - r0) * Math.min(1, t * 2);
        g.holder.rotation.x = Math.sin(t * Math.PI * 2) * 0.4;
      }, ease.inOut);
      this.guard(epoch);
      g.holder.rotation.x = 0;
      this.audio.play('land');
      this.effects.dust(target.x, target.y, target.z);
      this.pieces.release(teamId, to, 'cheer');
    });
  }

  // =========================================================================
  // Lavahöhle
  // =========================================================================
  private buildCave() {
    const V = new THREE.Vector3(VOLCANO.x, 0, VOLCANO.z);
    const fr = this.layout.fieldRadius;
    const place = (index: number, off: number) => {
      const f = this.layout.fields[index]!;
      const inward = new THREE.Vector3(V.x - f.x, 0, V.z - f.z).normalize();
      const x = f.x + inward.x * off;
      const z = f.z + inward.z * off;
      return { f, inward, x, z, y: this.field.height(x, z) };
    };
    // Einstieg: Höhlenmund im Hang neben dem Feld (Felsbogen, Stollenbalken, Glut im Inneren)
    const h = place(this.layout.plan.caveField, fr + 1.5);
    const entry = new THREE.Group();
    entry.position.set(h.x, h.f.y - 0.12, h.z);
    entry.rotation.y = Math.atan2(-h.inward.x, -h.inward.z);
    const rockE = mat('#5b4a40', { flat: true });
    const archE = new THREE.Mesh(new THREE.TorusGeometry(1.35, 0.55, 7, 16, Math.PI), rockE);
    archE.castShadow = archE.receiveShadow = true;
    entry.add(archE);
    const glowTex = (() => {
      const c = document.createElement('canvas');
      c.width = c.height = 128;
      const g = c.getContext('2d')!;
      const grd = g.createRadialGradient(64, 110, 4, 64, 100, 90);
      grd.addColorStop(0, '#ffb347');
      grd.addColorStop(0.25, '#ff5a14');
      grd.addColorStop(0.6, '#3a0d06');
      grd.addColorStop(1, '#0d0705');
      g.fillStyle = grd;
      g.fillRect(0, 0, 128, 128);
      const t = new THREE.CanvasTexture(c);
      t.colorSpace = THREE.SRGBColorSpace;
      return t;
    })();
    const inside = new THREE.Mesh(new THREE.CircleGeometry(1.35, 24, 0, Math.PI), new THREE.MeshBasicMaterial({ map: glowTex, toneMapped: false }));
    inside.position.z = -0.35;
    entry.add(inside);
    const wood = mat('#6b4630', { flat: true });
    for (const x of [-1.05, 1.05]) entry.add(mesh(new THREE.BoxGeometry(0.22, 1.5, 0.22), wood, x, 0.75, 0.15));
    const beam = mesh(new THREE.BoxGeometry(2.6, 0.24, 0.26), wood, 0, 1.55, 0.15);
    beam.rotation.z = 0.04;
    entry.add(beam);
    for (let k = 0; k < 7; k++) {
      const r = mesh(new THREE.DodecahedronGeometry(0.42 + (k % 3) * 0.14, 0), rockE, (k - 3) * 0.55, 1.6 + Math.sin(k * 1.7) * 0.35, -0.45);
      r.rotation.set(k, k * 2, k);
      entry.add(r);
    }
    // Warnschild davor
    const sign = new THREE.Group();
    sign.position.set(1.7, 0, 0.6);
    sign.add(mesh(new THREE.CylinderGeometry(0.05, 0.06, 1.3, 6), wood, 0, 0.62, 0));
    const board = mesh(new THREE.BoxGeometry(0.62, 0.45, 0.06), mat('#d9b46a'), 0, 1.15, 0);
    board.add(mesh(new THREE.BoxGeometry(0.08, 0.24, 0.02), mat('#b02a1a'), 0, 0.04, 0.04, false));
    board.add(mesh(new THREE.BoxGeometry(0.08, 0.07, 0.02), mat('#b02a1a'), 0, -0.14, 0.04, false));
    sign.add(board);
    sign.rotation.y = -0.4;
    entry.add(sign);
    const lavaLight = new THREE.PointLight('#ff6a1a', 6, 5, 2);
    lavaLight.position.set(0, 0.6, 0.4);
    entry.add(lavaLight);
    this.group.add(entry);
    entry.updateMatrixWorld(true);
    this.hole = new THREE.Vector3(0, 0.1, -0.6).applyMatrix4(entry.matrixWorld);
    this.holeFront = new THREE.Vector3(0, 0.05, 0.9).applyMatrix4(entry.matrixWorld);
    this.blockers.push({ x: h.x, z: h.z, r: 1.6, top: h.f.y + 2.5 });

    // Ausgang: Felsentor am Vulkanfuß, Öffnung zum Ausgangsfeld
    const m = place(this.layout.plan.caveExit, fr + 1.7);
    const gate = new THREE.Group();
    gate.position.set(m.x, m.y - 0.15, m.z);
    gate.rotation.y = Math.atan2(-m.inward.x, -m.inward.z);
    const rock = mat('#5b4a40', { flat: true });
    const arch = new THREE.Mesh(new THREE.TorusGeometry(1.15, 0.5, 7, 14, Math.PI), rock);
    arch.castShadow = arch.receiveShadow = true;
    gate.add(arch);
    const back = new THREE.Mesh(new THREE.CircleGeometry(1.15, 20, 0, Math.PI), new THREE.MeshBasicMaterial({ color: '#0d0705' }));
    back.position.z = -0.25;
    gate.add(back);
    const mouthGlow = new THREE.Mesh(new THREE.CircleGeometry(0.7, 16, 0, Math.PI), new THREE.MeshBasicMaterial({ color: '#ff6a1a', transparent: true, opacity: 0.35, toneMapped: false }));
    mouthGlow.position.z = -0.2;
    gate.add(mouthGlow);
    for (let k = 0; k < 6; k++) {
      const r = mesh(new THREE.DodecahedronGeometry(0.4 + (k % 2) * 0.2, 0), rock, (k - 2.5) * 0.55, 1.3 + Math.sin(k) * 0.35, -0.4);
      r.rotation.set(k, k, k);
      gate.add(r);
    }
    this.group.add(gate);
    const inner = new THREE.Vector3(0, 0.35, -0.15).applyMatrix4(gate.matrixWorld.compose(gate.position, gate.quaternion, gate.scale));
    this.mouth = { pos: new THREE.Vector3(m.x, m.y, m.z), inner };
  }

  caveFall(teamId: string) {
    return this.run(async (epoch) => {
      const g = this.pieces.grab(teamId);
      if (!g || !this.hole || !this.holeFront) return;
      const a = g.holder.position.clone();
      const front = this.holeFront.clone();
      g.rig.setMode('walk');
      g.holder.rotation.y = Math.atan2(front.x - a.x, front.z - a.z);
      await this.tweens.run(0.6, (t) => {
        g.holder.position.lerpVectors(a, front, t);
        g.holder.position.y += Math.sin(t * Math.PI) * 0.2;
      });
      this.guard(epoch);
      // Stolpern – und hinein ins Dunkle
      g.rig.setMode('fly');
      this.audio.play('whoosh-down');
      const b = this.hole.clone();
      await this.tweens.run(0.75, (t) => {
        g.holder.position.lerpVectors(front, b, t);
        g.holder.position.y += Math.sin(t * Math.PI) * 0.5 - t * t * 0.6;
        g.holder.rotation.x = t * 1.2;
        g.holder.scale.setScalar(Math.max(0.05, 1 - t * 0.9));
      }, ease.in);
      this.guard(epoch);
      g.holder.visible = false;
      g.holder.rotation.x = 0;
      this.effects.dust(front.x, front.y + 0.3, front.z, new THREE.Color('#5b4a40'), 16);
      this.bats(front.clone().setY(front.y + 0.8));
      await this.tweens.wait(500);
    });
  }

  caveSlide(teamId: string, to: number) {
    return this.run(async (epoch) => {
      const g = this.pieces.grab(teamId);
      if (!g || !this.mouth) return;
      const target = this.pieces.slotOn(teamId, to);
      const start = this.mouth.inner.clone();
      g.holder.visible = true;
      g.holder.scale.setScalar(1);
      g.holder.position.copy(start);
      g.holder.rotation.set(-0.35, Math.atan2(target.x - start.x, target.z - start.z), 0);
      g.rig.setMode('sad');
      await this.tweens.wait(250);
      this.guard(epoch);
      this.audio.play('whoosh-up', { volume: 0.6, rate: 0.8 });
      await this.tweens.run(0.9, (t) => {
        g.holder.position.lerpVectors(start, target, t);
        g.holder.position.y += Math.sin(t * Math.PI) * 0.35;
        g.holder.rotation.x = -0.35 * (1 - t);
      }, ease.out);
      this.guard(epoch);
      this.effects.dust(target.x, target.y, target.z, new THREE.Color('#7a6a60'), 14);
      this.audio.play('thud');
      this.pieces.release(teamId, to, 'sad');
    });
  }

  /** Fledermäuse flattern aus einem Loch. */
  private bats(at: THREE.Vector3) {
    const wingGeo = new THREE.BufferGeometry();
    wingGeo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0.32, 0.05, -0.1, 0.28, 0, 0.14, 0, 0, 0, -0.32, 0.05, -0.1, -0.28, 0, 0.14], 3));
    wingGeo.computeVertexNormals();
    const batMat = new THREE.MeshBasicMaterial({ color: '#1d1420', side: THREE.DoubleSide });
    const flock: { o: THREE.Mesh; v: THREE.Vector3; ph: number }[] = [];
    for (let k = 0; k < 9; k++) {
      const o = this.temp(new THREE.Mesh(wingGeo, batMat));
      o.position.copy(at).add(new THREE.Vector3((Math.random() - 0.5) * 0.6, 0.3, (Math.random() - 0.5) * 0.6));
      const a = Math.random() * Math.PI * 2;
      flock.push({ o, v: new THREE.Vector3(Math.cos(a) * 2.5, 3 + Math.random() * 2, Math.sin(a) * 2.5), ph: Math.random() * 6 });
    }
    let life = 0;
    const upd = (_t: number, dt: number) => {
      life += dt;
      for (const b of flock) {
        b.o.position.addScaledVector(b.v, dt);
        b.v.x += Math.sin(life * 3 + b.ph) * dt * 4;
        b.o.scale.set(1, 1, 1).multiplyScalar(1.4);
        b.o.scale.x = 1.4 * (0.3 + Math.abs(Math.sin(life * 22 + b.ph)));
        b.o.rotation.y = Math.atan2(b.v.x, b.v.z);
      }
      if (life > 2.6) {
        for (const b of flock) this.drop(b.o);
        this.updaters.delete(upd);
      }
    };
    this.updaters.add(upd);
  }

  // =========================================================================
  // Sprungfeder (Katapult vorwärts)
  // =========================================================================
  spring(teamId: string) {
    return this.run(async (epoch) => {
      const g = this.pieces.grab(teamId);
      if (!g) return;
      const base = g.holder.position.clone();
      const coil = new THREE.Group();
      const pts: THREE.Vector3[] = [];
      for (let k = 0; k <= 120; k++) {
        const u = k / 120;
        const a = u * Math.PI * 2 * 6;
        pts.push(new THREE.Vector3(Math.cos(a) * 0.5, u, Math.sin(a) * 0.5));
      }
      coil.add(mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 180, 0.075, 7, false), mat('#ffcf33', { rough: 0.3, metal: 0.55 })));
      const plate = mesh(new THREE.CylinderGeometry(0.65, 0.65, 0.14, 20), mat(FIELD_INFO.catapult_forward.color, { rough: 0.4 }), 0, 1.02, 0);
      plate.add(mesh(new THREE.TorusGeometry(0.65, 0.05, 6, 24).rotateX(Math.PI / 2), mat('#ffffff', { rough: 0.4 }), 0, 0.07, 0, false));
      const springRoot = this.temp(new THREE.Group());
      springRoot.position.copy(base).setY(base.y - 0.02);
      springRoot.add(coil, plate);
      const setH = (h: number) => {
        coil.scale.y = Math.max(0.02, h);
        plate.position.y = Math.max(0.02, h) + 0.05;
        g.holder.position.y = base.y + Math.max(0.02, h) + 0.1;
      };
      setH(0.02);
      this.audio.play('select', { volume: 0.6, rate: 1.4 });
      await this.tweens.run(0.35, (t) => setH(1.7 * t), ease.outBack);
      this.guard(epoch);
      g.rig.setMode('stuck');
      await this.tweens.run(0.4, (t) => setH(1.7 - 1.15 * t), ease.in);
      this.guard(epoch);
      this.audio.boing();
      g.rig.setMode('jump');
      await this.tweens.run(0.12, (t) => setH(0.55 + 1.75 * t), ease.out);
      this.guard(epoch);
      // Feder schnellt zurück und verschwindet im Hintergrund
      void this.tweens.run(0.6, (t) => {
        coil.scale.y = Math.max(0.02, 2.3 - t * 2.3 + Math.sin(t * 20) * 0.2 * (1 - t));
        plate.position.y = coil.scale.y + 0.05;
      }).then(() => this.drop(springRoot));
      // ab hier fliegt die Figur (Regie: pieces.fly startet an der aktuellen Stelle)
      g.holder.position.y += 0.2;
      g.rig.setMode('fly');
    });
  }

  // =========================================================================
  // Flugzeug mit Strickleiter und Fallschirm (Katapult rückwärts)
  // =========================================================================
  private buildPlane(): THREE.Group {
    const p = new THREE.Group();
    const red = mat('#d8402f', { rough: 0.45 });
    const white = mat('#f4f1ea', { rough: 0.5 });
    const yellow = mat('#f5c518', { rough: 0.5 });
    const dark = mat('#2f2f35', { rough: 0.5 });
    const body = mesh(new THREE.CapsuleGeometry(0.42, 2.0, 6, 12).rotateX(Math.PI / 2), red);
    p.add(body);
    p.add(mesh(new THREE.CylinderGeometry(0.43, 0.43, 0.25, 12).rotateX(Math.PI / 2), yellow, 0, 0, 0.55));
    p.add(mesh(new THREE.BoxGeometry(4.2, 0.08, 0.8), white, 0, 0.12, 0.25));
    p.add(mesh(new THREE.BoxGeometry(4.0, 0.08, 0.7), white, 0, 0.75, 0.25));
    for (const x of [-1.5, 1.5]) p.add(mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.65, 5), dark, x, 0.43, 0.25));
    p.add(mesh(new THREE.BoxGeometry(1.5, 0.06, 0.45), white, 0, 0.1, -1.25));
    p.add(mesh(new THREE.BoxGeometry(0.06, 0.6, 0.5), red, 0, 0.38, -1.3));
    p.add(mesh(new THREE.SphereGeometry(0.33, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat('#9fd6f0', { rough: 0.1, metal: 0.2 }), 0, 0.32, 0.25));
    const prop = new THREE.Group();
    prop.position.z = 1.45;
    prop.add(mesh(new THREE.BoxGeometry(1.4, 0.12, 0.04), dark));
    prop.add(mesh(new THREE.SphereGeometry(0.12, 8, 6), yellow));
    p.add(prop);
    p.userData.prop = prop;
    for (const x of [-0.5, 0.5]) p.add(mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.08, 10).rotateZ(Math.PI / 2), dark, x, -0.55, 0.45));
    return p;
  }

  private buildParachute(color: string): THREE.Group {
    const g = new THREE.Group();
    const canopy = new THREE.Mesh(
      new THREE.SphereGeometry(1.05, 16, 6, 0, Math.PI * 2, 0, Math.PI / 2.4),
      new THREE.MeshStandardMaterial({ color, roughness: 0.7, side: THREE.DoubleSide }),
    );
    canopy.position.y = 1.9;
    canopy.scale.y = 0.6;
    canopy.castShadow = true;
    g.add(canopy);
    const stripe = new THREE.Mesh(new THREE.SphereGeometry(1.06, 16, 2, 0, Math.PI * 2, Math.PI / 6, Math.PI / 14), new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.7, side: THREE.DoubleSide }));
    stripe.position.y = 1.9;
    stripe.scale.y = 0.6;
    g.add(stripe);
    const lineMat = new THREE.LineBasicMaterial({ color: '#555' });
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2;
      const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 1.25, 0), new THREE.Vector3(Math.cos(a) * 0.95, 1.95, Math.sin(a) * 0.95)]);
      g.add(new THREE.Line(geo, lineMat));
    }
    return g;
  }

  plane(teamId: string, to: number, color = '#ff6fb5') {
    return this.run(async (epoch) => {
      const g = this.pieces.grab(teamId);
      if (!g) return;
      const start = g.holder.position.clone();
      const target = this.pieces.slotOn(teamId, to);
      const dir = new THREE.Vector3(target.x - start.x, 0, target.z - start.z);
      if (dir.lengthSq() < 0.01) dir.set(0, 0, -1);
      dir.normalize();
      const plane = this.temp(this.buildPlane());
      const prop = plane.userData.prop as THREE.Object3D;
      const spin = (_t: number, dt: number) => (prop.rotation.z += dt * 40);
      this.updaters.add(spin);
      // Strickleiter
      const ladder = new THREE.Group();
      const ropeMat = mat('#d8c39a', { rough: 1 });
      for (const x of [-0.18, 0.18]) ladder.add(mesh(new THREE.CylinderGeometry(0.02, 0.02, 2.6, 4), ropeMat, x, -1.3, 0, false));
      for (let k = 0; k < 7; k++) ladder.add(mesh(new THREE.BoxGeometry(0.4, 0.04, 0.05), mat('#8a5d3b'), 0, -0.3 - k * 0.36, 0, false));
      ladder.position.set(0, -0.5, -0.2);
      plane.add(ladder);
      const flyHeight = 3.6;
      const heading = Math.atan2(dir.x, dir.z);
      plane.rotation.y = heading;
      // Anflug von vorne (aus Zielrichtung), über die Figur hinweg
      const approachFrom = start.clone().addScaledVector(dir, 24).setY(start.y + 12);
      const over = start.clone().setY(start.y + flyHeight);
      plane.rotation.y = heading + Math.PI;
      this.audio.play('whoosh-up', { volume: 0.7, rate: 0.7 });
      g.rig.setMode('cheer');
      await this.tweens.run(1.0, (t) => {
        plane.position.lerpVectors(approachFrom, over, t);
        plane.rotation.z = Math.sin(t * Math.PI) * 0.2;
      }, ease.out);
      this.guard(epoch);
      // Kehre und Figur greift die Leiter
      g.rig.setMode('fly');
      const climbTo = target.clone().setY(Math.max(target.y, start.y) + 7.5);
      const ctrl = start.clone().lerp(target, 0.5).setY(Math.max(start.y, target.y) + 10);
      const curve = new THREE.QuadraticBezierCurve3(over.clone(), ctrl, climbTo);
      await this.tweens.run(0.35, (t) => {
        plane.rotation.y = heading + Math.PI * (1 - t);
        plane.rotation.z = Math.sin(t * Math.PI) * -0.6;
        g.holder.position.lerpVectors(start, over.clone().setY(over.y - 3.1), t);
      }, ease.inOut);
      this.guard(epoch);
      await this.tweens.run(1.45, (t) => {
        const q = curve.getPoint(t);
        plane.position.copy(q);
        const tan = curve.getTangent(t);
        plane.rotation.set(-Math.atan2(tan.y, Math.hypot(tan.x, tan.z)) * 0.6, Math.atan2(tan.x, tan.z), Math.sin(t * Math.PI * 2) * 0.12);
        g.holder.position.set(q.x, q.y - 3.1, q.z);
        g.holder.rotation.set(Math.sin(t * Math.PI * 4) * 0.2, plane.rotation.y, 0);
      }, ease.inOut);
      this.guard(epoch);
      // loslassen: Fallschirm auf
      const chute = this.temp(this.buildParachute(color));
      chute.scale.setScalar(0.05);
      const dropFrom = g.holder.position.clone();
      const away = climbTo.clone().addScaledVector(dir, 40).setY(climbTo.y + 10);
      void this.tweens.run(1.3, (t) => {
        plane.position.lerpVectors(climbTo, away, t);
      }).then(() => {
        this.updaters.delete(spin);
        this.drop(plane);
      });
      this.audio.play('pop');
      g.rig.setMode('idle');
      await this.tweens.run(1.35, (t) => {
        g.holder.position.lerpVectors(dropFrom, target, ease.out(t));
        g.holder.position.x += Math.sin(t * Math.PI * 2) * 0.4;
        g.holder.rotation.set(Math.sin(t * Math.PI * 3) * 0.12, g.holder.rotation.y, 0);
        chute.position.copy(g.holder.position);
        chute.scale.setScalar(Math.min(1, 0.05 + t * 4));
      }, ease.linear);
      this.guard(epoch);
      void this.tweens.run(0.4, (t) => {
        chute.scale.set(1 + t * 0.3, Math.max(0.05, 1 - t), 1 + t * 0.3);
        chute.position.y = target.y - t * 0.6;
      }).then(() => this.drop(chute));
      this.audio.play('land');
      this.effects.dust(target.x, target.y, target.z);
      this.pieces.release(teamId, to, 'sad');
    });
  }

  // =========================================================================
  // UFO (Platztausch)
  // =========================================================================
  private buildUfo(): THREE.Group {
    const u = new THREE.Group();
    const hull = new THREE.Mesh(
      new THREE.LatheGeometry([new THREE.Vector2(0, -0.35), new THREE.Vector2(0.9, -0.25), new THREE.Vector2(1.8, 0), new THREE.Vector2(0.9, 0.25), new THREE.Vector2(0, 0.3)], 28),
      mat('#b9c3cf', { rough: 0.25, metal: 0.8 }),
    );
    hull.castShadow = true;
    u.add(hull);
    u.add(mesh(new THREE.SphereGeometry(0.75, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), mat('#8fe7ff', { rough: 0.05, metal: 0.1, emissive: '#2ab7e6' }), 0, 0.22, 0));
    const lights = new THREE.Group();
    const lightMats = ['#ff5ea8', '#ffe066', '#5dffb1'].map((c) => new THREE.MeshBasicMaterial({ color: c, toneMapped: false }));
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * Math.PI * 2;
      lights.add(new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), lightMats[k % 3]!).translateX(Math.cos(a) * 1.45).translateZ(Math.sin(a) * 1.45));
    }
    u.add(lights);
    const beamGeo = new THREE.CylinderGeometry(0.4, 1.3, 1, 24, 1, true);
    beamGeo.translate(0, -0.5, 0);
    const beam = new THREE.Mesh(
      beamGeo,
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        uniforms: { uTime: { value: 0 }, uOn: { value: 0 } },
        vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
        fragmentShader: `uniform float uTime; uniform float uOn; varying vec2 vUv;
          void main(){ float rings = 0.6 + 0.4 * sin(vUv.y * 30.0 + uTime * 8.0); float a = (0.35 + 0.25 * vUv.y) * rings * uOn;
            gl_FragColor = vec4(vec3(0.55, 1.0, 0.85) * a, a); }`,
      }),
    );
    beam.position.y = -0.3;
    u.add(beam);
    u.userData = { lights, beam };
    return u;
  }

  /** Position des UFOs (für die Kamera), solange es unterwegs ist. */
  ufoTarget: THREE.Vector3 | null = null;

  ufoSwap(aId: string, bId: string, posA: number, posB: number) {
    return this.run(async (epoch) => {
      const ga = this.pieces.grab(aId);
      const gb = this.pieces.grab(bId);
      if (!ga || !gb) return;
      const ufo = this.temp(this.buildUfo());
      this.ufoTarget = ufo.position;
      const { lights, beam } = ufo.userData as { lights: THREE.Object3D; beam: THREE.Mesh };
      const beamMat = beam.material as THREE.ShaderMaterial;
      const spin = (t: number, dt: number) => {
        lights.rotation.y += dt * 3;
        ufo.position.y += Math.sin(t * 5) * 0.004;
        beamMat.uniforms.uTime!.value = t;
      };
      this.updaters.add(spin);
      const pa = ga.holder.position.clone();
      const pb = gb.holder.position.clone();
      const hover = 5;
      const setBeam = (on: number, to: THREE.Vector3) => {
        beamMat.uniforms.uOn!.value = on;
        beam.scale.y = Math.max(0.01, ufo.position.y - to.y - 0.3);
      };
      this.audio.ufo();
      // Gemächlich: Flugzeit nach Entfernung, damit die Kamera ruhig mitfahren kann
      const legTime = Math.min(4.2, Math.max(2, 0.6 + pa.distanceTo(pb) / 9));
      // 1) herabschweben über A, A hochbeamen
      const sky = pa.clone().add(new THREE.Vector3(0, 22, 0));
      const overA = pa.clone().setY(pa.y + hover);
      await this.tweens.run(1.2, (t) => ufo.position.lerpVectors(sky, overA, t), ease.out);
      this.guard(epoch);
      await this.tweens.wait(250);
      this.guard(epoch);
      await this.tweens.run(1, (t) => {
        setBeam(Math.min(1, t * 3), pa);
        ga.holder.position.lerpVectors(pa, overA.clone().setY(overA.y - 0.4), t);
        ga.holder.scale.setScalar(Math.max(0.05, 1 - t));
        ga.holder.rotation.y += 0.2;
      }, ease.in);
      this.guard(epoch);
      setBeam(0, pa);
      ga.holder.visible = false;
      // 2) zu B fliegen, A absetzen und B hochholen
      const overB = pb.clone().setY(pb.y + hover);
      const arc = (from: THREE.Vector3, to: THREE.Vector3) => (t: number) => {
        ufo.position.lerpVectors(from, to, t);
        ufo.position.y += Math.sin(t * Math.PI) * (3 + from.distanceTo(to) * 0.08);
        ufo.rotation.z = Math.sin(t * Math.PI) * 0.18;
      };
      await this.tweens.run(legTime, arc(overA, overB), ease.inOut);
      this.guard(epoch);
      ga.holder.visible = true;
      const slotA = this.pieces.slotOn(aId, posB);
      await this.tweens.run(1.2, (t) => {
        setBeam(Math.min(1, t * 3), pb);
        ga.holder.position.lerpVectors(overB.clone().setY(overB.y - 0.4), slotA, t);
        ga.holder.scale.setScalar(Math.max(0.05, t));
        gb.holder.position.lerpVectors(pb, overB.clone().setY(overB.y - 0.4), t);
        gb.holder.scale.setScalar(Math.max(0.05, 1 - t));
      }, ease.inOut);
      this.guard(epoch);
      gb.holder.visible = false;
      this.pieces.release(aId, posB, 'idle');
      // 3) zurück zu A, B absetzen
      this.audio.ufo();
      await this.tweens.wait(200);
      this.guard(epoch);
      await this.tweens.run(legTime, arc(overB, overA), ease.inOut);
      this.guard(epoch);
      gb.holder.visible = true;
      const slotB = this.pieces.slotOn(bId, posA);
      await this.tweens.run(1, (t) => {
        setBeam(Math.min(1, t * 3), pa);
        gb.holder.position.lerpVectors(overA.clone().setY(overA.y - 0.4), slotB, t);
        gb.holder.scale.setScalar(Math.max(0.05, t));
      }, ease.out);
      this.guard(epoch);
      setBeam(0, pa);
      this.pieces.release(bId, posA, 'idle');
      // 4) davon
      this.ufoTarget = null;
      void this.tweens.run(1, (t) => ufo.position.lerpVectors(overA, sky.clone().add(new THREE.Vector3(20, 10, 0)), t), ease.in).then(() => {
        this.updaters.delete(spin);
        this.drop(ufo);
      });
    });
  }

  // =========================================================================
  // Minispiel-Bühne und Dampf-Geysir
  // =========================================================================
  stageOn(index: number) {
    this.stageOff(true);
    const f = this.layout.fields[index];
    if (!f) return;
    // Schild schwebt über dem Feld und dreht sich zur Kamera
    const x = f.x;
    const z = f.z;
    const y = f.y;
    const g = new THREE.Group();
    g.position.set(x, y, z);
    const c = document.createElement('canvas');
    c.width = 512;
    c.height = 256;
    const ctx = c.getContext('2d')!;
    const grd = ctx.createLinearGradient(0, 0, 0, 256);
    grd.addColorStop(0, '#ff7cc4');
    grd.addColorStop(1, '#d83f8f');
    ctx.fillStyle = grd;
    ctx.beginPath();
    ctx.roundRect(8, 8, 496, 240, 40);
    ctx.fill();
    ctx.lineWidth = 12;
    ctx.strokeStyle = '#ffffff';
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 96px Fredoka, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('🎮 Minispiel!', 256, 130);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const boardMesh = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 1.3), new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide, depthTest: false }));
    boardMesh.position.y = 3.6;
    boardMesh.renderOrder = 9;
    g.add(boardMesh);
    // Scheinwerferkegel von oben auf das Feld
    const beams: THREE.Mesh[] = [];
    const beamMat = new THREE.MeshBasicMaterial({ color: '#fff2b0', transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    for (let k = 0; k < 3; k++) {
      const cone = new THREE.Mesh(new THREE.ConeGeometry(1.1, 6, 18, 1, true).translate(0, -3, 0), beamMat);
      const a = (k / 3) * Math.PI * 2;
      cone.position.set(Math.cos(a) * 1.4, 6.2, Math.sin(a) * 1.4);
      g.add(cone);
      beams.push(cone);
    }
    g.scale.setScalar(0.01);
    this.group.add(g);
    this.stage = g;
    void this.tweens.run(0.5, (t) => g.scale.setScalar(Math.max(0.01, t)), ease.outBack);
    const upd = (t: number) => {
      beams.forEach((b, i) => {
        b.rotation.z = Math.sin(t * 1.6 + i * 2) * 0.25;
        b.rotation.x = Math.cos(t * 1.3 + i) * 0.25;
      });
      boardMesh.position.y = 3.6 + Math.sin(t * 3) * 0.08;
      if (this.camPos) boardMesh.lookAt(this.camPos);
    };
    g.userData.upd = upd;
    this.updaters.add(upd);
    this.effects.confettiBurst(x, y + 3.6, z, ['#ff6fb5', '#ffd23f', '#5fe0d8', '#ffffff'], 90, 0.7);
  }

  stageOff(instant = false) {
    const g = this.stage;
    if (!g) return;
    this.stage = null;
    const upd = g.userData.upd as ((t: number, dt: number) => void) | undefined;
    if (instant) {
      if (upd) this.updaters.delete(upd);
      g.removeFromParent();
      disposeTree(g);
      return;
    }
    void this.tweens.run(0.4, (t) => g.scale.setScalar(Math.max(0.01, 1 - t)), ease.in).then(() => {
      if (upd) this.updaters.delete(upd);
      g.removeFromParent();
      disposeTree(g);
    });
  }

  geyser(index: number) {
    const f = this.layout.fields[index];
    if (!f) return;
    // drei Stöße hintereinander
    for (const ms of [0, 380, 760]) void this.tweens.wait(ms).then(() => this.effects.geyser(f.x, f.y + 0.2, f.z));
  }

  private camPos: THREE.Vector3 | null = null;

  update(t: number, dt: number, camera?: THREE.Camera) {
    if (camera) this.camPos = camera.position;
    // Liane: Ruhependeln bzw. Nachschwingen
    if (this.liana && this.hanging === null) {
      const acc = -(this.lianaAngle - this.lianaTarget) * 9 - this.lianaVel * 1.6;
      this.lianaVel += acc * dt;
      this.setLianaAngle(this.lianaAngle + this.lianaVel * dt + Math.sin(t * 0.8) * 0.0006);
    } else if (this.liana && this.hanging) {
      // leicht schaukeln (außer beim großen Schwung), Figur hängt an der Spitze
      if (!this.swinging) this.setLianaAngle(Math.sin(t * 1.4) * 0.08);
      const p = this.pieces.get(this.hanging);
      if (p) p.holder.position.copy(this.lianaTip()).sub(new THREE.Vector3(0, p.rig.height * 0.85, 0));
    }
    for (const u of this.updaters) u(t, dt);
  }

  dispose() {
    this.abortAll();
    this.group.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose();
    });
  }
}
