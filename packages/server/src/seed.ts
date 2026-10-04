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

export function seedIfEmpty(database: db.DB, log: (msg: string) => void) {
  if (db.listCollections(database).length > 0 || db.listTemplates(database).length > 0) return;

  const starter = importCollections(database, loadSeed('starter-content.json'));
  const legacy = importCollections(database, loadSeed('legacy-content.json'));
  log(`Erster Start: ${starter.items + legacy.items} Inhalte in ${starter.collections + legacy.collections} Sammlungen angelegt`);

  const all = db.listCollections(database);
  const byName = (prefix: string) => all.filter((c) => c.name.startsWith(prefix)).map((c) => c.id);
  const field = all.filter((c) => c.name.startsWith('Feld-Minispiele')).map((c) => c.id);
  const now = Date.now();

  const templates = [
    {
      name: 'Standard (72 Felder)',
      description: 'Ein ganzer Spieleabend mit allen Beispiel-Inhalten.',
      config: { ...defaultConfig('Standard', 72), collectionIds: [...byName('Quiz-Mix'), ...byName('Partyspiele'), ...field] },
    },
    {
      name: 'Kurzes Spiel (40 Felder)',
      description: 'Für 45–60 Minuten.',
      config: { ...defaultConfig('Kurzes Spiel', 40), collectionIds: [...byName('Quiz-Mix'), ...byName('Partyspiele'), ...field] },
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
