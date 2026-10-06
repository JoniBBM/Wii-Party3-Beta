/**
 * Sprachaufnahmen der Fragen („Audio erstellen“ in der Regie) verwalten – über die Schnittstelle
 * des laufenden Servers, angemeldet mit ADMIN_PASSWORD aus der Umgebung bzw. der .env.
 *
 *   npm run audio -- list                      offene Wünsche (ID, Sammlung, Vorlesetext)
 *   npm run audio -- list --json               dasselbe als JSON
 *   npm run audio -- attach <id> <datei.mp3>   Aufnahme an die Frage hängen
 *   npm run audio -- remove <id>               Aufnahme entfernen
 *
 * Adresse: --url http://… oder INSEL_URL, sonst http://localhost:<HOST_PORT aus .env, Standard 9534>.
 */
import { existsSync, readFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');

function dotEnv(): Record<string, string> {
  const file = join(ROOT, '.env');
  const out: Record<string, string> = {};
  if (!existsSync(file)) return out;
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (!m || line.trim().startsWith('#')) continue;
    out[m[1]!] = m[2]!.replace(/^(["'])(.*)\1$/, '$2');
  }
  return out;
}

const args = process.argv.slice(2);
const flag = (name: string) => {
  const i = args.indexOf(name);
  if (i < 0) return undefined;
  const v = args[i + 1];
  args.splice(i, 2);
  return v;
};
const env = { ...dotEnv(), ...process.env };
const base = (flag('--url') ?? env.INSEL_URL ?? `http://localhost:${env.HOST_PORT || '9534'}`).replace(/\/$/, '');
const json = args.includes('--json');
const [cmd, ...rest] = args.filter((a) => a !== '--json');

async function call<T>(path: string, init: RequestInit & { token?: string } = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.token) headers.set('authorization', `Bearer ${init.token}`);
  const res = await fetch(base + path, { ...init, headers });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(`${path}: ${res.status} ${data.error ?? ''}`.trim());
  return data;
}

async function login(): Promise<string> {
  const password = env.ADMIN_PASSWORD ?? '';
  const r = await call<{ token: string }>('/api/auth/admin', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password }) });
  return r.token;
}

async function main() {
  if (cmd === 'list') {
    const token = await login();
    const { items } = await call<{ items: { id: string; title: string; kind: string; collection: string; text: string }[] }>('/api/library/audio-requests', { token });
    if (json) return console.log(JSON.stringify(items, null, 2));
    if (!items.length) return console.log('Keine offenen Wünsche.');
    for (const i of items) console.log(`${i.id}  [${i.collection}] ${i.title}\n    „${i.text}“ (${i.text.length} Zeichen)`);
    console.log(`\n${items.length} Frage(n), zusammen ${items.reduce((n, i) => n + i.text.length, 0)} Zeichen.`);
    return;
  }
  if (cmd === 'attach') {
    const [id, file] = rest;
    if (!id || !file || !existsSync(file)) throw new Error('Aufruf: attach <id> <datei.mp3>');
    const token = await login();
    const form = new FormData();
    form.append('file', new Blob([readFileSync(file)]), basename(file));
    const item = await call<{ title: string; audioUrl: string }>(`/api/library/items/${encodeURIComponent(id)}/audio`, { method: 'POST', body: form, token });
    console.log(`✅ ${item.title} → ${item.audioUrl}`);
    return;
  }
  if (cmd === 'remove') {
    const [id] = rest;
    if (!id) throw new Error('Aufruf: remove <id>');
    const token = await login();
    const item = await call<{ title: string }>(`/api/library/items/${encodeURIComponent(id)}/audio`, { method: 'DELETE', token });
    console.log(`🗑️  ${item.title}: Aufnahme entfernt`);
    return;
  }
  console.log('Aufruf: npm run audio -- list [--json] | attach <id> <datei.mp3> | remove <id>   [--url http://…]');
}

main().catch((e: unknown) => {
  console.error(`❌ ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});
