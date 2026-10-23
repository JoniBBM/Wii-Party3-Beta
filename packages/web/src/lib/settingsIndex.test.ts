/**
 * Verzeichnis der Einstellungen: Die Suche findet Begriffe beider Welten und Schreibweisen ohne
 * Umlaute, und jede Einstellung hat auf ihrer Seite ein Sprungziel (`data-setting` bzw. `Row id`).
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { GAME_SECTIONS, searchSettings, SETTINGS, settingPlace, settingTitle, SUGGESTED, settingById } from './settingsIndex.ts';

const first = (q: string, theme: 'island' | 'blocks' = 'island', admin = true) => searchSettings(q, theme, admin)[0]?.id;

describe('Suche', () => {
  it('findet Begriffe beider Welten', () => {
    expect(first('nether')).toBe('g.inside');
    expect(first('ranke')).toBe('g.vine');
    expect(first('liane', 'blocks')).toBe('g.vine');
    expect(first('minecraft')).toBe('g.world');
    expect(first('creeper')).toBe('g.catapultBackward');
  });
  it('ist unempfindlich für Umlaute und Groß-/Kleinschreibung', () => {
    expect(first('Lautstaerke')).toBe('b.master');
    expect(first('lautstärke')).toBe('b.master');
    expect(first('JAHRESZEIT')).toBe('g.season');
  });
  it('verlangt alle Wörter und sortiert Titel-Treffer nach vorn', () => {
    expect(first('druck ausbruch')).toBe('g.volcanoPressure');
    expect(searchSettings('schnee', 'island', true).map((e) => e.id)).toEqual(expect.arrayContaining(['g.weather']));
    expect(searchSettings('gibtesnicht', 'island', true)).toEqual([]);
    expect(searchSettings('   ', 'island', true)).toEqual([]);
  });
  it('zeigt Admin-Einstellungen nur Admins', () => {
    expect(first('smtp', 'island', true)).toBe('o.smtp');
    expect(first('smtp', 'island', false)).toBeUndefined();
  });
  it('benennt nach der Welt', () => {
    const vine = settingById('g.vine')!;
    expect(settingTitle(vine, 'island')).toBe('Liane');
    expect(settingTitle(vine, 'blocks')).toBe('Ranke');
    expect(settingPlace(settingById('g.inside')!, 'blocks')).toBe('Spiel einrichten › Vulkan & Nether');
  });
});

describe('Verzeichnis', () => {
  it('hat eindeutige IDs, gültige Bereiche und Vorschläge', () => {
    const ids = SETTINGS.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    const sections = new Set<string>(GAME_SECTIONS.map((s) => s.id));
    for (const e of SETTINGS.filter((x) => x.area === 'game')) expect(sections.has(e.section), e.id).toBe(true);
    for (const s of GAME_SECTIONS) expect(SETTINGS.some((e) => e.area === 'game' && e.section === s.id), s.id).toBe(true);
    for (const id of SUGGESTED) expect(settingById(id), id).toBeDefined();
  });

  it('jede Einstellung hat auf ihrer Seite ein Sprungziel', () => {
    const root = join(import.meta.dirname, '..');
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const f of readdirSync(dir)) {
        const p = join(dir, f);
        if (statSync(p).isDirectory()) walk(p);
        else if (p.endsWith('.tsx')) files.push(p);
      }
    };
    walk(root);
    const source = files.map((f) => readFileSync(f, 'utf8')).join('\n');
    const anchors = new Set([...source.matchAll(/(?:data-setting|\bid)="([gbo]\.[A-Za-z]+)"/g)].map((m) => m[1]));
    // Seiten (Bereich „page“) sind selbst das Ziel
    const missing = SETTINGS.filter((e) => e.area !== 'page' && !anchors.has(e.id)).map((e) => e.id);
    expect(missing).toEqual([]);
  });
});
