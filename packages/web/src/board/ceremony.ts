/**
 * Siegerehrung: Aus dem Krater steigt ein Siegerpodest, die drei Besten fliegen hinauf,
 * der Sieger tanzt und schlägt Saltos, Scheinwerfer kreisen, Feuerwerk und Konfetti –
 * die Kamera umkreist das Podest langsam.
 */
import * as THREE from 'three';
import { VOLCANO } from '@insel/shared';
import { worldMaterial } from './assets.ts';
import type { BoardAudio } from './audio.ts';
import type { CameraRig } from './camera.ts';
import { CRATER } from './ground.ts';
import type { Effects } from './particles.ts';
import type { Pieces } from './pieces.ts';
import { ease, type Tweens } from './tweens.ts';

export interface PodiumEntry {
  teamId: string;
  color: string;
}

/** Höhe der Podest-Oberkante über dem Kraterrand */
const TOP = VOLCANO.height + 1.6;
const STEPS = [
  { x: 0, h: 1.15, color: '#ffd23f', label: '1' },
  { x: -1.45, h: 0.75, color: '#cfd8e3', label: '2' },
  { x: 1.45, h: 0.45, color: '#d99155', label: '3' },
];

function numberTexture(label: string, color: string) {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, 256, 256);
  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  ctx.font = 'bold 190px Fredoka, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, 128, 140);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class Ceremony {
  readonly group = new THREE.Group();
  private podium: THREE.Group | null = null;
  private beams: THREE.Mesh[] = [];
  private placed: { teamId: string; rank: number }[] = [];
  private timers: number[] = [];
  private flipAt = 0;
  private flipping = false;
  private orbit = 0;
  private camPos = new THREE.Vector3();
  private camLook = new THREE.Vector3(VOLCANO.x, TOP + 1, VOLCANO.z);
  private epoch = 0;
  active = false;

  constructor(
    private pieces: Pieces,
    private tweens: Tweens,
    private effects: Effects,
    private audio: BoardAudio,
    private rig: CameraRig,
  ) {
    this.group.name = 'ceremony';
  }

  /** Welche Seite des Podests zeigt zur Kamera (die Treppe zeigt nach Süden, Richtung Start). */
  private facing() {
    return 0;
  }

  private build() {
    const g = new THREE.Group();
    g.position.set(VOLCANO.x, 0, VOLCANO.z);
    g.rotation.y = this.facing();
    // Steinsäule aus der Lava bis über den Rand
    const pillarH = TOP - CRATER.lavaY;
    const stone = new THREE.MeshStandardMaterial({ color: '#6d5a4e', roughness: 0.9, flatShading: true });
    worldMaterial(stone);
    const pillar = new THREE.Mesh(new THREE.CylinderGeometry(2.5, 3.1, pillarH, 10, 3), stone);
    pillar.position.y = CRATER.lavaY + pillarH / 2;
    pillar.castShadow = true;
    pillar.receiveShadow = true;
    g.add(pillar);
    const rimMat = new THREE.MeshStandardMaterial({ color: '#ffcf4a', roughness: 0.35, metalness: 0.6, emissive: '#7a4a00', emissiveIntensity: 0.4 });
    const rim = new THREE.Mesh(new THREE.TorusGeometry(2.55, 0.12, 8, 40), rimMat);
    rim.rotation.x = Math.PI / 2;
    rim.position.y = TOP;
    g.add(rim);
    // Treppchen 1–2–3
    for (const s of STEPS) {
      const m = new THREE.MeshStandardMaterial({ color: s.color, roughness: 0.4, metalness: s.label === '1' ? 0.5 : 0.25 });
      worldMaterial(m);
      const front = new THREE.MeshStandardMaterial({ map: numberTexture(s.label, s.color), roughness: 0.5 });
      const box = new THREE.Mesh(new THREE.BoxGeometry(1.35, s.h, 1.35), [m, m, m, m, front, m]);
      box.position.set(s.x, TOP + s.h / 2, 0);
      box.castShadow = true;
      box.receiveShadow = true;
      g.add(box);
    }
    // Scheinwerferkegel, die über das Podest streichen
    const beamMat = new THREE.MeshBasicMaterial({ color: '#fff4c2', transparent: true, opacity: 0.14, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    this.beams = [];
    for (let k = 0; k < 4; k++) {
      const cone = new THREE.Mesh(new THREE.ConeGeometry(1.6, 12, 20, 1, true).translate(0, -6, 0), beamMat);
      const a = (k / 4) * Math.PI * 2 + 0.4;
      cone.position.set(Math.cos(a) * 5, TOP + 11, Math.sin(a) * 5);
      g.add(cone);
      this.beams.push(cone);
    }
    this.group.add(g);
    this.podium = g;
    return g;
  }

  /** Weltposition des Stellplatzes für Platz 1–3. */
  private spot(rank: number) {
    const s = STEPS[rank - 1]!;
    return new THREE.Vector3(VOLCANO.x + s.x, TOP + s.h, VOLCANO.z);
  }

  /** Ganze Feier abspielen (beim Sieg). */
  async play(order: PodiumEntry[]) {
    this.stop();
    this.active = true;
    const epoch = ++this.epoch;
    const alive = () => epoch === this.epoch;
    const g = this.build();
    // Podest steigt aus dem Krater
    const rise = 7;
    g.position.y = -rise;
    this.audio.play('trommelwirbel', { volume: 0.9 });
    this.audio.play('rumble', { volume: 0.8, rate: 0.85 });
    this.rig.set({ kind: 'focus', position: this.camPos.set(VOLCANO.x + 9, TOP + 5, VOLCANO.z + 15), lookAt: this.camLook }, 1.2);
    await this.tweens.run(2.4, (t) => {
      g.position.y = -rise * (1 - t);
      if (Math.random() < 0.3) this.effects.dust(VOLCANO.x + (Math.random() - 0.5) * 5, CRATER.floorY + 1, VOLCANO.z + (Math.random() - 0.5) * 5, new THREE.Color('#8a6a55'), 4);
    }, ease.out);
    if (!alive()) return;
    this.effects.confettiBurst(VOLCANO.x, TOP + 3, VOLCANO.z, ['#ffd23f', '#ff6fb5', '#5fe0d8', '#ffffff', order[0]?.color ?? '#ffd23f'], 320, 1.4);
    this.audio.play('jubel');
    // Die besten drei fliegen nacheinander aufs Treppchen: erst 3, dann 2, zum Schluss der Sieger
    const top = order.slice(0, 3);
    for (let i = top.length - 1; i >= 0; i--) {
      const e = top[i]!;
      await this.flyTo(e.teamId, i + 1);
      if (!alive()) return;
      if (i === 0) {
        this.audio.play('applaus');
        this.audio.play('feuerwerk', { volume: 0.8, delay: 0.3 });
      }
    }
    this.startLoops(top);
  }

  /** Sofort aufbauen (Neuladen im Endstand). */
  sync(order: PodiumEntry[]) {
    if (this.active && this.podium) {
      for (const p of this.placed) this.place(p.teamId, p.rank);
      return;
    }
    this.stop();
    this.active = true;
    this.build();
    const top = order.slice(0, 3);
    top.forEach((e, i) => this.place(e.teamId, i + 1));
    this.startLoops(top, true);
  }

  private place(teamId: string, rank: number) {
    const got = this.pieces.grab(teamId);
    if (!got) return;
    got.holder.position.copy(this.spot(rank));
    got.holder.rotation.set(0, 0, 0);
    got.rig.setMode(rank === 1 ? 'dance' : 'clap');
    if (!this.placed.some((p) => p.teamId === teamId)) this.placed.push({ teamId, rank });
  }

  private async flyTo(teamId: string, rank: number) {
    const got = this.pieces.grab(teamId);
    if (!got) return;
    const { holder, rig } = got;
    const a = holder.position.clone();
    const b = this.spot(rank);
    const lift = 4 + a.distanceTo(b) * 0.25;
    rig.setMode('fly');
    this.audio.play('swoosh', { volume: 0.7 });
    const r0 = holder.rotation.y;
    await this.tweens.run(1.5, (t) => {
      holder.position.lerpVectors(a, b, t);
      holder.position.y += Math.sin(t * Math.PI) * lift;
      holder.rotation.y = r0 * (1 - t) + Math.PI * 2 * t;
    }, ease.inOut);
    holder.rotation.y = 0;
    this.audio.play('land');
    this.effects.sparkle(b.x, b.y, b.z, new THREE.Color(STEPS[rank - 1]!.color), 30);
    rig.setMode(rank === 1 ? 'dance' : 'clap');
    this.placed.push({ teamId, rank });
  }

  private startLoops(top: PodiumEntry[], quiet = false) {
    const colors = ['#ffd23f', '#ff6fb5', '#5fe0d8', '#ffffff', '#ff8a3d', top[0]?.color ?? '#ffd23f'];
    let n = 0;
    this.timers.push(
      window.setInterval(() => {
        const a = Math.random() * Math.PI * 2;
        const r = 6 + Math.random() * 8;
        this.effects.firework(VOLCANO.x + Math.cos(a) * r, TOP + 7 + Math.random() * 7, VOLCANO.z + Math.sin(a) * r, colors[n++ % colors.length]!);
        if (!quiet && n % 7 === 0) this.audio.play('feuerwerk', { volume: 0.5 });
      }, 650),
    );
    this.flipAt = 2.5;
  }

  /** Kamera langsam ums Podest; Sieger macht ab und zu einen Salto. */
  update(t: number, dt: number) {
    if (!this.active || !this.podium) return;
    this.beams.forEach((b, i) => {
      b.rotation.z = Math.sin(t * 0.9 + i * 1.7) * 0.35;
      b.rotation.x = Math.cos(t * 0.7 + i) * 0.35;
    });
    if (this.rig.mode.kind === 'focus' && this.rig.mode.position === this.camPos) {
      this.orbit += dt * 0.16;
      const r = 14;
      this.camPos.set(VOLCANO.x + Math.sin(this.orbit) * r, TOP + 5 + Math.sin(this.orbit * 0.7) * 1.2, VOLCANO.z + Math.cos(this.orbit) * r);
    }
    const winner = this.placed.find((p) => p.rank === 1);
    if (!winner) return;
    this.flipAt -= dt;
    if (this.flipAt <= 0 && !this.flipping) {
      this.flipAt = 3.8;
      void this.flip(winner.teamId);
    }
  }

  /** Kamera wieder aufs Podest richten (nach freier Kamera oder Neuladen). */
  focus() {
    if (!this.active) return;
    this.rig.set({ kind: 'focus', position: this.camPos.set(VOLCANO.x + 9, TOP + 5, VOLCANO.z + 15), lookAt: this.camLook }, 1.2);
  }

  private async flip(teamId: string) {
    const got = this.pieces.get(teamId);
    if (!got) return;
    this.flipping = true;
    const epoch = this.epoch;
    const { rig, holder } = got;
    const y0 = holder.position.y;
    const root = rig.root;
    const sc = root.scale.x;
    const c = rig.height * sc * 0.5;
    rig.setMode('tuck');
    this.audio.play('salto', { volume: 0.6 });
    await this.tweens.run(0.85, (u) => {
      const a = -Math.PI * 2 * u;
      root.rotation.x = a;
      root.position.set(0, c - c * Math.cos(a), -c * Math.sin(a));
      holder.position.y = y0 + Math.sin(u * Math.PI) * 1.4;
    }, ease.inOut);
    root.rotation.x = 0;
    root.position.set(0, 0, 0);
    holder.position.y = y0;
    this.flipping = false;
    if (epoch === this.epoch) rig.setMode('dance');
  }

  /** Feier beenden (Rückgängig, neues Spiel). Figuren stellt danach die Regie wieder auf. */
  stop() {
    this.epoch++;
    for (const id of this.timers) clearInterval(id);
    this.timers = [];
    this.flipping = false;
    if (this.podium) {
      this.podium.traverse((o) => {
        const m = o as THREE.Mesh;
        m.geometry?.dispose();
        for (const mt of Array.isArray(m.material) ? m.material : m.material ? [m.material] : []) {
          ((mt as THREE.MeshStandardMaterial).map as THREE.Texture | null)?.dispose();
          mt.dispose();
        }
      });
      this.group.remove(this.podium);
    }
    this.podium = null;
    this.beams = [];
    this.placed = [];
    this.active = false;
  }
}
