/**
 * Regie der Animationen: spielt die Effekte vom Server der Reihe nach ab
 * (Würfel → Laufen → Sonderfeld → …), führt die Kamera und liefert Einblendungen fürs HUD.
 */
import * as THREE from 'three';
import { FIELD_INFO, RIVER, RIVER_FORD, teamById, teamColor, TEAM_COLORS, type Effect, type GameState } from '@insel/shared';
import type { BoardScene } from './scene.ts';

export interface Caption {
  id: number;
  icon: string;
  title: string;
  sub?: string;
  tone: 'info' | 'good' | 'bad' | 'gold' | 'team';
  color?: string;
}

let captionSeq = 0;

export class Director {
  private queue: Effect[] = [];
  private running = false;
  private state: GameState | null = null;
  private reconcileTimer: number | null = null;
  private idleTimer: number | null = null;
  private fireworks: number | null = null;
  private disposed = false;
  /** Wird bei Rückgängig erhöht – laufende Abläufe brechen dann ab. */
  private generation = 0;
  private captionTimer: number | null = null;
  private currentCaption = 0;

  constructor(
    private s: BoardScene,
    private caption: (c: Caption | null) => void,
  ) {}

  private say(c: Omit<Caption, 'id'>, ms = 2600) {
    const cap = { ...c, id: ++captionSeq };
    this.currentCaption = cap.id;
    this.caption(cap);
    if (this.captionTimer) clearTimeout(this.captionTimer);
    this.captionTimer = window.setTimeout(() => {
      if (this.currentCaption === cap.id) this.caption(null);
    }, ms);
    return cap;
  }

  private team(id: string) {
    return this.state ? teamById(this.state, id) : undefined;
  }

  private teamCaption(id: string) {
    const t = this.team(id);
    return { name: t?.name ?? 'Team', color: teamColor(t?.color ?? 'red').hex };
  }

  onState(state: GameState) {
    this.state = state;
    if (this.reconcileTimer) clearTimeout(this.reconcileTimer);
    // Kurz warten: Effekte zur Änderung kommen direkt nach dem Zustand
    this.reconcileTimer = window.setTimeout(() => {
      if (!this.running && this.queue.length === 0) {
        this.reconcile();
        this.idleCamera();
      }
    }, 350);
  }

  /** Figuren an den Serverzustand angleichen (nach Rückgängig, Neuverbindung, Korrekturen). */
  private reconcile() {
    const st = this.state;
    if (!st) return;
    const positions: Record<string, number> = {};
    let changed = false;
    for (const t of st.teams) {
      positions[t.id] = t.position;
      if (this.s.pieces.positionOf(t.id) !== t.position) changed = true;
    }
    if (changed) this.s.pieces.snap(positions);
    else this.s.pieces.arrangeAll();
    this.s.pieces.applyBlocked(st.teams);
  }

  /** Kamera, wenn gerade nichts passiert. */
  private idleCamera() {
    const st = this.state;
    if (!st) return;
    if (this.idleTimer) clearTimeout(this.idleTimer);
    if (st.phase.name === 'dice' && !st.phase.dice.fieldGame) {
      const id = st.phase.dice.order[st.phase.dice.index];
      if (id) {
        this.s.pieces.setActive(id);
        const pos = this.s.pieces.positionOf(id);
        this.s.fields.highlight(pos, teamColor(this.team(id)?.color ?? 'red').hex);
        this.s.rig.set({ kind: 'follow', target: () => this.s.pieces.worldPos(id) }, 1.4);
        return;
      }
    }
    if (st.phase.name === 'finished' && st.winnerTeamId) {
      const id = st.winnerTeamId;
      this.s.rig.set({ kind: 'follow', target: () => this.s.pieces.worldPos(id), distance: 9, height: 4 }, 1.2);
      return;
    }
    this.s.pieces.setActive(null);
    this.s.fields.highlight(null);
    this.s.rig.set({ kind: 'overview', tour: true }, 0.7);
  }

  enqueue(effects: Effect[]) {
    for (const e of effects) {
      if (e.type === 'undo') {
        this.queue = [];
        this.generation += 1;
        this.s.pieces.abortAll();
        this.s.tweens.finishAll();
        this.stopFireworks();
        this.caption(null);
        void this.s.dice.hide(0);
        window.setTimeout(() => {
          this.reconcile();
          this.idleCamera();
        }, 50);
        continue;
      }
      this.queue.push(e);
    }
    this.s.tweens.speed = this.queue.length > 8 ? 2.2 : this.queue.length > 4 ? 1.5 : 1;
    if (!this.running) void this.run();
  }

  private async run() {
    this.running = true;
    while (this.queue.length && !this.disposed) {
      const e = this.queue.shift()!;
      const gen = this.generation;
      try {
        await this.play(e);
      } catch (err) {
        console.warn('Animation fehlgeschlagen', err);
      }
      if (gen !== this.generation) continue;
      this.s.tweens.speed = this.queue.length > 8 ? 2.2 : this.queue.length > 4 ? 1.5 : 1;
    }
    this.running = false;
    this.s.tweens.speed = 1;
    this.reconcile();
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = window.setTimeout(() => !this.running && this.idleCamera(), 1400);
  }

  private follow(id: string, opts: { distance?: number; height?: number } = {}) {
    this.s.rig.set({ kind: 'follow', target: () => this.s.pieces.worldPos(id), ...opts }, 2.2);
  }

  /** Weg der Strömung ab der Furt flussabwärts (Wasserhöhe, Figur steckt bis zur Brust drin). */
  private driftPath(): THREE.Vector3[] {
    const ford = this.s.layout.ford;
    const pts: THREE.Vector3[] = [];
    let prev = new THREE.Vector3(ford.x, ford.y, ford.z);
    let acc = 0;
    for (let i = RIVER_FORD; i < RIVER.length - 1 && acc < 6.5; i++) {
      const a = RIVER[i]!;
      const b = RIVER[i + 1]!;
      for (let k = 1; k <= 4 && acc < 6.5; k++) {
        const f = k / 4;
        const q = new THREE.Vector3(a.x + (b.x - a.x) * f, a.y + (b.y - a.y) * f - 0.5, a.z + (b.z - a.z) * f);
        acc += q.distanceTo(prev);
        prev = q;
        pts.push(q);
      }
    }
    return pts;
  }

  private async play(e: Effect) {
    const s = this.s;
    const A = s.audio;
    switch (e.type) {
      case 'river': {
        const { name, color } = this.teamCaption(e.teamId);
        s.rig.set({ kind: 'focus', ...s.rig.fieldShot(e.position, 6.5, 4.2) }, 2.2);
        this.say({ icon: '🛢️', title: 'Wackelige Fässer!', sub: `${name} muss balancieren …`, tone: 'team', color }, 1900);
        A.creak();
        await s.pieces.wobble(e.teamId, 1.4);
        if (e.result === 'safe') {
          s.pieces.setMode(e.teamId, 'cheer');
          A.play('jingle-good');
          this.say({ icon: '😅', title: 'Gerade noch mal gut gegangen!', sub: `${name} hält das Gleichgewicht`, tone: 'good', color }, 2200);
          await s.tweens.wait(800);
          s.pieces.setMode(e.teamId, 'idle');
        } else {
          this.say({ icon: '💦', title: 'Platsch!', sub: `${name} fällt in den Fluss und treibt ab`, tone: 'bad', color }, 3200);
          await s.pieces.tumbleIntoWater(e.teamId, s.layout.ford.y);
          const p = s.pieces.worldPos(e.teamId);
          A.splash();
          if (p) s.effects.splash(p.x, s.layout.ford.y, p.z, false);
          await s.tweens.wait(300);
        }
        return;
      }
      case 'crater': {
        const { name, color } = this.teamCaption(e.teamId);
        s.rig.set({ kind: 'focus', ...s.rig.craterShot() }, 2);
        if (e.result === 'fall') {
          this.say({ icon: '🕳️', title: 'Ab in den Krater!', sub: `${name} muss ${e.need} Augen sammeln, um herauszuklettern`, tone: 'bad', color }, 3400);
          A.play('whoosh-down');
          await s.pieces.fallIntoCrater(e.teamId);
          A.play('thud');
          s.rig.shake(0.12, 0.4);
          const p = s.pieces.worldPos(e.teamId);
          if (p) s.effects.dust(p.x, p.y, p.z, new THREE.Color('#7a6a60'), 14);
          await s.tweens.wait(500);
        } else if (e.result === 'climb') {
          this.say({ icon: '🧗', title: `${name} klettert …`, sub: `${e.climbed} von ${e.need} Augen – noch ${e.need - e.climbed}`, tone: 'team', color }, 2400);
          A.play('tick', { volume: 0.6 });
          await s.pieces.climb(e.teamId, e.climbed / Math.max(1, e.need));
        } else {
          this.say({ icon: '🧗', title: `${name} ist wieder draußen!`, tone: 'good', color }, 2200);
          A.play('confirm');
          await s.pieces.climbOut(e.teamId);
          const p = s.pieces.worldPos(e.teamId);
          if (p) s.effects.sparkle(p.x, p.y, p.z, new THREE.Color('#ffd27a'));
          await s.tweens.wait(300);
          s.pieces.setMode(e.teamId, 'idle');
        }
        return;
      }
      case 'turn': {
        const { name, color } = this.teamCaption(e.teamId);
        s.pieces.setActive(e.teamId);
        s.fields.highlight(s.pieces.positionOf(e.teamId), color);
        this.follow(e.teamId);
        A.play('select', { volume: 0.6 });
        this.say({ icon: '🎲', title: `${name} ist dran!`, tone: 'team', color }, 2400);
        await s.tweens.wait(500);
        return;
      }
      case 'dice': {
        const { name, color } = this.teamCaption(e.teamId);
        this.follow(e.teamId);
        A.play('dice-shake', { volume: 0.9 });
        await s.dice.roll(e.main, e.bonus, e.bonusDie, () => A.play(Math.random() < 0.5 ? 'dice-throw-1' : 'dice-throw-2'));
        const sum = e.bonus ? `${e.main} + ${e.bonus} = ${e.total}` : `${e.total}`;
        this.say({ icon: '🎲', title: `${name} würfelt ${sum}`, tone: 'team', color }, 2600);
        A.play('pop', { volume: 0.7 });
        void s.dice.hide(0.7);
        await s.tweens.wait(450);
        return;
      }
      case 'move': {
        if (e.reason === 'river') {
          this.follow(e.teamId, { distance: 13, height: 8 });
          await s.pieces.drift(e.teamId, this.driftPath(), e.to);
          return;
        }
        if (e.reason === 'catapult' || e.reason === 'eruption' || e.reason === 'swap') {
          this.follow(e.teamId, { distance: 14, height: 9 });
          A.play(e.to > e.from ? 'whoosh-up' : 'whoosh-down');
          await s.pieces.fly(e.teamId, e.to);
          A.play('land');
          return;
        }
        this.follow(e.teamId);
        if (Math.abs(e.to - e.from) > 14 && e.reason === 'correction') {
          await s.pieces.fly(e.teamId, e.to, { duration: 1.2, height: 4 });
        } else {
          await s.pieces.walk(e.teamId, e.from, e.to);
        }
        if (e.reason === 'reward') {
          A.play('jingle-good');
          const spot = s.layout.fields[e.to]!;
          s.effects.sparkle(spot.x, s.fields.topY[e.to]!, spot.z);
        }
        return;
      }
      case 'field': {
        const info = FIELD_INFO[e.field];
        const { name, color } = this.teamCaption(e.teamId);
        const spot = s.layout.fields[e.position]!;
        const y = s.fields.topY[e.position]!;
        const c = new THREE.Color(info.color);
        s.effects.sparkle(spot.x, y, spot.z, c, 30);
        const tone: Caption['tone'] = e.field === 'catapult_forward' ? 'good' : e.field === 'catapult_backward' || e.field === 'barrier' ? 'bad' : 'info';
        const sounds: Partial<Record<string, Parameters<typeof A.play>[0]>> = {
          catapult_forward: 'jingle-good',
          catapult_backward: 'jingle-bad',
          swap: 'jingle-swap',
          barrier: 'thud',
          minigame: 'jingle-fanfare',
          volcano: 'rumble',
        };
        const snd = sounds[e.field];
        if (snd) A.play(snd);
        this.say({ icon: info.icon, title: info.label, sub: `${name}${e.text ? ` · ${e.text}` : ''}`, tone, color }, 2800);
        if (e.field === 'catapult_forward' || e.field === 'catapult_backward') {
          s.pieces.setMode(e.teamId, 'jump');
          await s.tweens.wait(600);
        } else await s.tweens.wait(900);
        return;
      }
      case 'swap': {
        const a = this.teamCaption(e.a);
        const b = this.teamCaption(e.b);
        this.say({ icon: '🔄', title: 'Platztausch!', sub: `${a.name} ⇄ ${b.name}`, tone: 'info' }, 3200);
        const mid = new THREE.Vector3();
        const pa = s.pieces.worldPos(e.a);
        const pb = s.pieces.worldPos(e.b);
        if (pa && pb) {
          mid.addVectors(pa, pb).multiplyScalar(0.5);
          const away = new THREE.Vector3(mid.x, 0, mid.z).normalize().multiplyScalar(26);
          s.rig.set({ kind: 'focus', position: new THREE.Vector3(mid.x + away.x, mid.y + 22, mid.z + away.z), lookAt: mid }, 1.6);
        }
        A.play('whoosh-up');
        await Promise.all([s.pieces.fly(e.a, e.posB, { height: 6, duration: 2.2 }), s.pieces.fly(e.b, e.posA, { height: 6, duration: 2.2, spin: -Math.PI * 2 })]);
        A.play('land');
        return;
      }
      case 'barrier': {
        const { name, color } = this.teamCaption(e.teamId);
        if (e.result === 'blocked') {
          s.pieces.setCage(e.teamId, true);
          s.pieces.setMode(e.teamId, 'stuck');
          A.play('thud');
        } else if (e.result === 'stuck') {
          s.pieces.setMode(e.teamId, 'stuck');
          A.play('wrong', { volume: 0.7 });
          this.say({ icon: '🚧', title: `${name} sitzt fest`, sub: `Gewürfelt: ${e.roll}`, tone: 'bad', color }, 2400);
        } else {
          s.pieces.setCage(e.teamId, false);
          s.pieces.setMode(e.teamId, 'cheer');
          A.play('confirm');
          const p = s.pieces.worldPos(e.teamId);
          if (p) s.effects.sparkle(p.x, p.y, p.z, new THREE.Color('#ffd27a'));
          this.say({ icon: '🔓', title: `${name} ist frei!`, tone: 'good', color }, 2200);
        }
        await s.tweens.wait(900);
        s.pieces.setMode(e.teamId, e.result === 'blocked' || e.result === 'stuck' ? 'stuck' : 'idle');
        return;
      }
      case 'final_roll': {
        const { name, color } = this.teamCaption(e.teamId);
        if (!e.success) {
          s.pieces.setMode(e.teamId, 'sad');
          A.play('jingle-bad');
          this.say({ icon: '😬', title: 'Knapp daneben!', sub: `${name} braucht mindestens ${e.needed}`, tone: 'bad', color }, 2600);
          await s.tweens.wait(1600);
          s.pieces.setMode(e.teamId, 'idle');
        }
        return;
      }
      case 'summit': {
        const { name, color } = this.teamCaption(e.teamId);
        s.pieces.setMode(e.teamId, 'cheer');
        A.play('jingle-good');
        const p = s.pieces.worldPos(e.teamId);
        if (p) s.effects.sparkle(p.x, p.y, p.z, new THREE.Color('#ffe066'), 40, 2);
        this.say({ icon: '⛰️', title: `${name} ist auf dem Gipfel!`, sub: 'Jetzt fehlt nur noch der Siegeswurf', tone: 'gold', color }, 3200);
        await s.tweens.wait(1400);
        s.pieces.setMode(e.teamId, 'idle');
        return;
      }
      case 'volcano': {
        A.play('rumble', { volume: 0.5 + (e.pressure / e.threshold) * 0.5 });
        s.rig.shake(0.08 + (e.pressure / e.threshold) * 0.2, 0.8);
        if (e.pressure < e.threshold) this.say({ icon: '🌋', title: 'Der Vulkan brodelt …', sub: `Druck ${e.pressure} von ${e.threshold}`, tone: 'bad' }, 2200);
        await s.tweens.wait(600);
        return;
      }
      case 'eruption': {
        s.rig.set({ kind: 'focus', ...s.rig.volcanoShot() }, 2.4);
        this.say({ icon: '🌋', title: 'VULKANAUSBRUCH!', sub: e.affected.length ? 'Alle in der Nähe des Gipfels fliegen zurück!' : 'Glück gehabt – niemand in der Nähe.', tone: 'bad' }, 4200);
        A.play('jingle-alarm');
        await s.tweens.wait(900);
        A.play('rumble', { volume: 1, rate: 0.8 });
        s.volcano.erupt();
        s.rig.shake(0.7, 2.2);
        await s.tweens.wait(700);
        await Promise.all(e.affected.map((a, i) => s.tweens.wait(i * 120).then(() => s.pieces.fly(a.teamId, a.to, { height: 9, duration: 2.1, spin: Math.PI * 4 }))));
        await s.tweens.wait(500);
        return;
      }
      case 'victory': {
        const { name, color } = this.teamCaption(e.teamId);
        s.rig.set({ kind: 'follow', target: () => s.pieces.worldPos(e.teamId), distance: 9, height: 4 }, 1.6);
        s.pieces.setMode(e.teamId, 'cheer');
        A.play('jingle-win');
        A.play('jingle-fanfare', { delay: 1.4 });
        this.say({ icon: '🏆', title: `${name} gewinnt!`, sub: 'Herrscher der Insel!', tone: 'gold', color }, 9000);
        const p = s.pieces.worldPos(e.teamId) ?? new THREE.Vector3();
        s.effects.confettiBurst(p.x, p.y + 1.5, p.z, TEAM_COLORS.map((c) => c.hex), 260);
        this.startFireworks(p, color);
        await s.tweens.wait(2500);
        return;
      }
      case 'field_game': {
        const { name, color } = this.teamCaption(e.teamId);
        if (e.stage === 'running') {
          A.play('jingle-start');
        } else if (e.stage === 'won') {
          A.play('jingle-win');
          s.pieces.setMode(e.teamId, 'cheer');
          this.say({ icon: '🏅', title: `${name} gewinnt das Minispiel!`, tone: 'good', color }, 2600);
          await s.tweens.wait(1200);
          s.pieces.setMode(e.teamId, 'idle');
        } else if (e.stage === 'lost') {
          A.play('jingle-bad');
          s.pieces.setMode(e.teamId, 'sad');
          this.say({ icon: '😕', title: `${name} verliert das Minispiel`, tone: 'bad', color }, 2400);
          await s.tweens.wait(1200);
          s.pieces.setMode(e.teamId, 'idle');
        }
        return;
      }
      case 'content':
        if (e.stage === 'intro') A.play('question');
        else if (e.stage === 'open') A.play('jingle-start', { volume: 0.7 });
        else if (e.stage === 'revealed') A.play('confirm');
        else if (e.stage === 'closed') A.play('bong', { volume: 0.6 });
        return;
      case 'answer':
        A.play('tick', { volume: 0.5 });
        return;
      case 'buzz':
        A.play('bell', { volume: e.position === 1 ? 1 : 0.5 });
        return;
      case 'buzz_judged':
        A.play(e.correct ? 'jingle-good' : 'wrong');
        return;
      case 'results':
        A.play('jingle-results');
        return;
      case 'drawn':
        A.play('sparkle', { volume: 0.6 });
        return;
      case 'timer':
        if (e.action === 'end') A.play('bell');
        return;
      case 'round_end':
        s.rig.set({ kind: 'overview' }, 0.8);
        return;
      default:
        return;
    }
  }

  private startFireworks(center: THREE.Vector3, color: string) {
    this.stopFireworks();
    let n = 0;
    const colors = [color, '#ffd23f', '#ff6fb5', '#5fe0d8', '#ffffff'];
    this.fireworks = window.setInterval(() => {
      if (n++ > 14) return this.stopFireworks();
      const a = Math.random() * Math.PI * 2;
      this.s.effects.firework(center.x + Math.cos(a) * 6, center.y + 7 + Math.random() * 5, center.z + Math.sin(a) * 6, colors[n % colors.length]!);
      this.s.audio.play('pop', { volume: 0.5, rate: 0.6 + Math.random() * 0.3 });
    }, 550);
  }

  private stopFireworks() {
    if (this.fireworks) clearInterval(this.fireworks);
    this.fireworks = null;
  }

  dispose() {
    this.disposed = true;
    this.stopFireworks();
    if (this.reconcileTimer) clearTimeout(this.reconcileTimer);
    if (this.idleTimer) clearTimeout(this.idleTimer);
    if (this.captionTimer) clearTimeout(this.captionTimer);
  }
}
