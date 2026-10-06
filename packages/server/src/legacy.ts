/**
 * Übernahme von Inhalten aus der alten Flask-Version (minigames.json, field_minigames/*.json).
 * Wird vom Import-Werkzeug und vom Import-Dialog der Regie benutzt.
 */
import type { ContentItemInput, PlayerCount } from '@insel/shared';

interface LegacyItem {
  id?: string;
  name?: string;
  title?: string;
  description?: string;
  instructions?: string;
  materials?: string;
  type?: string;
  question_type?: string;
  question_text?: string;
  options?: string[];
  correct_option?: number;
  correct_text?: string;
  player_count?: string | number;
}

export interface LegacyFolder {
  folder_info?: { name?: string; description?: string };
  minigames?: LegacyItem[];
}

function playerCount(v: unknown): PlayerCount {
  const s = String(v ?? '1').trim().toLowerCase();
  if (s === 'all' || s === '-1' || s === 'alle') return 'all';
  if (['1', '2', '3', '4'].includes(s)) return s as PlayerCount;
  return '1';
}

/** Sichere Zeichenkette aus beliebigem Import-Wert (Zahlen/Objekte würden sonst .trim() werfen). */
const S = (v: unknown): string => (typeof v === 'string' ? v : typeof v === 'number' ? String(v) : '');

export function convertLegacyItem(m: LegacyItem): ContentItemInput | null {
  const title = (S(m.name) || S(m.title)).trim();
  if (!title) return null;
  const description = (S(m.description) || S(m.instructions)).trim();
  if (m.type === 'question') {
    const question = (S(m.question_text) || title).trim();
    if (m.question_type === 'multiple_choice' && Array.isArray(m.options) && m.options.length >= 2) {
      return {
        kind: 'choice',
        title,
        description,
        question,
        options: m.options.map(S),
        correctIndex: Math.max(0, Math.min(Number(m.correct_option ?? 0), m.options.length - 1)),
        playerCount: 'all',
      };
    }
    return {
      kind: 'text',
      title,
      description,
      question,
      answers: [S(m.correct_text).trim() || '?'],
      playerCount: 'all',
    };
  }
  return {
    kind: 'game',
    title,
    description,
    materials: S(m.materials).trim(),
    playerCount: playerCount(m.player_count),
  };
}

export function convertLegacyFolder(folder: LegacyFolder) {
  return {
    name: S(folder.folder_info?.name).trim() || 'Import',
    description: S(folder.folder_info?.description).trim(),
    items: (folder.minigames ?? []).map(convertLegacyItem).filter((x): x is ContentItemInput => x !== null),
  };
}

/** Feld-Minispiel aus team_vs_all / team_vs_team. */
export function convertLegacyFieldGame(m: LegacyItem, mode: 'vs_all' | 'duel'): ContentItemInput | null {
  const title = (S(m.title) || S(m.name)).trim();
  if (!title) return null;
  return {
    kind: 'game',
    title,
    description: (S(m.instructions) || S(m.description)).trim(),
    materials: S(m.materials).trim() === 'Keine' ? '' : S(m.materials).trim(),
    playerCount: playerCount(m.player_count),
    roundUse: false,
    fieldModes: [mode],
  };
}
