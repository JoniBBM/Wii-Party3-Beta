/**
 * Kommentator: sucht zu einem Ereignis einen passenden Spruch aus (ohne Wiederholung kurz
 * hintereinander) und spricht ihn – wie oft, bestimmt die Regie (aus / ab und zu / viel /
 * Quatschkopf). Zwischendurch, wenn gerade nichts passiert, plaudert er so oft, wie der Regler
 * „Sprüche pro Minute“ es vorgibt; der Quatschkopf lästert dabei über Führende und Letzte und
 * reißt dumme Witze.
 */
import type { CommentaryLevel, Theme } from '@insel/shared';
import type { SightKind } from './animals.ts';
import type { BoardAudio } from './audio.ts';
import { BLOCK_VOICE_LINES, SPACE_VOICE_LINES, VOICE_LINES, voiceUrl, type VoiceCategory } from './voice-lines.ts';

/** Begriffe, die es nur auf der Insel gibt – solche Sprüche fallen in anderen Welten weg */
const ISLAND_ONLY = /insel|liane|flugzeug|ufo|käfig|totenkopf|fäss|palme|affe|papagei|tukan|dschungel|kokos|strand|wasserfall|delfin|krabbe|schildkröte|flamingo|möwe|lava|südsee|tropen|hawaii|piraten|hängematte/i;
/** im Weltall zusätzlich: kein Wasser, keine Sprungfeder, kein Flugzeug-Flug */
const NOT_IN_SPACE = /fluss|wasser|bade|platsch|schwimm|dusche|sprungfeder|fallschirm|\bflug|vogel/i;

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

/** Tier-Sprüche je Art – nur, wenn das Tier gerade im Bild ist. */
const SIGHTS: [SightKind, VoiceCategory][] = [
  ['monkey', 'seeMonkey'],
  ['dolphin', 'seeDolphin'],
  ['whale', 'seeWhale'],
  ['turtle', 'seeTurtle'],
  ['flamingo', 'seeFlamingo'],
  ['parrot', 'seeParrot'],
  ['crab', 'seeCrab'],
  ['gull', 'seeGull'],
  ['frog', 'seeFrog'],
];

/** Wichtige Momente dürfen eine laufende Ansage unterbrechen. */
const URGENT = new Set<VoiceCategory>(['victory', 'eruption']);

/** Was gerade los ist – entscheidet, worüber zwischendurch geplaudert wird. */
export type TalkContext = 'off' | 'busy' | 'waiting' | 'thinking' | 'idle';

const pickOne = <T>(list: readonly T[]) => list[Math.floor(Math.random() * list.length)]!;

export class Commentator {
  level: CommentaryLevel = 'some';
  /** Welt: in der Blockwelt eigene Sprüche, wo es sie gibt */
  theme: Theme = 'island';
  /** Sprüche zwischendurch je Minute (0 = nur zu Ereignissen) */
  chatter = 0;
  /** z. B. während der Spielerklärung: kein Kommentar */
  paused = false;
  /** Ist ein Tier dieser Art gerade im Bild? (von der Szene gesetzt) */
  sight: ((kind: SightKind) => boolean) | null = null;
  private sightAt = new Map<SightKind, number>();
  private recent = new Map<VoiceCategory, string[]>();
  private lastAt = 0;
  /** Zufallsfaktor für den nächsten Abstand (0,8–1,2): klingt natürlich, trifft im Mittel genau */
  private jitter = 1;
  private context: TalkContext = 'off';
  private contextSince = 0;
  /** Rang des Teams am Zug (für Lästereien) */
  private turnRank: 'leader' | 'last' | null = null;
  private timer: number;

  constructor(private audio: BoardAudio) {
    // jede Sekunde prüfen, damit „Sprüche pro Minute“ auch bei hohen Werten genau stimmt
    this.timer = window.setInterval(() => this.idleTick(), 1000);
  }

  setContext(ctx: TalkContext, turnRank: 'leader' | 'last' | null = null) {
    if (ctx !== this.context) {
      this.context = ctx;
      this.contextSince = performance.now();
    }
    this.turnRank = turnRank;
  }

  private epoch = 0;
  /** Angekündigte (verzögerte) Sprüche verwerfen – z. B. nach Rückgängig. */
  cancel() {
    this.epoch += 1;
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
    this.spoke(now + (opts.delay ?? 0));
    const epoch = this.epoch;
    const go = () => {
      // inzwischen pausiert (Spielerklärung), abgeschaltet oder rückgängig gemacht → schweigen
      if (epoch !== this.epoch || this.paused || this.level === 'off') return;
      void this.audio.say(voiceUrl(id), { interrupt: urgent });
    };
    if (opts.delay) window.setTimeout(go, opts.delay);
    else go();
    return true;
  }

  private spoke(at: number) {
    this.lastAt = at;
    this.jitter = 0.8 + Math.random() * 0.4;
  }

  /** Zwischendurch etwas sagen, wenn eine Weile Ruhe ist – so oft, wie der Regler vorgibt. */
  private idleTick() {
    if (this.paused || !this.audio.ready || this.audio.speaking) return;
    if (this.level === 'off' || this.chatter <= 0) return;
    const ctx = this.context;
    if (ctx === 'off' || ctx === 'busy') return;
    const now = performance.now();
    const crazy = this.level === 'crazy';
    // Abstand seit dem letzten Spruch (auch zu einem Ereignis) und seit Beginn der Lage
    const gap = (60_000 / this.chatter) * this.jitter;
    // − halber Prüftakt: im Mittel kommt der Spruch dann genau nach `gap`
    if (now - this.lastAt < gap - 500) return;
    if (now - this.contextSince < Math.min(ctx === 'waiting' ? 6000 : 4000, gap / 2)) return;
    // Tier im Bild? Dann gern darüber reden (je Art höchstens alle 90 s)
    const animals = SIGHTS.filter(([k, cat]) => this.linesOf(cat).length > 0 && now - (this.sightAt.get(k) ?? -1e9) > 90_000 && this.sight?.(k));
    if (animals.length && Math.random() < 0.6) {
      const [k, cat] = pickOne(animals);
      const id = this.pick(cat);
      if (id) {
        this.sightAt.set(k, now);
        this.spoke(now);
        void this.audio.say(voiceUrl(id));
        return;
      }
    }
    let cats: VoiceCategory[];
    if (ctx === 'waiting') {
      cats = ['waiting', 'waiting', 'chat', 'joke'];
      if (crazy) {
        cats.push('dumb', 'joke', 'joke');
        if (this.turnRank) cats.push(this.turnRank, this.turnRank);
      }
    } else if (ctx === 'thinking') cats = crazy ? ['thinking', 'thinking', 'dumb', 'joke'] : ['thinking', 'thinking', 'chat'];
    else cats = crazy ? ['chat', 'dumb', 'joke', 'joke', 'leader', 'last'] : ['chat', 'chat', 'joke'];
    // nur Kategorien mit Sprüchen
    cats = cats.filter((c) => this.linesOf(c).length > 0);
    if (!cats.length) return;
    const cat = pickOne(cats);
    const id = this.pick(cat);
    if (!id) return;
    this.spoke(now);
    void this.audio.say(voiceUrl(id));
  }

  /**
   * Sprüche einer Kategorie für die Welt des Spiels: eigene (Blockwelt, Weltall), sonst die der Insel – in
   * anderen Welten ohne Sätze, die es dort nicht gibt (Liane, Flugzeug, Palmen …). Bleibt nichts
   * übrig, schweigt der Kommentator an der Stelle.
   */
  private linesOf(cat: VoiceCategory): readonly (readonly [string, string])[] {
    const own = this.theme === 'blocks' ? BLOCK_VOICE_LINES[cat] : this.theme === 'space' ? SPACE_VOICE_LINES[cat] : undefined;
    if (own?.length) return own;
    const lines = VOICE_LINES[cat];
    if (this.theme === 'island') return lines;
    return lines.filter(([, text]) => !ISLAND_ONLY.test(text) && !(this.theme === 'space' && NOT_IN_SPACE.test(text)));
  }

  private pick(cat: VoiceCategory): string | null {
    const lines = this.linesOf(cat);
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
