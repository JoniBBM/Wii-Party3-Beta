/** Erster Start: Beispiel- und Import-Inhalte sowie Standard-Vorlagen anlegen. */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { defaultConfig } from '@insel/shared';
import { newId } from './auth.ts';
import { ROOT } from './config.ts';
import * as db from './db.ts';
import { importCollections, type ExportFile } from './http/library-routes.ts';

const SEED_DIR = join(ROOT, 'packages', 'server', 'seed');

function loadSeed(file: string): ExportFile['collections'] {
  const path = join(SEED_DIR, file);
  if (!existsSync(path)) return [];
  return (JSON.parse(readFileSync(path, 'utf8')) as ExportFile).collections;
}

/**
 * Zusatzpakete: neue Sammlungen, die auch bestehende Installationen genau einmal bekommen
 * (gemerkt in den Einstellungen – wer ein Paket löscht, bekommt es nicht wieder).
 */
const EXTRAS = [{ id: 'wissensmix-100', file: 'wissensmix-100.json' }];
const EXTRAS_KEY = 'seedExtras';

export function seedExtras(database: db.DB, log: (msg: string) => void) {
  const row = database.prepare('SELECT value FROM settings WHERE key = ?').get(EXTRAS_KEY) as { value: string } | undefined;
  let done: string[] = [];
  try {
    done = row ? (JSON.parse(row.value) as string[]) : [];
  } catch {
    done = [];
  }
  let changed = false;
  for (const e of EXTRAS) {
    if (done.includes(e.id)) continue;
    const r = importCollections(database, loadSeed(e.file));
    if (r.items) log(`Neue Inhalte: ${r.items} Fragen in ${r.collections} Sammlungen („${e.id}“)`);
    done.push(e.id);
    changed = true;
  }
  if (changed) database.prepare('INSERT INTO settings(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(EXTRAS_KEY, JSON.stringify(done));
}

export function seedIfEmpty(database: db.DB, log: (msg: string) => void) {
  if (db.listCollections(database).length > 0 || db.listTemplates(database).length > 0) return;

  const starter = importCollections(database, loadSeed('starter-content.json'));
  const legacy = importCollections(database, loadSeed('legacy-content.json'));
  log(`Erster Start: ${starter.items + legacy.items} Inhalte in ${starter.collections + legacy.collections} Sammlungen angelegt`);
  seedExtras(database, log);

  const all = db.listCollections(database);
  const byName = (prefix: string) => all.filter((c) => c.name.startsWith(prefix)).map((c) => c.id);
  const field = all.filter((c) => c.name.startsWith('Feld-Minispiele')).map((c) => c.id);
  const now = Date.now();

  const templates = [
    {
      name: 'Standard (72 Felder)',
      description: 'Ein ganzer Spieleabend mit allen Beispiel-Inhalten.',
      config: { ...defaultConfig('Standard', 72), collectionIds: [...byName('Quiz-Mix'), ...byName('Wissensmix'), ...byName('Partyspiele'), ...field] },
    },
    {
      name: 'Kurzes Spiel (40 Felder)',
      description: 'Für 45–60 Minuten.',
      config: { ...defaultConfig('Kurzes Spiel', 40), collectionIds: [...byName('Quiz-Mix'), ...byName('Wissensmix'), ...byName('Partyspiele'), ...field] },
    },
    {
      name: 'Teenie 2025',
      description: 'Inhalte der Teenie-Freizeit 2025 aus der alten Version.',
      config: { ...defaultConfig('Teenie 2025', 72), collectionIds: [...byName('Teenie 2025'), ...field] },
    },
  ];
  for (const t of templates) {
    db.upsertTemplate(database, { id: newId(), ...t, createdAt: now, updatedAt: now });
  }
}
