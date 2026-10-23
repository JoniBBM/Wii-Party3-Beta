/**
 * Zu jedem Spruch und jedem Satz der Spielerklärung (alle Welten) gibt es eine Sprachdatei –
 * sonst würde der Beamer an der Stelle schweigen bzw. eine fehlende Datei laden wollen.
 */
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BLOCK_EXPLAINER_LINES, BLOCK_VOICE_LINES, EXPLAINER_LINES, SPACE_EXPLAINER_LINES, SPACE_VOICE_LINES, VOICE_LINES } from './voice-lines.ts';
import { NEW_VOICE_LINES } from './voice-lines-new.ts';

const dir = join(import.meta.dirname, '../../public/assets/voice');
const ids = (lines: Partial<Record<string, readonly (readonly [string, string])[]>>) => Object.values(lines).flatMap((l) => (l ?? []).map(([id]) => id));

describe('Sprachdateien', () => {
  it('gibt es für alle Sprüche und Erklärsätze', () => {
    const all = [
      ...ids(VOICE_LINES),
      ...ids(BLOCK_VOICE_LINES),
      ...ids(SPACE_VOICE_LINES),
      ...EXPLAINER_LINES.map(([id]) => id),
      ...Object.keys(BLOCK_EXPLAINER_LINES).map((id) => `bw_${id}`),
      ...Object.keys(SPACE_EXPLAINER_LINES).map((id) => `sw_${id}`),
    ];
    expect(all.filter((id) => !existsSync(join(dir, `${id}.mp3`)))).toEqual([]);
    expect(new Set(all).size).toBe(all.length);
  });
  it('Entwürfe ohne Datei sind leer (sonst gehören sie noch nicht nach voice-lines.ts)', () => {
    expect(ids(NEW_VOICE_LINES)).toEqual([]);
  });
});
