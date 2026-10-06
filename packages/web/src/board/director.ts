/**
 * Regie der Animationen: spielt die Effekte vom Server der Reihe nach ab
 * (Würfel → Laufen → Sonderfeld → …), führt die Kamera und liefert Einblendungen fürs HUD.
 */
import * as THREE from 'three';
import { FIELD_INFO, standings, teamById, teamColor, TEAM_COLORS, type Effect, type GameState, type Mood } from '@insel/shared';
import type { VoiceCategory } from './voice-lines.ts';
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
  /** Reaktionen nach dem Zug zeigen (Beamer-Show) */
  reactions = true;
  /** Wahl am Wasserfall (für die folgende Bewegung über den Fluss) */
  private riverPick: { choice: 'barrels' | 'crates'; result: 'safe' | 'fall' } | null = null;

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

  /** Kommentator: vielleicht etwas sagen. */
  private voice(cat: VoiceCategory, opts: { force?: boolean; delay?: number } = {}) {
    this.s.commentator.comment(cat, opts);
  }

  private podiumOrder() {
    if (!this.state) return [];
    return standings(this.state).map(({ team }) => ({ teamId: team.id, color: teamColor(team.color).hex }));
  }

  private team(id: string) {
    return this.state ? teamById(this.state, id) : undefined;
  }

  /** Platz des Teams: ganz vorne, ganz hinten oder dazwischen (für Lästereien). */
  private rankOf(id: string): 'leader' | 'last' | null {
    if (!this.state || this.state.teams.length < 2) return null;
    const order = standings(this.state);
    if (order[0]?.team.id === id) return 'leader';
    if (order[order.length - 1]?.team.id === id) return 'last';
    return null;
  }

  /** Worüber der Kommentator zwischendurch plaudert. */
  private updateTalk() {
    const st = this.state;
    const c = this.s.commentator;
    if (!st || st.status !== 'running') return c.setContext('off');
    if (this.running) return c.setContext('busy');
    const p = st.phase;
    if (p.name === 'dice' && !p.dice.fieldGame) {
      const id = p.dice.challenge?.teamId ?? p.dice.order[p.dice.index];
      return c.setContext('waiting', id ? this.rankOf(id) : null);
    }
    if (p.name === 'content' && p.content.stage === 'open') return c.setContext('thinking');
    c.setContext('idle');
  }

  /** Richtige Welt zeigen: Vulkan-Inneres, wenn das Team dort ist, sonst die Insel. */
  private viewFor(teamId: string | null) {
    const inside = !!teamId && this.s.pieces.isInside(teamId);
    const want = inside ? 'inside' : 'island';
    if (this.s.view === want) return false;
    this.s.setView(want);
    if (inside && teamId) {
      const step = this.s.pieces.insideStep(teamId) ?? 0;
      this.s.rig.set({ kind: 'focus', ...this.s.inside!.plateShot(step) }, 2);
    } else this.s.rig.set({ kind: 'overview' }, 1);
    this.s.rig.jump();
    return true;
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
      this.updateTalk();
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
    for (const t of st.teams) this.s.pieces.setInside(t.id, t.inside ? t.inside.step : null);
    if (changed) this.s.pieces.snap(positions);
    else this.s.pieces.arrangeAll();
    this.s.pieces.applyBlocked(st.teams);
    // Endstand: Siegerpodest (auch nach Neuladen); sonst ggf. abbauen
    if (st.phase.name === 'finished' && st.winnerTeamId) this.s.ceremony.sync(this.podiumOrder());
    else if (this.s.ceremony.active) {
      this.s.ceremony.stop();
      this.s.pieces.snap(positions);
    }
    const dice = st.phase.name === 'dice' ? st.phase.dice : null;
    this.s.stunts.syncVine(dice?.challenge?.kind === 'vine' ? dice.challenge.teamId : null);
    if (dice?.fieldGame) {
      if (!this.stageField || this.stageField !== dice.fieldGame.position) {
        this.stageField = dice.fieldGame.position;
        this.s.stunts.stageOn(dice.fieldGame.position);
      }
    } else if (this.stageField !== null) {
      this.stageField = null;
      this.s.stunts.stageOff();
    }
  }

  private stageField: number | null = null;

  /** Kamera, wenn gerade nichts passiert. */
  private idleCamera() {
    const st = this.state;
    if (!st) return;
    if (this.idleTimer) clearTimeout(this.idleTimer);
    if (st.phase.name === 'dice' && !st.phase.dice.fieldGame) {
      const ch = st.phase.dice.challenge;
      const id = ch?.teamId ?? st.phase.dice.order[st.phase.dice.index];
      if (id) {
        this.s.pieces.setActive(id);
        const color = teamColor(this.team(id)?.color ?? 'red').hex;
        this.viewFor(id);
        if (this.s.pieces.isInside(id) && this.s.inside) {
          const step = this.s.pieces.insideStep(id) ?? 0;
          this.s.inside.highlight(step, color);
          this.s.rig.set({ kind: 'focus', ...this.s.inside.plateShot(step) }, 1.4);
          return;
        }
        const pos = this.s.pieces.positionOf(id);
        this.s.fields.highlight(pos, color);
        // Mutproben: Kamera so, dass man sieht, worum es geht
        if (ch?.kind === 'river') this.s.rig.set({ kind: 'focus', ...this.s.stunts.riverShot() }, 1.4);
        else if (ch?.kind === 'vine') this.s.rig.set({ kind: 'focus', ...this.s.stunts.vineShot() }, 1.4);
        else this.s.rig.set({ kind: 'follow', target: () => this.s.pieces.worldPos(id) }, 1.4);
        return;
      }
    }
    this.viewFor(null);
    this.s.inside?.highlight(null);
    if (st.phase.name === 'finished' && st.winnerTeamId) {
      this.s.ceremony.focus();
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
        this.s.stunts.abortAll();
        this.stageField = null;
        this.stopFireworks();
        this.s.ceremony.stop();
        this.s.audio.stopVoice();
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
    this.updateTalk();
    while (this.queue.length && !this.disposed) {
      const e = this.queue.shift()!;
      const gen = this.generation;
      try {
        await this.play(e, gen);
      } catch (err) {
        console.warn('Animation fehlgeschlagen', err);
      }
      if (gen !== this.generation) continue;
      this.s.tweens.speed = this.queue.length > 8 ? 2.2 : this.queue.length > 4 ? 1.5 : 1;
    }
    this.running = false;
    this.updateTalk();
    this.s.tweens.speed = 1;
    this.reconcile();
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = window.setTimeout(() => !this.running && this.idleCamera(), 1400);
  }

  private follow(id: string, opts: { distance?: number; height?: number } = {}) {
    this.s.rig.set({ kind: 'follow', target: () => this.s.pieces.worldPos(id), ...opts }, 2.2);
  }

  private async play(e: Effect, gen = this.generation) {
    const s = this.s;
    const A = s.audio;
    /** nach Rückgängig nicht weiterspielen */
    const stale = () => gen !== this.generation;
    switch (e.type) {
      case 'vine': {
        const { name, color } = this.teamCaption(e.teamId);
        const rest = e.remaining ? ` – danach noch ${e.remaining} ${e.remaining === 1 ? 'Feld' : 'Felder'}` : '';
        if (e.stage === 'grab') {
          s.rig.set({ kind: 'focus', ...s.stunts.vineShot() }, 2);
          this.say({ icon: '🌿', title: 'Halt – hier geht’s nur mit der Liane!', sub: `${name} würfelt gleich, wie weit es über den Bach schwingt${rest}`, tone: 'team', color }, 3600);
          A.play('liane');
          this.voice('vine');
          await s.stunts.vineGrab(e.teamId);
          if (stale()) return;
          await s.tweens.wait(400);
          if (stale()) return;
        } else {
          A.play('dice-shake', { volume: 0.9 });
          await (e.sides === 6 ? s.dice.roll(e.roll, 0, 0) : s.dice.roll(0, e.roll, e.sides));
          if (stale()) return;
          A.play('pop', { volume: 0.7 });
          this.say({ icon: '🌿', title: `${name} schwingt ${e.roll} ${e.roll === 1 ? 'Feld' : 'Felder'} weit!`, sub: e.remaining ? `und läuft dann noch ${e.remaining} weiter` : undefined, tone: 'good', color }, 2600);
          this.voice('swing', { delay: 600 });
          void s.dice.hide(0.6);
          await s.tweens.wait(300);
          if (stale()) return;
        }
        return;
      }
      case 'cave': {
        const { name, color } = this.teamCaption(e.teamId);
        s.rig.set({ kind: 'focus', ...s.rig.clearShot(s.pieces.worldPos(e.teamId) ?? s.pieces.slotOn(e.teamId, e.position), 8, 5) }, 2.2);
        if (e.stage === 'stop') {
          this.say({ icon: '🦇', title: 'Mutprobe an der Lavahöhle!', sub: `${name} braucht mindestens eine ${e.need} – sonst geht’s ins Vulkan-Innere`, tone: 'team', color }, 3600);
          A.play('hoehle', { volume: 0.7 });
          A.play('rumble', { volume: 0.4 });
          s.pieces.setMode(e.teamId, 'shock');
          this.voice('caveStop', { delay: 300 });
          await s.tweens.wait(900);
          if (stale()) return;
          s.pieces.setMode(e.teamId, 'idle');
          return;
        }
        A.play('dice-shake', { volume: 0.9 });
        await s.dice.roll(e.roll, 0, 0, () => A.play('dice-throw-1'));
        if (stale()) return;
        void s.dice.hide(0.7);
        if (e.success) {
          A.play('jingle-good');
          s.pieces.setMode(e.teamId, 'cheer');
          this.say({ icon: '💪', title: `${name} würfelt ${e.roll} – geschafft!`, sub: e.remaining ? `weiter geht’s, noch ${e.remaining} ${e.remaining === 1 ? 'Feld' : 'Felder'}` : undefined, tone: 'good', color }, 2600);
          this.voice('cavePass', { delay: 300 });
          await s.tweens.wait(700);
          if (stale()) return;
          s.pieces.setMode(e.teamId, 'idle');
          return;
        }
        this.say({ icon: '🦇', title: `Nur eine ${e.roll}!`, sub: `${name} fällt in die Lavahöhle …`, tone: 'bad', color }, 3000);
        A.play('hoehle');
        this.voice('cave', { delay: 400 });
        await s.stunts.caveFall(e.teamId);
        if (stale()) return;
        return;
      }
      case 'river': {
        const { name, color } = this.teamCaption(e.teamId);
        if (e.stage === 'choose') {
          s.rig.set({ kind: 'focus', ...s.stunts.riverShot() }, 2);
          const rest = e.remaining ? ` – danach noch ${e.remaining} ${e.remaining === 1 ? 'Feld' : 'Felder'}` : '';
          this.say({ icon: '🛢️', title: 'Fässer oder Kisten?', sub: `${name} muss wählen – eine Seite bricht ein${rest}`, tone: 'team', color }, 3800);
          A.creak();
          this.voice('riverChoose', { delay: 500 });
          void s.stunts.riverPonder(e.teamId);
          await s.tweens.wait(900);
          if (stale()) return;
          return;
        }
        const what = e.choice === 'crates' ? 'Kisten' : 'Fässer';
        s.rig.set({ kind: 'focus', ...s.stunts.riverShot() }, 2);
        this.say({ icon: e.choice === 'crates' ? '📦' : '🛢️', title: `${name} nimmt die ${what}!`, tone: 'team', color }, 2000);
        // die Bewegung über den Fluss folgt als eigener Effekt
        this.riverPick = { choice: e.choice ?? 'barrels', result: e.result ?? 'safe' };
        return;
      }
      case 'crater': {
        const { name, color } = this.teamCaption(e.teamId);
        s.rig.set({ kind: 'focus', ...s.rig.craterShot() }, 2);
        if (e.result === 'fall') {
          this.say({ icon: '🕳️', title: 'Ab in den Krater!', sub: `${name} muss ${e.need} Augen sammeln, um herauszuklettern`, tone: 'bad', color }, 3400);
          A.play('fallen');
          this.voice('craterFall');
          await s.pieces.fallIntoCrater(e.teamId);
          if (stale()) return;
          A.play('thud');
          s.rig.shake(0.12, 0.4);
          const p = s.pieces.worldPos(e.teamId);
          if (p) s.effects.dust(p.x, p.y, p.z, new THREE.Color('#7a6a60'), 14);
          await s.tweens.wait(500);
          if (stale()) return;
        } else if (e.result === 'climb') {
          this.say({ icon: '🧗', title: `${name} klettert …`, sub: `${e.climbed} von ${e.need} Augen – noch ${e.need - e.climbed}`, tone: 'team', color }, 2400);
          A.play('tick', { volume: 0.6 });
          await s.pieces.climb(e.teamId, e.climbed / Math.max(1, e.need));
          if (stale()) return;
        } else {
          this.say({ icon: '🧗', title: `${name} ist wieder draußen!`, tone: 'good', color }, 2200);
          A.play('zauber');
          this.voice('craterOut');
          await s.pieces.climbOut(e.teamId);
          if (stale()) return;
          const p = s.pieces.worldPos(e.teamId);
          if (p) s.effects.sparkle(p.x, p.y, p.z, new THREE.Color('#ffd27a'));
          await s.tweens.wait(300);
          if (stale()) return;
          s.pieces.setMode(e.teamId, 'idle');
        }
        return;
      }
      case 'inside': {
        const { name, color } = this.teamCaption(e.teamId);
        const ins = s.inside;
        if (!ins) return;
        if (e.stage === 'enter') {
          s.pieces.setInside(e.teamId, 0);
          s.setView('inside');
          s.rig.set({ kind: 'focus', ...ins.dropShot() }, 3);
          s.rig.jump();
          this.say({ icon: '🌋', title: 'Ab ins Vulkan-Innere!', sub: `${name} muss über die Lava-Inseln zum Ausgang`, tone: 'bad', color }, 3600);
          this.voice('insideEnter', { delay: 300 });
          A.play('whoosh-down');
          await s.pieces.insideDrop(e.teamId, ins.dropPoint);
          if (stale()) return;
          A.play('lavaplatsch');
          ins.lavaBurst(s.pieces.worldPos(e.teamId) ?? ins.dropPoint);
          s.rig.shake(0.2, 0.5);
          await s.tweens.wait(500);
          if (stale()) return;
          // dann der Überblick: Weg, Ausgangsfeld und Portal
          s.rig.set({ kind: 'focus', ...ins.plateShot(0) }, 1.5);
          await s.tweens.wait(700);
          if (stale()) return;
          return;
        }
        if (e.stage === 'walk') {
          if (!s.pieces.isInside(e.teamId)) s.pieces.setInside(e.teamId, e.from);
          this.viewFor(e.teamId);
          s.rig.set({ kind: 'follow', target: () => s.pieces.worldPos(e.teamId), distance: 9, height: 6 }, 2);
          await s.pieces.insideWalk(e.teamId, e.from, e.to, () => A.step(false));
          if (stale()) return;
          ins.highlight(e.to, color);
          return;
        }
        // Ausgang: grüner Wirbel, dann zurück auf die Insel
        this.viewFor(e.teamId);
        const at = s.pieces.worldPos(e.teamId) ?? ins.portal;
        s.rig.set({ kind: 'focus', ...ins.plateShot(e.from) }, 2.4);
        this.say(
          e.shout
            ? { icon: '✨', title: 'Volltreffer aufs Ausgangsfeld!', sub: `${name} darf sofort raus`, tone: 'gold', color }
            : { icon: '🌀', title: 'Geschafft!', sub: `${name} verlässt den Vulkan`, tone: 'good', color },
          3000,
        );
        this.voice(e.shout ? 'insideShout' : 'insideExit', { delay: 200 });
        A.play('warp');
        ins.warpFlash(at);
        await s.pieces.insideVanish(e.teamId);
        if (stale()) return;
        ins.highlight(null);
        s.pieces.setInside(e.teamId, null);
        s.setView('island');
        s.rig.set({ kind: 'focus', ...s.rig.clearShot(s.pieces.slotOn(e.teamId, e.returnTo), 8, 5) }, 2.4);
        s.rig.jump();
        await s.stunts.warpOut(e.teamId, e.returnTo);
        if (stale()) return;
        return;
      }
      case 'turn': {
        const { name, color } = this.teamCaption(e.teamId);
        s.pieces.setActive(e.teamId);
        this.viewFor(e.teamId);
        if (s.pieces.isInside(e.teamId) && s.inside) {
          const step = s.pieces.insideStep(e.teamId) ?? 0;
          s.inside.highlight(step, color);
          s.rig.set({ kind: 'focus', ...s.inside.plateShot(step) }, 1.8);
        } else {
          s.inside?.highlight(null);
          s.fields.highlight(s.pieces.positionOf(e.teamId), color);
          this.follow(e.teamId);
        }
        A.play('zug', { volume: 0.8 });
        // Quatschkopf: über Führende und Letzte lästern
        const rank = this.rankOf(e.teamId);
        if (!(rank && s.commentator.level === 'crazy' && Math.random() < 0.45 && s.commentator.comment(rank, { delay: 400 }))) this.voice('turn', { delay: 400 });
        this.say({ icon: '🎲', title: `${name} ist dran!`, tone: 'team', color }, 2400);
        await s.tweens.wait(500);
        if (stale()) return;
        return;
      }
      case 'dice': {
        const { name, color } = this.teamCaption(e.teamId);
        this.viewFor(e.teamId);
        this.follow(e.teamId);
        A.play('dice-shake', { volume: 0.9 });
        await s.dice.roll(e.main, e.bonus, e.bonusDie, () => A.play(Math.random() < 0.5 ? 'dice-throw-1' : 'dice-throw-2'));
        if (stale()) return;
        const sum = e.bonus ? `${e.main} + ${e.bonus} = ${e.total}` : `${e.total}`;
        this.say({ icon: '🎲', title: `${name} würfelt ${sum}`, tone: 'team', color }, 2600);
        A.play('pop', { volume: 0.7 });
        if (e.main === 6) this.voice('six');
        else if (e.main === 1 && !e.bonus) this.voice('one');
        void s.dice.hide(0.7);
        await s.tweens.wait(450);
        if (stale()) return;
        return;
      }
      case 'move': {
        if (e.reason === 'vine') {
          s.rig.set({ kind: 'focus', ...s.stunts.swingShot(s.pieces.slotOn(e.teamId, e.to)) }, 1.6);
          await s.stunts.vineSwing(e.teamId, e.to);
          if (stale()) return;
          return;
        }
        if (e.reason === 'inside') {
          s.pieces.release(e.teamId, e.to, 'idle', false);
          return;
        }
        if (e.reason === 'catapult') {
          this.follow(e.teamId, { distance: 15, height: 9 });
          if (e.to > e.from) {
            this.voice('spring', { delay: 300 });
            await s.stunts.spring(e.teamId);
            if (stale()) return;
            await s.pieces.fly(e.teamId, e.to, { height: 5 + Math.abs(e.to - e.from) * 0.6, duration: 1.7, spin: Math.PI * 2 });
            if (stale()) return;
            A.play('land');
          } else {
            const t = this.team(e.teamId);
            A.play('flugzeug', { volume: 0.8 });
            this.voice('plane', { delay: 900 });
            await s.stunts.plane(e.teamId, e.to, teamColor(t?.color ?? 'red').hex);
            if (stale()) return;
          }
          return;
        }
        if (e.reason === 'river') {
          const pick = this.riverPick ?? { choice: 'barrels' as const, result: 'safe' as const };
          this.riverPick = null;
          const { name, color } = this.teamCaption(e.teamId);
          s.rig.set({ kind: 'focus', ...s.stunts.riverShot() }, 2);
          const cross = s.stunts.riverCross(e.teamId, pick.choice, pick.result, e.to);
          if (pick.result === 'fall') {
            window.setTimeout(() => {
              if (stale()) return;
              this.say({ icon: '💦', title: 'Krach – Platsch!', sub: `${name} schwimmt rüber, der restliche Wurf ist futsch`, tone: 'bad', color }, 3200);
              this.voice('riverFall');
            }, 900);
          } else {
            window.setTimeout(() => {
              if (stale()) return;
              this.say({ icon: '😅', title: 'Hält!', sub: `${name} kommt trocken rüber`, tone: 'good', color }, 2200);
              this.voice('riverSafe');
            }, 900);
          }
          await cross;
          if (stale()) return;
          if (pick.result === 'fall') this.follow(e.teamId);
          return;
        }
        if (e.reason === 'eruption' || e.reason === 'swap') {
          this.follow(e.teamId, { distance: 14, height: 9 });
          A.play(e.to > e.from ? 'whoosh-up' : 'whoosh-down');
          await s.pieces.fly(e.teamId, e.to);
          if (stale()) return;
          A.play('land');
          return;
        }
        this.follow(e.teamId);
        if (Math.abs(e.to - e.from) > 14 && e.reason === 'correction') {
          await s.pieces.fly(e.teamId, e.to, { duration: 1.2, height: 4 });
          if (stale()) return;
        } else {
          await s.pieces.walk(e.teamId, e.from, e.to);
          if (stale()) return;
        }
        if (e.reason === 'reward') {
          A.play('zauber');
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
        const tone: Caption['tone'] = e.field === 'catapult_forward' ? 'good' : e.field === 'catapult_backward' || e.field === 'barrier' || e.field === 'skull' ? 'bad' : 'info';
        const sounds: Partial<Record<string, Parameters<typeof A.play>[0]>> = {
          catapult_forward: 'jingle-good',
          catapult_backward: 'jingle-bad',
          swap: 'jingle-swap',
          minigame: 'jingle-fanfare',
          volcano: 'lava',
          skull: 'jingle-bad',
        };
        if (e.field === 'minigame') this.voice('fieldGame', { delay: 500 });
        const snd = sounds[e.field];
        if (snd) A.play(snd);
        this.say({ icon: info.icon, title: info.label, sub: `${name}${e.text ? ` · ${e.text}` : ''}`, tone, color }, 2800);
        if (e.field === 'minigame') {
          this.stageField = e.position;
          s.stunts.stageOn(e.position);
        }
        if (e.field === 'volcano') {
          s.stunts.geyser(e.position);
          s.rig.shake(0.15, 0.6);
        }
        if (e.field === 'skull') {
          s.rig.set({ kind: 'focus', ...s.rig.clearShot(s.pieces.worldPos(e.teamId) ?? new THREE.Vector3(spot.x, y, spot.z), 6.5, 4) }, 2.2);
          this.voice('skull', { delay: 200 });
          await s.tweens.wait(500);
          if (stale()) return;
          await s.stunts.trapdoor(e.teamId, e.position);
          if (stale()) return;
          return;
        }
        if (e.field === 'catapult_forward' || e.field === 'catapult_backward') {
          s.pieces.setMode(e.teamId, e.field === 'catapult_forward' ? 'jump' : 'cheer');
          await s.tweens.wait(500);
          if (stale()) return;
        } else await s.tweens.wait(900);
        return;
      }
      case 'swap': {
        const a = this.teamCaption(e.a);
        const b = this.teamCaption(e.b);
        this.say({ icon: '🔄', title: 'Platztausch!', sub: `${a.name} ⇄ ${b.name}`, tone: 'info' }, 3200);
        this.voice('ufo', { delay: 800 });
        // Kamera begleitet das UFO
        const pa = s.pieces.worldPos(e.a) ?? new THREE.Vector3();
        const last = pa.clone();
        // etwas straffer geführt, damit die Kamera dem UFO auch über die ganze Insel folgt
        s.rig.set({ kind: 'follow', target: () => (s.stunts.ufoTarget ? last.copy(s.stunts.ufoTarget).setY(s.stunts.ufoTarget.y - 3) : last), distance: 15, height: 9 }, 2.8);
        await s.stunts.ufoSwap(e.a, e.b, e.posA, e.posB);
        if (stale()) return;
        return;
      }
      case 'barrier': {
        const { name, color } = this.teamCaption(e.teamId);
        if (e.result === 'blocked') {
          s.pieces.setMode(e.teamId, 'stuck');
          A.play('whoosh-down', { volume: 0.6 });
          this.voice('cage', { delay: 900 });
          await s.pieces.setCage(e.teamId, true, () => {
            A.play('kaefig');
            s.rig.shake(0.12, 0.3);
            const p = s.pieces.worldPos(e.teamId);
            if (p) s.effects.dust(p.x, p.y, p.z, new THREE.Color('#e9d6a8'), 12);
          });
        } else if (e.result === 'stuck') {
          s.pieces.setMode(e.teamId, 'stuck');
          A.play('wrong', { volume: 0.7 });
          this.say({ icon: '🚧', title: `${name} sitzt fest`, sub: `Gewürfelt: ${e.roll}`, tone: 'bad', color }, 2400);
        } else {
          void s.pieces.setCage(e.teamId, false);
          s.pieces.setMode(e.teamId, 'cheer');
          A.play('zauber');
          this.voice('free');
          const p = s.pieces.worldPos(e.teamId);
          if (p) s.effects.sparkle(p.x, p.y, p.z, new THREE.Color('#ffd27a'));
          this.say({ icon: '🔓', title: `${name} ist frei!`, tone: 'good', color }, 2200);
        }
        await s.tweens.wait(900);
        if (stale()) return;
        s.pieces.setMode(e.teamId, e.result === 'blocked' || e.result === 'stuck' ? 'stuck' : 'idle');
        return;
      }
      case 'final_roll': {
        const { name, color } = this.teamCaption(e.teamId);
        if (!e.success) {
          s.pieces.setMode(e.teamId, 'sad');
          A.play('posaune');
          this.voice('finalFail', { delay: 1200 });
          this.say({ icon: '😬', title: 'Knapp daneben!', sub: `${name} braucht mindestens ${e.needed}`, tone: 'bad', color }, 2600);
          await s.tweens.wait(1600);
          if (stale()) return;
          s.pieces.setMode(e.teamId, 'idle');
        }
        return;
      }
      case 'summit': {
        const { name, color } = this.teamCaption(e.teamId);
        s.pieces.setMode(e.teamId, 'cheer');
        A.play('jubel');
        this.voice('summit');
        const p = s.pieces.worldPos(e.teamId);
        if (p) s.effects.sparkle(p.x, p.y, p.z, new THREE.Color('#ffe066'), 40, 2);
        this.say({ icon: '⛰️', title: `${name} ist auf dem Gipfel!`, sub: 'Jetzt fehlt nur noch der Siegeswurf', tone: 'gold', color }, 3200);
        await s.tweens.wait(1400);
        if (stale()) return;
        s.pieces.setMode(e.teamId, 'idle');
        return;
      }
      case 'volcano': {
        A.play('rumble', { volume: 0.5 + (e.pressure / e.threshold) * 0.5 });
        s.rig.shake(0.08 + (e.pressure / e.threshold) * 0.2, 0.8);
        if (e.pressure < e.threshold) {
          this.say({ icon: '🌋', title: 'Der Vulkan brodelt …', sub: `Druck ${e.pressure} von ${e.threshold}`, tone: 'bad' }, 2200);
          if (e.pressure / e.threshold >= 0.6) this.voice('pressure');
        }
        await s.tweens.wait(600);
        if (stale()) return;
        return;
      }
      case 'eruption': {
        s.rig.set({ kind: 'focus', ...s.rig.volcanoShot() }, 2.4);
        this.say({ icon: '🌋', title: 'VULKANAUSBRUCH!', sub: e.affected.length ? 'Alle in der Nähe des Gipfels fliegen zurück!' : 'Glück gehabt – niemand in der Nähe.', tone: 'bad' }, 4200);
        A.play('jingle-alarm');
        this.voice('eruption');
        await s.tweens.wait(900);
        if (stale()) return;
        A.play('vulkan');
        A.play('rumble', { volume: 0.7, rate: 0.8 });
        s.volcano.erupt();
        s.rig.shake(0.7, 2.2);
        await s.tweens.wait(700);
        if (stale()) return;
        await Promise.all(e.affected.map((a, i) => s.tweens.wait(i * 120).then(() => s.pieces.fly(a.teamId, a.to, { height: 9, duration: 2.1, spin: Math.PI * 4 }))));
        if (stale()) return;
        await s.tweens.wait(500);
        if (stale()) return;
        return;
      }
      case 'victory': {
        const { name, color } = this.teamCaption(e.teamId);
        s.pieces.setMode(e.teamId, 'cheer');
        A.play('jingle-win');
        this.voice('victory', { force: true });
        this.say({ icon: '🏆', title: `${name} gewinnt!`, sub: 'Herrscher der Insel!', tone: 'gold', color }, 9000);
        const p = s.pieces.worldPos(e.teamId) ?? new THREE.Vector3();
        s.effects.confettiBurst(p.x, p.y + 1.5, p.z, TEAM_COLORS.map((c) => c.hex), 260);
        s.pieces.setAllModes('clap', e.teamId);
        await s.ceremony.play(this.podiumOrder());
        if (stale()) return;
        return;
      }
      case 'field_game': {
        const { name, color } = this.teamCaption(e.teamId);
        if (e.stage === 'won' || e.stage === 'lost' || e.stage === 'cancelled') {
          this.stageField = null;
          s.stunts.stageOff();
        }
        if (e.stage === 'running') {
          A.play('pfiff');
          this.voice('game', { delay: 500 });
        } else if (e.stage === 'won') {
          A.play('jingle-win');
          A.play('applaus', { volume: 0.6 });
          s.pieces.setMode(e.teamId, 'cheer');
          this.say({ icon: '🏅', title: `${name} gewinnt das Minispiel!`, tone: 'good', color }, 2600);
          await s.tweens.wait(1200);
          if (stale()) return;
          s.pieces.setMode(e.teamId, 'idle');
        } else if (e.stage === 'lost') {
          A.play('aww');
          s.pieces.setMode(e.teamId, 'sad');
          this.say({ icon: '😕', title: `${name} verliert das Minispiel`, tone: 'bad', color }, 2400);
          await s.tweens.wait(1200);
          if (stale()) return;
          s.pieces.setMode(e.teamId, 'idle');
        }
        return;
      }
      case 'content':
        if (e.stage === 'intro') {
          A.play('frage');
          const cat: VoiceCategory = e.kind === 'estimate' ? 'estimate' : e.kind === 'buzzer' ? 'buzzer' : e.kind === 'game' ? 'game' : 'question';
          this.voice(cat, { delay: 900 });
        } else if (e.stage === 'open') A.play('jingle-start', { volume: 0.7 });
        else if (e.stage === 'revealed') A.play('trommelwirbel', { volume: 0.7 });
        else if (e.stage === 'closed') A.play('bong', { volume: 0.6 });
        return;
      case 'answer':
        A.play('tick', { volume: 0.5 });
        return;
      case 'buzz':
        A.play('bell', { volume: e.position === 1 ? 1 : 0.5 });
        return;
      case 'buzz_judged':
        A.play(e.correct ? 'richtig' : 'falsch');
        this.voice(e.correct ? 'right' : 'wrong', { delay: 500 });
        return;
      case 'results':
        A.play('jingle-results');
        this.voice('results', { delay: 600 });
        return;
      case 'drawn':
        A.play('blase', { volume: 0.8 });
        this.voice('drawn', { delay: 800 });
        return;
      case 'timer':
        if (e.action === 'end') {
          A.play('bell');
          this.voice('timeUp', { delay: 300 });
        }
        return;
      case 'round_end':
        this.viewFor(null);
        s.rig.set({ kind: 'overview' }, 0.8);
        this.voice('roundEnd', { delay: 1500 });
        return;
      case 'react': {
        if (!this.reactions) return;
        const pos = s.pieces.worldPos(e.teamId);
        if (!pos) return;
        // kurz zur Figur, von vorn – dann reagiert sie
        const shot = s.rig.portraitShot(pos);
        s.rig.set({ kind: 'focus', ...shot }, 1.5);
        await s.tweens.wait(300);
        if (stale()) return;
        const fx: Partial<Record<Mood, Parameters<typeof A.play>[0]>> = { super: 'salto', happy: 'jubel', sad: 'aww', angry: 'aerger', shock: 'aww' };
        const snd = fx[e.mood];
        if (snd) A.play(snd, { volume: e.mood === 'super' ? 0.8 : 0.7, delay: e.mood === 'super' ? 0.45 : 0.35 });
        if (e.mood === 'super') A.play('jubel', { volume: 0.6, delay: 1.3 });
        this.voice(e.mood === 'ok' ? 'happy' : e.mood, { delay: 500 });
        await s.pieces.react(e.teamId, e.mood, shot.position, 1.25);
        if (stale()) return;
        return;
      }
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
