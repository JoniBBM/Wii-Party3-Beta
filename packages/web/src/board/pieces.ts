/** Spielfiguren auf dem Brett: Aufstellung, Laufen von Feld zu Feld, Fliegen, Käfig, Namensschilder. */
import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { teamColor, type Team } from '@insel/shared';
import { createFigure, type FigureRig } from '../figure/figure3d.ts';
import type { FieldMeshes } from './fields.ts';
import type { IslandLayout } from './layout.ts';
import { ease, type Tweens } from './tweens.ts';
import { DURATION } from '@insel/shared';

const SCALE = 0.85;

interface Piece {
  teamId: string;
  rig: FigureRig;
  holder: THREE.Group;
  /** angezeigte Feldposition */
  position: number;
  busy: boolean;
  key: string;
  tag: CSS2DObject;
  cage: THREE.Group;
}

export interface PieceCallbacks {
  onStep?: (teamId: string, field: number) => void;
  onLand?: (teamId: string, field: number) => void;
}

export class Pieces {
  readonly group = new THREE.Group();
  private pieces = new Map<string, Piece>();
  private teams: Team[] = [];
  /** Erhöht bei Abbruch (Rückgängig): laufende Lauf-/Flug-Schleifen beenden sich. */
  private epoch = 0;

  abortAll() {
    this.epoch += 1;
    for (const p of this.pieces.values()) p.busy = false;
  }

  constructor(
    private layout: IslandLayout,
    private fields: FieldMeshes,
    private tweens: Tweens,
    private cb: PieceCallbacks = {},
  ) {
    this.group.name = 'pieces';
  }

  get(teamId: string) {
    return this.pieces.get(teamId);
  }

  worldPos(teamId: string): THREE.Vector3 | null {
    const p = this.pieces.get(teamId);
    return p ? p.holder.position.clone() : null;
  }

  /** Teams anlegen/aktualisieren/entfernen. Neue Figuren erscheinen auf ihrer aktuellen Position. */
  sync(teams: Team[]) {
    this.teams = teams;
    const ids = new Set(teams.map((t) => t.id));
    for (const [id, p] of this.pieces) {
      if (!ids.has(id)) {
        this.group.remove(p.holder);
        p.tag.element.remove();
        p.rig.dispose();
        this.pieces.delete(id);
      }
    }
    for (const t of teams) {
      const key = `${t.color}|${JSON.stringify(t.figure)}`;
      let p = this.pieces.get(t.id);
      if (p && p.key !== key) {
        p.holder.remove(p.rig.root);
        p.rig.dispose();
        p.rig = createFigure(t.figure, t.color);
        p.rig.root.scale.setScalar(SCALE);
        p.holder.add(p.rig.root);
        p.key = key;
      }
      if (!p) {
        const holder = new THREE.Group();
        const rig = createFigure(t.figure, t.color);
        rig.root.scale.setScalar(SCALE);
        holder.add(rig.root);
        const el = document.createElement('div');
        el.className = 'board-tag-wrap';
        el.appendChild(document.createElement('span')).className = 'board-tag';
        const tag = new CSS2DObject(el);
        tag.position.set(0, rig.height * SCALE + 0.35, 0);
        holder.add(tag);
        const cage = buildCage();
        cage.visible = false;
        holder.add(cage);
        this.group.add(holder);
        p = { teamId: t.id, rig, holder, position: t.position, busy: false, key, tag, cage };
        this.pieces.set(t.id, p);
        p.cage.visible = !!t.blocked;
        p.rig.setMode(t.blocked ? 'stuck' : 'idle');
      }
      const c = teamColor(t.color);
      const label = p.tag.element.firstElementChild as HTMLElement;
      label.textContent = t.name;
      label.style.setProperty('--c', c.hex);
      label.style.setProperty('--d', c.dark);
    }
  }

  /** Käfige und Grundhaltung an den Zustand angleichen (nur wenn keine Animation läuft). */
  applyBlocked(teams: Team[]) {
    for (const t of teams) {
      const p = this.pieces.get(t.id);
      if (!p || p.busy) continue;
      p.cage.visible = !!t.blocked;
      p.cage.scale.set(1, 1, 1);
      if (t.blocked) p.rig.setMode('stuck');
      else if (p.rig.mode === 'stuck') p.rig.setMode('idle');
    }
  }

  /** Slot-Positionen für alle Figuren auf demselben Feld. */
  private slotFor(teamId: string, field: number): THREE.Vector3 {
    const f = this.layout.fields[field]!;
    const here = [...this.pieces.values()].filter((p) => p.position === field && !p.busy).map((p) => p.teamId);
    if (!here.includes(teamId)) here.push(teamId);
    here.sort((a, b) => this.teams.findIndex((t) => t.id === a) - this.teams.findIndex((t) => t.id === b));
    const k = here.length;
    const i = here.indexOf(teamId);
    const R = this.fields.radiusOf(field);
    let ox = 0;
    let oz = 0;
    if (k === 2) ox = (i === 0 ? -1 : 1) * R * 0.38;
    else if (k > 2) {
      const ring = Math.min(R * 0.62, 0.32 + k * 0.09);
      const a = (i / k) * Math.PI * 2 + Math.PI / 2;
      ox = Math.cos(a) * ring;
      oz = Math.sin(a) * ring;
    }
    // Offsets quer zur Laufrichtung drehen
    const h = f.heading;
    const sx = Math.cos(h + Math.PI / 2);
    const sz = Math.sin(h + Math.PI / 2);
    const fx = Math.cos(h);
    const fz = Math.sin(h);
    return new THREE.Vector3(f.x + sx * ox + fx * oz, this.fields.topY[field]!, f.z + sz * ox + fz * oz);
  }

  private facing(field: number) {
    const f = this.layout.fields[Math.min(field, this.layout.fields.length - 2)]!;
    return Math.atan2(Math.cos(f.heading), Math.sin(f.heading));
  }

  arrangeAll(animated = true) {
    const perField = new Map<number, string[]>();
    for (const p of this.pieces.values()) {
      if (p.busy) continue;
      const list = perField.get(p.position) ?? [];
      list.push(p.teamId);
      perField.set(p.position, list);
    }
    for (const p of this.pieces.values()) {
      if (p.busy) continue;
      const mates = perField.get(p.position) ?? [];
      const idx = mates.indexOf(p.teamId);
      p.tag.position.y = p.rig.height * SCALE + 0.35 + (mates.length > 1 ? (idx % 3) * 0.42 : 0);
      const target = this.slotFor(p.teamId, p.position);
      const rot = this.facing(p.position);
      if (!animated || p.holder.position.distanceTo(target) > 6) {
        p.holder.position.copy(target);
        p.holder.rotation.y = rot;
      } else if (p.holder.position.distanceTo(target) > 0.01) {
        const from = p.holder.position.clone();
        const r0 = p.holder.rotation.y;
        void this.tweens.run(0.35, (t) => {
          p.holder.position.lerpVectors(from, target, t);
          p.holder.rotation.y = r0 + shortAngle(r0, rot) * t;
        });
      }
    }
  }

  /** Sofort auf Positionen setzen (Neuverbindung, Rückgängig). */
  snap(positions: Record<string, number>) {
    for (const p of this.pieces.values()) {
      if (positions[p.teamId] !== undefined) p.position = positions[p.teamId]!;
      p.busy = false;
      if (!this.teams.find((t) => t.id === p.teamId)?.blocked) p.rig.setMode('idle');
    }
    this.arrangeAll(false);
  }

  positionOf(teamId: string) {
    return this.pieces.get(teamId)?.position ?? 0;
  }

  /** Schritt für Schritt laufen (mit kleinen Hüpfern). */
  async walk(teamId: string, from: number, to: number) {
    const p = this.pieces.get(teamId);
    if (!p) return;
    p.busy = true;
    p.position = from;
    this.arrangeAll();
    p.rig.setMode('walk');
    const dir = to > from ? 1 : -1;
    let cur = from;
    const epoch = this.epoch;
    while (cur !== to) {
      if (epoch !== this.epoch) return;
      const next = cur + dir;
      const a = p.holder.position.clone();
      const last = next === to;
      const b = last ? this.slotFor(teamId, next) : this.centerOf(next);
      const yaw = Math.atan2(b.x - a.x, b.z - a.z);
      const r0 = p.holder.rotation.y;
      const hop = 0.45 + Math.abs(b.y - a.y) * 0.4;
      await this.tweens.run(DURATION.step / 1000, (t) => {
        p.holder.position.lerpVectors(a, b, t);
        p.holder.position.y += Math.sin(t * Math.PI) * hop;
        p.holder.rotation.y = r0 + shortAngle(r0, yaw) * Math.min(1, t * 2.5);
      }, ease.linear);
      if (epoch !== this.epoch) return;
      cur = next;
      p.position = cur;
      this.cb.onStep?.(teamId, cur);
    }
    p.busy = false;
    p.rig.setMode('idle');
    this.cb.onLand?.(teamId, to);
    this.arrangeAll();
  }

  private centerOf(field: number) {
    const f = this.layout.fields[field]!;
    return new THREE.Vector3(f.x, this.fields.topY[field]!, f.z);
  }

  /** Flug in hohem Bogen (Katapult, Tausch, Ausbruch). */
  async fly(teamId: string, to: number, opts: { height?: number; duration?: number; spin?: number } = {}) {
    const p = this.pieces.get(teamId);
    if (!p) return;
    p.busy = true;
    p.rig.setMode('fly');
    const a = p.holder.position.clone();
    p.position = to;
    const b = this.slotFor(teamId, to);
    const dist = a.distanceTo(b);
    const height = opts.height ?? 3 + dist * 0.35;
    const spin = opts.spin ?? Math.PI * 2;
    const r0 = p.holder.rotation.y;
    const epoch = this.epoch;
    await this.tweens.run(opts.duration ?? DURATION.flight / 1000 - 0.4, (t) => {
      p.holder.position.lerpVectors(a, b, t);
      p.holder.position.y += Math.sin(t * Math.PI) * height;
      p.holder.rotation.y = r0 + spin * t;
    }, ease.inOut);
    if (epoch !== this.epoch) return;
    p.holder.rotation.y = this.facing(to);
    p.busy = false;
    p.rig.setMode('idle');
    this.cb.onLand?.(teamId, to);
    this.arrangeAll();
  }

  setMode(teamId: string, mode: Parameters<FigureRig['setMode']>[0]) {
    this.pieces.get(teamId)?.rig.setMode(mode);
  }

  setCage(teamId: string, on: boolean) {
    const p = this.pieces.get(teamId);
    if (!p) return;
    if (on) {
      p.cage.visible = true;
      p.cage.scale.set(1, 0.01, 1);
      void this.tweens.run(0.5, (t) => p.cage.scale.set(1, Math.max(0.01, t), 1), ease.outBack);
    } else {
      void this.tweens.run(0.4, (t) => p.cage.scale.set(1 + t * 0.4, Math.max(0.01, 1 - t), 1 + t * 0.4), ease.in).then(() => {
        p.cage.visible = false;
        p.cage.scale.set(1, 1, 1);
      });
    }
  }

  setActive(teamId: string | null) {
    for (const p of this.pieces.values()) p.tag.element.firstElementChild?.classList.toggle('active', p.teamId === teamId);
  }

  private tagsOn = true;
  private ndc = new THREE.Vector3();

  setTagsVisible(on: boolean) {
    this.tagsOn = on;
    for (const p of this.pieces.values()) p.tag.visible = on;
  }

  /** Schilder von Figuren außerhalb des Bildes ausblenden (sonst kleben sie am Rand). */
  updateTags(camera: THREE.Camera) {
    if (!this.tagsOn) return;
    for (const p of this.pieces.values()) {
      this.ndc.copy(p.holder.position).project(camera);
      p.tag.visible = this.ndc.z < 1 && Math.abs(this.ndc.x) < 0.98 && this.ndc.y < 0.95 && this.ndc.y > -1.05;
    }
  }

  update(t: number, dt: number) {
    for (const p of this.pieces.values()) p.rig.update(t, dt);
  }
}

function shortAngle(a: number, b: number) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

function buildCage(): THREE.Group {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: '#ff9f2e', roughness: 0.4, metalness: 0.3 });
  const bar = new THREE.CylinderGeometry(0.035, 0.035, 1.7, 8);
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    const m = new THREE.Mesh(bar, mat);
    m.position.set(Math.cos(a) * 0.55, 0.85, Math.sin(a) * 0.55);
    m.castShadow = true;
    g.add(m);
  }
  const ring = new THREE.TorusGeometry(0.55, 0.05, 8, 32);
  ring.rotateX(Math.PI / 2);
  for (const y of [0.05, 1.7]) {
    const m = new THREE.Mesh(ring, mat);
    m.position.y = y;
    g.add(m);
  }
  return g;
}
