import { describe, expect, it } from 'vitest';
import { CHATTER_PRESET, DEFAULT_SHOW, parseShow, showPatchSchema } from './show.ts';

describe('Kommentator: Sprüche pro Minute', () => {
  it('übernimmt bei älteren Einstellungen den Vorschlag der Stufe', () => {
    expect(parseShow({ commentary: 'lots' }).chatter).toBe(CHATTER_PRESET.lots);
    expect(parseShow({ commentary: 'crazy' }).chatter).toBe(CHATTER_PRESET.crazy);
    expect(parseShow({}).chatter).toBe(DEFAULT_SHOW.chatter);
    // ein eingestellter Wert bleibt, auch wenn er nicht zur Stufe passt
    expect(parseShow({ commentary: 'some', chatter: 2.5 }).chatter).toBe(2.5);
  });

  it('nimmt nur 0–6 in halben Schritten an', () => {
    expect(showPatchSchema.safeParse({ chatter: 1.5 }).success).toBe(true);
    expect(showPatchSchema.safeParse({ chatter: 6 }).success).toBe(true);
    expect(showPatchSchema.safeParse({ chatter: 6.5 }).success).toBe(false);
    expect(showPatchSchema.safeParse({ chatter: -1 }).success).toBe(false);
    expect(showPatchSchema.safeParse({ chatter: 1.3 }).success).toBe(false);
  });
});
