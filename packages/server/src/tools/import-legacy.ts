/**
 * Liest die Inhalte der alten Flask-Version (legacy/) und schreibt sie als Seed-Datei
 * (seed/legacy-content.json). Beim ersten Start mit leerer Datenbank wird sie importiert.
 *
 *   npm run import:legacy
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ContentItemInput } from '@insel/shared';
import { ROOT } from '../config.ts';
import { convertLegacyFieldGame, convertLegacyFolder, type LegacyFolder } from '../legacy.ts';

const legacy = join(ROOT, 'legacy', 'app', 'static');
const out = join(ROOT, 'packages', 'server', 'seed', 'legacy-content.json');

const collections: { name: string; description: string; items: ContentItemInput[] }[] = [];

const folders = join(legacy, 'minigame_folders');
if (existsSync(folders)) {
  for (const dir of readdirSync(folders)) {
    const file = join(folders, dir, 'minigames.json');
    if (!existsSync(file)) continue;
    const c = convertLegacyFolder(JSON.parse(readFileSync(file, 'utf8')) as LegacyFolder);
    c.name = `${c.name} (Import)`;
    collections.push(c);
  }
}

const field: ContentItemInput[] = [];
for (const [dir, mode] of [['team_vs_all', 'vs_all'], ['team_vs_team', 'duel']] as const) {
  const path = join(legacy, 'field_minigames', dir);
  if (!existsSync(path)) continue;
  for (const f of readdirSync(path).filter((x) => x.endsWith('.json'))) {
    const item = convertLegacyFieldGame(JSON.parse(readFileSync(join(path, f), 'utf8')), mode);
    if (item) field.push(item);
  }
}
if (field.length) collections.push({ name: 'Feld-Minispiele (Import)', description: 'Aus der alten Version übernommen', items: field });

writeFileSync(
  out,
  JSON.stringify({ format: 'insel-inhalte', version: 1, exportedAt: new Date().toISOString(), collections }, null, 2) + '\n',
);
console.log(`${collections.length} Sammlungen, ${collections.reduce((n, c) => n + c.items.length, 0)} Inhalte → ${out}`);
