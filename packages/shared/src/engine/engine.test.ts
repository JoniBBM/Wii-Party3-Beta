import { describe, expect, it } from 'vitest';
import { isTextAnswerCorrect } from '../answers.ts';
import { generateBoard, countFields } from '../board.ts';
import type { FieldType } from '../constants.ts';
import { buildItem, defaultConfig, upgradeState } from '../defaults.ts';
import { seededRng } from '../rng.ts';
import { commandSchema, type ContentItemInput } from '../schemas.ts';
import type { Actor, ContentItem, GameConfig, GameState } from '../types.ts';
import { applyCommand, createGame, EngineError, projectState, type EngineContext } from './index.ts';

const ADMIN: Actor = { role: 'admin' };
const MOD: Actor = { role: 'moderator' };

function item(id: string, input: ContentItemInput): ContentItem {
  return buildItem(input, { id, collectionId: 'c1', now: 0 });
}

const ITEMS: ContentItem[] = [
  item('q1', { kind: 'choice', title: 'Hauptstadt', question: 'Hauptstadt von Deutschland?', options: ['München', 'Berlin', 'Hamburg'], correctIndex: 1, playerCount: 'all' }),
  item('q2', { kind: 'text', title: 'Fluss', question: 'Längster Fluss Deutschlands?', answers: ['Rhein'], playerCount: 'all' }),
  item('q3', { kind: 'estimate', title: 'Schätzen', question: 'Wie hoch ist die Zugspitze?', target: 2962, unit: 'm', playerCount: 'all' }),
  item('q4', { kind: 'buzzer', title: 'Buzzer', question: 'Wer malte die Mona Lisa?', answer: 'Leonardo da Vinci', playerCount: 'all' }),
  item('g1', { kind: 'game', title: 'Becher stapeln', description: 'Stapelt Becher', playerCount: '2' }),
  item('f1', { kind: 'game', title: 'Duell-Spiel', roundUse: false, fieldModes: ['duel'], playerCount: '1' }),
  item('f2', { kind: 'game', title: 'Alle gegen einen', roundUse: false, fieldModes: ['vs_all'], playerCount: '1' }),
];

function boardWith(special: Record<number, FieldType>, goal = 40) {
  const fields: FieldType[] = Array.from({ length: goal + 1 }, () => 'normal');
  fields[0] = 'start';
  fields[goal] = 'goal';
  for (const [pos, type] of Object.entries(special)) fields[Number(pos)] = type;
  return { fields, seed: 1 };
}

function phase<N extends GameState['phase']['name']>(s: GameState, name: N): Extract<GameState['phase'], { name: N }> {
  if (s.phase.name !== name) throw new Error(`Phase ${s.phase.name} statt ${name}`);
  return s.phase as Extract<GameState['phase'], { name: N }>;
}

function harness(opts: { config?: Partial<GameConfig>; seed?: number } = {}) {
  let now = 1_000_000;
  let ids = 0;
  const rng = seededRng(opts.seed ?? 42);
  const config: GameConfig = { ...defaultConfig('Test'), board: boardWith({}), ...opts.config };
  let state: GameState = createGame({ id: 'g', config, now });
  const ctx = (): EngineContext => ({
    now,
    rng,
    pool: ITEMS,
    lookup: (id) => ITEMS.find((i) => i.id === id),
    newId: () => `id${++ids}`,
    newToken: () => `tok${++ids}`,
  });
  const h = {
    get s() {
      return state;
    },
    run(cmd: unknown, actor: Actor = ADMIN) {
      const r = applyCommand(state, commandSchema.parse(cmd), actor, ctx());
      state = r.state;
      return r;
    },
    tick(ms = 60_000) {
      now += ms;
    },
    mutate(fn: (s: GameState) => void) {
      fn(state);
    },
    team(i: number) {
      return state.teams[i]!;
    },
    /** Zwei Teams mit je zwei Spielern, Spiel gestartet. */
    setup(teams = 2) {
      for (let i = 0; i < teams * 2; i++) h.run({ type: 'player.register', name: `Spieler ${i + 1}` }, { role: 'guest' });
      h.run({ type: 'teams.auto', count: teams });
      h.run({ type: 'game.start' });
      return h;
    },
    /** Würfelphase mit fester Reihenfolge herstellen. */
    toDice(order: string[]) {
      state.phase = {
        name: 'dice',
        dice: { order, index: 0, rolls: [], fieldGame: null, busyUntil: 0 },
        results: null,
      };
    },
  };
  return h;
}

describe('Spielfeld', () => {
  it('ist deterministisch und hat Start/Ziel', () => {
    const a = generateBoard(72, 5);
    const b = generateBoard(72, 5);
    expect(a).toEqual(b);
    expect(a.fields).toHaveLength(73);
    expect(a.fields[0]).toBe('start');
    expect(a.fields[72]).toBe('goal');
    const counts = countFields(a);
    expect(counts.minigame).toBe(7);
    expect(counts.volcano).toBe(3);
    expect(generateBoard(72, 6)).not.toEqual(a);
  });

  it('legt Fässer in die Flussfurt und das Kraterloch an den Rand – für jede Länge', () => {
    for (const goal of [20, 40, 72, 100, 120]) {
      const b = generateBoard(goal, 3);
      const river = b.fields.flatMap((f, i) => (f === 'river' ? [i] : []));
      const crater = b.fields.flatMap((f, i) => (f === 'crater' ? [i] : []));
      expect(river.length).toBeGreaterThanOrEqual(1);
      expect(crater).toHaveLength(1);
      expect(crater[0]!).toBeGreaterThan(goal * 0.85);
      expect(crater[0]!).toBeLessThan(goal);
      // Inselfelder kommen aus dem Plan und nicht vom Zufall
      expect(generateBoard(goal, 99).fields.flatMap((f, i) => (f === 'river' ? [i] : []))).toEqual(river);
    }
  });

  it('setzt Vulkanfelder nur in den oberen Bereich', () => {
    const b = generateBoard(72, 9);
    b.fields.forEach((f, i) => {
      if (f === 'volcano') expect(i).toBeGreaterThan(45);
    });
  });
});

describe('Lobby & Teams', () => {
  it('teilt Spieler ausgeglichen ein und startet erst ab 2 Teams', () => {
    const h = harness();
    for (let i = 0; i < 7; i++) h.run({ type: 'player.register', name: `P${i}` }, { role: 'guest' });
    expect(() => h.run({ type: 'game.start' })).toThrow(EngineError);
    h.run({ type: 'teams.auto', count: 3 });
    const sizes = h.s.teams.map((t) => h.s.players.filter((p) => p.teamId === t.id).length).sort();
    expect(sizes).toEqual([2, 2, 3]);
    expect(new Set(h.s.teams.map((t) => t.color)).size).toBe(3);
    expect(new Set(h.s.teams.map((t) => t.pin)).size).toBe(3);
    h.run({ type: 'game.start' });
    expect(h.s.status).toBe('running');
    expect(h.s.phase.name).toBe('idle');
  });

  it('verhindert doppelte Namen und Anmeldung bei geschlossener Anmeldung', () => {
    const h = harness();
    h.run({ type: 'player.register', name: 'Max' }, { role: 'guest' });
    expect(() => h.run({ type: 'player.register', name: 'max' }, { role: 'guest' })).toThrow(/vergeben/);
    h.run({ type: 'registration.set', open: false });
    expect(() => h.run({ type: 'player.register', name: 'Lisa' }, { role: 'guest' })).toThrow(/geschlossen/);
    // mit Team-PIN beigetreten geht es trotzdem
    h.run({ type: 'team.create' });
    h.run({ type: 'player.register', name: 'Lisa' }, { role: 'team', teamId: h.team(0).id });
    expect(h.s.players.find((p) => p.name === 'Lisa')?.teamId).toBe(h.team(0).id);
  });

  it('Teams dürfen nur sich selbst ändern', () => {
    const h = harness().setup();
    const a = h.team(0);
    const b = h.team(1);
    h.run({ type: 'team.update', name: 'Die Haie' }, { role: 'team', teamId: a.id });
    expect(h.team(0).name).toBe('Die Haie');
    expect(() => h.run({ type: 'team.update', teamId: b.id, name: 'X' }, { role: 'team', teamId: a.id })).toThrow();
    expect(() => h.run({ type: 'content.select', source: 'random' }, { role: 'team', teamId: a.id })).toThrow(/Berechtigung/);
  });
});

describe('Fragen', () => {
  it('Auswahlfrage: Auflösung, Platzierung nach Zeit, Bonus nur für richtige', () => {
    const h = harness().setup(3);
    const [a, b, c] = [h.team(0), h.team(1), h.team(2)];
    h.run({ type: 'content.select', source: 'manual', itemId: 'q1' });
    expect(() => h.run({ type: 'answer.submit', value: 1 }, { role: 'team', teamId: a.id })).toThrow(/nicht möglich/);
    h.run({ type: 'content.open' });
    h.run({ type: 'answer.submit', value: 0 }, { role: 'team', teamId: a.id }); // falsch
    h.tick(1000);
    h.run({ type: 'answer.submit', value: 1 }, { role: 'team', teamId: c.id }); // richtig, zuerst
    h.tick(1000);
    expect(() => h.run({ type: 'answer.submit', value: 1 }, { role: 'team', teamId: a.id })).toThrow(/schon/);
    h.run({ type: 'answer.submit', value: 1 }, { role: 'team', teamId: b.id }); // richtig, später
    // alle haben geantwortet → automatisch geschlossen
    expect(h.s.phase.name === 'content' && phase(h.s, 'content').content.stage).toBe('closed');

    // Beamer sieht vor der Auflösung keine Lösung und keine Antworten
    const beamer = projectState(h.s, { role: 'beamer' });
    if (beamer.phase.name !== 'content' || beamer.phase.content.item.kind !== 'choice') throw new Error('phase');
    expect(beamer.phase.content.item.correctIndex).toBe(-1);
    expect(beamer.phase.content.answers[a.id]?.value).toBe('');
    expect(beamer.teams.every((t) => t.pin === '')).toBe(true);

    h.run({ type: 'content.reveal' });
    h.run({ type: 'content.finish' });
    const e = Object.fromEntries(phase(h.s, 'results').results.entries.map((x) => [x.teamId, x]));
    expect(e[c.id]).toMatchObject({ rank: 1, bonusDie: 6, correct: true });
    expect(e[b.id]).toMatchObject({ rank: 2, bonusDie: 4, correct: true });
    expect(e[a.id]).toMatchObject({ rank: 3, bonusDie: 0, correct: false });
    expect(phase(h.s, 'results').results.order).toEqual([c.id, b.id, a.id]);

    h.run({ type: 'results.confirm' });
    expect(h.s.phase.name).toBe('dice');
    expect(h.s.teams.find((t) => t.id === c.id)?.bonusDie).toBe(6);
  });

  it('Freitext wird tolerant bewertet und kann überstimmt werden', () => {
    const h = harness().setup();
    const [a, b] = [h.team(0), h.team(1)];
    h.run({ type: 'content.select', source: 'manual', itemId: 'q2' });
    h.run({ type: 'content.open' });
    h.run({ type: 'answer.submit', value: 'der rhien' }, { role: 'team', teamId: a.id });
    h.run({ type: 'answer.submit', value: 'Donau' }, { role: 'team', teamId: b.id });
    h.run({ type: 'content.reveal' });
    expect(phase(h.s, 'content').content.answers[a.id]?.correct).toBe(true);
    expect(phase(h.s, 'content').content.answers[b.id]?.correct).toBe(false);
    h.run({ type: 'answer.judge', teamId: b.id, correct: true }, MOD);
    expect(phase(h.s, 'content').content.ranking?.find((r) => r.teamId === b.id)?.rank).toBe(2);
    expect(phase(h.s, 'content').content.answers[b.id]?.correct).toBe(true);
  });

  it('Schätzfrage: am nächsten dran gewinnt, Gleichstand teilt den Platz', () => {
    const h = harness().setup(3);
    const [a, b, c] = [h.team(0), h.team(1), h.team(2)];
    h.run({ type: 'content.select', source: 'manual', itemId: 'q3' });
    h.run({ type: 'content.open' });
    h.run({ type: 'answer.submit', value: '3000' }, { role: 'team', teamId: a.id });
    h.run({ type: 'answer.submit', value: 2924 }, { role: 'team', teamId: b.id });
    h.run({ type: 'content.reveal' });
    h.run({ type: 'content.finish' });
    const e = Object.fromEntries(phase(h.s, 'results').results.entries.map((x) => [x.teamId, x]));
    expect(e[a.id]!.rank).toBe(1);
    expect(e[b.id]!.rank).toBe(1);
    expect(e[a.id]!.bonusDie).toBe(6);
    expect(e[c.id]).toMatchObject({ rank: 3, bonusDie: 0 });
  });

  it('Buzzer: Reihenfolge, falsch → nächstes Team, richtig → aufgelöst', () => {
    const h = harness().setup(3);
    const [a, b, c] = [h.team(0), h.team(1), h.team(2)];
    h.run({ type: 'content.select', source: 'manual', itemId: 'q4' });
    h.run({ type: 'content.open' });
    h.run({ type: 'buzz' }, { role: 'team', teamId: b.id });
    h.tick(200);
    h.run({ type: 'buzz' }, { role: 'team', teamId: a.id });
    h.run({ type: 'buzz' }, { role: 'team', teamId: a.id }); // doppelt: ignoriert
    expect(phase(h.s, 'content').content.buzzQueue.map((x) => x.teamId)).toEqual([b.id, a.id]);
    h.run({ type: 'buzz.judge', teamId: b.id, correct: false }, MOD);
    h.run({ type: 'buzz.judge', teamId: a.id, correct: true }, MOD);
    expect(phase(h.s, 'content').content.stage).toBe('revealed');
    h.run({ type: 'content.finish' });
    expect(phase(h.s, 'results').results.order[0]).toBe(a.id);
    const e = Object.fromEntries(phase(h.s, 'results').results.entries.map((x) => [x.teamId, x]));
    expect(e[a.id]!.bonusDie).toBe(6);
    expect(e[b.id]!.bonusDie).toBe(0);
    expect(e[c.id]!.bonusDie).toBe(0);
  });
});

describe('Spiele', () => {
  it('lost Spieler fair aus und vergibt Bonuswürfel nach Platz', () => {
    const h = harness().setup(3);
    h.run({ type: 'content.select', source: 'manual', itemId: 'g1' });
    for (const t of h.s.teams) expect(phase(h.s, 'content').content.drawn[t.id]).toHaveLength(2);
    expect(() => h.run({ type: 'content.finish' })).toThrow(/Platzierung/);
    const [a, b, c] = [h.team(0), h.team(1), h.team(2)];
    h.run({ type: 'content.open' });
    h.run({ type: 'content.rank', ranking: [{ teamId: b.id, rank: 1 }, { teamId: c.id, rank: 2 }, { teamId: a.id, rank: 3 }] });
    h.run({ type: 'content.finish' });
    expect(phase(h.s, 'results').results.entries.map((e) => [e.teamId, e.bonusDie])).toEqual([
      [b.id, 6],
      [c.id, 4],
      [a.id, 2],
    ]);
  });

  it('Rotation: bei 1 Spieler pro Team kommen alle reihum dran', () => {
    const h = harness().setup(2);
    const t = h.team(0);
    const seen = new Set<string>();
    for (let r = 0; r < 2; r++) {
      h.run({ type: 'content.select', source: 'manual', itemId: 'f1' });
        seen.add(phase(h.s, 'content').content.drawn[t.id]![0]!);
      h.run({ type: 'content.abort' });
      // abort nimmt die Auslosung zurück → erneut auslosen ohne Effekt auf Fairness
      h.mutate((s) => {
        for (const id of seen) {
          const p = s.players.find((x) => x.id === id);
          if (p) p.playCount += 1;
        }
      });
    }
    expect(seen.size).toBe(2);
  });

  it('Zufall wählt ungespielte Inhalte und mischt neu, wenn alle gespielt sind', () => {
    const h = harness().setup();
    const round = ITEMS.filter((i) => i.roundUse).map((i) => i.id);
    const seen: string[] = [];
    for (let i = 0; i < round.length; i++) {
      h.run({ type: 'content.select', source: 'random' });
        seen.push(phase(h.s, 'content').content.item.id);
      h.mutate((s) => (s.phase = { name: 'idle' }));
    }
    expect(new Set(seen)).toEqual(new Set(round));
    h.run({ type: 'content.select', source: 'random' });
    expect(h.s.feed.some((f) => f.text.includes('neu gemischt'))).toBe(true);
  });
});

describe('Würfeln & Sonderfelder', () => {
  it('bewegt nach Wurf und sperrt während der Animation', () => {
    const h = harness().setup();
    const [a, b] = [h.team(0), h.team(1)];
    h.toDice([a.id, b.id]);
    h.mutate((s) => (s.teams[0]!.bonusDie = 4));
    const r = h.run({ type: 'dice.roll', main: 3, bonus: 2 }, MOD);
    expect(h.team(0).position).toBe(5);
    expect(h.team(0).bonusDie).toBe(0);
    expect(r.effects.map((e) => e.type)).toEqual(['dice', 'move', 'turn']);
    expect(() => h.run({ type: 'dice.roll' }, { role: 'team', teamId: b.id })).toThrow(/Animation/);
    expect(() => h.run({ type: 'dice.roll' }, { role: 'team', teamId: a.id })).toThrow(/dran/);
    h.tick(20_000);
    h.run({ type: 'dice.roll' }, { role: 'team', teamId: b.id });
    expect(h.s.phase.name).toBe('round_end');
    expect(h.s.history).toHaveLength(1);
  });

  it('Katapult vorwärts/rückwärts verketten sich nicht', () => {
    const h = harness({ config: { board: boardWith({ 4: 'catapult_forward', 9: 'catapult_backward', 7: 'catapult_backward' }) } }).setup();
    const [a, b] = [h.team(0), h.team(1)];
    h.mutate((s) => (s.config.rules.catapultForward = { min: 3, max: 3 }));
    h.toDice([a.id, b.id]);
    h.run({ type: 'dice.roll', main: 4 }, ADMIN);
    expect(h.team(0).position).toBe(7); // 4 + 3, Feld 7 (Katapult zurück) wirkt nicht erneut
    h.tick();
    h.mutate((s) => (s.config.rules.catapultBackward = { min: 5, max: 5 }));
    h.run({ type: 'dice.roll', main: 6, force: true }, ADMIN);
    expect(h.team(1).position).toBe(6); // Feld 6 normal? → keine Wirkung
  });

  it('Platztausch mit Mindestabstand', () => {
    const h = harness({ config: { board: boardWith({ 3: 'swap' }) } }).setup(3);
    const [a, b, c] = [h.team(0), h.team(1), h.team(2)];
    h.mutate((s) => {
      s.teams[1]!.position = 4; // zu nah
      s.teams[2]!.position = 20;
    });
    h.toDice([a.id, b.id, c.id]);
    h.run({ type: 'dice.roll', main: 3 }, ADMIN);
    expect(h.team(0).position).toBe(20);
    expect(h.team(2).position).toBe(3);
    expect(h.team(1).position).toBe(4);
  });

  it('Sperre: festsitzen, befreien und automatisch öffnen', () => {
    const h = harness({ config: { board: boardWith({ 2: 'barrier' }) } }).setup();
    const [a, b] = [h.team(0), h.team(1)];
    h.mutate((s) => {
      s.config.rules.barrier = { mode: 'atLeast', value: 5 };
      s.config.rules.barrierMaxAttempts = 2;
    });
    const roundWith = (main: number) => {
      h.toDice([a.id, b.id]);
      h.run({ type: 'dice.roll', main, force: true }, ADMIN);
    };
    roundWith(2);
    expect(h.team(0).blocked).not.toBeNull();
    roundWith(3);
    expect(h.team(0).position).toBe(2);
    expect(h.team(0).blocked?.attempts).toBe(1);
    roundWith(1); // 2. Fehlversuch → öffnet sich, bewegt sich aber nicht
    expect(h.team(0).blocked).toBeNull();
    expect(h.team(0).position).toBe(2);
    h.mutate((s) => (s.teams[0]!.blocked = { attempts: 0, since: 0 }));
    roundWith(5);
    expect(h.team(0).blocked).toBeNull();
    expect(h.team(0).position).toBe(7);
  });

  it('Fässer im Fluss: sicher drüber oder ins Wasser und zurücktreiben', () => {
    const h = harness({ config: { board: boardWith({ 9: 'river', 10: 'river' }) } }).setup();
    const [a, b] = [h.team(0), h.team(1)];
    h.mutate((s) => (s.config.rules.river = { enabled: true, fallChance: 100, driftBack: { min: 3, max: 3 } }));
    h.toDice([a.id, b.id]);
    const r = h.run({ type: 'dice.roll', main: 5, force: true }, ADMIN);
    h.mutate((s) => (s.teams[0]!.position = 9));
    expect(r.effects.some((e) => e.type === 'river')).toBe(false);
    h.toDice([a.id, b.id]);
    const r2 = h.run({ type: 'dice.roll', main: 1, force: true }, ADMIN);
    // Landet auf 10 → fällt → 3 zurück wäre 7 (vor der Furt)
    expect(r2.effects.find((e) => e.type === 'river')).toMatchObject({ result: 'fall', position: 10 });
    expect(r2.effects.find((e) => e.type === 'move' && e.reason === 'river')).toMatchObject({ from: 10, to: 7 });
    expect(h.team(0).position).toBe(7);
    // Treiben endet nie auf einem Fass
    h.mutate((s) => {
      s.config.rules.river.driftBack = { min: 1, max: 1 };
      s.teams[0]!.position = 9;
    });
    h.toDice([a.id, b.id]);
    h.run({ type: 'dice.roll', main: 1, force: true }, ADMIN);
    expect(h.team(0).position).toBe(8);
    // Ohne Sturzgefahr bleibt man stehen
    h.mutate((s) => {
      s.config.rules.river.fallChance = 0;
      s.teams[0]!.position = 8;
    });
    h.toDice([a.id, b.id]);
    const r3 = h.run({ type: 'dice.roll', main: 1, force: true }, ADMIN);
    expect(r3.effects.find((e) => e.type === 'river')).toMatchObject({ result: 'safe' });
    expect(h.team(0).position).toBe(9);
  });

  it('Krater: hineinfallen, Augen sammeln, Rest weiterlaufen', () => {
    const h = harness({ config: { board: boardWith({ 36: 'crater' }) } }).setup();
    const [a, b] = [h.team(0), h.team(1)];
    h.mutate((s) => {
      s.config.rules.crater = { enabled: true, climb: 8 };
      s.config.rules.volcano.enabled = false;
      s.teams[0]!.position = 33;
    });
    const roundWith = (main: number) => {
      h.toDice([a.id, b.id]);
      return h.run({ type: 'dice.roll', main, force: true }, ADMIN);
    };
    const r = roundWith(3);
    expect(h.team(0).crater).toEqual({ climbed: 0, need: 8 });
    expect(r.effects.find((e) => e.type === 'crater')).toMatchObject({ result: 'fall', position: 36 });
    const r2 = roundWith(5);
    expect(h.team(0).position).toBe(36);
    expect(h.team(0).crater).toEqual({ climbed: 5, need: 8 });
    expect(r2.effects.find((e) => e.type === 'crater')).toMatchObject({ result: 'climb', climbed: 5 });
    const r3 = roundWith(6); // 11 ≥ 8 → raus, 3 Felder weiter
    expect(r3.effects.find((e) => e.type === 'crater')).toMatchObject({ result: 'out' });
    expect(h.team(0).crater).toBeNull();
    expect(h.team(0).position).toBe(39);
    // Regie kann befreien, Ausbruch schleudert heraus
    h.mutate((s) => {
      s.teams[0]!.position = 36;
      s.teams[0]!.crater = { climbed: 2, need: 8 };
    });
    h.run({ type: 'team.unblock', teamId: a.id }, ADMIN);
    expect(h.team(0).crater).toBeNull();
    h.mutate((s) => {
      s.config.rules.volcano.enabled = true;
      s.teams[0]!.crater = { climbed: 2, need: 8 };
    });
    h.run({ type: 'volcano.erupt' }, ADMIN);
    expect(h.team(0).crater).toBeNull();
    expect(h.team(0).position).toBeLessThan(36);
  });

  it('alte Spielstände ohne Fluss/Krater werden ergänzt', () => {
    const h = harness().setup();
    const old = JSON.parse(JSON.stringify(h.s)) as GameState;
    delete (old.config.rules as Partial<GameConfig['rules']>).river;
    delete (old.config.rules as Partial<GameConfig['rules']>).crater;
    for (const t of old.teams) delete (t as Partial<typeof t>).crater;
    const up = upgradeState(old);
    expect(up.config.rules.river.enabled).toBe(true);
    expect(up.config.rules.crater.climb).toBe(8);
    expect(up.teams.every((t) => t.crater === null)).toBe(true);
  });

  it('Minispiel-Feld pausiert die Runde bis zum Ergebnis', () => {
    const h = harness({ config: { board: boardWith({ 3: 'minigame' }) } }).setup();
    const [a, b] = [h.team(0), h.team(1)];
    h.toDice([a.id, b.id]);
    h.run({ type: 'dice.roll', main: 3 }, ADMIN);
    expect(phase(h.s, 'dice').dice.fieldGame?.stage).toBe('choose');
    expect(phase(h.s, 'dice').dice.index).toBe(0);
    expect(() => h.run({ type: 'dice.roll', force: true }, ADMIN)).toThrow(/Feld-Minispiel/);
    h.run({ type: 'fieldgame.setup', mode: 'duel' }, MOD);
    const fg = phase(h.s, 'dice').dice.fieldGame!;
    expect(fg.item?.id).toBe('f1');
    expect(fg.opponentIds).toEqual([b.id]);
    expect(fg.drawn[a.id]).toHaveLength(1);
    h.run({ type: 'fieldgame.result', won: true }, MOD);
    expect(h.team(0).position).toBe(8);
    expect(phase(h.s, 'dice').dice.index).toBe(1);
  });

  it('Vulkan: Druck steigt, Ausbruch wirft Teams am Gipfel zurück', () => {
    const h = harness({ config: { board: boardWith({ 33: 'volcano' }) } }).setup();
    const [a, b] = [h.team(0), h.team(1)];
    h.mutate((s) => {
      s.config.rules.volcano = { ...s.config.rules.volcano, threshold: 3, pressurePerField: 2, pressurePerRound: 1, zoneSize: 10, knockback: { min: 4, max: 4 } };
      s.teams[0]!.position = 30;
      s.teams[1]!.position = 10;
    });
    h.toDice([a.id, b.id]);
    h.run({ type: 'dice.roll', main: 3 }, ADMIN);
    expect(h.s.volcano.pressure).toBe(2);
    h.tick();
    const r = h.run({ type: 'dice.roll', main: 1 }, ADMIN); // Runde endet → +1 → Ausbruch
    expect(r.effects.some((e) => e.type === 'eruption')).toBe(true);
    expect(h.team(0).position).toBe(29); // 33 - 4
    expect(h.team(1).position).toBe(11); // außerhalb der Zone
    expect(h.s.volcano).toEqual({ pressure: 0, eruptions: 1 });
    expect(phase(h.s, 'round_end').summary.eruption).toBe(true);
    expect(h.s.history[0]!.positions[a.id]).toBe(29);
  });

  it('Sieg: auf dem Gipfel stehen und dann mindestens 6 würfeln', () => {
    const h = harness().setup();
    const [a, b] = [h.team(0), h.team(1)];
    h.mutate((s) => (s.teams[0]!.position = 38));
    h.toDice([a.id, b.id]);
    const r = h.run({ type: 'dice.roll', main: 5 }, ADMIN);
    expect(h.team(0).position).toBe(40);
    expect(r.effects.some((e) => e.type === 'summit')).toBe(true);
    expect(h.s.status).toBe('running');
    h.toDice([a.id, b.id]);
    h.run({ type: 'dice.roll', main: 4, force: true }, ADMIN);
    expect(h.s.status).toBe('running');
    h.toDice([a.id, b.id]);
    h.mutate((s) => (s.teams[0]!.bonusDie = 4));
    h.run({ type: 'dice.roll', main: 4, bonus: 2, force: true }, ADMIN);
    expect(h.s.status).toBe('finished');
    expect(h.s.winnerTeamId).toBe(a.id);
    expect(h.s.phase.name).toBe('finished');
  });

  it('Regel „genau treffen“ prallt vom Ziel zurück', () => {
    const h = harness().setup();
    const [a, b] = [h.team(0), h.team(1)];
    h.mutate((s) => {
      s.config.rules.winRule = 'exact';
      s.teams[0]!.position = 37;
    });
    h.toDice([a.id, b.id]);
    h.run({ type: 'dice.roll', main: 5 }, ADMIN);
    expect(h.team(0).position).toBe(38);
    h.toDice([a.id, b.id]);
    h.run({ type: 'dice.roll', main: 2, force: true }, ADMIN);
    expect(h.s.winnerTeamId).toBe(a.id);
  });
});

describe('Antwortvergleich', () => {
  it('toleriert Tippfehler, Umlaute und Artikel', () => {
    expect(isTextAnswerCorrect('Muenchen', ['München'])).toBe(true);
    expect(isTextAnswerCorrect('münchen ', ['München'])).toBe(true);
    expect(isTextAnswerCorrect('Munchen', ['München'])).toBe(true);
    expect(isTextAnswerCorrect('Die Zugspitze', ['Zugspitze'])).toBe(true);
    expect(isTextAnswerCorrect('Zugspize', ['Zugspitze'])).toBe(true);
    expect(isTextAnswerCorrect('Rom', ['Bonn'])).toBe(false);
    expect(isTextAnswerCorrect('', ['x'])).toBe(false);
  });
});

describe('Korrekturen aus dem Review', () => {
  it('„genau treffen“ gilt auch beim Befreien aus der Sperre', () => {
    const h = harness({ config: { board: boardWith({ 38: 'barrier' }) } }).setup();
    const [a, b] = [h.team(0), h.team(1)];
    h.mutate((s) => {
      s.config.rules.winRule = 'exact';
      s.config.rules.barrier = { mode: 'atLeast', value: 5 };
      s.teams[0]!.position = 38;
      s.teams[0]!.blocked = { attempts: 0, since: 0 };
    });
    h.toDice([a.id, b.id]);
    h.run({ type: 'dice.roll', main: 5 }, ADMIN);
    expect(h.s.winnerTeamId).toBeNull();
    expect(h.team(0).position).toBe(37);
  });

  it('Abbrechen gibt den Punkt im Ablaufplan zurück', () => {
    const h = harness({ config: { plan: ['q1', 'g1'] } }).setup();
    h.run({ type: 'content.select', source: 'plan' });
    expect(phase(h.s, 'content').content.item.id).toBe('q1');
    h.run({ type: 'content.abort' });
    expect(h.s.planIndex).toBe(0);
    h.run({ type: 'content.select', source: 'plan' });
    // Ersetzen durch manuelle Auswahl gibt den Planpunkt ebenfalls zurück
    h.run({ type: 'content.select', source: 'manual', itemId: 'q2' });
    expect(h.s.planIndex).toBe(0);
  });

  it('leere Antworten zählen nicht', () => {
    const h = harness().setup();
    h.run({ type: 'content.select', source: 'manual', itemId: 'q1' });
    h.run({ type: 'content.open' });
    expect(() => h.run({ type: 'answer.submit', value: '  ' }, { role: 'team', teamId: h.team(0).id })).toThrow(/Antwort/);
    expect(phase(h.s, 'content').content.answers[h.team(0).id]).toBeUndefined();
  });

  it('im laufenden Spiel bleiben mindestens 2 Teams', () => {
    const h = harness().setup();
    expect(() => h.run({ type: 'team.remove', teamId: h.team(0).id })).toThrow(/mindestens/);
  });

  it('der Siegeswurf steht im Verlauf', () => {
    const h = harness().setup();
    const [a, b] = [h.team(0), h.team(1)];
    h.mutate((s) => (s.teams[0]!.position = 40));
    h.toDice([a.id, b.id]);
    h.run({ type: 'dice.roll', main: 6 }, ADMIN);
    expect(h.s.winnerTeamId).toBe(a.id);
    expect(h.s.history.at(-1)!.rolls).toEqual([{ teamId: a.id, total: 6 }]);
  });

  it('Spieler dürfen keinen Fotopfad setzen', () => {
    const h = harness().setup();
    const p = h.s.players[0]!;
    expect(() => h.run({ type: 'player.update', playerId: p.id, photo: `/media/g/${p.id}-abc.webp` }, { role: 'player', playerId: p.id })).toThrow();
    expect(() => commandSchema.parse({ type: 'player.update', playerId: p.id, photo: '/media/../x' })).toThrow();
  });

  it('Buzzer: zweiter Buzz pausiert den Countdown erneut', () => {
    const h = harness().setup(3);
    const [a, b] = [h.team(0), h.team(1)];
    h.run({ type: 'content.select', source: 'manual', itemId: 'q4' });
    h.run({ type: 'timer.start', seconds: 30 });
    h.run({ type: 'content.open' });
    h.run({ type: 'buzz' }, { role: 'team', teamId: a.id });
    expect(phase(h.s, 'content').content.timer!.startedAt).toBeNull();
    h.run({ type: 'buzz.judge', teamId: a.id, correct: false }, MOD);
    expect(phase(h.s, 'content').content.timer!.startedAt).not.toBeNull();
    h.run({ type: 'buzz' }, { role: 'team', teamId: b.id });
    expect(phase(h.s, 'content').content.timer!.startedAt).toBeNull();
  });

  it('Neu auslosen bei „ganzes Team“ verändert die Zähler nicht', () => {
    const h = harness().setup();
    const all = buildItem({ kind: 'game', title: 'Alle', playerCount: 'all' }, { id: 'all', collectionId: 'c1', now: 0 });
    ITEMS.push(all);
    h.run({ type: 'content.select', source: 'manual', itemId: 'all' });
    h.run({ type: 'content.redraw' });
    h.run({ type: 'content.redraw' });
    expect(h.s.players.every((p) => p.playCount === 0)).toBe(true);
    ITEMS.pop();
  });
});

