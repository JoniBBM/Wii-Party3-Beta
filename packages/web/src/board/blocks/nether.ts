/**
 * Vulkan-Inneres der Blockwelt: der „Nether“. Höhle aus Netherrack mit Glowstone an der Decke,
 * Lavasee und Lavafällen, Strafweg über Netherziegel-Pfeiler, Ausgangsfeld als Goldblock mit
 * Leuchtfeuer, Obsidian-Portal als Ausgang und schwebende Glutgeister. Gleiche Schnittstelle wie
 * VolcanoInside (Route, Plätze, Kameras, Markierung, Effekte).
 */
import * as THREE from 'three';
import { ParticleSystem } from '../particles.ts';
import { insideTour, type InsideQuality, type InsideShot } from '../inside.ts';
import { rand } from '../noise.ts';
import { blockAtlas, type Tile } from './atlas.ts';
import { buildMob } from './mobs.ts';
import { FaceBuffer } from './world.ts';

const NB = 1;
const CAVE = { rx: 44, rz: 34, ceil: 26 };
const ROUTE_Z = -6;
const PLATE_R = 1.25;
const LANDING_SCALE = 1.25;
const MAX_STEPS = 20;
const HALF_FOV = THREE.MathUtils.degToRad(21);
const ASPECT = 16 / 9;
const LAVA_Y = 0;
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const rnd = (a: number, b: number) => a + Math.random() * (b - a);

interface Plate {
  top: THREE.Vector3;
  radius: number;
}

function tileBox(w: number, h: number, d: number, top: Tile, side: Tile = top): THREE.BoxGeometry {
  const g = new THREE.BoxGeometry(w, h, d);
  const atlas = blockAtlas();
  const uv = g.getAttribute('uv') as THREE.BufferAttribute;
  for (let f = 0; f < 6; f++) {
    const [u0, v0, u1, v1] = atlas.uv(f === 2 || f === 3 ? top : side);
    for (let i = 0; i < 4; i++) {
      const k = f * 4 + i;
      uv.setXY(k, uv.getX(k) ? u1 : u0, uv.getY(k) ? v1 : v0);
    }
  }
  return g;
}

/** Ziffer in Pixelschrift als Bild für die Plattenoberseite */
function numberTexture(n: number, shout: boolean): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  g.font = '44px "Pixelify Sans", monospace';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillStyle = 'rgba(0,0,0,0.55)';
  g.fillText(String(n), 35, 37);
  g.fillStyle = shout ? '#3a2a00' : '#ffd8a8';
  g.fillText(String(n), 32, 34);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.NearestFilter;
  return t;
}

export class NetherInside {
  readonly scene = new THREE.Scene();
  readonly dropPoint = new THREE.Vector3();
  readonly portal = new THREE.Vector3();
  private length = 9;
  private shout = 4;
  private plates: Plate[] = [];
  private route = new THREE.Group();
  private lavaTex: THREE.CanvasTexture;
  private portalTex: THREE.CanvasTexture;
  private glow = new ParticleSystem(700, 'pixel', { additive: true });
  private smoke = new ParticleSystem(300, 'pixel');
  private sparks = new ParticleSystem(260, 'pixel', { additive: true });
  private frame = new THREE.Group();
  private frameMat = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.9, toneMapped: false });
  private beamMat = new THREE.MeshBasicMaterial({ color: '#ffd34d', transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false });
  private ghosts: { o: THREE.Object3D; base: THREE.Vector3; ph: number }[] = [];
  /** Deckenhöhen je Block (Unterkante, in Blöcken) – für die Kamera */
  private roof: { ceil: number[]; nx: number; nz: number; x0: number; z0: number } | null = null;
  private emberAcc = 0;
  private geos: THREE.BufferGeometry[] = [];
  private textures: THREE.Texture[] = [];

  constructor(opts: { length: number; shout: number; quality: InsideQuality }) {
    const s = this.scene;
    s.background = new THREE.Color('#3a0f0a');
    s.fog = new THREE.Fog('#5a1a0e', 28, 90);
    s.add(new THREE.HemisphereLight('#ff9a6a', '#2a0806', 1.1));
    const key = new THREE.DirectionalLight('#ffb27a', 1.2);
    key.position.set(-10, 30, 20);
    s.add(key);
    const lavaLight = new THREE.PointLight('#ff6a1a', 400, 60, 1.5);
    lavaLight.position.set(0, 4, ROUTE_Z);
    s.add(lavaLight);

    const atlas = blockAtlas();
    const tile = (name: Tile) => {
      const img = new Image();
      img.src = atlas.dataUrl(name);
      const c = document.createElement('canvas');
      c.width = c.height = 16;
      const t = new THREE.CanvasTexture(c);
      img.onload = () => {
        c.getContext('2d')!.drawImage(img, 0, 0);
        t.needsUpdate = true;
      };
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.magFilter = THREE.NearestFilter;
      t.colorSpace = THREE.SRGBColorSpace;
      this.textures.push(t);
      return t;
    };
    this.lavaTex = tile('lava');
    this.portalTex = tile('portal');
    this.portalTex.repeat.set(2, 3);

    this.buildCave();
    // Lavasee
    const lakeGeo = new THREE.PlaneGeometry(CAVE.rx * 2.4, CAVE.rz * 2.4);
    lakeGeo.rotateX(-Math.PI / 2);
    const uv = lakeGeo.getAttribute('uv') as THREE.BufferAttribute;
    const pos = lakeGeo.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i) / NB, pos.getZ(i) / NB);
    this.geos.push(lakeGeo);
    const lake = new THREE.Mesh(lakeGeo, new THREE.MeshBasicMaterial({ map: this.lavaTex, color: '#a8a8a8' }));
    lake.position.y = LAVA_Y;
    s.add(lake);

    // Markierung: Auswahlrahmen + Leuchtfeuer
    const bar = new THREE.BoxGeometry(1, 1, 1);
    this.geos.push(bar);
    for (let i = 0; i < 12; i++) this.frame.add(new THREE.Mesh(bar, this.frameMat));
    this.frame.visible = false;
    s.add(this.frame, this.route);
    s.add(this.glow.points, this.smoke.points, this.sparks.points);

    // Glutgeister schweben über dem See
    for (let k = 0; k < 3; k++) {
      const g = buildMob('glutgeist').root;
      g.scale.setScalar(1.6);
      const base = new THREE.Vector3(-22 + k * 20, 9 + k * 2, ROUTE_Z - 14 + (k % 2) * 6);
      g.position.copy(base);
      s.add(g);
      this.ghosts.push({ o: g, base, ph: k * 2.1 });
    }
    void opts.quality;
    this.setPath(opts.length, opts.shout);
  }

  /** Höhle: Boden steigt am Rand zur Wand auf, Decke hängt mit Zacken herab, Glowstone und Lavafälle */
  private buildCave() {
    const atlas = blockAtlas();
    const solid = new FaceBuffer();
    const glow = new FaceBuffer();
    const rng = rand(4242);
    const nx = Math.ceil((CAVE.rx * 2.3) / NB);
    const nz = Math.ceil((CAVE.rz * 2.3) / NB);
    const x0 = -nx / 2;
    const z0 = -nz / 2;
    const floor: number[] = [];
    const ceil: number[] = [];
    for (let j = 0; j < nz; j++)
      for (let i = 0; i < nx; i++) {
        const x = (x0 + i + 0.5) * NB;
        const z = (z0 + j + 0.5) * NB + ROUTE_Z;
        const r = Math.hypot(x / CAVE.rx, (z - ROUTE_Z) / CAVE.rz);
        const wob = Math.sin(x * 0.31) * 0.04 + Math.cos(z * 0.27) * 0.04 + (rng() - 0.5) * 0.03;
        const f = r + wob < 0.86 ? -3 : Math.round(-3 + (r + wob - 0.86) * 140);
        floor.push(Math.min(CAVE.ceil + 2, f));
        const c = CAVE.ceil - Math.round(Math.max(0, Math.sin(x * 0.7) * Math.cos(z * 0.6) * 3) + (rng() < 0.08 ? 3 + rng() * 5 : 0));
        ceil.push(c);
      }
    this.roof = { ceil, nx, nz, x0, z0 };
    const F = (i: number, j: number) => (i < 0 || j < 0 || i >= nx || j >= nz ? CAVE.ceil + 2 : floor[j * nx + i]!);
    const C = (i: number, j: number) => (i < 0 || j < 0 || i >= nx || j >= nz ? CAVE.ceil : ceil[j * nx + i]!);
    const kindAt = (i: number, y: number, j: number, wall: boolean): Tile => {
      const h = Math.sin(i * 1.7 + j * 0.9 + y * 2.3);
      if (wall && h > 0.93) return 'glowstone';
      if (!wall && h > 0.7) return 'soul_sand';
      if (h < -0.96) return 'magma';
      return 'netherrack';
    };
    const quad = (buf: FaceBuffer, c: number[][], n: [number, number, number], tile: Tile, shade: number) => buf.quad(c, n, atlas.uv(tile), [shade, shade, shade, shade]);
    for (let j = 0; j < nz; j++)
      for (let i = 0; i < nx; i++) {
        const xa = (x0 + i) * NB;
        const za = (z0 + j) * NB + ROUTE_Z;
        const xb = xa + NB;
        const zb = za + NB;
        const f = F(i, j);
        const wall = f > 0;
        // Boden/Wand: Oberseite und Seiten bis zum niedrigsten Nachbarn
        const yTop = f * NB;
        const t = kindAt(i, f, j, wall);
        quad(t === 'glowstone' ? glow : solid, [[xa, yTop, za], [xa, yTop, zb], [xb, yTop, zb], [xb, yTop, za]], [0, 1, 0], t, 1);
        const sides: [number, number, number[][], [number, number, number]][] = [
          [1, 0, [[xb, 0, zb], [xb, 0, za], [xb, 1, za], [xb, 1, zb]], [1, 0, 0]],
          [-1, 0, [[xa, 0, za], [xa, 0, zb], [xa, 1, zb], [xa, 1, za]], [-1, 0, 0]],
          [0, 1, [[xa, 0, zb], [xb, 0, zb], [xb, 1, zb], [xa, 1, zb]], [0, 0, 1]],
          [0, -1, [[xb, 0, za], [xa, 0, za], [xa, 1, za], [xb, 1, za]], [0, 0, -1]],
        ];
        for (const [di, dj, c, n] of sides) {
          const nf = F(i + di, j + dj);
          for (let y = nf + 1; y <= f; y++) {
            const k = kindAt(i, y, j, true);
            quad(k === 'glowstone' ? glow : solid, c.map((p) => [p[0]!, (y - 1 + p[1]!) * NB, p[2]!]), n, k, di ? 0.85 : 0.72);
          }
          // Decke: Unterseite und herabhängende Zacken
          const cc = C(i, j);
          const nc = C(i + di, j + dj);
          for (let y = cc; y < nc; y++) {
            const k = kindAt(i, y + 50, j, true);
            quad(k === 'glowstone' ? glow : solid, c.map((p) => [p[0]!, (y + p[1]!) * NB, p[2]!]), n, k, 0.7);
          }
        }
        const cy = C(i, j) * NB;
        if (F(i, j) < C(i, j)) {
          const k = kindAt(i, 99, j, true);
          quad(k === 'glowstone' ? glow : solid, [[xa, cy, zb], [xa, cy, za], [xb, cy, za], [xb, cy, zb]], [0, -1, 0], k, 0.6);
        }
      }
    const solidMat = new THREE.MeshLambertMaterial({ map: atlas.texture, vertexColors: true });
    const glowMat = new THREE.MeshBasicMaterial({ map: atlas.texture, vertexColors: true, color: '#d8d0c0' });
    for (const [buf, mat] of [
      [solid, solidMat],
      [glow, glowMat],
    ] as const) {
      const g = buf.build();
      if (!g) continue;
      this.geos.push(g);
      this.scene.add(new THREE.Mesh(g, mat));
    }
    // Lavafälle an der Rückwand
    const fallMat = new THREE.MeshBasicMaterial({ map: this.lavaTex, color: '#b8b8b8' });
    for (const [x, w] of [
      [-18, 3],
      [6, 4],
      [24, 2],
    ] as const) {
      const g = new THREE.BoxGeometry(w * NB, CAVE.ceil * NB, NB);
      const uv = g.getAttribute('uv') as THREE.BufferAttribute;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * w, uv.getY(i) * CAVE.ceil);
      this.geos.push(g);
      const m = new THREE.Mesh(g, fallMat);
      m.position.set(x, (CAVE.ceil * NB) / 2 - 1, ROUTE_Z - CAVE.rz * 0.8);
      this.scene.add(m);
    }
  }

  setPath(length: number, shout: number) {
    this.length = clamp(Math.round(length) || 9, 3, MAX_STEPS);
    this.shout = Math.round(shout) >= 1 && Math.round(shout) <= this.length ? Math.round(shout) : 0;
    const L = this.length;
    const rng = rand(9137);
    const pts: THREE.Vector3[] = [];
    let x = 0;
    let z = 0;
    let s = 0;
    for (let i = 0; i <= L + 1; i++) {
      // Plattenhöhen auf ganze Blöcke
      const y = Math.round(clamp(2.75 + Math.sin(i * 0.9 + 0.3) * 0.95 + (rng() - 0.5) * 0.5, 1.5, 4));
      pts.push(new THREE.Vector3(x, y, z));
      const step = i === L ? 3.7 : 3.0 + rng() * 0.4;
      const h = 0.85 * Math.sin(((s + step / 2) / 30) * Math.PI * 2);
      x += Math.cos(h) * step;
      z += Math.sin(h) * step;
      s += step;
    }
    const first = pts[0]!.clone();
    const last = pts[pts.length - 1]!;
    const ang = Math.atan2(last.z - first.z, last.x - first.x);
    const box = new THREE.Box3();
    for (const p of pts) {
      const dx = p.x - first.x;
      const dz = p.z - first.z;
      p.x = dx * Math.cos(-ang) - dz * Math.sin(-ang);
      p.z = dx * Math.sin(-ang) + dz * Math.cos(-ang);
      box.expandByPoint(p);
    }
    const cx = (box.min.x + box.max.x) / 2;
    const cz = (box.min.z + box.max.z) / 2;
    for (const p of pts) {
      p.x -= cx;
      p.z += ROUTE_Z - cz;
    }
    const portalPt = pts.pop()!;
    portalPt.y = pts[L]!.y;
    this.plates = pts.map((p, i) => ({ top: p, radius: PLATE_R * (i === 0 ? LANDING_SCALE : 1) }));
    this.portal.set(portalPt.x, portalPt.y + 0.04, portalPt.z);
    const p0 = this.plates[0]!.top;
    this.dropPoint.set(p0.x, CAVE.ceil * NB - 3, p0.z);
    this.buildRoute(portalPt);
  }

  private buildRoute(portalPt: THREE.Vector3) {
    for (const o of [...this.route.children]) {
      o.removeFromParent();
      o.traverse((c) => {
        const m = c as THREE.Mesh;
        if (m.isMesh && m.userData.own) {
          m.geometry.dispose();
          (m.material as THREE.Material).dispose();
        }
      });
    }
    const atlas = blockAtlas();
    const brick = new THREE.MeshLambertMaterial({ map: atlas.texture });
    const gold = new THREE.MeshLambertMaterial({ map: atlas.texture, color: '#ffe27a', emissive: new THREE.Color('#5a4300') });
    this.plates.forEach((p, i) => {
      const size = Math.round(p.radius * 2);
      const exit = i === this.shout;
      // Pfeiler aus Netherziegeln vom Seegrund bis unter die Platte
      const ph = p.top.y - 0.5 + 3;
      const pillar = new THREE.Mesh(tileBox(NB * 1.0, ph, NB * 1.0, 'nether_bricks'), brick);
      pillar.position.set(p.top.x, p.top.y - 0.5 - ph / 2, p.top.z);
      pillar.userData.own = true;
      const plate = new THREE.Mesh(tileBox(size, 0.5, size, exit ? 'glowstone' : 'nether_bricks'), exit ? gold : brick);
      plate.position.set(p.top.x, p.top.y - 0.25, p.top.z);
      plate.userData.own = true;
      // Nummer obendrauf
      const tex = numberTexture(i, exit);
      this.textures.push(tex);
      const num = new THREE.Mesh(new THREE.PlaneGeometry(size * 0.6, size * 0.6), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
      num.rotation.x = -Math.PI / 2;
      num.position.set(p.top.x, p.top.y + 0.02, p.top.z);
      num.userData.own = true;
      this.route.add(pillar, plate, num);
      if (exit) {
        const beam = new THREE.Mesh(new THREE.BoxGeometry(0.6, 40, 0.6), this.beamMat);
        beam.position.set(p.top.x, p.top.y + 20, p.top.z);
        this.route.add(beam);
      }
    });
    // Portal: Obsidian-Rahmen 4×5, innen violetter Strudel, quer zur Laufrichtung
    const d = this.dir(this.length);
    const portal = new THREE.Group();
    portal.position.copy(portalPt);
    portal.rotation.y = Math.atan2(d.x, d.z) + Math.PI / 2;
    const obs = new THREE.MeshLambertMaterial({ map: atlas.texture });
    for (let r = 0; r < 5; r++)
      for (let c = 0; c < 4; c++) {
        if (r > 0 && r < 4 && c > 0 && c < 3) continue;
        const m = new THREE.Mesh(tileBox(NB, NB, NB, 'obsidian'), obs);
        m.position.set((c - 1.5) * NB, (r + 0.5) * NB - 0.5, 0);
        m.userData.own = true;
        portal.add(m);
      }
    const swirl = new THREE.Mesh(new THREE.PlaneGeometry(NB * 2, NB * 3), new THREE.MeshBasicMaterial({ map: this.portalTex, transparent: true, opacity: 0.85, side: THREE.DoubleSide, toneMapped: false, depthWrite: false }));
    swirl.position.y = 2 * NB;
    swirl.userData.own = true;
    swirl.name = 'swirl';
    portal.add(swirl);
    const base = new THREE.Mesh(tileBox(NB * 5, 0.5, NB * 2, 'obsidian'), obs);
    base.position.y = -0.75;
    base.userData.own = true;
    portal.add(base);
    this.route.add(portal);
  }

  private dir(step: number) {
    const i = clamp(Math.round(step), 0, this.length);
    const a = this.plates[i]!.top;
    const b = i >= this.length ? this.portal : this.plates[i + 1]!.top;
    const d = new THREE.Vector3(b.x - a.x, 0, b.z - a.z);
    return d.lengthSq() > 1e-6 ? d.normalize() : new THREE.Vector3(1, 0, 0);
  }

  private side(step: number) {
    const d = this.dir(step);
    const s = new THREE.Vector3(-d.z, 0, d.x);
    return s.z < 0 ? s.negate() : s;
  }

  spot(step: number, slot = 0, count = 1, gap = 0): THREE.Vector3 {
    const i = clamp(Math.round(step), 0, this.length);
    const pl = this.plates[i]!;
    const R = pl.radius;
    const k = Math.max(1, count);
    let ox = 0;
    let oz = 0;
    if (k === 2) ox = (slot === 0 ? -1 : 1) * Math.max(R * 0.38, gap * 0.55);
    else if (k > 2) {
      const ring = Math.min(R * 0.86, Math.max(Math.min(R * 0.6, 0.32 + k * 0.09), gap / (2 * Math.sin(Math.PI / k))));
      const a = (slot / k) * Math.PI * 2 + Math.PI / 2;
      ox = Math.cos(a) * ring;
      oz = Math.sin(a) * ring;
    }
    const d = this.dir(i);
    return new THREE.Vector3(pl.top.x - d.z * ox + d.x * oz, pl.top.y + 0.02, pl.top.z + d.x * ox + d.z * oz);
  }

  facing(step: number): number {
    const d = this.dir(step);
    return Math.atan2(d.x, d.z);
  }

  heightAt(x: number, z: number): number {
    let h = LAVA_Y;
    for (const p of this.plates) if ((p.top.x - x) ** 2 + (p.top.z - z) ** 2 < (p.radius + 0.5) ** 2) h = Math.max(h, p.top.y);
    return h;
  }

  overviewShot(): InsideShot {
    const box = new THREE.Box3();
    for (const p of this.plates) box.expandByPoint(p.top);
    box.expandByPoint(this.portal);
    const c = box.getCenter(new THREE.Vector3());
    const w = box.max.x - box.min.x + 9;
    const depth = box.max.z - box.min.z;
    let d = Math.max(22, w / 2 / (Math.tan(HALF_FOV) * ASPECT) + depth * 0.5);
    const yaw = -0.2;
    let pitch = 0.5;
    const maxH = CAVE.rz * 0.7;
    if (d * Math.cos(pitch) > maxH) pitch = Math.acos(clamp(maxH / d, 0.3, 1));
    const maxY = CAVE.ceil - 4;
    if (c.y + d * Math.sin(pitch) > maxY) d = (maxY - c.y) / Math.sin(pitch);
    const position = new THREE.Vector3(c.x + Math.sin(yaw) * Math.cos(pitch) * d, c.y + Math.sin(pitch) * d, c.z + Math.cos(yaw) * Math.cos(pitch) * d);
    // nicht in herabhängenden Netherrack-Zacken stehen
    position.y = Math.min(position.y, this.roofAt(position.x, position.z) - 1.4);
    return { position, lookAt: new THREE.Vector3(c.x, c.y + 1, c.z - 1.5) };
  }

  plateShot(step: number): InsideShot {
    const i = clamp(Math.round(step), 0, this.length);
    const p = this.plates[i]!.top;
    const d = this.dir(i);
    const s = this.side(i);
    const position = p.clone().addScaledVector(d, -5).addScaledVector(s, 5.6);
    position.y = p.y + 4.6;
    const lookAt = p.clone().addScaledVector(d, 2.4);
    lookAt.y = p.y + 0.8;
    return { position, lookAt };
  }

  portalShot(): InsideShot {
    const p = this.portal;
    const d = this.dir(this.length);
    const s = this.side(this.length);
    const position = p.clone().addScaledVector(d, 3.5).addScaledVector(s, 7.5);
    position.y = p.y + 4.4;
    const lookAt = p.clone().addScaledVector(d, -1.6);
    lookAt.y = p.y + 1.4;
    return { position, lookAt };
  }

  dropShot(): InsideShot {
    const p = this.plates[0]!.top;
    const d = this.dir(0);
    const s = this.side(0);
    const position = p.clone().addScaledVector(s, 11).addScaledVector(d, 3);
    position.y = p.y + 1.6;
    const lookAt = p.clone().addScaledVector(d, 0.5);
    lookAt.y = p.y + 3.4;
    return { position, lookAt };
  }

  /** Route für die Kamera: Platten und Portal */
  private get routePoints(): THREE.Vector3[] {
    return [...this.plates.map((p) => p.top), this.portal];
  }

  /** Unterkante der Decke (samt Zacken) im Umkreis `pad` um (x, z) */
  private roofAt(x: number, z: number, pad = 2.5): number {
    const g = this.roof;
    if (!g) return CAVE.ceil * NB;
    let roof = Infinity;
    const i0 = Math.floor((x - pad) / NB - g.x0);
    const i1 = Math.floor((x + pad) / NB - g.x0);
    const j0 = Math.floor((z - ROUTE_Z - pad) / NB - g.z0);
    const j1 = Math.floor((z - ROUTE_Z + pad) / NB - g.z0);
    for (let j = j0; j <= j1; j++)
      for (let i = i0; i <= i1; i++) roof = Math.min(roof, (i < 0 || j < 0 || i >= g.nx || j >= g.nz ? CAVE.ceil : g.ceil[j * g.nx + i]!) * NB);
    return roof;
  }

  /** Kamera-Standpunkt in den freien Raum holen: weg von den Wänden, unter Decke und Zacken, über Lava und Platten. */
  fit(p: THREE.Vector3): THREE.Vector3 {
    const dz = p.z - ROUTE_Z;
    const r = Math.hypot(p.x / CAVE.rx, dz / CAVE.rz);
    if (r > 0.72) {
      p.x *= 0.72 / r;
      p.z = ROUTE_Z + (dz * 0.72) / r;
    }
    p.y = Math.min(p.y, this.roofAt(p.x, p.z) - 1.4);
    p.y = Math.max(p.y, this.heightAt(p.x, p.z) + 2.5, LAVA_Y + 3);
    return p;
  }

  /** Ankunft von oben (Regie-Besuch): unter der Decke über dem Landefeld, Blick steil hinab */
  entryShot(): InsideShot {
    const p = this.plates[0]!.top;
    const s = this.side(0);
    const position = this.fit(new THREE.Vector3(p.x + s.x * 5, this.dropPoint.y - 1.5, p.z + s.z * 5));
    return { position, lookAt: new THREE.Vector3(p.x - s.x, p.y + 0.4, p.z - s.z) };
  }

  /** Hinaus (Regie-Besuch): von vorn aufs Portal zu und mitten in den Strudel – Stützpunkte der Fahrt */
  exitShots(): InsideShot[] {
    const d = this.dir(this.length);
    // Strudel steht quer zur Laufrichtung; Kamera kommt von der Kameraseite (+z)
    const n = new THREE.Vector3(-d.z, 0, d.x);
    if (n.z < 0) n.negate();
    const swirl = this.portal.clone().setY(this.portal.y - 0.04 + 2 * NB);
    return [
      { position: this.fit(swirl.clone().addScaledVector(n, 7.5).add(new THREE.Vector3(0, 1.6, 0))), lookAt: swirl.clone() },
      { position: swirl.clone().addScaledVector(n, 1.1), lookAt: swirl.clone().addScaledVector(n, -3) },
    ];
  }

  /** Automatische Kamera, solange nichts passiert (Regie-Besuch); `focus` = Figuren im Nether */
  tourShot(t: number, focus: THREE.Vector3[] = []): InsideShot {
    // unter allen Zacken bleiben (die längsten reichen bis 15 Blöcke herab)
    const fit = (p: THREE.Vector3) => this.fit(p.setY(Math.min(p.y, (CAVE.ceil - 11) * NB - 1.5)));
    return insideTour(t, { route: this.routePoints, base: this.overviewShot(), near: 8, focus, fit });
  }

  highlight(step: number | null, color?: string) {
    if (step === null || step < 0) {
      this.frame.visible = false;
      return;
    }
    const i = clamp(Math.round(step), 0, this.length);
    const pl = this.plates[i]!;
    const size = Math.round(pl.radius * 2) + 0.12;
    const h = 1.1;
    const t = 0.07;
    const s = size / 2;
    let k = 0;
    const bars = this.frame.children as THREE.Mesh[];
    for (const y of [0, h])
      for (const sg of [-1, 1]) {
        bars[k]!.scale.set(size, t, t);
        bars[k++]!.position.set(0, y, sg * s);
        bars[k]!.scale.set(t, t, size);
        bars[k++]!.position.set(sg * s, y, 0);
      }
    for (const sx of [-1, 1])
      for (const sz of [-1, 1]) {
        bars[k]!.scale.set(t, h, t);
        bars[k++]!.position.set(sx * s, h / 2, sz * s);
      }
    this.frame.position.set(pl.top.x, pl.top.y, pl.top.z);
    this.frameMat.color.set(color ?? '#ffffff');
    this.frame.visible = true;
  }

  lavaBurst(at: THREE.Vector3) {
    const { x, y, z } = at;
    this.glow.emit(90, (p) => {
      const a = Math.random() * Math.PI * 2;
      const s = rnd(1, 4.5);
      Object.assign(p, { x: x + rnd(-0.3, 0.3), y: y + 0.2, z: z + rnd(-0.3, 0.3), vx: Math.cos(a) * s, vy: rnd(4, 11), vz: Math.sin(a) * s, maxLife: rnd(0.9, 1.7), size: rnd(0.3, 0.6), sizeEnd: 0.12, r: 2.2, g: rnd(0.6, 1.3), b: 0.12, alpha: 1, gravity: 13, drag: 0.4 });
    });
    this.smoke.emit(16, (p) => {
      const a = Math.random() * Math.PI * 2;
      const s = rnd(0.4, 1.6);
      Object.assign(p, { x, y: y + 0.3, z, vx: Math.cos(a) * s, vy: rnd(1.2, 3), vz: Math.sin(a) * s, maxLife: rnd(1.6, 2.6), size: rnd(0.8, 1.2), sizeEnd: rnd(2, 3), r: 0.22, g: 0.13, b: 0.1, alpha: 0.6, drag: 1.2 });
    });
  }

  warpFlash(at: THREE.Vector3) {
    const { x, y, z } = at;
    this.sparks.emit(90, (p) => {
      const a = Math.random() * Math.PI * 2;
      const r = rnd(0.2, 1.4);
      Object.assign(p, { x: x + Math.cos(a) * r, y: y + rnd(0, 2), z: z + Math.sin(a) * r, vx: -Math.sin(a) * 3, vy: rnd(2, 7), vz: Math.cos(a) * 3, maxLife: rnd(0.9, 1.6), size: rnd(0.3, 0.6), sizeEnd: 0.1, r: 1.6, g: 0.6, b: 2.4, alpha: 1, drag: 1.4 });
    });
  }

  setQuality(_q: InsideQuality) {}

  setViewport(heightPx: number) {
    for (const s of [this.glow, this.smoke, this.sparks]) s.setScale(heightPx);
  }

  update(t: number, dt: number, _camera: THREE.Camera) {
    this.lavaTex.offset.set(t * 0.03, Math.sin(t * 0.2) * 0.3);
    this.portalTex.offset.set(Math.sin(t * 0.7) * 0.2, t * 0.4);
    for (const g of this.ghosts) {
      g.o.position.set(g.base.x + Math.sin(t * 0.3 + g.ph) * 6, g.base.y + Math.sin(t * 0.9 + g.ph) * 1.2, g.base.z + Math.cos(t * 0.25 + g.ph) * 3);
      g.o.rotation.y = Math.sin(t * 0.3 + g.ph) * 0.8;
    }
    if (this.frame.visible) this.frameMat.opacity = 0.6 + Math.sin(t * 5) * 0.35;
    this.beamMat.opacity = 0.3 + Math.sin(t * 3) * 0.08;
    // Glutfunken steigen aus dem See
    this.emberAcc += dt * 14;
    while (this.emberAcc > 1) {
      this.emberAcc -= 1;
      this.glow.emit(1, (p) => Object.assign(p, { x: rnd(-CAVE.rx * 0.7, CAVE.rx * 0.7), y: LAVA_Y + 0.1, z: ROUTE_Z + rnd(-CAVE.rz * 0.6, CAVE.rz * 0.4), vx: rnd(-0.3, 0.3), vy: rnd(0.8, 2.2), vz: rnd(-0.3, 0.3), maxLife: rnd(2, 4), size: rnd(0.12, 0.22), sizeEnd: 0.05, r: 1.8, g: 0.7, b: 0.15, alpha: 1 }));
    }
    this.glow.update(dt);
    this.smoke.update(dt);
    this.sparks.update(dt);
  }

  dispose() {
    for (const g of this.geos) g.dispose();
    for (const t of this.textures) t.dispose();
    for (const s of [this.glow, this.smoke, this.sparks]) s.dispose();
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh && m.userData.own) {
        m.geometry.dispose();
        (m.material as THREE.Material).dispose();
      }
    });
  }
}
