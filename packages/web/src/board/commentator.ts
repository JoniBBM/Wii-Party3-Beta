/**
 * Kommentator: sucht zu einem Ereignis einen passenden Spruch aus (ohne Wiederholung kurz
 * hintereinander) und spricht ihn – wie oft, bestimmt die Regie (aus / ab und zu / viel /
 * Quatschkopf). Bei „viel“ und „Quatschkopf“ plaudert er auch zwischendurch, wenn gerade
 * nichts passiert; der Quatschkopf lästert dazu über Führende und Letzte und reißt dumme Witze.
 */
import type { CommentaryLevel } from '@insel/shared';
import type { BoardAudio } from './audio.ts';
import { VOICE_LINES, voiceUrl, type VoiceCategory } from './voice-lines.ts';

/** Grundwahrscheinlichkeit je Anlass bei „ab und zu“ (bei „viel“ deutlich höher). */
const CHANCE: Partial<Record<VoiceCategory, number>> = {
  victory: 1,
  eruption: 1,
  start: 1,
  summit: 0.9,
  cave: 0.8,
  craterFall: 0.8,
  riverFall: 0.8,
  skull: 0.9,
  insideEnter: 0.8,
  insideShout: 0.9,
  insideExit: 0.6,
  ufo: 0.7,
  plane: 0.7,
  spring: 0.7,
  cage: 0.6,
  vine: 0.7,
  riverChoose: 0.6,
  caveStop: 0.7,
  cavePass: 0.6,
  finalFail: 0.8,
  question: 0.6,
  estimate: 0.7,
  buzzer: 0.7,
  game: 0.6,
  fieldGame: 0.6,
  free: 0.5,
  craterOut: 0.6,
  swing: 0.4,
  riverSafe: 0.5,
  drawn: 0.45,
  roundEnd: 0.4,
  timeUp: 0.5,
  results: 0.35,
  right: 0.5,
  wrong: 0.5,
  super: 0.45,
  shock: 0.4,
  angry: 0.4,
  sad: 0.35,
  happy: 0.25,
  meh: 0.2,
  six: 0.4,
  one: 0.4,
  pressure: 0.35,
  turn: 0.15,
  lobby: 1,
  leader: 0.35,
  last: 0.35,
};

/** Geplauder – erst ab „viel“ */
const CHATTY = new Set<VoiceCategory>(['chat', 'waiting', 'thinking']);
/** Lästern und Quatsch – nur „Quatschkopf“ */
const CRAZY = new Set<VoiceCategory>(['leader', 'last', 'dumb', 'mockBad', 'mockGood']);
const BAD = new Set<VoiceCategory>(['sad', 'angry', 'shock', 'riverFall', 'cave', 'craterFall', 'plane', 'finalFail', 'wrong', 'one', 'skull']);
const GOOD = new Set<VoiceCategory>(['super', 'happy', 'six', 'spring', 'right', 'riverSafe', 'cavePass']);

/** Wichtige Momente dürfen eine laufende Ansage unterbrechen. */
const URGENT = new Set<VoiceCategory>(['victory', 'eruption']);

/** Was gerade los ist – entscheidet, worüber zwischendurch geplaudert wird. */
export type TalkContext = 'off' | 'busy' | 'waiting' | 'thinking' | 'idle';

const pickOne = <T>(list: readonly T[]) => list[Math.floor(Math.random() * list.length)]!;

export class Commentator {
  level: CommentaryLevel = 'some';
  /** z. B. während der Spielerklärung: kein Kommentar */
  paused = false;
  private recent = new Map<VoiceCategory, string[]>();
  private lastAt = 0;
  private context: TalkContext = 'off';
  private contextSince = 0;
  /** Rang des Teams am Zug (für Lästereien) */
  private turnRank: 'leader' | 'last' | null = null;
  private timer: number;

  constructor(private audio: BoardAudio) {
    this.timer = window.setInterval(() => this.idleTick(), 2500);
  }

  setContext(ctx: TalkContext, turnRank: 'leader' | 'last' | null = null) {
    if (ctx !== this.context) {
      this.context = ctx;
      this.contextSince = performance.now();
    }
    this.turnRank = turnRank;
  }

  /** Spruch zu einem Anlass – vielleicht. Liefert true, wenn gesprochen wird. */
  comment(cat: VoiceCategory, opts: { force?: boolean; delay?: number } = {}): boolean {
    if (this.level === 'off' || this.paused || !this.audio.ready) return false;
    const urgent = URGENT.has(cat) || opts.force;
    if (CHATTY.has(cat) && this.level === 'some') return false;
    if (CRAZY.has(cat) && this.level !== 'crazy') return false;
    // Quatschkopf: Schadenfreude bzw. Neid statt netter Worte
    if (this.level === 'crazy' && !urgent) {
      if (BAD.has(cat) && Math.random() < 0.45) cat = 'mockBad';
      else if (GOOD.has(cat) && Math.random() < 0.35) cat = 'mockGood';
    }
    const base = CHANCE[cat] ?? 0.4;
    const p = this.level === 'crazy' ? Math.min(1, base * 2.6) : this.level === 'lots' ? Math.min(1, base * 2.2) : base;
    if (!urgent && Math.random() > p) return false;
    const now = performance.now();
    // nicht pausenlos plappern
    const gap = this.level === 'crazy' ? 1600 : this.level === 'lots' ? 2500 : 6000;
    if (!urgent && now - this.lastAt < gap) return false;
    if (!urgent && this.audio.speaking) return false;
    const id = this.pick(cat);
    if (!id) return false;
    this.lastAt = now + (opts.delay ?? 0);
    const go = () => void this.audio.say(voiceUrl(id), { interrupt: urgent });
    if (opts.delay) window.setTimeout(go, opts.delay);
    else go();
    return true;
  }

  /** Zwischendurch etwas sagen, wenn eine Weile Ruhe ist (nur „viel“ und „Quatschkopf“). */
  private idleTick() {
    if (this.paused || !this.audio.ready || this.audio.speaking) return;
    if (this.level !== 'lots' && this.level !== 'crazy') return;
    const ctx = this.context;
    if (ctx === 'off' || ctx === 'busy') return;
    const now = performance.now();
    const crazy = this.level === 'crazy';
    // Ruhe seit dem letzten Spruch bzw. seit Beginn der Lage
    const quiet = crazy ? 9000 : 15000;
    if (now - this.lastAt < quiet + Math.random() * 4000) return;
    if (now - this.contextSince < (ctx === 'waiting' ? 7000 : 5000)) return;
    let cats: VoiceCategory[];
    if (ctx === 'waiting') {
      cats = ['waiting', 'chat'];
      if (crazy) {
        cats.push('dumb', 'dumb');
        if (this.turnRank) cats.push(this.turnRank, this.turnRank);
      }
    } else if (ctx === 'thinking') cats = crazy ? ['thinking', 'thinking', 'dumb'] : ['thinking', 'thinking', 'chat'];
    else cats = crazy ? ['chat', 'dumb', 'dumb', 'leader', 'last'] : ['chat'];
    const cat = pickOne(cats);
    const id = this.pick(cat);
    if (!id) return;
    this.lastAt = now;
    void this.audio.say(voiceUrl(id));
  }

  private pick(cat: VoiceCategory): string | null {
    const lines = VOICE_LINES[cat];
    if (!lines.length) return null;
    const used = this.recent.get(cat) ?? [];
    const fresh = lines.filter(([id]) => !used.includes(id));
    const pool = fresh.length ? fresh : lines;
    const [id] = pool[Math.floor(Math.random() * pool.length)]!;
    used.push(id);
    if (used.length > Math.max(1, lines.length - 1)) used.shift();
    this.recent.set(cat, used);
    return id;
  }

  dispose() {
    clearInterval(this.timer);
  }
}
