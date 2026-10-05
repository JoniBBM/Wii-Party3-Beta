/**
 * Kommentator: sucht zu einem Ereignis einen passenden Spruch aus (ohne Wiederholung kurz
 * hintereinander) und spricht ihn – wie oft, bestimmt die Regie (aus / ab und zu / viel).
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
  ufo: 0.7,
  plane: 0.7,
  spring: 0.7,
  cage: 0.6,
  vine: 0.7,
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
};

/** Wichtige Momente dürfen eine laufende Ansage unterbrechen. */
const URGENT = new Set<VoiceCategory>(['victory', 'eruption']);

export class Commentator {
  level: CommentaryLevel = 'some';
  private recent = new Map<VoiceCategory, string[]>();
  private lastAt = 0;

  constructor(private audio: BoardAudio) {}

  /** Spruch zu einem Anlass – vielleicht. Liefert true, wenn gesprochen wird. */
  comment(cat: VoiceCategory, opts: { force?: boolean; delay?: number } = {}): boolean {
    if (this.level === 'off' || !this.audio.ready) return false;
    const urgent = URGENT.has(cat) || opts.force;
    const base = CHANCE[cat] ?? 0.4;
    const p = this.level === 'lots' ? Math.min(1, base * 2.2) : base;
    if (!urgent && Math.random() > p) return false;
    const now = performance.now();
    // nicht pausenlos plappern
    if (!urgent && now - this.lastAt < (this.level === 'lots' ? 2500 : 6000)) return false;
    if (!urgent && this.audio.speaking) return false;
    const id = this.pick(cat);
    if (!id) return false;
    this.lastAt = now;
    const go = () => void this.audio.say(voiceUrl(id), { interrupt: urgent });
    if (opts.delay) window.setTimeout(go, opts.delay);
    else go();
    return true;
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
}
