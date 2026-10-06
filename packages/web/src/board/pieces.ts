/** Spielfiguren auf dem Brett: Aufstellung, Laufen von Feld zu Feld, Fliegen, Käfig, Namensschilder. */
import * as THREE from 'three';
import { teamColor, type FigureConfig, type Mood, type Team, type TeamColorKey } from '@insel/shared';
import { createFigure, type FigureRig } from '../figure/figure3d.ts';
import type { FieldMeshes } from './fields.ts';
import type { IslandLayout } from './layout.ts';
import { ease, type Tweens } from './tweens.ts';
import { DURATION } from '@insel/shared';
import { CRATER } from './ground.ts';
import { NameTags } from './tags.ts';

const SCALE = 0.85;

interface Piece {
  teamId: string;
  rig: FigureRig;
  holder: THREE.Group;
  /** angezeigte Feldposition */
  position: number;
  busy: boolean;
  key: string;
  /** Höhe des Namensschilds über den Füßen (mit Versatz, wenn mehrere auf einem Feld stehen) */
  tagY: number;
  tagHidden: boolean;
  cage: THREE.Group;
}

export interface PieceCallbacks {
  onStep?: (teamId: string, field: number) => void;
  onLand?: (teamId: string, field: number) => void;
  /** Geländehöhe (für die Kraterwand) */
  heightAt?: (x: number, z: number) => number;
}

export class Pieces {
  readonly group = new THREE.Group();
  /** Namensschilder (WebGL, eigene Szene – siehe tags.ts) */
  readonly tags = new NameTags();
  private pieces = new Map<string, Piece>();
  private teams: Team[] = [];
  /** Erhöht bei Abbruch (Rückgängig): laufende Lauf-/Flug-Schleifen beenden sich. */
  private epoch = 0;
  /** Teams im Krater: Fortschritt beim Herausklettern (0 = Boden, 1 = Rand) */
  private crater = new Map<string, number>();
  /** Vorführ-Figuren der Spielerklärung (gehören zu keinem Team) */
  private demos = new Set<string>();
  /** Teams im Vulkan-Inneren: Platte, auf der sie stehen */
  private insideSteps = new Map<string, number>();
  /** Vulkan-Inneres (eigene Szene), gesetzt von scene.ts */
  inside: {
    root: THREE.Object3D;
    spot: (step: number, slot?: number, count?: number) => THREE.Vector3;
    facing: (step: number) => number;
  } | null = null;

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
      if (!ids.has(id) && !this.demos.has(id)) {
        p.holder.removeFromParent();
        this.insideSteps.delete(id);
        this.tags.remove(id);
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
        const cage = buildCage();
        cage.visible = false;
        holder.add(cage);
        this.group.add(holder);
        p = { teamId: t.id, rig, holder, position: t.position, busy: false, key, tagY: rig.height * SCALE + 0.35, tagHidden: false, cage };
        this.pieces.set(t.id, p);
        p.cage.visible = !!t.blocked;
        p.rig.setMode(t.blocked ? 'stuck' : 'idle');
      }
      const c = teamColor(t.color);
      this.tags.set(t.id, t.name, c.hex, c.dark);
    }
  }

  /** Vorführ-Figur aufstellen (Spielerklärung). */
  addDemo(id: string, figure: FigureConfig, color: TeamColorKey, name: string, field: number) {
    this.removeDemo(id);
    const holder = new THREE.Group();
    const rig = createFigure(figure, color);
    rig.root.scale.setScalar(SCALE);
    holder.add(rig.root);
    const c = teamColor(color);
    this.tags.set(id, name, c.hex, c.dark);
    const cage = buildCage();
    cage.visible = false;
    holder.add(cage);
    this.group.add(holder);
    const p: Piece = { teamId: id, rig, holder, position: field, busy: false, key: 'demo', tagY: rig.height * SCALE + 0.35, tagHidden: false, cage };
    this.pieces.set(id, p);
    this.demos.add(id);
    holder.position.copy(this.slotFor(id, field));
    holder.rotation.y = this.facing(field);
  }

  removeDemo(id: string) {
    const p = this.pieces.get(id);
    if (!p || !this.demos.has(id)) return;
    p.holder.removeFromParent();
    this.insideSteps.delete(id);
    this.crater.delete(id);
    this.tags.remove(id);
    p.rig.dispose();
    this.pieces.delete(id);
    this.demos.delete(id);
  }

  /** Käfige, Krater und Grundhaltung an den Zustand angleichen (nur wenn keine Animation läuft). */
  applyBlocked(teams: Team[]) {
    for (const t of teams) {
      const p = this.pieces.get(t.id);
      if (!p || p.busy) continue;
      p.cage.visible = !!t.blocked;
      p.cage.scale.set(1, 1, 1);
      p.cage.position.set(0, 0, 0);
      if (t.crater) this.crater.set(t.id, Math.min(1, t.crater.climbed / Math.max(1, t.crater.need)));
      else this.crater.delete(t.id);
      if (t.blocked) p.rig.setMode('stuck');
      else if (t.crater) p.rig.setMode(t.crater.climbed > 0 ? 'climb' : 'sad');
      else if (p.rig.mode === 'stuck' || p.rig.mode === 'climb' || p.rig.mode === 'swim' || p.rig.mode === 'balance') p.rig.setMode('idle');
    }
    this.arrangeAll();
  }

  /** Platz im Krater: am Boden (0) bis kurz unter dem Rand (1), zur Seite des Kraterfelds. */
  private craterSpot(teamId: string, progress: number): THREE.Vector3 {
    const v = this.layout.volcano;
    const f = this.layout.fields[this.layout.craterField]!;
    const inside = [...this.crater.keys()];
    const k = Math.max(0, inside.indexOf(teamId));
    // neben dem Kraterfeld (sonst verdeckt die Feldscheibe die kletternde Figur)
    const base = Math.atan2(f.z - v.z, f.x - v.x) + 0.62 + k * 0.4;
    const r = CRATER.ledge - 0.45 + (CRATER.crest - 0.35 - (CRATER.ledge - 0.45)) * Math.min(1, progress) * 0.92;
    const x = v.x + Math.cos(base) * r;
    const z = v.z + Math.sin(base) * r;
    const y = this.cb.heightAt ? this.cb.heightAt(x, z) : CRATER.floorY;
    return new THREE.Vector3(x, Math.max(y, CRATER.floorY) + 0.02, z);
  }

  private faceOutOfCrater(): number {
    const v = this.layout.volcano;
    const f = this.layout.fields[this.layout.craterField]!;
    return Math.atan2(f.x - v.x, f.z - v.z);
  }

  /** Slot-Positionen für alle Figuren auf demselben Feld. */
  private slotFor(teamId: string, field: number): THREE.Vector3 {
    const step = this.insideSteps.get(teamId);
    if (step !== undefined && this.inside) {
      const mates = [...this.insideSteps.entries()].filter(([id, s]) => s === step && (id === teamId || !this.pieces.get(id)?.busy)).map(([id]) => id);
      mates.sort((a, b) => this.teams.findIndex((t) => t.id === a) - this.teams.findIndex((t) => t.id === b));
      return this.inside.spot(step, Math.max(0, mates.indexOf(teamId)), mates.length);
    }
    const inCrater = this.crater.get(teamId);
    if (inCrater !== undefined) return this.craterSpot(teamId, inCrater);
    const f = this.layout.fields[field]!;
    const here = [...this.pieces.values()].filter((p) => p.position === field && !p.busy && !this.crater.has(p.teamId) && !this.insideSteps.has(p.teamId)).map((p) => p.teamId);
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
    return new THREE.Vector3(f.x + sx * ox + fx * oz, this.fields.topY[field]! + 0.045, f.z + sz * ox + fz * oz);
  }

  private facing(field: number) {
    const f = this.layout.fields[Math.min(field, this.layout.fields.length - 2)]!;
    return Math.atan2(Math.cos(f.heading), Math.sin(f.heading));
  }

  arrangeAll(animated = true) {
    const perField = new Map<number, string[]>();
    for (const p of this.pieces.values()) {
      if (p.busy) continue;
      // nach einem abgebrochenen Salto wieder gerade stehen
      if (p.rig.root.rotation.x !== 0) {
        p.rig.root.rotation.x = 0;
        p.rig.root.position.set(0, 0, 0);
        p.rig.root.scale.setScalar(SCALE);
      }
      const key = this.insideSteps.has(p.teamId) ? -1000 - this.insideSteps.get(p.teamId)! : p.position;
      const list = perField.get(key) ?? [];
      list.push(p.teamId);
      perField.set(key, list);
    }
    for (const p of this.pieces.values()) {
      if (p.busy) continue;
      const mates = perField.get(this.insideSteps.has(p.teamId) ? -1000 - this.insideSteps.get(p.teamId)! : p.position) ?? [];
      const idx = mates.indexOf(p.teamId);
      p.tagY = p.rig.height * SCALE + 0.35 + (mates.length > 1 ? (idx % 3) * 0.42 : 0);
      const target = this.slotFor(p.teamId, p.position);
      const inStep = this.insideSteps.get(p.teamId);
      const rot = inStep !== undefined && this.inside ? this.inside.facing(inStep) : this.crater.has(p.teamId) ? this.faceOutOfCrater() : this.facing(p.position);
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
    this.crater.clear();
    for (const p of this.pieces.values()) {
      if (positions[p.teamId] !== undefined) p.position = positions[p.teamId]!;
      p.busy = false;
      p.holder.visible = true;
      p.holder.scale.setScalar(1);
      p.holder.rotation.set(0, p.holder.rotation.y, 0);
      // Salto/Hocke abgebrochen → Figur wieder gerade hinstellen
      p.rig.root.rotation.set(0, 0, 0);
      p.rig.root.position.set(0, 0, 0);
      p.rig.root.scale.setScalar(SCALE);
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
    this.crater.delete(teamId);
    p.busy = true;
    p.position = from;
    this.arrangeAll();
    p.rig.setMode('walk');
    const dir = to > from ? 1 : -1;
    let cur = from;
    const epoch = this.epoch;
    // abgebrochen (Rückgängig) oder Figur entfernt (Spielerklärung beendet) → aufhören
    const gone = () => epoch !== this.epoch || this.pieces.get(teamId) !== p;
    while (cur !== to) {
      if (gone()) return;
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
      if (gone()) return;
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
    this.crater.delete(teamId);
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

  /** Wackeln auf dem Fass (Balance halten). */
  async wobble(teamId: string, seconds = 1.2) {
    const p = this.pieces.get(teamId);
    if (!p) return;
    p.rig.setMode('balance');
    const r0 = p.holder.rotation.z;
    await this.tweens.run(seconds, (t) => {
      p.holder.rotation.z = r0 + Math.sin(t * Math.PI * 7) * 0.22 * (1 - t * 0.3);
    }, ease.linear);
    p.holder.rotation.z = 0;
  }

  /** Vom Fass kippen und ins Wasser plumpsen. */
  async tumbleIntoWater(teamId: string, waterY: number) {
    const p = this.pieces.get(teamId);
    if (!p) return;
    const epoch = this.epoch;
    p.busy = true;
    p.rig.setMode('fly');
    const a = p.holder.position.clone();
    const side = new THREE.Vector3(Math.cos(p.holder.rotation.y), 0, -Math.sin(p.holder.rotation.y)).multiplyScalar(0.9);
    const b = a.clone().add(side).setY(waterY - 0.55);
    await this.tweens.run(0.75, (t) => {
      p.holder.position.lerpVectors(a, b, t);
      p.holder.position.y += Math.sin(t * Math.PI) * 0.8;
      p.holder.rotation.z = t * 1.2;
    }, ease.in);
    p.holder.rotation.z = 0;
    if (epoch !== this.epoch) return;
    p.rig.setMode('swim');
  }

  /** Mit der Strömung treiben (entlang von Punkten) und dann ans Ufer auf ein Feld springen. */
  async drift(teamId: string, path: THREE.Vector3[], to: number) {
    const p = this.pieces.get(teamId);
    if (!p || path.length < 2) return this.fly(teamId, to);
    p.busy = true;
    p.rig.setMode('swim');
    const epoch = this.epoch;
    const curve = new THREE.CatmullRomCurve3([p.holder.position.clone(), ...path]);
    await this.tweens.run(1.6, (t) => {
      const q = curve.getPointAt(t);
      p.holder.position.set(q.x, q.y + Math.sin(t * 18) * 0.05, q.z);
      const d = curve.getTangentAt(t);
      p.holder.rotation.y = Math.atan2(d.x, d.z) + Math.sin(t * 9) * 0.3;
    }, ease.inOut);
    if (epoch !== this.epoch) return;
    p.position = to;
    const a = p.holder.position.clone();
    const b = this.slotFor(teamId, to);
    p.rig.setMode('jump');
    await this.tweens.run(0.8, (t) => {
      p.holder.position.lerpVectors(a, b, t);
      p.holder.position.y += Math.sin(t * Math.PI) * 1.6;
    }, ease.inOut);
    if (epoch !== this.epoch) return;
    p.holder.rotation.y = this.facing(to);
    p.busy = false;
    p.rig.setMode('sad');
    this.cb.onLand?.(teamId, to);
    this.arrangeAll();
  }

  /** Vom Kraterrand in den Krater rutschen. */
  async fallIntoCrater(teamId: string) {
    const p = this.pieces.get(teamId);
    if (!p) return;
    const epoch = this.epoch;
    p.busy = true;
    this.crater.set(teamId, 0);
    const a = p.holder.position.clone();
    const b = this.craterSpot(teamId, 0);
    p.rig.setMode('fly');
    const r0 = p.holder.rotation.y;
    await this.tweens.run(1.2, (t) => {
      p.holder.position.lerpVectors(a, b, t);
      p.holder.position.y += Math.sin(t * Math.PI) * 0.9 - t * t * 0.2;
      p.holder.rotation.y = r0 + t * Math.PI * 2;
    }, ease.in);
    if (epoch !== this.epoch) return;
    p.holder.rotation.y = this.faceOutOfCrater();
    p.busy = false;
    p.rig.setMode('sad');
  }

  /** Ein Stück die Kraterwand hinaufklettern. */
  async climb(teamId: string, progress: number) {
    const p = this.pieces.get(teamId);
    if (!p) return;
    const epoch = this.epoch;
    p.busy = true;
    this.crater.set(teamId, progress);
    const a = p.holder.position.clone();
    const b = this.craterSpot(teamId, progress);
    p.rig.setMode('climb');
    p.holder.rotation.y = this.faceOutOfCrater();
    await this.tweens.run(1.1, (t) => p.holder.position.lerpVectors(a, b, t), ease.inOut);
    if (epoch !== this.epoch) return;
    p.busy = false;
  }

  /** Über den Rand zurück aufs Kraterfeld. */
  async climbOut(teamId: string) {
    const p = this.pieces.get(teamId);
    if (!p) return;
    const epoch = this.epoch;
    p.busy = true;
    const a = p.holder.position.clone();
    this.crater.delete(teamId);
    const b = this.slotFor(teamId, p.position);
    p.rig.setMode('jump');
    await this.tweens.run(0.9, (t) => {
      p.holder.position.lerpVectors(a, b, t);
      p.holder.position.y += Math.sin(t * Math.PI) * 1.2;
    }, ease.inOut);
    if (epoch !== this.epoch) return;
    p.holder.rotation.y = this.facing(p.position);
    p.busy = false;
    p.rig.setMode('cheer');
    this.arrangeAll();
  }

  inCrater(teamId: string) {
    return this.crater.has(teamId);
  }

  // --- Für Auftritte (stunts.ts): Figur vorübergehend frei bewegen -------------------

  /** Figur übernehmen: keine Aufstellung mehr, bis `release`. */
  grab(teamId: string): { holder: THREE.Group; rig: FigureRig } | null {
    const p = this.pieces.get(teamId);
    if (!p) return null;
    p.busy = true;
    this.crater.delete(teamId);
    return { holder: p.holder, rig: p.rig };
  }

  /** Figur auf ein Feld zurückgeben (logische Position setzen, aufstellen). */
  release(teamId: string, field: number, mode: Parameters<FigureRig['setMode']>[0] = 'idle', land = true) {
    const p = this.pieces.get(teamId);
    if (!p) return;
    p.position = field;
    p.busy = false;
    p.holder.rotation.set(0, this.facing(field), 0);
    p.holder.scale.setScalar(1);
    p.rig.setMode(mode);
    if (land) this.cb.onLand?.(teamId, field);
    this.arrangeAll();
  }

  /** Stellplatz einer Figur auf einem Feld (für Zielpunkte von Auftritten). */
  slotOn(teamId: string, field: number): THREE.Vector3 {
    const p = this.pieces.get(teamId);
    const old = p?.position;
    const busy = p?.busy;
    if (p) {
      p.position = field;
      p.busy = false;
    }
    const v = this.slotFor(teamId, field);
    if (p) {
      p.position = old!;
      p.busy = busy!;
    }
    return v;
  }

  facingOf(field: number) {
    return this.facing(field);
  }

  /**
   * Reaktion nach dem Zug: zur Kamera drehen, je nach Stimmung Salto, Jubel, Winken,
   * Schulterzucken, Ärger, Schreck oder Traurigkeit – danach wieder zurück.
   */
  async react(teamId: string, mood: Mood, lookAt: THREE.Vector3 | null, seconds = 1.5) {
    const p = this.pieces.get(teamId);
    if (!p || p.busy) return;
    const epoch = this.epoch;
    const alive = () => epoch === this.epoch;
    const prevMode = p.rig.mode;
    p.busy = true;
    const r0 = p.holder.rotation.y;
    const want = lookAt ? Math.atan2(lookAt.x - p.holder.position.x, lookAt.z - p.holder.position.z) : r0;
    const turn = shortAngle(r0, want);
    await this.tweens.run(0.35, (t) => (p.holder.rotation.y = r0 + turn * t), ease.inOut);
    if (!alive()) return;
    const root = p.rig.root;
    const y0 = p.holder.position.y;
    if (mood === 'super') {
      // Rückwärtssalto um den Körperschwerpunkt
      const c = p.rig.height * SCALE * 0.5;
      p.rig.setMode('jump');
      await this.tweens.run(0.22, (t) => (root.scale.y = SCALE * (1 - Math.sin(t * Math.PI) * 0.18)), ease.inOut);
      if (!alive()) return;
      p.rig.setMode('tuck');
      await this.tweens.run(0.85, (t) => {
        const a = -Math.PI * 2 * t;
        root.rotation.x = a;
        root.position.set(0, c - c * Math.cos(a), -c * Math.sin(a));
        p.holder.position.y = y0 + Math.sin(t * Math.PI) * 1.5;
      }, ease.inOut);
      root.rotation.x = 0;
      root.position.set(0, 0, 0);
      p.holder.position.y = y0;
      if (!alive()) return;
      this.cb.onLand?.(teamId, p.position);
      p.rig.setMode('cheer');
      await this.tweens.wait(Math.max(300, (seconds - 1.07) * 1000));
    } else if (mood === 'happy') {
      p.rig.setMode('cheer');
      await this.tweens.run(seconds, (t) => (p.holder.position.y = y0 + Math.abs(Math.sin(t * Math.PI * 3)) * 0.35), ease.linear);
      p.holder.position.y = y0;
    } else if (mood === 'shock') {
      p.rig.setMode('shock');
      await this.tweens.run(0.4, (t) => (p.holder.position.y = y0 + Math.sin(t * Math.PI) * 0.45), ease.out);
      p.holder.position.y = y0;
      await this.tweens.wait((seconds - 0.4) * 1000);
    } else {
      const mode = mood === 'ok' ? 'wave' : mood === 'meh' ? 'shrug' : mood === 'angry' ? 'angry' : 'sad';
      p.rig.setMode(mode);
      await this.tweens.wait(seconds * 1000);
    }
    if (!alive()) return;
    p.rig.setMode(prevMode === 'stuck' ? 'stuck' : 'idle');
    await this.tweens.run(0.35, (t) => (p.holder.rotation.y = r0 + turn * (1 - t)), ease.inOut);
    if (!alive()) return;
    p.busy = false;
  }

  /** Alle Figuren in eine Haltung versetzen (z. B. Applaus bei der Siegerehrung). */
  setAllModes(mode: Parameters<FigureRig['setMode']>[0], except?: string) {
    for (const p of this.pieces.values()) if (p.teamId !== except && !p.busy) p.rig.setMode(mode);
  }

  get epochNow() {
    return this.epoch;
  }

  setMode(teamId: string, mode: Parameters<FigureRig['setMode']>[0]) {
    this.pieces.get(teamId)?.rig.setMode(mode);
  }

  /** Käfig fällt von oben herab (mit Aufprall) bzw. fliegt davon. */
  setCage(teamId: string, on: boolean, onImpact?: () => void): Promise<void> {
    const p = this.pieces.get(teamId);
    if (!p) return Promise.resolve();
    if (on) {
      p.cage.visible = true;
      p.cage.scale.set(1, 1, 1);
      p.cage.position.set(0, 7, 0);
      let hit = false;
      return this.tweens.run(0.75, (t) => {
        p.cage.position.y = 7 * (1 - t);
        p.cage.rotation.y = (1 - t) * 2;
        if (!hit && t >= 0.36) {
          hit = true;
          onImpact?.();
        }
      }, ease.outBounce);
    }
    return this.tweens.run(0.7, (t) => {
      p.cage.position.y = t * t * 9;
      p.cage.rotation.y = t * 4;
      p.cage.scale.setScalar(1 - t * 0.5);
    }, ease.in).then(() => {
      p.cage.visible = false;
      p.cage.position.set(0, 0, 0);
      p.cage.rotation.set(0, 0, 0);
      p.cage.scale.set(1, 1, 1);
    });
  }

  // --- Vulkan-Inneres ---------------------------------------------------------------

  /** Figur ins Vulkan-Innere (auf Platte `step`) bzw. zurück auf die Insel hängen. */
  setInside(teamId: string, step: number | null) {
    const p = this.pieces.get(teamId);
    if (!p) return;
    if (step === null || !this.inside) {
      if (!this.insideSteps.delete(teamId)) return;
      this.group.add(p.holder);
      return;
    }
    this.insideSteps.set(teamId, step);
    if (p.holder.parent !== this.inside.root) this.inside.root.add(p.holder);
  }

  insideStep(teamId: string): number | null {
    return this.insideSteps.get(teamId) ?? null;
  }

  isInside(teamId: string) {
    return this.insideSteps.has(teamId);
  }

  /** Im Vulkan-Inneren von Platte zu Platte hüpfen. */
  async insideWalk(teamId: string, from: number, to: number, onStep?: (step: number) => void) {
    const p = this.pieces.get(teamId);
    if (!p || !this.inside) return;
    const epoch = this.epoch;
    this.setInside(teamId, from);
    p.busy = true;
    p.rig.setMode('walk');
    let cur = from;
    const gone = () => epoch !== this.epoch || this.pieces.get(teamId) !== p;
    while (cur !== to) {
      if (gone()) return;
      const next = cur + (to > cur ? 1 : -1);
      const a = p.holder.position.clone();
      this.insideSteps.set(teamId, next);
      const b = next === to ? this.slotFor(teamId, next) : this.inside.spot(next);
      const yaw = Math.atan2(b.x - a.x, b.z - a.z);
      const r0 = p.holder.rotation.y;
      const hop = 0.9 + Math.abs(b.y - a.y) * 0.5;
      p.rig.setMode('jump');
      await this.tweens.run(DURATION.insideStep / 1000, (t) => {
        p.holder.position.lerpVectors(a, b, t);
        p.holder.position.y += Math.sin(t * Math.PI) * hop;
        p.holder.rotation.y = r0 + shortAngle(r0, yaw) * Math.min(1, t * 2.5);
      }, ease.inOut);
      if (gone()) return;
      cur = next;
      onStep?.(cur);
    }
    p.busy = false;
    p.rig.setMode('idle');
    this.arrangeAll();
  }

  /** Von oben ins Vulkan-Innere fallen und auf der ersten Platte landen. */
  async insideDrop(teamId: string, from: THREE.Vector3) {
    const p = this.pieces.get(teamId);
    if (!p || !this.inside) return;
    const epoch = this.epoch;
    this.setInside(teamId, 0);
    p.busy = true;
    p.holder.visible = true;
    p.holder.scale.setScalar(1);
    p.rig.setMode('fly');
    const b = this.slotFor(teamId, 0);
    const a = from.clone();
    await this.tweens.run(1.15, (t) => {
      p.holder.position.lerpVectors(a, b, t * t);
      p.holder.rotation.y += 0.22;
    }, ease.linear);
    if (epoch !== this.epoch) return;
    p.busy = false;
    p.holder.rotation.set(0, this.inside.facing(0), 0);
    p.rig.setMode('sad');
    this.arrangeAll();
  }

  /** Im Vulkan: in einem grünen Wirbel verschwinden. */
  async insideVanish(teamId: string) {
    const p = this.pieces.get(teamId);
    if (!p) return;
    const epoch = this.epoch;
    p.busy = true;
    p.rig.setMode('fly');
    const a = p.holder.position.clone();
    await this.tweens.run(0.9, (t) => {
      p.holder.position.set(a.x, a.y + t * 1.6, a.z);
      p.holder.rotation.y += 0.45 + t * 0.6;
      p.holder.scale.setScalar(Math.max(0.02, 1 - t * t));
    }, ease.in);
    if (epoch !== this.epoch) return;
    p.holder.visible = false;
    p.holder.scale.setScalar(1);
  }

  setActive(teamId: string | null) {
    this.tags.setActive(teamId);
  }

  private ndc = new THREE.Vector3();
  private tagPos = new THREE.Vector3();
  /** Sichtprüfung (Gelände) – Schilder verdeckter Figuren ausblenden */
  lineOfSight: ((from: THREE.Vector3, to: THREE.Vector3) => boolean) | null = null;
  private tagTick = 0;

  setTagsVisible(on: boolean) {
    this.tags.visible = on;
    if (!on) this.tags.hideAll();
  }

  /** Schilder mitführen; außerhalb des Bildes oder hinter einem Berg ausblenden. */
  updateTags(camera: THREE.Camera, time = 0) {
    if (!this.tags.visible) return;
    const check = this.tagTick++ % 4 === 0;
    for (const p of this.pieces.values()) {
      p.holder.getWorldPosition(this.tagPos);
      this.ndc.copy(this.tagPos).project(camera);
      const onScreen = this.ndc.z < 1 && Math.abs(this.ndc.x) < 0.98 && this.ndc.y < 0.95 && this.ndc.y > -1.05;
      this.tagPos.y += p.tagY;
      // hinter einem Berg? (nur jedes 4. Bild prüfen)
      if (check && onScreen && this.lineOfSight) p.tagHidden = !this.lineOfSight(camera.position, this.tagPos.clone().setY(this.tagPos.y - 0.05));
      this.tags.place(p.teamId, this.tagPos, onScreen && !p.tagHidden && p.holder.visible && this.isShown(p), time);
    }
  }

  /** Figur gehört zur gerade gezeigten Szene (siehe Vulkan-Inneres). */
  isShown: (p: { teamId: string }) => boolean = () => true;

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
