/**
 * Integrationstest: echter Server, echte WebSockets. Spielt einen kompletten Ablauf durch
 * (Anmeldung → Teams → Frage → Ergebnis → Würfeln → Rückgängig) und prüft die Rollensichten.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { io as connect, type Socket } from 'socket.io-client';
import { buildBoard, type Effect, type GameState, type Session } from '@insel/shared';

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

/** Neues Spiel anlegen – ein laufendes eigenes Spiel vorher schließen (sonst lehnt der Server ab) */
async function freshGame(token: string, body: Record<string, unknown>) {
  const cur = (await api<{ currentGameId: string | null }>('/api/games', { token })).data.currentGameId;
  if (cur) await api(`/api/games/${cur}/close`, { token, body: {} });
  return api<{ id: string; code: string }>('/api/games', { token, body });
}

function client(token: string | null, view = 'guest', code?: string): Promise<Client> {
  return new Promise((resolve) => {
    let state: GameState | null = null;
    let session: Session | null = null;
    const waiters: { pred: (s: GameState) => boolean; resolve: (s: GameState) => void }[] = [];
    const effects: Effect[] = [];
    const socket = connect(base, { auth: { token, view, code }, transports: ['websocket'], forceNew: true });
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
    const created = await api<{ id: string; code: string }>('/api/games', { token: admin, body: { name: 'Testabend', templateId: standard.id } });
    expect(created.status).toBe(200);
    expect(created.data.code).toMatch(/^[A-Z2-9]{4}$/);
    const code = created.data.code;

    const regie = await client(admin);
    const beamer = await client(null, 'beamer');
    expect(regie.session()?.role).toBe('admin');
    // Ein unbekannter Beamer ist Gast (keine Fotos, kein Verlauf), bis die Regie ihn freigibt
    expect(beamer.session()?.role).toBe('guest');
    await new Promise((r) => setTimeout(r, 50));
    const pairCode = beamer.pairCode();
    expect(pairCode).toMatch(/^\d{6}$/);
    const wrong = await new Promise<{ ok: boolean }>((res) => beamer.socket.emit('beamer:pair', pairCode, res));
    expect(wrong.ok).toBe(false); // ein Beamer kann sich nicht selbst freigeben
    const paired = await new Promise<{ ok: boolean }>((res) => regie.socket.emit('beamer:pair', pairCode, res));
    expect(paired.ok).toBe(true);
    for (let i = 0; i < 40 && beamer.session()?.role !== 'beamer'; i++) await new Promise((r) => setTimeout(r, 25));
    expect(beamer.session()?.role).toBe('beamer');
    expect(regie.state()?.status).toBe('lobby');

    // Vier Spieler melden sich an
    const players: { token: string }[] = [];
    for (const name of ['Anna', 'Ben', 'Cem', 'Dana']) {
      const r = await api<{ token: string }>('/api/auth/register', { body: { name, code } });
      expect(r.status).toBe(200);
      players.push(r.data);
    }
    expect((await api('/api/auth/register', { body: { name: 'anna', code } })).status).toBe(400);
    // ohne gültigen Spielcode kein Beitritt
    expect((await api('/api/auth/register', { body: { name: 'Eve' } })).status).toBe(404);
    expect((await api('/api/auth/register', { body: { name: 'Eve', code: 'ZZZZ' } })).status).toBe(404);

    const anna = await client(players[0]!.token);
    expect(anna.session()?.role).toBe('player');

    expect((await regie.cmd({ type: 'teams.auto', count: 2 })).ok).toBe(true);
    const s1 = await anna.waitFor((s) => s.teams.length === 2);
    const annaTeam = s1.players.find((p) => p.name === 'Anna')!.teamId!;
    // Anna sieht nur die PIN ihres eigenen Teams
    expect(s1.teams.find((t) => t.id === annaTeam)!.pin).toMatch(/^\d{6}$/);
    expect(s1.teams.filter((t) => t.id !== annaTeam).every((t) => t.pin === '')).toBe(true);

    // Team-Gerät tritt per PIN bei
    const pin = regie.state()!.teams.find((t) => t.id !== annaTeam)!.pin;
    expect((await api('/api/auth/pin', { body: { pin } })).status).toBe(400); // Spielcode fehlt
    const join = await api<{ token: string }>('/api/auth/pin', { body: { pin, code } });
    expect(join.status).toBe(200);
    const teamB = await client(join.data.token);
    expect(teamB.session()?.role).toBe('team');

    // Teams dürfen nicht steuern
    expect((await anna.cmd({ type: 'game.start' })).error).toMatch(/Berechtigung/);
    expect((await regie.cmd({ type: 'game.start' })).ok).toBe(true);
    // Solange das eigene Spiel läuft, gibt es kein neues
    expect((await api('/api/games', { token: admin, body: { name: 'Zweites' } })).status).toBe(409);

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
    const { code } = (await freshGame(admin, { name: 'Review', templateId: tpl.templates[0]!.id })).data;
    const regie = await client(admin);
    const a = (await api<{ token: string }>('/api/auth/register', { body: { name: 'Ada', code } })).data.token;
    const b = await api<{ token: string; playerId: string }>('/api/auth/register', { body: { name: 'Bob', code } });
    // 1) Ohne Team keine fremde Identität übernehmen
    expect((await api('/api/auth/become-player', { token: a, body: { playerId: b.data.playerId } })).status).toBe(404);

    // 6) Neue PIN sperrt alte Team-Geräte aus
    await regie.cmd({ type: 'teams.auto', count: 2 });
    const team = (await regie.waitFor((s) => s.teams.length === 2)).teams[0]!;
    const joined = (await api<{ token: string }>('/api/auth/pin', { body: { pin: team.pin, code } })).data.token;
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
    const { code } = (await freshGame(admin, { name: 'Bindung', templateId: tpl.templates[0]!.id })).data;
    const regie = await client(admin);
    const p = await api<{ playerId: string }>('/api/auth/register', { body: { name: 'Cara', code } });
    await api('/api/auth/register', { body: { name: 'Dani', code } });
    await regie.cmd({ type: 'teams.auto', count: 2 });
    const state = await regie.waitFor((s) => s.teams.length === 2);
    const team = state.teams.find((t) => state.players.find((pl) => pl.id === p.data.playerId)?.teamId === t.id)!;
    const teamTok = (await api<{ token: string }>('/api/auth/pin', { body: { pin: team.pin, code } })).data.token;
    // Team-Gerät wird zu Spieler Cara → gebundener Spieler-Token
    const playerTok = (await api<{ token: string }>('/api/auth/become-player', { token: teamTok, body: { playerId: p.data.playerId } })).data.token;
    expect((await api<{ session: { role: string } }>('/api/auth/me', { token: playerTok })).data.session.role).toBe('player');
    // Neue PIN → der gebundene Spieler-Token gilt nicht mehr
    await regie.cmd({ type: 'team.regeneratePin', teamId: team.id });
    expect((await api<{ session: { role: string } }>('/api/auth/me', { token: playerTok })).data.session.role).toBe('guest');
  });

  it('Spiel-Tempo: Moderator stellt es ein, Teams und Beamer merken nichts', async () => {
    const admin = (await api<{ token: string }>('/api/auth/admin', { body: { password: 'test-passwort' } })).data.token;
    const { code } = (await freshGame(admin, { name: 'Tempo' })).data;
    const regie = await client(admin);
    const p = await api<{ token: string }>('/api/auth/register', { body: { name: 'Tim', code } });
    await api('/api/auth/register', { body: { name: 'Tara', code } });
    await regie.cmd({ type: 'teams.auto', count: 2 });
    const mod = await client((await api<{ token: string }>('/api/auth/moderator-link', { token: admin, body: {} })).data.token, 'moderator');
    const player = await client(p.data.token);
    expect((await mod.cmd({ type: 'tempo.set', targetMinutes: 35 })).ok).toBe(true);
    expect((await player.cmd({ type: 'tempo.set', targetMinutes: 200 })).ok).toBe(false);
    await regie.waitFor((st) => st.config.targetMinutes === 35);
    await new Promise((r) => setTimeout(r, 100));
    expect(player.state()?.config.targetMinutes).toBeNull();
    expect(player.state()?.tempo).toEqual({ startedAt: null, manual: 0 });
    expect(player.state()?.feed.some((f) => /Tempo|Spieldauer/.test(f.text))).toBe(false);
    // Einstellung ist kein Spielzug: „Rückgängig“ nimmt sie nicht zurück
    const undo = await new Promise<{ ok: boolean }>((res) => regie.socket.emit('undo', res));
    expect(undo.ok).toBe(true);
    await regie.waitFor((st) => st.teams.length === 0); // Teams bilden wurde zurückgenommen …
    expect(regie.state()?.config.targetMinutes).toBe(35); // … die Spieldauer bleibt
  });

  it('Einrichtungs-Assistent: übernimmt alles in einem Schritt, „Rückgängig“ holt die alte Einrichtung komplett zurück', async () => {
    const admin = (await api<{ token: string }>('/api/auth/admin', { body: { password: 'test-passwort' } })).data.token;
    await freshGame(admin, { name: 'Assistent' });
    const regie = await client(admin);
    const before = (await regie.waitFor((s) => s.config.name === 'Assistent')).config;
    const config = {
      ...before,
      targetMinutes: null,
      tempoEnabled: false,
      contentKinds: ['estimate'],
      board: buildBoard(30, 3, { skull: 0, minigame: 2 }),
    };
    expect((await regie.cmd({ type: 'config.update', config })).ok).toBe(true);
    const after = (await regie.waitFor((s) => s.config.tempoEnabled === false)).config;
    expect(after.board.fields).toHaveLength(31);
    expect(after.board.mix).toEqual({ skull: 0, minigame: 2 });
    expect(after.contentKinds).toEqual(['estimate']);
    expect((await new Promise<{ ok: boolean }>((res) => regie.socket.emit('undo', res))).ok).toBe(true);
    const undone = (await regie.waitFor((s) => s.config.tempoEnabled === true)).config;
    expect(undone.board.fields.length).toBe(before.board.fields.length);
    expect(undone.contentKinds).toEqual(before.contentKinds);
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

describe('Spielleiter-Konten und mehrere Spiele', () => {
  const adminToken = async () => (await api<{ token: string }>('/api/auth/admin', { body: { password: 'test-passwort' } })).data.token;
  const tokenFromLink = (link: string) => new URL(link).hash.replace(/^#t=/, '');

  /** Konto anlegen (ohne SMTP: Link kommt zurück), Passwort setzen, einloggen. */
  async function leader(admin: string, email: string, name: string) {
    const inv = await api<{ account: { id: string; status: string }; link: string; mailed: boolean }>('/api/users', { token: admin, body: { email, name } });
    expect(inv.status).toBe(200);
    expect(inv.data.account.status).toBe('invited');
    expect(inv.data.link).toContain('/konto#t=');
    const t = tokenFromLink(inv.data.link);
    expect((await api<{ purpose: string }>('/api/auth/link-info', { body: { token: t } })).data.purpose).toBe('invite');
    expect((await api('/api/auth/set-password', { body: { token: t, password: 'kurz' } })).status).toBe(400);
    const set = await api<{ token: string }>('/api/auth/set-password', { body: { token: t, password: 'Lagerfeuer-und-Sterne-7' } });
    expect(set.status).toBe(200);
    // Link gilt nur einmal
    expect((await api('/api/auth/set-password', { body: { token: t, password: 'Lagerfeuer-und-Sterne-8' } })).status).toBe(400);
    const login = await api<{ token: string }>('/api/auth/login', { body: { email, password: 'Lagerfeuer-und-Sterne-7' } });
    expect(login.status).toBe(200);
    return { id: inv.data.account.id, token: login.data.token };
  }

  it('Admin lädt Spielleiter ein; nur Admins verwalten Konten', async () => {
    const admin = await adminToken();
    const lea = await leader(admin, 'lea@example.org', 'Lea');
    // ohne SMTP: keine Mail, der Admin bekommt den Link zum Weitergeben
    const third = await api<{ mailed: boolean; link: string }>('/api/users', { token: admin, body: { email: 'ohne-mail@example.org', name: 'Ohne Mail' } });
    expect(third.data).toMatchObject({ mailed: false });
    expect(third.data.link).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/konto#t=/);
    expect((await api('/api/users', { token: lea.token })).status).toBe(403);
    expect((await api('/api/users', { token: admin, body: { email: 'LEA@example.org', name: 'Doppelt' } })).status).toBe(409);
    expect((await api('/api/auth/login', { body: { email: 'lea@example.org', password: 'falsches-passwort-123' } })).status).toBe(401);
    const me = await api<{ account: { name: string; isAdmin: boolean } }>('/api/auth/me', { token: lea.token });
    expect(me.data.account).toMatchObject({ name: 'Lea', isAdmin: false });
  });

  it('zwei Spiele laufen getrennt; Spielleiter sehen und steuern nur ihre eigenen', async () => {
    const admin = await adminToken();
    const max = await leader(admin, 'max@example.org', 'Max');
    const tim = await leader(admin, 'tim@example.org', 'Tim');
    const gMax = (await api<{ id: string; code: string }>('/api/games', { token: max.token, body: { name: 'Max-Abend' } })).data;
    const gTim = (await api<{ id: string; code: string }>('/api/games', { token: tim.token, body: { name: 'Tim-Abend' } })).data;
    expect(gMax.code).not.toBe(gTim.code);

    // Liste: Max sieht nur sein Spiel, der Admin alle
    const listMax = (await api<{ games: { id: string }[] }>('/api/games', { token: max.token })).data.games.map((g) => g.id);
    expect(listMax).toEqual([gMax.id]);
    const listAdmin = (await api<{ games: { id: string; ownerName: string }[] }>('/api/games', { token: admin })).data.games;
    expect(listAdmin.find((g) => g.id === gTim.id)?.ownerName).toBe('Tim');

    // Fremdes Spiel: weder wählen noch löschen noch exportieren
    expect((await api(`/api/games/${gTim.id}/select`, { token: max.token, body: {} })).status).toBe(403);
    expect((await api(`/api/games/${gTim.id}`, { method: 'DELETE', token: max.token })).status).toBe(403);
    expect((await api(`/api/games/${gTim.id}/export`, { token: max.token })).status).toBe(403);

    // Regie von Max hängt an seinem Spiel und ist dort „admin“
    const regieMax = await client(max.token);
    expect(regieMax.session()).toMatchObject({ role: 'admin', gameId: gMax.id });
    const regieTim = await client(tim.token);
    expect(regieTim.state()?.id).toBe(gTim.id);

    // Spieler mit Code von Tims Spiel landen nur dort
    const p = await api<{ token: string }>('/api/auth/register', { body: { name: 'Gina', code: gTim.code } });
    expect(p.status).toBe(200);
    await regieTim.waitFor((s) => s.players.some((x) => x.name === 'Gina'));
    await new Promise((r) => setTimeout(r, 100));
    expect(regieMax.state()?.players.some((x) => x.name === 'Gina')).toBe(false);
    // Befehle wirken nur im eigenen Spiel
    expect((await regieMax.cmd({ type: 'teams.auto', count: 2 })).ok).toBe(true);
    await new Promise((r) => setTimeout(r, 100));
    expect(regieTim.state()?.teams.length).toBe(0);

    // Gast mit Spielcode sieht Tims Spiel, ohne Code nichts
    const guest = await client(null, 'join', gTim.code);
    expect(guest.state()?.id).toBe(gTim.id);
    expect(guest.session()?.role).toBe('guest');
    const nobody = await client(null, 'join', 'QQQQ');
    expect(nobody.state()).toBeNull();
    expect((await api('/api/join/check', { body: { code: gTim.code } })).status).toBe(200);
    expect((await api('/api/join/check', { body: { code: 'QQQQ' } })).status).toBe(404);

    // Der Admin darf jedes Spiel wählen
    expect((await api(`/api/games/${gTim.id}/select`, { token: admin, body: {} })).status).toBe(200);

    // Moderator-Link von Tim gilt nur für Tims Spiel
    const mod = (await api<{ token: string }>('/api/auth/moderator-link', { token: tim.token, body: {} })).data.token;
    const moderator = await client(mod, 'moderator');
    expect(moderator.session()).toMatchObject({ role: 'moderator', gameId: gTim.id });

    // Beamer von Tim folgt Tims gewähltem Spiel
    const bt = (await api<{ token: string }>('/api/auth/beamer-link', { token: tim.token, body: {} })).data.token;
    const beamer = await client(bt, 'beamer');
    expect(beamer.state()?.id).toBe(gTim.id);
    const second = (await api<{ id: string }>('/api/games', { token: tim.token, body: { name: 'Tim-Zweitspiel' } })).data;
    await beamer.waitFor((s) => s.id === second.id);

    // Spiel schließen: Gäste verlieren es
    expect((await api(`/api/games/${gTim.id}/close`, { token: tim.token, body: {} })).status).toBe(200);
    for (let i = 0; i < 40 && guest.state() !== null; i++) await new Promise((r) => setTimeout(r, 25));
    expect(guest.state()).toBeNull();
  });

  it('Bibliothek: eigene, veröffentlichte und gemeinsame Sammlungen', async () => {
    const admin = await adminToken();
    const ute = await leader(admin, 'ute@example.org', 'Ute');
    const ole = await leader(admin, 'ole@example.org', 'Ole');
    type Lib = { collections: { id: string; name: string; editable: boolean; published: boolean; ownerName: string }[] };
    const shared = (await api<Lib>('/api/library', { token: ute.token })).data.collections;
    expect(shared.length).toBeGreaterThan(2); // Beispiele des Admins sind gemeinsam
    expect(shared.every((c) => !c.editable && c.published)).toBe(true);
    expect((await api(`/api/library/collections/${shared[0]!.id}`, { method: 'PUT', token: ute.token, body: { name: 'Gekapert', description: '' } })).status).toBe(403);

    // eigene Sammlung: privat, bis sie veröffentlicht wird
    const own = (await api<{ id: string }>('/api/library/collections', { token: ute.token, body: { name: 'Utes Fragen', description: '' } })).data;
    const item = await api<{ id: string }>(`/api/library/collections/${own.id}/items`, {
      token: ute.token,
      body: { kind: 'choice', title: 'Utes Frage', question: 'Wie heißt Ute?', options: ['Ute', 'Ole'], correctIndex: 0 },
    });
    expect(item.status).toBe(200);
    const seen = async (token: string) => (await api<Lib>('/api/library', { token })).data.collections.some((c) => c.id === own.id);
    expect(await seen(ole.token)).toBe(false);
    expect(await seen(admin)).toBe(true);
    expect((await api<{ items: { id: string }[] }>('/api/library/items', { token: ole.token })).data.items.some((i) => i.id === item.data.id)).toBe(false);
    // fremde private Inhalte: „gibt es nicht“ (verrät nicht einmal, dass es sie gibt)
    expect((await api(`/api/library/items/${item.data.id}`, { method: 'DELETE', token: ole.token })).status).toBe(404);

    // veröffentlichen → Ole sieht sie, darf sie aber nicht ändern; als Kopie übernehmen geht
    expect((await api(`/api/library/collections/${own.id}/published`, { method: 'PUT', token: ute.token, body: { published: true } })).status).toBe(200);
    expect(await seen(ole.token)).toBe(true);
    expect((await api(`/api/library/collections/${own.id}/published`, { method: 'PUT', token: ole.token, body: { published: false } })).status).toBe(403);
    expect((await api(`/api/library/items/${item.data.id}`, { method: 'DELETE', token: ole.token })).status).toBe(403);
    const copy = await api<{ id: string; editable: boolean; ownerName: string; itemCount: number }>(`/api/library/collections/${own.id}/copy`, { token: ole.token, body: {} });
    expect(copy.data).toMatchObject({ editable: true, ownerName: 'Ole', itemCount: 1 });

    // Admin pflegt alles
    expect((await api(`/api/library/collections/${own.id}`, { method: 'PUT', token: admin, body: { name: 'Utes Fragen (geprüft)', description: '' } })).status).toBe(200);
  });

  it('Beamer-Einstellungen gehen auch ohne gewähltes Spiel und gelten je Konto', async () => {
    const admin = await adminToken();
    const ida = await leader(admin, 'ida@example.org', 'Ida');
    type Show = { settings: { quality: string; commentary: string } };
    const showCmd = (c: Client, cmd: unknown) => new Promise<{ ok: boolean; error?: string }>((res) => c.socket.emit('show', cmd, res));
    // Ida hat noch kein Spiel – ihr Beamer zeigt die Insel und folgt trotzdem ihren Einstellungen
    const regie = await client(ida.token);
    expect(regie.state()).toBeNull();
    const beamer = await client((await api<{ token: string }>('/api/auth/beamer-link', { token: ida.token, body: {} })).data.token, 'beamer');
    // (Zuweisung im Callback – sonst verengt TypeScript auf null)
    let seen = null as Show | null;
    beamer.socket.on('show', (sh: Show) => (seen = sh));
    const set = await showCmd(regie, { type: 'set', patch: { quality: 'eco', commentary: 'crazy' } });
    expect(set).toMatchObject({ ok: true });
    for (let i = 0; i < 40 && seen?.settings.quality !== 'eco'; i++) await new Promise((r) => setTimeout(r, 25));
    expect(seen!.settings).toMatchObject({ quality: 'eco', commentary: 'crazy' });
    // Testton und Erklärung gehen ebenfalls ohne Spiel
    expect(await showCmd(regie, { type: 'test', what: 'sound' })).toMatchObject({ ok: true });
    expect(await showCmd(regie, { type: 'explain', action: 'start' })).toMatchObject({ ok: true });

    // Idas Einstellungen gelten auch für ihr neues Spiel – und ändern die des Admins nicht
    await api('/api/games', { token: ida.token, body: { name: 'Ida-Abend' } });
    const adminRegie = await client(admin);
    let adminShow = null as Show | null;
    adminRegie.socket.on('show', (sh: Show) => (adminShow = sh));
    expect(await showCmd(adminRegie, { type: 'set', patch: { quality: 'ultra' } })).toMatchObject({ ok: true });
    await new Promise((r) => setTimeout(r, 100));
    expect(adminShow!.settings.quality).toBe('ultra');
    expect(seen!.settings.quality).toBe('eco');
    // Gäste dürfen nicht steuern
    const guest = await client(null, 'join');
    expect((await showCmd(guest, { type: 'set', patch: { quality: 'ultra' } })).ok).toBe(false);
  });

  it('Admin sieht live, welche Spielleiter gerade online sind', async () => {
    const admin = await adminToken();
    const ben = await leader(admin, 'ben@example.org', 'Ben');
    type Accounts = { online: Record<string, number>; lastSeen: Record<string, number> };
    const regie = await client(admin);
    let latest: Accounts | null = null;
    regie.socket.on('accounts', (a: Accounts) => (latest = a));
    const until = async (pred: (a: Accounts) => boolean) => {
      for (let i = 0; i < 60 && !(latest && pred(latest)); i++) await new Promise((r) => setTimeout(r, 25));
      return latest!;
    };
    type Users = { users: { id: string; online: number; lastSeenAt: number | null }[] };
    expect((await api<Users>('/api/users', { token: admin })).data.users.find((u) => u.id === ben.id)?.online).toBe(0);

    // Ben öffnet die Regie auf zwei Geräten
    const laptop = await client(ben.token);
    const phone = await client(ben.token);
    expect((await until((a) => a.online[ben.id] === 2)).online[ben.id]).toBe(2);
    expect((await api<Users>('/api/users', { token: admin })).data.users.find((u) => u.id === ben.id)?.online).toBe(2);
    // Spielleiter selbst bekommen diese Liste nicht
    let leaked = false;
    laptop.socket.on('accounts', () => (leaked = true));

    // beide Fenster zu → offline, „zuletzt online“ gesetzt
    laptop.socket.close();
    phone.socket.close();
    const after = await until((a) => !a.online[ben.id]);
    expect(after.online[ben.id]).toBeUndefined();
    expect(after.lastSeen[ben.id]).toBeGreaterThan(Date.now() - 5000);
    expect(leaked).toBe(false);
    // nur Admins dürfen die Liste abrufen
    expect((await api('/api/users', { token: ben.token })).status).toBe(403);
  });

  it('„Überall abmelden“ wirkt sofort auf offene Regie-Fenster; eigener Passwortwechsel behält dieses Gerät', async () => {
    const admin = await adminToken();
    const eva = await leader(admin, 'eva@example.org', 'Eva');
    const ended = (c: Client) => new Promise<boolean>((res) => {
      const t = setTimeout(() => res(false), 1500);
      c.socket.once('session:ended', () => (clearTimeout(t), res(true)));
    });
    // zwei Geräte von Eva (zwei Anmeldungen)
    const laptop = await client(eva.token);
    const phoneToken = (await api<{ token: string }>('/api/auth/login', { body: { email: 'eva@example.org', password: 'Lagerfeuer-und-Sterne-7' } })).data.token;
    const phone = await client(phoneToken);
    const oldBeamer = await client((await api<{ token: string }>('/api/auth/beamer-link', { token: eva.token, body: {} })).data.token, 'beamer');
    expect(oldBeamer.session()?.role).toBe('beamer');
    const oldBeamerOut = ended(oldBeamer);

    // Eva ändert ihr Passwort am Laptop: Laptop bekommt den neuen Zugang, das Handy fliegt raus
    const renewed = new Promise<string>((res) => laptop.socket.once('session:token', res));
    const phoneOut = ended(phone);
    const changed = await api<{ token: string }>('/api/account/password', { token: eva.token, body: { current: 'Lagerfeuer-und-Sterne-7', next: 'Neues-Eva-Passwort-1' } });
    expect(changed.status).toBe(200);
    expect(await renewed).toBe(changed.data.token);
    expect(await phoneOut).toBe(true);
    expect(await oldBeamerOut).toBe(true); // Beamer hängen am Zugang des Kontos
    const beamer = await client((await api<{ token: string }>('/api/auth/beamer-link', { token: changed.data.token, body: {} })).data.token, 'beamer');
    expect(beamer.session()?.role).toBe('beamer');
    // falsches bisheriges Passwort ist 400 (401 hieße „abgemeldet“)
    expect((await api('/api/account/password', { token: changed.data.token, body: { current: 'falsch-falsch-falsch', next: 'Noch-ein-Passwort-2' } })).status).toBe(400);

    // Admin: „Überall abmelden“ → Laptop und Beamer bekommen sofort Bescheid
    const laptopOut = ended(laptop);
    const beamerOut = ended(beamer);
    const t0 = Date.now();
    expect((await api(`/api/users/${eva.id}/logout`, { token: admin, body: {} })).status).toBe(200);
    expect(await laptopOut).toBe(true);
    expect(await beamerOut).toBe(true);
    expect(Date.now() - t0).toBeLessThan(1000);
    await new Promise((r) => setTimeout(r, 50));
    expect(laptop.session()?.role).toBe('guest');
    expect((await api('/api/games', { token: changed.data.token })).status).toBe(401);
  });

  it('Passwort vergessen (Link geht an die feste Adresse), Sperren und Passwortwechsel melden ab', async () => {
    const admin = await adminToken();
    const kim = await leader(admin, 'kim@example.org', 'Kim');
    const { setMailSenderForTests } = await import('./mail.ts');
    const sent: { to: string; subject: string; text: string }[] = [];
    setMailSenderForTests(async (_smtp, mail) => void sent.push(mail));
    try {
      // SMTP eintragen; das Passwort kommt nie zurück
      const smtp = { host: 'mail.example.org', port: 587, security: 'starttls', user: 'insel', password: 'smtp-geheim-123', fromAddress: 'insel@example.org', fromName: 'Insel' };
      expect((await api('/api/system/smtp', { method: 'PUT', token: kim.token, body: { smtp } })).status).toBe(403);
      expect((await api('/api/system/smtp', { method: 'PUT', token: admin, body: { smtp } })).status).toBe(200);
      const read = await api<{ smtp: { password: string }; hasPassword: boolean }>('/api/system/smtp', { token: admin });
      expect(read.data.smtp.password).toBe('');
      expect(read.data.hasPassword).toBe(true);
      expect((await api('/api/system/smtp/test', { token: admin, body: { to: 'admin@example.org' } })).status).toBe(200);

      // ohne feste Adresse keine Mail (sonst ließe sich der Link über den Host-Header umbiegen)
      sent.length = 0;
      await api('/api/auth/forgot', { body: { email: 'kim@example.org' } });
      await new Promise((r) => setTimeout(r, 50));
      expect(sent.length).toBe(0);
      await api('/api/system/settings', { method: 'PUT', token: admin, body: { joinUrl: 'https://party.example.org' } });
      // unbekannte Adresse: gleiche Antwort, keine Mail
      expect((await api('/api/auth/forgot', { body: { email: 'niemand@example.org' } })).status).toBe(200);
      // je Konto höchstens ein Link alle 2 Minuten – Kims Versuch zählte schon, deshalb ein zweites Konto
      const pia = await leader(admin, 'pia@example.org', 'Pia');
      expect((await api('/api/auth/forgot', { body: { email: 'pia@example.org' } })).status).toBe(200);
      const isReset = (m: { to: string; subject: string }) => m.to === 'pia@example.org' && m.subject.startsWith('Passwort zurücksetzen');
      for (let i = 0; i < 40 && !sent.some(isReset); i++) await new Promise((r) => setTimeout(r, 25));
      const mail = sent.find(isReset)!;
      expect(mail.text).toMatch(/https:\/\/party\.example\.org\/konto#t=/);
      expect(sent.some((m) => m.to === 'niemand@example.org')).toBe(false);
      const t = /#t=([A-Za-z0-9_-]+)/.exec(mail.text)![1]!;
      const reset = await api<{ token: string }>('/api/auth/set-password', { body: { token: t, password: 'Neues-Passwort-fuer-Pia' } });
      expect(reset.status).toBe(200);
      // alte Anmeldung von Pia gilt nicht mehr, die neue schon
      expect((await api<{ account: unknown }>('/api/auth/me', { token: pia.token })).data.account).toBeNull();
      expect((await api<{ account: { name: string } }>('/api/auth/me', { token: reset.data.token })).data.account?.name).toBe('Pia');

      // Sperren: sofort abgemeldet, Login geht nicht
      expect((await api(`/api/users/${kim.id}`, { method: 'PUT', token: admin, body: { disabled: true } })).status).toBe(200);
      expect((await api<{ account: unknown }>('/api/auth/me', { token: kim.token })).data.account).toBeNull();
      expect((await api('/api/auth/login', { body: { email: 'kim@example.org', password: 'Lagerfeuer-und-Sterne-7' } })).status).toBe(401);

      // eigenes Passwort ändern → neuer Zugang, alter ungültig
      const neu = await api<{ token: string }>('/api/account/password', { token: reset.data.token, body: { current: 'Neues-Passwort-fuer-Pia', next: 'Noch-ein-neues-Passwort' } });
      expect(neu.status).toBe(200);
      expect((await api<{ account: unknown }>('/api/auth/me', { token: reset.data.token })).data.account).toBeNull();
    } finally {
      setMailSenderForTests(null);
      await api('/api/system/settings', { method: 'PUT', token: admin, body: { joinUrl: '' } });
    }
  });
});
