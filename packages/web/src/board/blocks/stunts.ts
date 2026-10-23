/**
 * Auftritte der Blockwelt: gleiche Abläufe (Kamera, Timing, Rückgängig) wie auf der Insel, aber aus
 * Blöcken: Eiche mit Ranke, Fässer/Kisten-Blöcke, Höhleneingang aus Bruchstein, Schleimblock als
 * Sprungfeder, explodierender Knaller statt Flugzeug, Teleport statt UFO, Notenblock-Bühne mit
 * Leuchtfeuer, eckige Falltür und Portal-Strahl.
 */
import * as THREE from 'three';
import { RIVER, RIVER_FORD, VOLCANO, type RiverChoice } from '@insel/shared';
import { ease } from '../tweens.ts';
import { Stunts, type LaneItem } from '../stunts.ts';
import { blockAtlas, type Tile } from './atlas.ts';
import { atlasMat, boxGeo, cross, cube } from './cube.ts';
import { buildMob, type MobKind } from './mobs.ts';
import { BLOCK } from './world.ts';

const B = BLOCK;

/** Schild in Pixelschrift auf einem Holzbrett */
function pixelSign(text: string, w = 1.6, h = 0.55, color = '#3a2516', bg = '#b8945f'): THREE.Mesh {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = Math.round((256 * h) / w);
  const g = c.getContext('2d')!;
  g.fillStyle = bg;
  g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = 'rgba(0,0,0,0.18)';
  for (let y = 0; y < c.height; y += 16) g.fillRect(0, y + 14, c.width, 2);
  g.fillStyle = color;
  g.font = `${Math.round(c.height * 0.5)}px "Pixelify Sans", monospace`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, c.width / 2, c.height / 2 + 2);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.NearestFilter;
  const plank = atlasMat();
  const face = new THREE.MeshLambertMaterial({ map: tex });
  const geo = boxGeo(w, h, 0.08, 'planks');
  // Vorder- und Rückseite zeigen das ganze Schriftbild
  const uv = geo.getAttribute('uv') as THREE.BufferAttribute;
  for (let k = 16; k < 24; k++) uv.setXY(k, [0, 1, 0, 1][k % 4]!, [1, 1, 0, 0][k % 4]!);
  const m = new THREE.Mesh(geo, [plank, plank, plank, plank, face, face]);
  m.castShadow = true;
  return m;
}

/** Mob-Vorlagen einmal bauen, danach klonen (Geometrie/Material geteilt) */
const mobTemplates = new Map<MobKind, THREE.Group>();
function mob(kind: MobKind): THREE.Group {
  let t = mobTemplates.get(kind);
  if (!t) {
    t = buildMob(kind).root;
    mobTemplates.set(kind, t);
  }
  return t.clone(true);
}

export class BlockStunts extends Stunts {
  /** Boden der Blockwelt an (x, z): Oberkante der Säule (gleiche Rundung wie das Gelände) */
  protected groundAt(x: number, z: number) {
    const cx = (Math.floor(x / B) + 0.5) * B;
    const cz = (Math.floor(z / B) + 0.5) * B;
    return Math.round(this.field.height(cx, cz) / B) * B;
  }

  // ---------------------------------------------------------------------------------------
  // Liane: Eiche mit Ast über den Weg, Ranke hängt daran
  // ---------------------------------------------------------------------------------------
  protected override buildVineTree() {
    const { f, dir, side } = this.vineFrame();
    const pivot = new THREE.Vector3(f.x, f.y + this.lianaLen + 2.9, f.z);
    const sx = this.field.height(f.x + side.x * 4, f.z + side.z * 4) >= this.field.height(f.x - side.x * 4, f.z - side.z * 4) ? 1 : -1;
    this.treeSide = sx;
    const snap = (v: number) => (Math.floor(v / B) + 0.5) * B;
    const tx = snap(f.x + side.x * sx * 4.6 - dir.x * 0.6);
    const tz = snap(f.z + side.z * sx * 4.6 - dir.z * 0.6);
    const ty = this.groundAt(tx, tz);
    const tree = new THREE.Group();
    const log = { top: 'log_top', side: 'log_side' } as const;
    // Stamm 2×2 bis über die Aufhängung
    const topY = pivot.y + 0.6;
    for (let y = ty + B / 2; y < topY; y += B)
      for (const [dx, dz] of [
        [0, 0],
        [B, 0],
        [0, B],
        [B, B],
      ] as const) {
        const m = cube(log);
        m.position.set(tx + dx - B / 2, y, tz + dz - B / 2);
        tree.add(m);
      }
    // Ast: Blöcke vom Stamm bis über die Aufhängung
    const from = new THREE.Vector3(tx, topY, tz);
    const steps = Math.ceil(from.distanceTo(pivot.clone().setY(topY)) / B) + 1;
    for (let k = 0; k <= steps; k++) {
      const p = from.clone().lerp(pivot.clone().setY(topY), k / steps);
      const m = cube(log);
      m.position.set(snap(p.x), Math.floor(p.y / B) * B + B / 2, snap(p.z));
      tree.add(m);
    }
    // Blätterdach: um den Stamm und über der Aufhängung
    const leafBlock = (x: number, y: number, z: number) => {
      const m = cube('leaves', B, 'cutout');
      m.position.set(x, y, z);
      tree.add(m);
    };
    const crownAt = (cx: number, cy: number, cz: number, r: number) => {
      for (let dy = -1; dy <= 2; dy++) {
        const rr = dy === 2 ? r - 1 : r;
        for (let i = -rr; i <= rr; i++)
          for (let j = -rr; j <= rr; j++) {
            if (Math.abs(i) === rr && Math.abs(j) === rr && (dy === 2 || (i + j + dy) % 2 === 0)) continue;
            leafBlock(snap(cx) + i * B, Math.floor(cy / B) * B + B / 2 + dy * B, snap(cz) + j * B);
          }
      }
      this.crowns.push(new THREE.Vector3(cx, cy + B, cz));
    };
    crownAt(tx, topY + B, tz, 3);
    crownAt(pivot.x, topY + B * 0.5, pivot.z, 2);
    // Ranke: dreht sich um die Aufhängung (Achse quer zur Laufrichtung)
    const liana = new THREE.Group();
    liana.position.copy(pivot);
    const segs = Math.ceil(this.lianaLen / B);
    for (let k = 0; k < segs; k++) {
      const seg = cross('vine', B * 0.9, B);
      seg.position.y = -B / 2 - k * B;
      seg.rotation.y = k * 0.4;
      liana.add(seg);
    }
    // Griff am Ende: kleiner Holzblock
    const knot = cube('planks', B * 0.35);
    knot.position.y = -this.lianaLen - 0.08;
    liana.add(knot);
    this.lianaAxis.set(dir.z, 0, -dir.x).normalize();
    this.group.add(tree, liana);
    this.liana = liana;
    this.blockers.push({ x: tx, z: tz, r: 2.6, top: topY + B * 3 });
  }

  protected override buildCreekDeco() {
    const creek = this.layout.creek;
    if (creek.length < 3) return;
    const src = creek[0]!;
    // Quelle: bemooste Steinblöcke
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2 + 0.3;
      const x = src.x + Math.cos(a) * 0.9;
      const z = src.z + Math.sin(a) * 0.9;
      const m = cube(k % 2 ? 'mossy_cobblestone' : 'cobblestone');
      m.position.set((Math.floor(x / B) + 0.5) * B, this.groundAt(x, z) + B / 2, (Math.floor(z / B) + 0.5) * B);
      this.group.add(m);
    }
  }

  // ---------------------------------------------------------------------------------------
  // Fässer oder Kisten: Fass- und Kistenblöcke auf zwei Wegen über den Fluss
  // ---------------------------------------------------------------------------------------
  protected override buildFord() {
    const ff = this.layout.fordFields;
    if (!ff.length) return;
    const fr = this.layout.fieldRadius;
    const top = this.layout.ford.raftY - 0.08;
    const basin = this.layout.fordBasin;
    const a = RIVER[RIVER_FORD - 1]!;
    const b = RIVER[RIVER_FORD + 1]!;
    const flow = basin ? new THREE.Vector3(basin.along.x, 0, basin.along.z) : new THREE.Vector3(b.x - a.x, 0, b.z - a.z).normalize();
    const up = flow.clone().negate();
    const gap = Math.min(fr * 2.3 + 0.5, (basin?.halfAlong ?? 6) - fr * 0.95 - 0.35);
    const size = Math.max(B * 1.5, fr * 1.7);
    ff.forEach((i, k) => {
      const f = this.layout.fields[i]!;
      const barrel = new THREE.Mesh(boxGeo(size, 1.7, size, { top: 'barrel_top', side: 'barrel_side' }), atlasMat());
      barrel.castShadow = barrel.receiveShadow = true;
      barrel.position.set(f.x, top - 0.85, f.z);
      barrel.rotation.y = (k % 2) * 0.2;
      const bHolder = new THREE.Group();
      bHolder.add(barrel);
      this.group.add(bHolder);
      this.lanes.barrels.push({ o: bHolder, top: new THREE.Vector3(f.x, top, f.z), ph: k * 1.7, hidden: 0, rise: 0 });
      const cx = f.x + up.x * gap;
      const cz = f.z + up.z * gap;
      const crate = new THREE.Mesh(boxGeo(size * 1.05, 1.7, size * 1.05, 'crate'), atlasMat());
      crate.castShadow = crate.receiveShadow = true;
      crate.position.set(cx, top - 0.85, cz);
      crate.rotation.y = Math.atan2(flow.x, flow.z);
      const cHolder = new THREE.Group();
      cHolder.add(crate);
      this.group.add(cHolder);
      this.lanes.crates.push({ o: cHolder, top: new THREE.Vector3(cx, top + 0.02, cz), ph: k * 2.3 + 1, hidden: 0, rise: 0 });
    });
    // Zaunpfosten an beiden Ufern, dazwischen eine Leine
    const span = this.fordSpan();
    const bank = this.layout.fields[span.bank]!;
    const exit = this.layout.fields[span.exit]!;
    const leash = new THREE.MeshLambertMaterial({ color: '#4a3524' });
    for (const off of [fr * 1.45, -(gap + fr * 1.35)]) {
      const pa = new THREE.Vector3(bank.x + flow.x * off, bank.y + 1.0, bank.z + flow.z * off);
      const pb = new THREE.Vector3(exit.x + flow.x * off, exit.y + 1.0, exit.z + flow.z * off);
      for (const q of [pa, pb]) {
        const post = new THREE.Mesh(boxGeo(0.16, 1.4, 0.16, 'planks'), atlasMat());
        post.position.set(q.x, q.y - 0.7, q.z);
        post.castShadow = true;
        this.group.add(post);
      }
      // Leine aus kurzen Stücken, leicht durchhängend
      const n = 14;
      for (let s = 0; s < n; s++) {
        const p0 = pa.clone().lerp(pb, s / n);
        const p1 = pa.clone().lerp(pb, (s + 1) / n);
        p0.y -= Math.sin((s / n) * Math.PI) * 0.5;
        p1.y -= Math.sin(((s + 1) / n) * Math.PI) * 0.5;
        const seg = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, p0.distanceTo(p1)), leash);
        seg.position.copy(p0).lerp(p1, 0.5);
        seg.lookAt(p1);
        this.group.add(seg);
      }
    }
    // Schilder am Ufer
    const dir = new THREE.Vector3(Math.cos(bank.heading), 0, Math.sin(bank.heading));
    const px = bank.x - dir.x * 0.4 + flow.x * (fr + 0.7);
    const pz = bank.z - dir.z * 0.4 + flow.z * (fr + 0.7);
    const py = this.groundAt(px, pz);
    const post = new THREE.Group();
    post.position.set(px, py, pz);
    const stick = new THREE.Mesh(boxGeo(0.12, 2.0, 0.12, 'planks'), atlasMat());
    stick.position.y = 1.0;
    post.add(stick);
    const sign = (text: string, toward: THREE.Vector3, y: number) => {
      const s = pixelSign(text);
      s.position.set(toward.x * 0.5, y, toward.z * 0.5);
      s.rotation.y = Math.atan2(toward.x, toward.z) - Math.PI / 2;
      post.add(s);
    };
    sign('Fässer', dir.clone().multiplyScalar(0.6).addScaledVector(up, 0.15).normalize(), 1.7);
    sign('Kisten', dir.clone().multiplyScalar(0.4).addScaledVector(up, 0.9).normalize(), 1.15);
    this.group.add(post);
    this.blockers.push({ x: px, z: pz, r: 0.5, top: py + 2.2 });
  }

  /** Fass bzw. Kiste bricht ein: Bretter fliegen als kleine Blöcke */
  protected override burst(item: LaneItem, choice: RiverChoice) {
    item.o.visible = false;
    item.hidden = 3.4;
    const at = item.top;
    const bits: { o: THREE.Mesh; v: THREE.Vector3; w: THREE.Vector3 }[] = [];
    for (let k = 0; k < 12; k++) {
      const o = this.temp(cube(choice === 'crates' ? 'crate' : k % 3 ? 'barrel_side' : 'barrel_top', B * 0.35));
      o.position.set(at.x, at.y - 0.1, at.z);
      const a = (k / 12) * Math.PI * 2;
      bits.push({ o, v: new THREE.Vector3(Math.cos(a) * 2.2, 2.5 + Math.random() * 2, Math.sin(a) * 2.2), w: new THREE.Vector3(Math.random() * 8, Math.random() * 8, 0) });
    }
    this.effects.splash(at.x, this.layout.ford.y, at.z, true);
    this.effects.dust(at.x, at.y, at.z, new THREE.Color('#8a6438'), 18);
    const water = this.layout.ford.y;
    let life = 0;
    const upd = (_t: number, dt: number) => {
      life += dt;
      for (const b of bits) {
        if (b.o.position.y > water || b.v.y > 0) {
          b.v.y -= 9.8 * dt;
          b.o.position.addScaledVector(b.v, dt);
          b.o.rotation.x += b.w.x * dt;
          b.o.rotation.y += b.w.y * dt;
          if (b.o.position.y <= water && b.v.y < 0) {
            b.o.position.y = water;
            b.v.set(b.v.x * 0.2, 0, b.v.z * 0.2);
          }
        } else {
          b.o.position.x += 0.6 * dt;
          b.o.position.y = water - Math.max(0, life - 2.4) * 0.25;
        }
      }
      if (life > 4.5) {
        for (const b of bits) this.drop(b.o);
        this.updaters.delete(upd);
      }
    };
    this.updaters.add(upd);
  }

  // ---------------------------------------------------------------------------------------
  // Lavahöhle: Eingang aus Bruchstein mit Glut, Ausgang als Steinziegel-Tor
  // ---------------------------------------------------------------------------------------
  protected override buildCave() {
    const V = new THREE.Vector3(VOLCANO.x, 0, VOLCANO.z);
    const fr = this.layout.fieldRadius;
    const place = (index: number, off: number) => {
      const f = this.layout.fields[index]!;
      const inward = new THREE.Vector3(V.x - f.x, 0, V.z - f.z).normalize();
      const x = f.x + inward.x * off;
      const z = f.z + inward.z * off;
      return { f, inward, x, z, y: this.groundAt(x, z) };
    };
    const gateway = (w: number, h: number, frame: Tile, glow: boolean) => {
      const g = new THREE.Group();
      // Rahmen: Säulen und Sturz aus Blöcken, Öffnung dunkel mit Glut
      const cols = Math.round(w / B);
      const rows = Math.round(h / B);
      for (let r = 0; r <= rows; r++)
        for (let c = -1; c <= cols; c++) {
          const edge = c === -1 || c === cols || r === rows;
          if (!edge) continue;
          const m = cube(r === rows && (c + r) % 3 === 0 ? 'mossy_cobblestone' : frame);
          m.position.set((c - (cols - 1) / 2) * B, r * B + B / 2, 0);
          g.add(m);
        }
      // dahinter Felsblöcke als Hang
      for (let r = 0; r <= rows + 1; r++)
        for (let c = -2; c <= cols + 1; c++) {
          const m = cube(r > rows || c < -1 || c > cols ? 'stone' : 'cobblestone');
          m.position.set((c - (cols - 1) / 2) * B, r * B + B / 2, -B);
          if (r < rows && c >= 0 && c < cols) continue;
          g.add(m);
        }
      const hole = new THREE.Mesh(new THREE.PlaneGeometry(cols * B, rows * B), new THREE.MeshBasicMaterial({ color: glow ? '#2a0a04' : '#0d0705' }));
      hole.position.set(0, (rows * B) / 2, -B * 0.45);
      g.add(hole);
      if (glow) {
        const inner = cube('lava', B, 'glow');
        inner.scale.set(cols * 0.6, 0.4, 0.4);
        inner.position.set(0, B * 0.2, -B * 0.4);
        g.add(inner);
        const light = new THREE.PointLight('#ff6a1a', 6, 5, 2);
        light.position.set(0, 0.6, 0.4);
        g.add(light);
      }
      return g;
    };
    const h = place(this.layout.plan.caveField, fr + 1.5);
    const entry = gateway(B * 3, B * 3, 'cobblestone', true);
    entry.position.set(h.x, h.f.y - 0.12, h.z);
    entry.rotation.y = Math.atan2(-h.inward.x, -h.inward.z);
    // Warnschild
    const sign = pixelSign('Vorsicht!', 1.1, 0.5, '#7a1a10');
    sign.position.set(B * 3, 1.15, 0.6);
    sign.rotation.y = -0.4;
    entry.add(sign);
    const stick = new THREE.Mesh(boxGeo(0.1, 1.0, 0.1, 'planks'), atlasMat());
    stick.position.set(B * 3, 0.5, 0.6);
    entry.add(stick);
    this.group.add(entry);
    entry.updateMatrixWorld(true);
    this.hole = new THREE.Vector3(0, 0.1, -0.6).applyMatrix4(entry.matrixWorld);
    this.holeFront = new THREE.Vector3(0, 0.05, 0.9).applyMatrix4(entry.matrixWorld);
    this.blockers.push({ x: h.x, z: h.z, r: 1.6, top: h.f.y + 2.5 });
    const m = place(this.layout.plan.caveExit, fr + 1.7);
    const gate = gateway(B * 3, B * 3, 'stone_bricks', false);
    gate.position.set(m.x, m.y - 0.05, m.z);
    gate.rotation.y = Math.atan2(-m.inward.x, -m.inward.z);
    this.group.add(gate);
    const inner = new THREE.Vector3(0, 0.35, -0.15).applyMatrix4(gate.matrixWorld.compose(gate.position, gate.quaternion, gate.scale));
    this.mouth = { pos: new THREE.Vector3(m.x, m.y, m.z), inner };
  }

  /** Block-Fledermäuse flattern aus einem Loch */
  protected override bats(at: THREE.Vector3) {
    const flock: { o: THREE.Group; v: THREE.Vector3; ph: number; wl?: THREE.Object3D; wr?: THREE.Object3D }[] = [];
    for (let k = 0; k < 7; k++) {
      const o = this.temp(mob('bat'));
      o.scale.setScalar(0.5);
      o.position.copy(at).add(new THREE.Vector3((Math.random() - 0.5) * 0.6, 0.3, (Math.random() - 0.5) * 0.6));
      const a = Math.random() * Math.PI * 2;
      flock.push({ o, v: new THREE.Vector3(Math.cos(a) * 2.5, 3 + Math.random() * 2, Math.sin(a) * 2.5), ph: Math.random() * 6, wl: o.getObjectByName('wingL'), wr: o.getObjectByName('wingR') });
    }
    let life = 0;
    const upd = (_t: number, dt: number) => {
      life += dt;
      for (const b of flock) {
        b.o.position.addScaledVector(b.v, dt);
        b.v.x += Math.sin(life * 3 + b.ph) * dt * 4;
        const flap = Math.sin(life * 24 + b.ph) * 0.9;
        if (b.wl) b.wl.rotation.z = flap;
        if (b.wr) b.wr.rotation.z = -flap;
        b.o.rotation.y = Math.atan2(b.v.x, b.v.z);
      }
      if (life > 2.6) {
        for (const b of flock) this.drop(b.o);
        this.updaters.delete(upd);
      }
    };
    this.updaters.add(upd);
  }

  // ---------------------------------------------------------------------------------------
  // Totenkopf: Blöcke brechen weg, darunter glüht die Lava
  // ---------------------------------------------------------------------------------------
  override trapdoor(teamId: string, field: number) {
    return this.run(async (epoch) => {
      const g = this.pieces.grab(teamId);
      const f = this.layout.fields[field];
      if (!g || !f) return;
      const at = g.holder.position.clone();
      const hole = this.temp(new THREE.Mesh(new THREE.PlaneGeometry(B * 2, B * 2), new THREE.MeshBasicMaterial({ color: '#120806' })));
      hole.rotation.x = -Math.PI / 2;
      hole.position.set(at.x, at.y + 0.02, at.z);
      hole.scale.setScalar(0.01);
      const glow = this.temp(cube('lava', B * 1.2, 'glow'));
      glow.scale.set(1, 0.05, 1);
      glow.position.set(at.x, at.y - 0.5, at.z);
      glow.visible = false;
      this.audio.play('falltuer');
      g.rig.setMode('shock');
      // Brocken fliegen als kleine Blöcke
      for (let k = 0; k < 8; k++) {
        const bit = this.temp(cube(k % 2 ? 'dirt' : 'netherrack', B * 0.3));
        bit.position.set(at.x + (Math.random() - 0.5), at.y, at.z + (Math.random() - 0.5));
        const v = new THREE.Vector3((Math.random() - 0.5) * 3, 2 + Math.random() * 2, (Math.random() - 0.5) * 3);
        let life = 0;
        const upd = (_t: number, dt: number) => {
          life += dt;
          v.y -= 9.8 * dt;
          bit.position.addScaledVector(v, dt);
          bit.rotation.x += dt * 6;
          if (life > 1.4) {
            this.drop(bit);
            this.updaters.delete(upd);
          }
        };
        this.updaters.add(upd);
      }
      this.effects.dust(at.x, at.y, at.z, new THREE.Color('#5b4a40'), 16);
      await this.tweens.run(0.35, (t) => hole.scale.setScalar(0.01 + t), ease.out);
      glow.visible = true;
      this.guard(epoch);
      await this.tweens.wait(250);
      this.guard(epoch);
      g.rig.setMode('fly');
      await this.tweens.run(0.6, (t) => {
        g.holder.position.set(at.x, at.y + Math.sin(t * Math.PI) * 0.3 - t * t * 2.2, at.z);
        g.holder.rotation.y += 0.25;
        g.holder.scale.setScalar(Math.max(0.05, 1 - t * 0.8));
      }, ease.in);
      this.guard(epoch);
      g.holder.visible = false;
      g.holder.scale.setScalar(1);
      this.bats(at.clone().setY(at.y + 0.6));
      await this.tweens.run(0.5, (t) => hole.scale.setScalar(1 - t * 0.99));
      this.drop(hole);
      this.drop(glow);
    });
  }

  /** Aus dem Nether zurück: violetter Portalstrahl, Figur springt heraus */
  override warpOut(teamId: string, field: number) {
    return this.run(async (epoch) => {
      const g = this.pieces.grab(teamId);
      if (!g) return;
      const at = this.pieces.slotOn(teamId, field);
      const beamMat = new THREE.MeshBasicMaterial({ map: blockAtlas().texture, color: '#c58cff', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
      const beam = this.temp(new THREE.Mesh(boxGeo(B * 1.6, 7, B * 1.6, 'portal'), beamMat));
      beam.position.set(at.x, at.y + 3.5, at.z);
      this.audio.play('warp');
      await this.tweens.run(0.35, (t) => (beamMat.opacity = t * 0.75));
      this.guard(epoch);
      g.holder.visible = true;
      g.holder.scale.setScalar(0.2);
      g.holder.position.copy(at).setY(at.y - 0.6);
      g.rig.setMode('jump');
      this.effects.sparkle(at.x, at.y + 0.5, at.z, new THREE.Color('#c58cff'), 40, 1.6);
      await this.tweens.run(0.8, (t) => {
        g.holder.position.set(at.x, at.y - 0.6 + Math.sin(t * Math.PI) * 2.4 + t * 0.6, at.z);
        g.holder.scale.setScalar(0.2 + Math.min(1, t * 1.6) * 0.8);
        g.holder.rotation.y += 0.3;
      }, ease.out);
      this.guard(epoch);
      g.holder.scale.setScalar(1);
      this.audio.play('land');
      this.effects.dust(at.x, at.y, at.z);
      this.pieces.release(teamId, field, 'cheer');
      await this.tweens.run(0.5, (t) => (beamMat.opacity = 0.75 * (1 - t)));
      this.drop(beam);
    });
  }

  // ---------------------------------------------------------------------------------------
  // Katapult vorwärts: Schleimblock schiebt sich aus dem Boden und schleudert die Figur
  // ---------------------------------------------------------------------------------------
  override spring(teamId: string) {
    return this.run(async (epoch) => {
      const g = this.pieces.grab(teamId);
      if (!g) return;
      const base = g.holder.position.clone();
      const slime = new THREE.Mesh(boxGeo(B * 1.5, 1, B * 1.5, 'slime_block'), atlasMat('cutout'));
      slime.castShadow = true;
      const root = this.temp(new THREE.Group());
      root.position.copy(base).setY(base.y - 0.02);
      root.add(slime);
      const setH = (h: number) => {
        const hh = Math.max(0.02, h);
        slime.scale.y = hh;
        slime.position.y = hh / 2;
        g.holder.position.y = base.y + hh + 0.02;
      };
      setH(0.02);
      this.audio.play('select', { volume: 0.6, rate: 1.4 });
      await this.tweens.run(0.35, (t) => setH(1.3 * t), ease.outBack);
      this.guard(epoch);
      g.rig.setMode('stuck');
      // einsinken wie in Wackelpudding
      await this.tweens.run(0.4, (t) => {
        setH(1.3 - 0.75 * t);
        slime.scale.x = slime.scale.z = 1 + t * 0.25;
      }, ease.in);
      this.guard(epoch);
      this.audio.play('feder');
      g.rig.setMode('jump');
      await this.tweens.run(0.12, (t) => {
        setH(0.55 + 1.2 * t);
        slime.scale.x = slime.scale.z = 1.25 - t * 0.35;
      }, ease.out);
      this.guard(epoch);
      void this.tweens.run(0.6, (t) => {
        slime.scale.y = Math.max(0.02, 1.75 * (1 - t) + Math.sin(t * 20) * 0.15 * (1 - t));
        slime.position.y = slime.scale.y / 2;
        slime.scale.x = slime.scale.z = 0.9 + Math.sin(t * 18) * 0.1 * (1 - t);
      }).then(() => this.drop(root));
      g.holder.position.y += 0.2;
      g.rig.setMode('fly');
    });
  }

  // ---------------------------------------------------------------------------------------
  // Katapult rückwärts: Knaller schleicht heran, zischt – und sprengt die Figur zurück
  // ---------------------------------------------------------------------------------------
  override plane(teamId: string, to: number) {
    return this.run(async (epoch) => {
      const g = this.pieces.grab(teamId);
      if (!g) return;
      const start = g.holder.position.clone();
      const target = this.pieces.slotOn(teamId, to);
      const back = new THREE.Vector3(target.x - start.x, 0, target.z - start.z);
      if (back.lengthSq() < 0.01) back.set(0, 0, -1);
      back.normalize();
      // Knaller kommt von vorne (gegen die Flugrichtung)
      const k = this.temp(mob('knaller'));
      k.scale.setScalar(0.9);
      const from = start.clone().addScaledVector(back, -3.2);
      const stop = start.clone().addScaledVector(back, -0.95);
      k.position.copy(from);
      k.rotation.y = Math.atan2(back.x, back.z);
      const feet = [0, 1, 2, 3].map((i) => k.getObjectByName(`foot${i}`));
      const spark = k.getObjectByName('spark');
      g.rig.setMode('shock');
      g.holder.rotation.y = Math.atan2(-back.x, -back.z);
      await this.tweens.run(0.9, (t) => {
        k.position.lerpVectors(from, stop, t);
        k.position.y = from.y + Math.abs(Math.sin(t * Math.PI * 4)) * 0.08;
        feet.forEach((f, i) => f && (f.rotation.x = Math.sin(t * 24 + i * Math.PI) * 0.6));
      }, ease.out);
      this.guard(epoch);
      // Zischen: anschwellen und weiß blinken
      this.audio.play('swoosh', { rate: 1.6, volume: 0.6 });
      const body = k.getObjectByName('body-mesh') as THREE.Mesh | undefined;
      const flash = body ? ((body.material as THREE.MeshLambertMaterial).clone() as THREE.MeshLambertMaterial) : null;
      if (body && flash) {
        flash.emissive = new THREE.Color('#ffffff');
        body.material = flash;
      }
      await this.tweens.run(1.0, (t) => {
        const pulse = Math.sin(t * Math.PI * 8) > 0 ? 1 : 0;
        if (flash) flash.emissiveIntensity = pulse * (0.3 + t * 0.6);
        k.scale.setScalar(0.9 * (1 + t * 0.25 + pulse * 0.04));
        if (spark) spark.visible = pulse === 1;
      });
      this.guard(epoch);
      // Explosion
      this.audio.play('vulkan', { volume: 0.7, rate: 1.4 });
      const boom = stop.clone().setY(stop.y + 0.6);
      this.effects.eruption(boom.x, boom.y, boom.z);
      for (let n = 0; n < 10; n++) {
        const bit = this.temp(cube(n % 3 ? 'dirt' : 'grass_side', B * 0.32));
        bit.position.copy(boom);
        const v = new THREE.Vector3((Math.random() - 0.5) * 6, 3 + Math.random() * 4, (Math.random() - 0.5) * 6);
        let life = 0;
        const upd = (_t: number, dt: number) => {
          life += dt;
          v.y -= 9.8 * dt;
          bit.position.addScaledVector(v, dt);
          bit.rotation.x += dt * 7;
          if (life > 1.6) {
            this.drop(bit);
            this.updaters.delete(upd);
          }
        };
        this.updaters.add(upd);
      }
      this.drop(k);
      flash?.dispose();
      // Figur fliegt im hohen Bogen rückwärts
      g.rig.setMode('fly');
      const top = Math.max(start.y, target.y) + 4 + start.distanceTo(target) * 0.25;
      const curve = new THREE.QuadraticBezierCurve3(start.clone(), start.clone().lerp(target, 0.5).setY(top), target.clone());
      await this.tweens.run(1.6, (t) => {
        g.holder.position.copy(curve.getPoint(t));
        g.holder.rotation.x = t * Math.PI * 2;
      }, ease.inOut);
      this.guard(epoch);
      g.holder.rotation.x = 0;
      this.audio.play('land');
      this.effects.dust(target.x, target.y, target.z);
      this.pieces.release(teamId, to, 'sad');
    });
  }

  // ---------------------------------------------------------------------------------------
  // Platztausch: Teleport-Perle fliegt hin und her, Figuren verschwinden in Portal-Funken
  // ---------------------------------------------------------------------------------------
  override ufoSwap(aId: string, bId: string, posA: number, posB: number) {
    return this.run(async (epoch) => {
      const ga = this.pieces.grab(aId);
      const gb = this.pieces.grab(bId);
      if (!ga || !gb) return;
      const pearl = this.temp(new THREE.Group());
      const core = cube('portal', B * 0.45, 'glow');
      pearl.add(core);
      const halo = new THREE.Mesh(new THREE.BoxGeometry(B * 0.8, B * 0.8, B * 0.8), new THREE.MeshBasicMaterial({ color: '#b46cff', transparent: true, opacity: 0.25, blending: THREE.AdditiveBlending, depthWrite: false }));
      pearl.add(halo);
      this.ufoTarget = pearl.position;
      const spin = (t: number, dt: number) => {
        pearl.rotation.y += dt * 4;
        pearl.rotation.x += dt * 2;
        halo.scale.setScalar(1 + Math.sin(t * 8) * 0.15);
        if (Math.random() < 0.5) this.effects.sparkle(pearl.position.x, pearl.position.y, pearl.position.z, new THREE.Color('#c58cff'), 2, 0.4);
      };
      this.updaters.add(spin);
      const pa = ga.holder.position.clone();
      const pb = gb.holder.position.clone();
      const hover = 2.5;
      const legTime = Math.min(4.2, Math.max(2, 0.6 + pa.distanceTo(pb) / 9));
      const vanish = async (g: typeof ga, at: THREE.Vector3) => {
        this.audio.play('zauber', { volume: 0.7 });
        this.effects.sparkle(at.x, at.y + 0.8, at.z, new THREE.Color('#c58cff'), 50, 1.4);
        await this.tweens.run(0.6, (t) => {
          g.holder.scale.setScalar(Math.max(0.05, 1 - t));
          g.holder.rotation.y += 0.3;
        }, ease.in);
        g.holder.visible = false;
      };
      const appear = async (g: typeof ga, at: THREE.Vector3) => {
        g.holder.visible = true;
        g.holder.position.copy(at);
        this.effects.sparkle(at.x, at.y + 0.8, at.z, new THREE.Color('#c58cff'), 50, 1.4);
        await this.tweens.run(0.6, (t) => g.holder.scale.setScalar(Math.max(0.05, t)), ease.out);
      };
      const arc = (from: THREE.Vector3, to: THREE.Vector3) => (t: number) => {
        pearl.position.lerpVectors(from, to, t);
        pearl.position.y += Math.sin(t * Math.PI) * (2.5 + from.distanceTo(to) * 0.12);
      };
      const overA = pa.clone().setY(pa.y + hover);
      const overB = pb.clone().setY(pb.y + hover);
      pearl.position.copy(overA);
      pearl.scale.setScalar(0.01);
      await this.tweens.run(0.4, (t) => pearl.scale.setScalar(Math.max(0.01, t)), ease.outBack);
      this.guard(epoch);
      await vanish(ga, pa);
      this.guard(epoch);
      await this.tweens.run(legTime, arc(overA, overB), ease.inOut);
      this.guard(epoch);
      const slotA = this.pieces.slotOn(aId, posB);
      await Promise.all([appear(ga, slotA), vanish(gb, pb)]);
      this.guard(epoch);
      this.pieces.release(aId, posB, 'idle');
      await this.tweens.run(legTime, arc(overB, overA), ease.inOut);
      this.guard(epoch);
      const slotB = this.pieces.slotOn(bId, posA);
      await appear(gb, slotB);
      this.guard(epoch);
      this.pieces.release(bId, posA, 'idle');
      this.ufoTarget = null;
      void this.tweens.run(0.4, (t) => pearl.scale.setScalar(Math.max(0.01, 1 - t))).then(() => {
        this.updaters.delete(spin);
        this.drop(pearl);
      });
    });
  }

  // ---------------------------------------------------------------------------------------
  // Minispiel: Schild in Pixelschrift, Notenblöcke und ein Leuchtfeuer-Strahl
  // ---------------------------------------------------------------------------------------
  override stageOn(index: number) {
    this.stageOff(true);
    const f = this.layout.fields[index];
    if (!f) return;
    const g = new THREE.Group();
    g.position.set(f.x, f.y, f.z);
    const board = pixelSign('MINISPIEL!', 2.8, 0.9, '#ffffff', '#b0306f');
    board.position.y = 3.4;
    board.renderOrder = 9;
    g.add(board);
    const notes: THREE.Mesh[] = [];
    for (const s of [-1, 1]) {
      const nb = cube('note_block', B);
      nb.position.set(s * 1.5, B / 2, 0);
      g.add(nb);
      notes.push(nb);
    }
    const beamMat = new THREE.MeshBasicMaterial({ color: '#ff9ad5', transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false });
    const beam = new THREE.Mesh(new THREE.BoxGeometry(B * 0.6, 40, B * 0.6), beamMat);
    beam.position.y = 20;
    g.add(beam);
    g.scale.setScalar(0.01);
    this.group.add(g);
    this.stage = g;
    void this.tweens.run(0.5, (t) => g.scale.setScalar(Math.max(0.01, t)), ease.outBack);
    const colors = ['#ff5fa2', '#5fd0ff', '#ffd34d', '#7dff8a'];
    let last = 0;
    const upd = (t: number) => {
      board.position.y = 3.4 + Math.sin(t * 3) * 0.08;
      if (this.camPos) board.lookAt(this.camPos.x, board.getWorldPosition(new THREE.Vector3()).y, this.camPos.z);
      beamMat.opacity = 0.28 + Math.sin(t * 4) * 0.08;
      if (t - last > 0.45) {
        last = t;
        const nb = notes[Math.floor(t * 2) % 2]!;
        const p = nb.getWorldPosition(new THREE.Vector3());
        this.effects.sparkle(p.x, p.y + 0.6, p.z, new THREE.Color(colors[Math.floor(t * 3) % colors.length]!), 3, 0.3);
      }
    };
    g.userData.upd = upd;
    this.updaters.add(upd);
    this.effects.confettiBurst(f.x, f.y + 3.4, f.z, ['#ff6fb5', '#ffd23f', '#5fe0d8', '#ffffff'], 90, 0.7);
  }
}

