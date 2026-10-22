import { describe, expect, it } from 'vitest';
import { CHATTER_PRESET, DEFAULT_SHOW, effectiveChatter, parseShow, showPatchSchema } from './show.ts';

describe('Kommentator: Sprüche pro Minute', () => {
  it('Regler gilt nur beim Quatschkopf, sonst feste Werte je Stufe', () => {
    expect(effectiveChatter({ commentary: 'crazy', crazyChatter: 2.5 })).toBe(2.5);
    expect(effectiveChatter({ commentary: 'lots', crazyChatter: 2.5 })).toBe(CHATTER_PRESET.lots);
    expect(effectiveChatter({ commentary: 'some', crazyChatter: 6 })).toBe(0);
    expect(effectiveChatter({ commentary: 'off', crazyChatter: 6 })).toBe(0);
  });

  it('startet beim Quatschkopf mit 5 pro Minute; alte Felder stören nicht', () => {
    expect(DEFAULT_SHOW.crazyChatter).toBe(5);
    expect(parseShow({ commentary: 'crazy', chatter: 0 }).crazyChatter).toBe(5);
    expect(parseShow({ crazyChatter: 1.5 }).crazyChatter).toBe(1.5);
  });

  it('nimmt nur 0–6 in halben Schritten an', () => {
    expect(showPatchSchema.safeParse({ crazyChatter: 1.5 }).success).toBe(true);
    expect(showPatchSchema.safeParse({ crazyChatter: 6 }).success).toBe(true);
    expect(showPatchSchema.safeParse({ crazyChatter: 6.5 }).success).toBe(false);
    expect(showPatchSchema.safeParse({ crazyChatter: -1 }).success).toBe(false);
    expect(showPatchSchema.safeParse({ crazyChatter: 1.3 }).success).toBe(false);
  });
});
