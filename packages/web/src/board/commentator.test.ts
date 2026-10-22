/**
 * „Sprüche pro Minute“: Der Kommentator plaudert in ruhigen Phasen im Mittel genau so oft, wie
 * die Regie es einstellt – und gar nicht, wenn der Regler auf 0 steht oder gerade viel los ist.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BoardAudio } from './audio.ts';

(globalThis as { window?: unknown }).window ??= globalThis;
const { Commentator } = await import('./commentator.ts');

function setup(level: 'some' | 'lots' | 'crazy', chatter: number) {
  let speakingUntil = 0;
  const said: number[] = [];
  const audio = {
    ready: true,
    get speaking() {
      return performance.now() < speakingUntil;
    },
    say: async () => {
      said.push(performance.now());
      speakingUntil = performance.now() + 4000; // ein Spruch dauert ein paar Sekunden
    },
  } as unknown as BoardAudio;
  const c = new Commentator(audio);
  c.level = level;
  c.chatter = chatter;
  return { c, said };
}

describe('Kommentator: Sprüche pro Minute', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  for (const rate of [1, 2.5, 4, 6]) {
    it(`${rate} pro Minute in ruhigen Phasen`, () => {
      const { c, said } = setup('lots', rate);
      c.setContext('waiting');
      vi.advanceTimersByTime(30 * 60_000);
      const perMinute = said.length / 30;
      expect(perMinute).toBeGreaterThan(rate * 0.93);
      expect(perMinute).toBeLessThan(rate * 1.07);
      c.dispose();
    });
  }

  it('0 = still, auch beim Quatschkopf; bei viel Betrieb ebenfalls still', () => {
    const quiet = setup('crazy', 0);
    quiet.c.setContext('idle');
    vi.advanceTimersByTime(10 * 60_000);
    expect(quiet.said.length).toBe(0);

    const busy = setup('lots', 6);
    busy.c.setContext('busy');
    vi.advanceTimersByTime(10 * 60_000);
    expect(busy.said.length).toBe(0);
  });

  it('plaudert auf Wunsch auch bei „ab und zu“', () => {
    const { c, said } = setup('some', 2);
    c.setContext('thinking');
    vi.advanceTimersByTime(10 * 60_000);
    expect(said.length).toBeGreaterThan(15);
  });
});
