import { describe, expect, it } from 'vitest';
import { CHATTER_PRESET, DEFAULT_SHOW, effectiveChatter, parseShow, showPatchSchema } from './show.ts';

describe('Kommentator: Sprüche pro Minute', () => {
  it('Regler gilt nur beim Quatschkopf, sonst feste Werte je Stufe', () => {
    expect(effectiveChatter({ commentary: 'crazy', crazyChatter: 2.5 })).toBe(2.5);
    expect(effectiveChatter({ commentary: 'lots', crazyChatter: 2.5 })).toBe(CHATTER_PRESET.lots);
    expect(effectiveChatter({ commentary: 'some', crazyChatter: 6 })).toBe(0);
    expect(effectiveChatter({ commentary: 'off', crazyChatter: 6 })).toBe(0);
  });

  it('startet beim Quatschkopf mit 1 pro Minute; alte oder ungültige Werte fallen darauf zurück', () => {
    expect(DEFAULT_SHOW.crazyChatter).toBe(1);
    expect(parseShow({ commentary: 'crazy', chatter: 0 }).crazyChatter).toBe(1);
    expect(parseShow({ crazyChatter: 5 }).crazyChatter).toBe(1);
    expect(parseShow({ crazyChatter: 1.5 }).crazyChatter).toBe(1.5);
  });

  it('nimmt nur die Stufen 0, 0,25, 0,5, 0,75, 1 … 4 an', () => {
    for (const v of [0, 0.25, 0.5, 0.75, 1, 1.5, 2, 2.5, 3, 3.5, 4]) expect(showPatchSchema.safeParse({ crazyChatter: v }).success).toBe(true);
    for (const v of [5, 6, 4.5, 1.25, -1, 0.3]) expect(showPatchSchema.safeParse({ crazyChatter: v }).success).toBe(false);
  });
});
