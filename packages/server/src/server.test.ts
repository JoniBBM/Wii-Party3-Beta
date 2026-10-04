/**
 * Integrationstest: echter Server, echte WebSockets. Spielt einen kompletten Ablauf durch
 * (Anmeldung → Teams → Frage → Ergebnis → Würfeln → Rückgängig) und prüft die Rollensichten.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { io as connect, type Socket } from 'socket.io-client';
import type { Effect, GameState, Session } from '@insel/shared';

const dir = mkdtempSync(join(tmpdir(), 'insel-test-'));
process.env.DATA_DIR = dir;
process.env.ADMIN_PASSWORD = 'test-passwort';
process.env.AUTH_DISABLED = 'false';
process.env.WEB_DIST = join(dir, 'kein-web');

type Server = Awaited<ReturnType<typeof import('./main.ts').startServer>>;
let server: Server;
let base = '';
const sockets: Socket[] = [];

interface Client {
  socket: Socket;
  state: () => GameState | null;
  session: () => Session | null;
  effects: Effect[];
  waitFor: (pred: (s: GameState) => boolean) => Promise<GameState>;
  cmd: (c: Record<string, unknown>) => Promise<{ ok: boolean; error?: string; meta?: Record<string, unknown> }>;
}

async function api<T = Record<string, unknown>>(path: string, opts: { method?: string; body?: unknown; token?: string } = {}) {
  const res = await fetch(base + path, {
    method: opts.method ?? (opts.body ? 'POST' : 'GET'),
    headers: {
      ...(opts.body ? { 'content-type': 'application/json' } : {}),
      ...(opts.token ? { authorization: `Bearer ${opts.token}` } : {}),
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const data = (await res.json()) as T & { error?: string };
  return { status: res.status, data };
}

function client(token: string | null, view = 'guest'): Promise<Client> {
  return new Promise((resolve) => {
    let state: GameState | null = null;
    let session: Session | null = null;
    const waiters: { pred: (s: GameState) => boolean; resolve: (s: GameState) => void }[] = [];
    const effects: Effect[] = [];
    const socket = connect(base, { auth: { token, view }, transports: ['websocket'], forceNew: true });
    sockets.push(socket);
    socket.on('effects', (list: Effect[]) => effects.push(...list));
    let ready = false;
    socket.on('state', (payload: { state: GameState | null; session: Session }) => {
      state = payload.state;
      session = payload.session;
      for (const w of [...waiters]) {
        if (state && w.pred(state)) {
          waiters.splice(waiters.indexOf(w), 1);
          w.resolve(state);
        }
      }
      if (!ready) {
        ready = true;
        resolve(c);
      }
    });
    const c: Client = {
      socket,
      state: () => state,
      session: () => session,
      effects,
      waitFor: (pred) =>
        new Promise((res, rej) => {
          if (state && pred(state)) return res(state);
          const t = setTimeout(() => rej(new Error('Timeout beim Warten auf Zustand')), 3000);
          waiters.push({ pred, resolve: (s) => (clearTimeout(t), res(s)) });
        }),
      cmd: (cmd) => new Promise((res) => socket.emit('cmd', cmd, res)),
    };
  });
}

beforeAll(async () => {
  const { startServer } = await import('./main.ts');
  server = await startServer({ port: 0, quiet: true });
  base = `http://127.0.0.1:${server.port}`;
});

afterAll(async () => {
  for (const s of sockets) s.close();
  await server?.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('Server', () => {
  it('lehnt Regie-Zugriffe ohne Login ab', async () => {
    expect((await api('/api/library')).status).toBe(401);
    expect((await api('/api/auth/admin', { body: { password: 'falsch' } })).status).toBe(401);
  });

  it('spielt einen kompletten Ablauf über WebSockets', async () => {
    const login = await api<{ token: string }>('/api/auth/admin', { body: { password: 'test-passwort' } });
    expect(login.status).toBe(200);
    const admin = login.data.token;

    const { data: lib } = await api<{ collections: { id: string; name: string }[] }>('/api/library', { token: admin });
    expect(lib.collections.length).toBeGreaterThan(2);
    const { data: tpl } = await api<{ templates: { id: string; name: string }[] }>('/api/templates', { token: admin });
    const standard = tpl.templates.find((t) => t.name.startsWith('Standard'))!;
    const created = await api<{ id: string }>('/api/games', { token: admin, body: { name: 'Testabend', templateId: standard.id } });
    expect(created.status).toBe(200);

    const regie = await client(admin);
    const beamer = await client(null, 'beamer');
    expect(regie.session()?.role).toBe('admin');
    expect(beamer.session()?.role).toBe('beamer');
    expect(regie.state()?.status).toBe('lobby');

    // Vier Spieler melden sich an
    const players: { token: string }[] = [];
    for (const name of ['Anna', 'Ben', 'Cem', 'Dana']) {
      const r = await api<{ token: string }>('/api/auth/register', { body: { name } });
      expect(r.status).toBe(200);
      players.push(r.data);
    }
    expect((await api('/api/auth/register', { body: { name: 'anna' } })).status).toBe(400);

    const anna = await client(players[0]!.token);
    expect(anna.session()?.role).toBe('player');

    expect((await regie.cmd({ type: 'teams.auto', count: 2 })).ok).toBe(true);
    const s1 = await anna.waitFor((s) => s.teams.length === 2);
    const annaTeam = s1.players.find((p) => p.name === 'Anna')!.teamId!;
    // Anna sieht nur die PIN ihres eigenen Teams
    expect(s1.teams.find((t) => t.id === annaTeam)!.pin).toMatch(/^\d{4}$/);
    expect(s1.teams.filter((t) => t.id !== annaTeam).every((t) => t.pin === '')).toBe(true);

    // Team-Gerät tritt per PIN bei
    const pin = regie.state()!.teams.find((t) => t.id !== annaTeam)!.pin;
    const join = await api<{ token: string }>('/api/auth/pin', { body: { pin } });
    expect(join.status).toBe(200);
    const teamB = await client(join.data.token);
    expect(teamB.session()?.role).toBe('team');

    // Teams dürfen nicht steuern
    expect((await anna.cmd({ type: 'game.start' })).error).toMatch(/Berechtigung/);
    expect((await regie.cmd({ type: 'game.start' })).ok).toBe(true);

    // Auswahlfrage
    const items = (await api<{ items: { id: string; kind: string; title: string }[] }>('/api/library/items', { token: admin })).data.items;
    const q = items.find((i) => i.kind === 'choice' && i.title === 'Krabbeltier')!;
    expect((await regie.cmd({ type: 'content.select', source: 'manual', itemId: q.id })).ok).toBe(true);
    expect((await regie.cmd({ type: 'content.open' })).ok).toBe(true);

    const bs = await beamer.waitFor((s) => s.phase.name === 'content' && s.phase.content.stage === 'open');
    if (bs.phase.name !== 'content' || bs.phase.content.item.kind !== 'choice') throw new Error('phase');
    expect(bs.phase.content.item.correctIndex).toBe(-1); // Beamer kennt die Lösung nicht

    expect((await anna.cmd({ type: 'answer.submit', value: 1 })).ok).toBe(true);
    expect((await teamB.cmd({ type: 'answer.submit', value: 0 })).ok).toBe(true);
    await regie.waitFor((s) => s.phase.name === 'content' && s.phase.content.stage === 'closed');
    expect((await regie.cmd({ type: 'content.reveal' })).ok).toBe(true);
    const revealed = await beamer.waitFor((s) => s.phase.name === 'content' && s.phase.content.stage === 'revealed');
    if (revealed.phase.name !== 'content' || revealed.phase.content.item.kind !== 'choice') throw new Error('phase');
    expect(revealed.phase.content.item.correctIndex).toBe(1);

    expect((await regie.cmd({ type: 'content.finish' })).ok).toBe(true);
    expect((await regie.cmd({ type: 'results.confirm' })).ok).toBe(true);
    const dice = await anna.waitFor((s) => s.phase.name === 'dice');
    if (dice.phase.name !== 'dice') throw new Error('phase');
    expect(dice.phase.dice.order[0]).toBe(annaTeam); // richtig geantwortet → zuerst

    // Falsches Team darf nicht würfeln, richtiges schon
    expect((await teamB.cmd({ type: 'dice.roll' })).ok).toBe(false);
    const roll = await anna.cmd({ type: 'dice.roll' });
    expect(roll.ok).toBe(true);
    await beamer.waitFor((s) => s.teams.find((t) => t.id === annaTeam)!.position > 0);
    expect(beamer.effects.some((e) => e.type === 'dice' && e.teamId === annaTeam)).toBe(true);

    // Animation läuft → zweites Team muss warten, Regie kann erzwingen
    expect((await teamB.cmd({ type: 'dice.roll' })).error).toMatch(/Animation/);
    expect((await regie.cmd({ type: 'dice.roll', force: true, main: 2 })).ok).toBe(true);
    await regie.waitFor((s) => s.phase.name === 'round_end');

    // Rückgängig
    const undo = await new Promise<{ ok: boolean; meta?: { label: string } }>((res) => regie.socket.emit('undo', res));
    expect(undo.ok).toBe(true);
    await regie.waitFor((s) => s.phase.name === 'dice');
    expect(await new Promise((res) => anna.socket.emit('undo', res))).toMatchObject({ ok: false });
  });

  it('liefert Systeminfos mit Beitrittsadressen', async () => {
    const { data } = await api<{ appName: string; joinUrls: unknown[] }>('/api/system/info');
    expect(data.appName).toBe('Insel der Abenteuer');
    expect(Array.isArray(data.joinUrls)).toBe(true);
  });
});
