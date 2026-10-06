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
  /** Kopplungscode, den ein noch nicht freigegebener Beamer anzeigt */
  pairCode: () => string | null;
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
    let pairCode: string | null = null;
    socket.on('beamer:pair', (p: { code: string }) => (pairCode = p.code));
    socket.on('beamer:token', (t: string) => socket.emit('auth', t));
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
      pairCode: () => pairCode,
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

  it('Passwortregeln: schwache oder bekannte Passwörter erkennen; sicheres Passwort geht auch übers Internet', async () => {
    const { isWeakPassword } = await import('./config.ts');
    expect(isWeakPassword('kurz')).toBe(true);
    expect(isWeakPassword('bitte-aendern')).toBe(true);
    expect(isWeakPassword('Geheim-Lagerfeuer-42')).toBe(false);
    const res = await fetch(`${base}/api/auth/admin`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'cf-connecting-ip': '203.0.113.7' },
      body: JSON.stringify({ password: 'test-passwort' }),
    });
    expect(res.status).toBe(200);
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
    // Ein unbekannter Beamer ist Gast (keine Fotos, kein Verlauf), bis die Regie ihn freigibt
    expect(beamer.session()?.role).toBe('guest');
    await new Promise((r) => setTimeout(r, 50));
    const code = beamer.pairCode();
    expect(code).toMatch(/^\d{4}$/);
    const wrong = await new Promise<{ ok: boolean }>((res) => beamer.socket.emit('beamer:pair', code, res));
    expect(wrong.ok).toBe(false); // ein Beamer kann sich nicht selbst freigeben
    const paired = await new Promise<{ ok: boolean }>((res) => regie.socket.emit('beamer:pair', code, res));
    expect(paired.ok).toBe(true);
    for (let i = 0; i < 40 && beamer.session()?.role !== 'beamer'; i++) await new Promise((r) => setTimeout(r, 25));
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

    // Zufallswürfe können auf einem Minispiel-Feld oder an einer Mutprobe (Liane, Wasserfall,
    // Lavahöhle) landen – das erledigt die Regie hier
    const settle = async () => {
      for (let i = 0; i < 12; i++) {
        const st = regie.state();
        if (!st || st.phase.name !== 'dice') return;
        const d = st.phase.dice;
        if (d.fieldGame) {
          expect((await regie.cmd({ type: 'fieldgame.cancel' })).ok).toBe(true);
        } else if (d.challenge) {
          const c = d.challenge;
          const res =
            c.kind === 'river'
              ? await regie.cmd({ type: 'challenge.choose', choice: 'barrels', result: 'safe', force: true })
              : await regie.cmd({ type: 'challenge.roll', force: true, value: c.kind === 'cave' ? 6 : 1 });
          expect(res.ok).toBe(true);
        } else return;
        await new Promise((r) => setTimeout(r, 30));
      }
    };
    await regie.waitFor((s) => s.phase.name === 'dice');
    const afterRoll = regie.state()!;
    const hadExtra = afterRoll.phase.name === 'dice' && (!!afterRoll.phase.dice.challenge || !!afterRoll.phase.dice.fieldGame);
    await settle();

    // Animation läuft → zweites Team muss warten, Regie kann erzwingen
    // (nach erledigter Mutprobe kann die Animation schon vorbei sein)
    const early = await teamB.cmd({ type: 'dice.roll' });
    if (!hadExtra) expect(early.error).toMatch(/Animation/);
    if (!early.ok) expect((await regie.cmd({ type: 'dice.roll', force: true, main: 2 })).ok).toBe(true);
    await new Promise((r) => setTimeout(r, 30));
    await settle();
    await regie.waitFor((s) => s.phase.name === 'round_end');

    // Rückgängig
    const undo = await new Promise<{ ok: boolean; meta?: { label: string } }>((res) => regie.socket.emit('undo', res));
    expect(undo.ok).toBe(true);
    await regie.waitFor((s) => s.phase.name === 'dice');
    expect(await new Promise((res) => anna.socket.emit('undo', res))).toMatchObject({ ok: false });
  });

  it('schließt die im Review gefundenen Lücken', async () => {
    const admin = (await api<{ token: string }>('/api/auth/admin', { body: { password: 'test-passwort' } })).data.token;
    const { data: tpl } = await api<{ templates: { id: string; name: string }[] }>('/api/templates', { token: admin });
    await api('/api/games', { token: admin, body: { name: 'Review', templateId: tpl.templates[0]!.id } });
    const regie = await client(admin);
    const a = (await api<{ token: string }>('/api/auth/register', { body: { name: 'Ada' } })).data.token;
    const b = await api<{ token: string; playerId: string }>('/api/auth/register', { body: { name: 'Bob' } });
    // 1) Ohne Team keine fremde Identität übernehmen
    expect((await api('/api/auth/become-player', { token: a, body: { playerId: b.data.playerId } })).status).toBe(404);

    // 6) Neue PIN sperrt alte Team-Geräte aus
    await regie.cmd({ type: 'teams.auto', count: 2 });
    const team = (await regie.waitFor((s) => s.teams.length === 2)).teams[0]!;
    const joined = (await api<{ token: string }>('/api/auth/pin', { body: { pin: team.pin } })).data.token;
    const device = await client(joined);
    expect(device.session()?.role).toBe('team');
    await regie.cmd({ type: 'team.regeneratePin', teamId: team.id });
    const me = await api<{ session: { role: string } }>('/api/auth/me', { token: joined });
    expect(me.data.session.role).toBe('guest');

    // 4) Abgelaufener Countdown blockiert Rückgängig nicht
    await regie.cmd({ type: 'game.start' });
    const { data: lib } = await api<{ items: { id: string; kind: string }[] }>('/api/library/items', { token: admin });
    await regie.cmd({ type: 'content.select', source: 'manual', itemId: lib.items.find((i) => i.kind === 'choice')!.id });
    await regie.cmd({ type: 'timer.start', seconds: 5 });
    await regie.cmd({ type: 'content.open' });
    await regie.cmd({ type: 'timer.add', seconds: -5 });
    await regie.waitFor((s) => s.phase.name === 'content' && s.phase.content.stage === 'closed');
    const undo = await new Promise<{ ok: boolean; meta?: { label: string } }>((res) => regie.socket.emit('undo', res));
    expect(undo.meta?.label).not.toBe('Antworten geschlossen');

    // 5) Manipulierte Spiel-IDs werden abgewiesen
    expect((await api('/api/games/..%2F..', { method: 'DELETE', token: admin })).status).toBe(400);
  });

  it('Neue PIN macht auch gebundene Spieler-Tokens (become-player) ungültig', async () => {
    const admin = (await api<{ token: string }>('/api/auth/admin', { body: { password: 'test-passwort' } })).data.token;
    const { data: tpl } = await api<{ templates: { id: string }[] }>('/api/templates', { token: admin });
    await api('/api/games', { token: admin, body: { name: 'Bindung', templateId: tpl.templates[0]!.id } });
    const regie = await client(admin);
    const p = await api<{ playerId: string }>('/api/auth/register', { body: { name: 'Cara' } });
    await api('/api/auth/register', { body: { name: 'Dani' } });
    await regie.cmd({ type: 'teams.auto', count: 2 });
    const state = await regie.waitFor((s) => s.teams.length === 2);
    const team = state.teams.find((t) => state.players.find((pl) => pl.id === p.data.playerId)?.teamId === t.id)!;
    const teamTok = (await api<{ token: string }>('/api/auth/pin', { body: { pin: team.pin } })).data.token;
    // Team-Gerät wird zu Spieler Cara → gebundener Spieler-Token
    const playerTok = (await api<{ token: string }>('/api/auth/become-player', { token: teamTok, body: { playerId: p.data.playerId } })).data.token;
    expect((await api<{ session: { role: string } }>('/api/auth/me', { token: playerTok })).data.session.role).toBe('player');
    // Neue PIN → der gebundene Spieler-Token gilt nicht mehr
    await regie.cmd({ type: 'team.regeneratePin', teamId: team.id });
    expect((await api<{ session: { role: string } }>('/api/auth/me', { token: playerTok })).data.session.role).toBe('guest');
  });

  it('globale Anmeldebremse zählt Fehlversuche, nicht korrekte Logins', async () => {
    const { globalAttemptsExhausted, spendAttempt } = await import('./auth.ts');
    const scope = `test-${Math.random()}`;
    expect(globalAttemptsExhausted(scope, 25)).toBe(false);
    for (let i = 0; i < 25; i++) spendAttempt(scope, 25);
    // nach 25 Fehlversuchen ist der Eimer leer → gebremst
    expect(globalAttemptsExhausted(scope, 25)).toBe(true);
    // ein anderer Anlass ist davon unberührt (ein korrekter Login „kostet“ nie)
    expect(globalAttemptsExhausted(`${scope}-korrekt`, 25)).toBe(false);
  });

  it('„Audio erstellen“: Wunsch, Liste, Aufnahme hochladen, bei geänderter Frage neu anfordern', async () => {
    const admin = (await api<{ token: string }>('/api/auth/admin', { body: { password: 'test-passwort' } })).data.token;
    const { data: lib } = await api<{ collections: { id: string }[] }>('/api/library', { token: admin });
    const cid = lib.collections[0]!.id;
    const created = await api<{ id: string; audioRequest: boolean }>(`/api/library/collections/${cid}/items`, {
      token: admin,
      body: { kind: 'choice', title: 'Audiotest', question: 'Welche Farbe hat der Himmel?', options: ['Blau', 'Grün'], correctIndex: 0, audioRequest: true },
    });
    expect(created.data.audioRequest).toBe(true);
    const id = created.data.id;
    const list = await api<{ items: { id: string; text: string }[] }>('/api/library/audio-requests', { token: admin });
    expect(list.data.items.find((i) => i.id === id)?.text).toBe('Welche Farbe hat der Himmel? A: Blau. B: Grün.');
    // nur Admin; keine Fremdformate
    expect((await api('/api/library/audio-requests')).status).toBe(401);
    const upload = async (bytes: Uint8Array) => {
      const form = new FormData();
      form.append('file', new Blob([bytes]), 'frage.mp3');
      const res = await fetch(`${base}/api/library/items/${id}/audio`, { method: 'POST', body: form, headers: { authorization: `Bearer ${admin}` } });
      return { status: res.status, data: (await res.json()) as { audioUrl?: string; audioRequest?: boolean } };
    };
    expect((await upload(new TextEncoder().encode('<svg>kein Audio</svg>'))).status).toBe(400);
    const mp3 = new Uint8Array(64);
    mp3.set([0x49, 0x44, 0x33]); // „ID3“
    const up = await upload(mp3);
    expect(up.status).toBe(200);
    expect(up.data.audioUrl).toMatch(/^\/media\/audio\/[a-z0-9]+-[0-9a-f]+\.mp3$/);
    expect(up.data.audioRequest).toBe(false);
    expect((await fetch(base + up.data.audioUrl!)).status).toBe(200);
    expect((await api<{ items: { id: string }[] }>('/api/library/audio-requests', { token: admin })).data.items.some((i) => i.id === id)).toBe(false);
    // gleicher Text → Aufnahme bleibt; geänderte Frage → neu angefordert, alte Datei weg
    const keep = await api<{ audioUrl: string | null }>(`/api/library/items/${id}`, {
      method: 'PUT',
      token: admin,
      body: { kind: 'choice', title: 'Audiotest neu', question: 'Welche Farbe hat der Himmel?', options: ['Blau', 'Grün'], correctIndex: 0, audioRequest: true },
    });
    expect(keep.data.audioUrl).toBe(up.data.audioUrl);
    const changed = await api<{ audioUrl: string | null; audioRequest: boolean }>(`/api/library/items/${id}`, {
      method: 'PUT',
      token: admin,
      body: { kind: 'choice', title: 'Audiotest neu', question: 'Welche Farbe hat das Meer?', options: ['Blau', 'Grün'], correctIndex: 0, audioRequest: true },
    });
    expect(changed.data.audioUrl).toBeNull();
    expect(changed.data.audioRequest).toBe(true);
    expect((await fetch(base + up.data.audioUrl!)).status).toBe(404);
  });

  it('liefert Systeminfos mit Beitrittsadressen', async () => {
    const { data } = await api<{ appName: string; joinUrls: unknown[] }>('/api/system/info');
    expect(data.appName).toBe('Insel der Abenteuer');
    expect(Array.isArray(data.joinUrls)).toBe(true);
  });
});
