import { describe, expect, it } from 'vitest';
import { CHATTER_PRESET, DEFAULT_SHOW, effectiveChatter, MUSIC_MOODS, MUSIC_TRACKS, musicTracksFor, musicUrl, musicWorld, parseShow, showPatchSchema } from './show.ts';

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

describe('Musik je Welt', () => {
  it('Insel spielt nur Inselstücke, die Blockwelt ihre eigenen', () => {
    for (const m of MUSIC_MOODS) {
      const island = musicTracksFor(m, 'island');
      expect(island.length).toBeGreaterThan(0);
      expect(island.some((id) => id.startsWith('block-'))).toBe(false);
    }
    expect(musicTracksFor('insel', 'blocks')).toEqual(['block-overworld-1', 'block-overworld-2', 'block-overworld-3']);
    expect(musicTracksFor('vulkan', 'blocks')).toEqual(['block-nether-1', 'block-nether-2']);
    expect(musicTracksFor('lobby', 'blocks')).toEqual(['block-lobby']);
  });

  it('fehlt der Blockwelt eine Stimmung, kommen die Inselstücke', () => {
    expect(musicTracksFor('finale', 'blocks')).toEqual(musicTracksFor('finale', 'island'));
  });

  it('Dateiadresse mit passender Endung, IDs eindeutig', () => {
    expect(musicUrl('lobby')).toBe('/assets/audio/music/lobby.mp3');
    expect(musicUrl('block-nether-1')).toBe('/assets/audio/music/block-nether-1.m4a');
    const ids = MUSIC_TRACKS.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const t of MUSIC_TRACKS) expect(t.id.startsWith('block-')).toBe(musicWorld(t) === 'blocks');
  });

  it('feste Wahl eines Blockwelt-Stücks ist gültig, alte Werte bleiben lesbar', () => {
    expect(showPatchSchema.safeParse({ musicTrack: 'block-overworld-2' }).success).toBe(true);
    expect(parseShow({ musicTrack: 'insel-calypso' }).musicTrack).toBe('insel-calypso');
    expect(parseShow({ musicTrack: 'gibt-es-nicht' }).musicTrack).toBe('auto');
  });
});
