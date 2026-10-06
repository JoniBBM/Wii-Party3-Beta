/** Würfelrunde: Wurf, Bewegung, Sonderfelder, Vulkan, Feld-Minispiele, Sieg. */
import { FIELD_GAME_MODE_LABEL, FIELD_INFO, type FieldGameMode, type FieldType } from '../constants.ts';
import { pick, randInt } from '../rng.ts';
import type { CommandOf } from '../schemas.ts';
import type { BarrierCondition, ChallengeKind, DiceRound, EffectInput, GameState, Mood, Phase, RollRecord, Team } from '../types.ts';
import { drawForTeams, undoDraw } from './draw.ts';
import { effectsDuration } from './durations.ts';
import { fail, feed, findTeam, goalOf, isStaff, resolveTeamFor, teamLabel, type Tx } from './tx.ts';

type DicePhase = Extract<Phase, { name: 'dice' }>;

function dicePhase(tx: Tx): DicePhase {
  if (tx.s.phase.name !== 'dice') fail('Gerade ist keine Würfelrunde');
  return tx.s.phase;
}

export function currentTeamId(dice: DiceRound): string | null {
  return dice.order[dice.index] ?? null;
}

export function barrierText(c: BarrierCondition): string {
  switch (c.mode) {
    case 'atLeast':
      return `mindestens eine ${c.value}`;
    case 'atMost':
      return `höchstens eine ${c.value}`;
    case 'oneOf':
      return c.values.length === 1 ? `eine ${c.values[0]}` : `eine ${c.values.slice(0, -1).join(', ')} oder ${c.values.at(-1)}`;
  }
}

function barrierMet(c: BarrierCondition, roll: number): boolean {
  switch (c.mode) {
    case 'atLeast':
      return roll >= c.value;
    case 'atMost':
      return roll <= c.value;
    case 'oneOf':
      return c.values.includes(roll);
  }
}

function move(tx: Tx, team: Team, to: number, reason: Extract<EffectInput, { type: 'move' }>['reason']) {
  const goal = goalOf(tx.s);
  to = Math.max(0, Math.min(goal, to));
  if (to === team.position) return;
  tx.effects.push({ type: 'move', teamId: team.id, from: team.position, to, reason });
  team.position = to;
}

/**
 * Vorwärts ziehen unter Beachtung der Zielregel: Bei „genau treffen“ prallt die Figur
 * vom Gipfel zurück, sonst endet der Weg am Gipfel.
 */
function advance(tx: Tx, team: Team, steps: number, reason: Extract<EffectInput, { type: 'move' }>['reason']) {
  const goal = goalOf(tx.s);
  const target = team.position + steps;
  if (tx.s.config.rules.winRule === 'exact' && target > goal) {
    move(tx, team, goal, reason);
    move(tx, team, goal - (target - goal), reason);
  } else {
    move(tx, team, target, reason);
  }
}

/** Ufer vor dem Fluss (Pflichthalt) und erstes Feld am anderen Ufer. */
export function riverSpan(fields: readonly FieldType[]): { bank: number; exit: number } | null {
  const start = fields.indexOf('river');
  if (start < 1) return null;
  let end = start;
  while (fields[end + 1] === 'river') end++;
  return { bank: start - 1, exit: Math.min(fields.length - 1, end + 1) };
}

/** Liegt auf diesem Feld eine Mutprobe (Pflichthalt beim Vorwärtslaufen)? */
export function challengeAt(s: GameState, pos: number): ChallengeKind | null {
  const f = s.config.board.fields[pos];
  const r = s.config.rules;
  if (f === 'vine' && r.vine?.enabled) return 'vine';
  if (f === 'cave' && r.cave?.enabled && r.inside?.enabled) return 'cave';
  if (r.river?.enabled && riverSpan(s.config.board.fields)?.bank === pos) return 'river';
  return null;
}

/** Team hält an einer Mutprobe an und wartet auf Wurf bzw. Wahl. */
function startChallenge(tx: Tx, phase: DicePhase, team: Team, kind: ChallengeKind, remaining: number) {
  const rules = tx.s.config.rules;
  const position = team.position;
  phase.dice.challenge = { teamId: team.id, kind, position, remaining };
  const rest = remaining > 0 ? ` (danach noch ${remaining} ${remaining === 1 ? 'Feld' : 'Felder'})` : '';
  if (kind === 'vine') {
    tx.effects.push({ type: 'vine', teamId: team.id, position, stage: 'grab', roll: 0, sides: rules.vine.sides, remaining });
    feed(tx, '🌿', `${teamLabel(team)} hält an der Liane – jetzt würfeln, wie weit es über den Bach schwingt${rest}`, team.id);
  } else if (kind === 'river') {
    tx.effects.push({ type: 'river', teamId: team.id, position, stage: 'choose', choice: null, result: null, remaining });
    feed(tx, '🛢️', `${teamLabel(team)} steht am Wasserfall: Fässer oder Kisten?${rest}`, team.id);
  } else {
    tx.effects.push({ type: 'cave', teamId: team.id, position, stage: 'stop', roll: 0, need: rules.cave.need, success: false, remaining });
    feed(tx, '🦇', `${teamLabel(team)} muss an der Lavahöhle mindestens eine ${rules.cave.need} würfeln – sonst geht es ins Vulkan-Innere`, team.id);
  }
}

/** Ins Innere des Vulkans fallen; zurück geht es später auf `team.position`. */
function enterInside(tx: Tx, team: Team) {
  team.inside = { step: 0, returnTo: team.position };
  team.blocked = null;
  team.crater = null;
  tx.effects.push({ type: 'inside', teamId: team.id, stage: 'enter', from: 0, to: 0, returnTo: team.position, shout: false });
  feed(tx, '🌋', `${teamLabel(team)} fällt ins Innere des Vulkans und muss ${tx.s.config.rules.inside.length} Felder über die Lava-Inseln laufen`, team.id);
}

/**
 * Vorwärts laufen. An Mutproben (Liane, Ufer vor dem Fluss, Lavahöhle) hält das Team an –
 * der Rest des Wurfs wird gemerkt. Sonst wirkt das Zielfeld wie gewohnt.
 */
function walk(tx: Tx, phase: DicePhase, team: Team, steps: number, reason: Extract<EffectInput, { type: 'move' }>['reason']): 'done' | 'pending' | 'finished' {
  const s = tx.s;
  const goal = goalOf(s);
  const from = team.position;
  // Wer am Ufer steht, muss erst Fässer oder Kisten wählen
  if (steps > 0 && challengeAt(s, from) === 'river') {
    startChallenge(tx, phase, team, 'river', steps);
    return 'pending';
  }
  const last = Math.min(goal, from + steps);
  for (let p = from + 1; p <= last; p++) {
    const kind = challengeAt(s, p);
    if (kind) {
      move(tx, team, p, reason);
      startChallenge(tx, phase, team, kind, steps - (p - from));
      return 'pending';
    }
  }
  advance(tx, team, steps, reason);
  return checkArrival(tx, team) ? 'finished' : applyField(tx, phase, team);
}

function victory(tx: Tx, team: Team) {
  const s = tx.s;
  s.winnerTeamId = team.id;
  s.status = 'finished';
  if (s.phase.name === 'dice') pushHistory(tx, s.phase);
  s.phase = { name: 'finished' };
  tx.effects.push({ type: 'victory', teamId: team.id });
  feed(tx, '🏆', `${teamLabel(team)} gewinnt das Spiel!`, team.id);
}

/** Prüft nach einer Bewegung, ob das Team gewonnen hat oder den Gipfel erreicht. true = Spiel vorbei. */
function checkArrival(tx: Tx, team: Team): boolean {
  const goal = goalOf(tx.s);
  if (team.position !== goal) return false;
  const rule = tx.s.config.rules.winRule;
  if (rule === 'reach' || rule === 'exact') {
    victory(tx, team);
    return true;
  }
  tx.effects.push({ type: 'summit', teamId: team.id });
  feed(tx, '⛰️', `${teamLabel(team)} ist auf dem Gipfel! Jetzt braucht es mindestens eine ${tx.s.config.rules.finalRollMin}.`, team.id);
  return false;
}

export function addPressure(tx: Tx, amount: number, reason: string) {
  const s = tx.s;
  const v = s.config.rules.volcano;
  if (!v.enabled || amount <= 0) return;
  s.volcano.pressure = Math.min(v.threshold, s.volcano.pressure + amount);
  tx.effects.push({ type: 'volcano', pressure: s.volcano.pressure, threshold: v.threshold });
  feed(tx, '🌋', `${reason} – Vulkandruck ${s.volcano.pressure}/${v.threshold}`);
  if (s.volcano.pressure >= v.threshold) erupt(tx);
}

export function erupt(tx: Tx) {
  const s = tx.s;
  const v = s.config.rules.volcano;
  const goal = goalOf(s);
  const zoneStart = goal - v.zoneSize + 1;
  const affected: { teamId: string; from: number; to: number }[] = [];
  for (const t of s.teams) {
    if (t.position < zoneStart || t.inside) continue;
    const back = randInt(tx.ctx.rng, v.knockback.min, v.knockback.max);
    const to = Math.max(0, t.position - back);
    affected.push({ teamId: t.id, from: t.position, to });
    t.position = to;
    t.blocked = null;
    t.crater = null;
  }
  s.volcano.pressure = 0;
  s.volcano.eruptions += 1;
  tx.effects.push({ type: 'eruption', affected });
  feed(
    tx,
    '🌋',
    affected.length
      ? `VULKANAUSBRUCH! Zurückgeworfen: ${affected.map((a) => teamLabel(findTeam(s, a.teamId))).join(', ')}`
      : 'VULKANAUSBRUCH! Zum Glück war niemand in der Nähe.',
  );
}

/** Wirkung des Feldes, auf dem das Team gelandet ist. Effekte verketten sich nicht. */
function applyField(tx: Tx, phase: DicePhase, team: Team): 'done' | 'pending' | 'finished' {
  const s = tx.s;
  const rules = s.config.rules;
  const goal = goalOf(s);
  const field = s.config.board.fields[team.position] ?? 'normal';
  const pos = team.position;

  switch (field) {
    case 'catapult_forward': {
      const dist = randInt(tx.ctx.rng, rules.catapultForward.min, rules.catapultForward.max);
      tx.effects.push({ type: 'field', teamId: team.id, field, position: pos, text: `+${Math.min(dist, goal - pos)}` });
      advance(tx, team, dist, 'catapult');
      feed(tx, FIELD_INFO[field].icon, `Katapult! ${teamLabel(team)} fliegt ${team.position - pos} Felder vor`, team.id);
      return checkArrival(tx, team) ? 'finished' : 'done';
    }
    case 'catapult_backward': {
      const dist = randInt(tx.ctx.rng, rules.catapultBackward.min, rules.catapultBackward.max);
      const to = Math.max(0, pos - dist);
      tx.effects.push({ type: 'field', teamId: team.id, field, position: pos, text: `−${pos - to}` });
      move(tx, team, to, 'catapult');
      feed(tx, FIELD_INFO[field].icon, `Autsch! ${teamLabel(team)} fliegt ${pos - to} Felder zurück`, team.id);
      return 'done';
    }
    case 'swap': {
      const others = s.teams.filter((t) => t.id !== team.id && t.position !== pos && !t.inside);
      const far = others.filter((t) => Math.abs(t.position - pos) >= rules.swapMinDistance);
      const target = pick(tx.ctx.rng, far.length ? far : others);
      if (!target) {
        tx.effects.push({ type: 'field', teamId: team.id, field, position: pos, text: 'Niemand zum Tauschen' });
        feed(tx, FIELD_INFO[field].icon, `${teamLabel(team)}: Kein Team zum Tauschen da`, team.id);
        return 'done';
      }
      tx.effects.push({ type: 'field', teamId: team.id, field, position: pos, text: teamLabel(target) });
      tx.effects.push({ type: 'swap', a: team.id, b: target.id, posA: pos, posB: target.position });
      const tp = target.position;
      target.position = pos;
      team.position = tp;
      target.blocked = null; // hat das Sperrfeld verlassen
      target.crater = null;
      feed(tx, FIELD_INFO[field].icon, `Platztausch! ${teamLabel(team)} ⇄ ${teamLabel(target)}`, team.id);
      if (team.position === goal) return checkArrival(tx, team) ? 'finished' : 'done';
      if (target.position === goal) return checkArrival(tx, target) ? 'finished' : 'done';
      return 'done';
    }
    case 'barrier': {
      team.blocked = { attempts: 0, since: tx.ctx.now };
      tx.effects.push({ type: 'field', teamId: team.id, field, position: pos, text: barrierText(rules.barrier) });
      tx.effects.push({ type: 'barrier', teamId: team.id, roll: 0, result: 'blocked' });
      feed(tx, FIELD_INFO[field].icon, `${teamLabel(team)} sitzt fest – zum Befreien ${barrierText(rules.barrier)} würfeln`, team.id);
      return 'done';
    }
    case 'minigame': {
      phase.dice.fieldGame = {
        teamId: team.id,
        position: pos,
        stage: 'choose',
        mode: null,
        opponentIds: [],
        item: null,
        drawn: {},
      };
      tx.effects.push({ type: 'field', teamId: team.id, field, position: pos, text: 'Feld-Minispiel' });
      tx.effects.push({ type: 'field_game', teamId: team.id, stage: 'pending' });
      feed(tx, FIELD_INFO[field].icon, `${teamLabel(team)} landet auf einem Minispiel-Feld!`, team.id);
      return 'pending';
    }
    case 'skull': {
      if (!rules.inside?.enabled) return 'done';
      tx.effects.push({ type: 'field', teamId: team.id, field, position: pos, text: 'Ab ins Vulkan-Innere!' });
      enterInside(tx, team);
      return 'done';
    }
    case 'crater': {
      const c = rules.crater;
      if (!c.enabled) return 'done';
      team.crater = { climbed: 0, need: c.climb };
      tx.effects.push({ type: 'crater', teamId: team.id, position: pos, result: 'fall', roll: 0, climbed: 0, need: c.climb });
      feed(tx, FIELD_INFO[field].icon, `${teamLabel(team)} rutscht in den Krater! Zum Herausklettern braucht es ${c.climb} Augen`, team.id);
      return 'done';
    }
    case 'volcano': {
      if (!rules.volcano.enabled) return 'done';
      tx.effects.push({ type: 'field', teamId: team.id, field, position: pos, text: `+${rules.volcano.pressurePerField} Druck` });
      addPressure(tx, rules.volcano.pressurePerField, `${teamLabel(team)} heizt den Vulkan an`);
      return 'done';
    }
    default:
      return 'done';
  }
}

/** Wie fühlt sich das Team nach seinem Zug? Steuert die kurze Reaktion der Figur auf dem Beamer. */
export function moodAfterTurn(effects: readonly EffectInput[], teamId: string, gain: number): Mood {
  let mood: Mood | null = null;
  let positive = false;
  for (const e of effects) {
    if (e.type === 'eruption') {
      if (e.affected.some((a) => a.teamId === teamId)) mood = 'shock';
      continue;
    }
    if (!('teamId' in e) || e.teamId !== teamId) {
      if (e.type === 'swap' && (e.a === teamId || e.b === teamId)) positive ||= gain > 0;
      continue;
    }
    switch (e.type) {
      case 'summit':
        return 'super';
      case 'crater':
        if (e.result === 'fall') mood = 'shock';
        else if (e.result === 'climb') mood ??= 'meh';
        else positive = true;
        break;
      case 'cave':
        if (e.stage === 'roll') {
          if (e.success) positive = true;
          else mood = 'shock';
        }
        break;
      case 'river':
        if (e.result === 'fall') mood ??= 'sad';
        else if (e.result === 'safe') positive = true;
        break;
      case 'inside':
        if (e.stage === 'enter') mood ??= 'angry';
        else if (e.stage === 'exit') return 'super';
        else mood ??= 'meh';
        break;
      case 'barrier':
        if (e.result === 'blocked' || e.result === 'stuck') mood ??= 'angry';
        else positive = true;
        break;
      case 'final_roll':
        if (!e.success) mood = 'sad';
        break;
      case 'field':
        if (e.field === 'catapult_backward' || e.field === 'skull') mood = 'shock';
        if (e.field === 'catapult_forward') positive = true;
        break;
      case 'vine':
        positive = true;
        break;
      case 'field_game':
        if (e.stage === 'won') positive = true;
        if (e.stage === 'lost') mood ??= 'sad';
        break;
      default:
        break;
    }
  }
  if (mood) return mood;
  if (gain < 0) return gain <= -5 ? 'angry' : 'sad';
  if (gain >= 7 || (positive && gain >= 4)) return 'super';
  if (gain >= 4 || positive) return 'happy';
  if (gain >= 2) return 'ok';
  return 'meh';
}

/** Reaktion am Ende des Zuges anhängen (Gewinn bezogen auf die Position vor dem Wurf). */
function react(tx: Tx, team: Team, from: number, startEffects: number) {
  if (tx.ctx.reactions === false) return;
  const gain = team.position - from;
  tx.effects.push({ type: 'react', teamId: team.id, mood: moodAfterTurn(tx.effects.slice(startEffects), team.id, gain), gain });
}

function pushHistory(tx: Tx, phase: DicePhase) {
  const s = tx.s;
  if (s.history.some((h) => h.round === s.round)) return;
  const positions: Record<string, number> = {};
  for (const t of s.teams) positions[t.id] = t.position;
  s.history.push({
    round: s.round,
    itemId: phase.results?.itemId ?? null,
    title: phase.results?.title ?? '',
    kind: phase.results?.kind ?? null,
    ranking: (phase.results?.entries ?? []).map((e) => ({ teamId: e.teamId, rank: e.rank, bonusDie: e.bonusDie })),
    positions,
    rolls: phase.dice.rolls.map((r) => ({ teamId: r.teamId, total: r.total })),
    at: tx.ctx.now,
  });
}

function endRound(tx: Tx, phase: DicePhase) {
  const s = tx.s;
  pushHistory(tx, phase);
  const before = s.history.at(-2)?.positions ?? {};
  for (const t of s.teams) t.bonusDie = 0;
  const eruptionsBefore = s.volcano.eruptions;
  addPressure(tx, s.config.rules.volcano.pressurePerRound, 'Die Runde ist vorbei');
  // Positionen nach einem möglichen Ausbruch im Verlauf aktualisieren.
  const last = s.history.at(-1)!;
  for (const t of s.teams) last.positions[t.id] = t.position;
  s.phase = {
    name: 'round_end',
    summary: {
      round: s.round,
      title: phase.results?.title ?? '',
      moves: s.teams.map((t) => ({ teamId: t.id, from: before[t.id] ?? 0, to: t.position })),
      eruption: s.volcano.eruptions > eruptionsBefore,
    },
  };
  tx.effects.push({ type: 'round_end', round: s.round });
  feed(tx, '🏁', `Runde ${s.round} ist vorbei`);
}

function advanceTurn(tx: Tx, phase: DicePhase) {
  const dice = phase.dice;
  dice.index += 1;
  const next = currentTeamId(dice);
  if (next) tx.effects.push({ type: 'turn', teamId: next });
  else endRound(tx, phase);
}

function bump(tx: Tx, phase: DicePhase, startEffects: number) {
  const added = tx.effects.slice(startEffects);
  phase.dice.busyUntil = Math.max(phase.dice.busyUntil, tx.ctx.now) + effectsDuration(added);
}

export function handleDiceCommand(
  tx: Tx,
  cmd: CommandOf<
    'dice.roll' | 'dice.skip' | 'vine.roll' | 'challenge.roll' | 'challenge.choose' | 'fieldgame.setup' | 'fieldgame.result' | 'fieldgame.cancel' | 'round.next' | 'volcano.set' | 'volcano.erupt'
  >,
) {
  const s = tx.s;
  const now = tx.ctx.now;
  const rules = s.config.rules;

  switch (cmd.type) {
    case 'dice.roll': {
      const phase = dicePhase(tx);
      const dice = phase.dice;
      if (dice.fieldGame) fail('Zuerst muss das Feld-Minispiel abgeschlossen werden');
      if (dice.challenge) fail(dice.challenge.kind === 'river' ? 'Zuerst müssen Fässer oder Kisten gewählt werden' : dice.challenge.kind === 'vine' ? 'Zuerst muss an der Liane gewürfelt werden' : 'Zuerst muss die Mutprobe an der Lavahöhle gewürfelt werden');
      const currentId = currentTeamId(dice);
      if (!currentId) fail('Alle Teams haben schon gewürfelt');
      const staff = isStaff(tx.actor);
      const team = resolveTeamFor(tx, cmd.teamId ?? (staff ? currentId : undefined));
      if (team.id !== currentId) fail(`${teamLabel(findTeam(s, currentId))} ist gerade dran`, 'forbidden');
      if (now < dice.busyUntil - 300 && !(staff && cmd.force)) fail('Einen Moment – auf dem Spielbrett läuft noch die Animation', 'busy');

      const start = tx.effects.length;
      const goal = goalOf(s);
      const main = staff && cmd.main ? cmd.main : randInt(tx.ctx.rng, 1, 6);
      const bonusDie = team.bonusDie;
      const bonus = bonusDie > 0 ? (staff && cmd.bonus ? Math.min(cmd.bonus, bonusDie) : randInt(tx.ctx.rng, 1, bonusDie)) : 0;
      const total = main + bonus;
      const manual = Boolean(staff && cmd.main);
      const from = team.position;
      tx.effects.push({ type: 'dice', teamId: team.id, main, bonus, bonusDie, total, manual });
      team.bonusDie = 0;
      const record: RollRecord = { teamId: team.id, main, bonus, bonusDie, total, from, to: from, outcome: '', manual, at: now };
      dice.rolls.push(record);
      let outcome = '';
      let result: 'done' | 'pending' | 'finished' = 'done';
      const rollText = bonus ? `${main} + ${bonus} = ${total}` : `${main}`;

      if (rules.winRule === 'final_roll' && team.position === goal) {
        const success = total >= rules.finalRollMin;
        tx.effects.push({ type: 'final_roll', teamId: team.id, roll: total, needed: rules.finalRollMin, success });
        if (success) {
          outcome = 'Siegeswurf!';
          victory(tx, team);
          result = 'finished';
        } else {
          outcome = `Siegeswurf verfehlt (${total} < ${rules.finalRollMin})`;
          feed(tx, '😬', `${teamLabel(team)} würfelt ${rollText} – knapp vorbei, nächste Runde nochmal!`, team.id);
        }
      } else if (team.inside) {
        // Strafweg im Vulkan: genau aufs Ausgangsfeld oder bis zum Ende laufen, dann zurück auf die Insel
        const ins = team.inside;
        const len = rules.inside.length;
        const reached = ins.step + total;
        const shout = reached === rules.inside.shout;
        const to = Math.min(len, reached);
        tx.effects.push({ type: 'inside', teamId: team.id, stage: 'walk', from: ins.step, to, returnTo: ins.returnTo, shout: false });
        if (shout || reached >= len) {
          tx.effects.push({ type: 'inside', teamId: team.id, stage: 'exit', from: to, to, returnTo: ins.returnTo, shout });
          team.inside = null;
          feed(tx, '🌋', shout ? `${teamLabel(team)} trifft das Ausgangsfeld und darf sofort aus dem Vulkan!` : `${teamLabel(team)} hat den Weg durch den Vulkan geschafft und ist zurück auf der Insel`, team.id);
          outcome = shout ? 'Ausgangsfeld – raus aus dem Vulkan' : 'Raus aus dem Vulkan';
        } else {
          ins.step = to;
          feed(tx, '🌋', `${teamLabel(team)} würfelt ${rollText} im Vulkan – noch ${len - to} Felder bis zum Ausgang`, team.id);
          outcome = `Im Vulkan (${to}/${len})`;
        }
      } else if (team.crater) {
        // Herausklettern: Augen sammeln, der Rest geht auf dem Weg weiter
        const c = team.crater;
        c.climbed += total;
        if (c.climbed >= c.need) {
          const rest = c.climbed - c.need;
          tx.effects.push({ type: 'crater', teamId: team.id, position: team.position, result: 'out', roll: total, climbed: c.need, need: c.need });
          team.crater = null;
          feed(tx, '🧗', rest ? `${teamLabel(team)} klettert aus dem Krater und läuft ${rest} Felder weiter` : `${teamLabel(team)} klettert aus dem Krater`, team.id);
          outcome = rest ? `Aus dem Krater, ${rest} Felder` : 'Aus dem Krater geklettert';
          if (rest > 0) result = walk(tx, phase, team, rest, 'dice');
        } else {
          tx.effects.push({ type: 'crater', teamId: team.id, position: team.position, result: 'climb', roll: total, climbed: c.climbed, need: c.need });
          feed(tx, '🧗', `${teamLabel(team)} würfelt ${rollText} und klettert – noch ${c.need - c.climbed} Augen bis zum Rand`, team.id);
          outcome = `Klettert (${c.climbed}/${c.need})`;
        }
      } else if (team.blocked) {
        if (barrierMet(rules.barrier, main)) {
          team.blocked = null;
          tx.effects.push({ type: 'barrier', teamId: team.id, roll: main, result: 'released' });
          feed(tx, '🔓', `${teamLabel(team)} würfelt ${main} und ist frei!`, team.id);
          outcome = `Befreit, ${total} Felder`;
          result = walk(tx, phase, team, total, 'dice');
        } else {
          team.blocked.attempts += 1;
          const max = rules.barrierMaxAttempts;
          if (max > 0 && team.blocked.attempts >= max) {
            team.blocked = null;
            tx.effects.push({ type: 'barrier', teamId: team.id, roll: main, result: 'opened' });
            outcome = 'Sperre öffnet sich (nächste Runde frei)';
            feed(tx, '🔓', `${teamLabel(team)} würfelt ${main} – nach ${max} Versuchen öffnet sich die Sperre`, team.id);
          } else {
            tx.effects.push({ type: 'barrier', teamId: team.id, roll: main, result: 'stuck' });
            outcome = 'Sitzt weiter fest';
            feed(tx, '🚧', `${teamLabel(team)} würfelt ${main} – sitzt weiter fest`, team.id);
          }
        }
      } else {
        result = walk(tx, phase, team, total, 'dice');
        feed(tx, '🎲', `${teamLabel(team)} würfelt ${rollText} → Feld ${team.position}`, team.id);
        outcome = result === 'pending' ? `${total} Felder (Halt bei Feld ${team.position})` : `${total} Felder`;
      }

      record.to = team.position;
      record.outcome = outcome;
      if (result === 'finished') {
        tx.label = `Siegeswurf ${teamLabel(team)}`;
        return;
      }
      tx.label = `Wurf ${teamLabel(team)}: ${rollText}`;
      if (result !== 'pending') {
        react(tx, team, from, start);
        advanceTurn(tx, phase);
      }
      if (s.phase.name === 'dice' || s.phase.name === 'round_end') bump(tx, phase, start);
      return;
    }

    case 'dice.skip': {
      const phase = dicePhase(tx);
      const id = currentTeamId(phase.dice);
      if (!id) fail('Niemand ist mehr dran');
      phase.dice.challenge = null;
      delete phase.dice.vine;
      const openFg = phase.dice.fieldGame;
      if (openFg) {
        if (openFg.stage === 'running') undoDraw(tx, openFg.drawn, openFg.item?.playerCount ?? '1');
        phase.dice.fieldGame = null;
      }
      const t = findTeam(s, id);
      t.bonusDie = 0;
      feed(tx, '⏭️', `${teamLabel(t)} wurde übersprungen`, t.id);
      tx.label = `${teamLabel(t)} übersprungen`;
      advanceTurn(tx, phase);
      return;
    }

    case 'vine.roll':
    case 'challenge.roll': {
      const phase = dicePhase(tx);
      const dice = phase.dice;
      const c = dice.challenge;
      if (!c || c.kind === 'river') fail('Gerade wartet keine Mutprobe mit Würfel');
      const staff = isStaff(tx.actor);
      const team = resolveTeamFor(tx, cmd.teamId ?? (staff ? c.teamId : undefined));
      if (team.id !== c.teamId) fail(`${teamLabel(findTeam(s, c.teamId))} ist bei der Mutprobe dran`, 'forbidden');
      if (now < dice.busyUntil - 300 && !(staff && cmd.force)) fail('Einen Moment – auf dem Spielbrett läuft noch die Animation', 'busy');
      const start = tx.effects.length;
      dice.challenge = null;
      const record = [...dice.rolls].reverse().find((r) => r.teamId === team.id);
      let result: 'done' | 'pending' | 'finished' = 'done';
      let note = '';
      if (c.kind === 'vine') {
        const sides = rules.vine?.sides ?? 6;
        const roll = staff && cmd.value ? Math.min(cmd.value, sides) : randInt(tx.ctx.rng, 1, sides);
        tx.effects.push({ type: 'vine', teamId: team.id, position: team.position, stage: 'swing', roll, sides, remaining: c.remaining });
        move(tx, team, c.position + roll, 'vine');
        feed(tx, '🌿', `${teamLabel(team)} würfelt ${roll} und schwingt über den Bach bis Feld ${team.position}${c.remaining ? ` – jetzt noch ${c.remaining} Felder` : ''}`, team.id);
        note = `Liane +${roll}`;
        tx.label = `Lianen-Wurf ${teamLabel(team)}: ${roll}`;
        result = checkArrival(tx, team) ? 'finished' : walk(tx, phase, team, c.remaining, 'dice');
      } else {
        const need = rules.cave.need;
        const roll = staff && cmd.value ? Math.min(cmd.value, 6) : randInt(tx.ctx.rng, 1, 6);
        const success = roll >= need;
        tx.effects.push({ type: 'cave', teamId: team.id, position: team.position, stage: 'roll', roll, need, success, remaining: c.remaining });
        tx.label = `Mutprobe ${teamLabel(team)}: ${roll}`;
        if (success) {
          feed(tx, '🦇', `${teamLabel(team)} würfelt ${roll} – geschafft, weiter geht’s!`, team.id);
          note = `Mutprobe ${roll} ✓`;
          result = walk(tx, phase, team, c.remaining, 'dice');
        } else {
          note = `Mutprobe ${roll} ✗ – Vulkan`;
          enterInside(tx, team);
        }
      }
      if (record) {
        record.to = team.position;
        record.outcome = `${record.outcome} · ${note}`;
      }
      if (result === 'finished') return;
      if (result !== 'pending') {
        react(tx, team, record?.from ?? team.position, start);
        advanceTurn(tx, phase);
      }
      if (s.phase.name === 'dice' || s.phase.name === 'round_end') bump(tx, phase, start);
      return;
    }

    case 'challenge.choose': {
      const phase = dicePhase(tx);
      const dice = phase.dice;
      const c = dice.challenge;
      if (!c || c.kind !== 'river') fail('Gerade steht niemand am Wasserfall');
      const staff = isStaff(tx.actor);
      const team = resolveTeamFor(tx, cmd.teamId ?? (staff ? c.teamId : undefined));
      if (team.id !== c.teamId) fail(`${teamLabel(findTeam(s, c.teamId))} ist am Wasserfall dran`, 'forbidden');
      if (now < dice.busyUntil - 300 && !(staff && cmd.force)) fail('Einen Moment – auf dem Spielbrett läuft noch die Animation', 'busy');
      const start = tx.effects.length;
      dice.challenge = null;
      const fall = staff && cmd.result ? cmd.result === 'fall' : randInt(tx.ctx.rng, 1, 100) <= rules.river.fallChance;
      const what = cmd.choice === 'barrels' ? 'Fässer' : 'Kisten';
      tx.effects.push({ type: 'river', teamId: team.id, position: team.position, stage: 'cross', choice: cmd.choice, result: fall ? 'fall' : 'safe', remaining: c.remaining });
      const span = riverSpan(s.config.board.fields);
      if (span) move(tx, team, span.exit, 'river');
      let result: 'done' | 'pending' | 'finished' = 'done';
      if (fall) {
        feed(tx, '💦', `${teamLabel(team)} wählt die ${what} – die brechen ein! Platsch, ans andere Ufer schwimmen, der restliche Wurf verfällt`, team.id);
      } else {
        feed(tx, '🛢️', `${teamLabel(team)} wählt die ${what} und kommt trocken rüber${c.remaining ? ` – noch ${c.remaining} Felder` : ''}`, team.id);
        result = checkArrival(tx, team) ? 'finished' : walk(tx, phase, team, c.remaining, 'dice');
      }
      const record = [...dice.rolls].reverse().find((r) => r.teamId === team.id);
      if (record) {
        record.to = team.position;
        record.outcome = `${record.outcome} · ${what} ${fall ? '✗' : '✓'}`;
      }
      tx.label = `${what} gewählt: ${teamLabel(team)}`;
      if (result === 'finished') return;
      if (result !== 'pending') {
        react(tx, team, record?.from ?? team.position, start);
        advanceTurn(tx, phase);
      }
      if (s.phase.name === 'dice' || s.phase.name === 'round_end') bump(tx, phase, start);
      return;
    }

    case 'fieldgame.setup': {
      const phase = dicePhase(tx);
      const fg = phase.dice.fieldGame;
      if (!fg) fail('Kein Feld-Minispiel offen');
      if (fg.stage === 'running') undoDraw(tx, fg.drawn, fg.item?.playerCount ?? '1');
      const others = s.teams.filter((t) => t.id !== fg.teamId);
      if (others.length === 0) fail('Es gibt keine Gegner');
      let item = null;
      if (cmd.itemId) {
        item = tx.ctx.lookup(cmd.itemId) ?? null;
        if (!item) fail('Minispiel nicht gefunden', 'not_found');
      } else if (cmd.itemId === undefined) {
        const pool = tx.ctx.pool.filter(
          (i) => i.fieldModes.length > 0 && (!cmd.mode || i.fieldModes.includes(cmd.mode)),
        );
        const fresh = pool.filter((i) => !s.playedItemIds.includes(i.id));
        item = pick(tx.ctx.rng, fresh.length ? fresh : pool) ?? null;
      }
      const allowed = rules.fieldGame.modes;
      const itemModes = (item?.fieldModes ?? []).filter((m) => allowed.includes(m));
      const mode: FieldGameMode =
        cmd.mode ?? pick(tx.ctx.rng, itemModes.length ? itemModes : allowed) ?? 'vs_all';
      const opponents =
        mode === 'duel'
          ? [cmd.opponentId ? findTeam(s, cmd.opponentId) : pick(tx.ctx.rng, others)!]
          : others;
      if (opponents.some((o) => o.id === fg.teamId)) fail('Ein Team kann nicht gegen sich selbst spielen');
      fg.mode = mode;
      fg.item = item;
      fg.opponentIds = opponents.map((o) => o.id);
      fg.drawn = drawForTeams(tx, [fg.teamId, ...fg.opponentIds], item?.playerCount ?? '1');
      fg.stage = 'running';
      if (item && !s.playedItemIds.includes(item.id)) s.playedItemIds.push(item.id);
      tx.effects.push({ type: 'field_game', teamId: fg.teamId, stage: 'running' });
      const t = findTeam(s, fg.teamId);
      const vs = mode === 'duel' ? teamLabel(opponents[0]!) : 'alle';
      tx.label = `Feld-Minispiel: ${teamLabel(t)} gegen ${vs}`;
      feed(tx, '🎮', `${item?.title ?? 'Feld-Minispiel'}: ${teamLabel(t)} gegen ${vs} (${FIELD_GAME_MODE_LABEL[mode]})`, t.id);
      return;
    }

    case 'fieldgame.result': {
      const phase = dicePhase(tx);
      const fg = phase.dice.fieldGame;
      if (!fg || fg.stage !== 'running') fail('Kein laufendes Feld-Minispiel');
      const team = findTeam(s, fg.teamId);
      const start = tx.effects.length;
      tx.effects.push({ type: 'field_game', teamId: team.id, stage: cmd.won ? 'won' : 'lost' });
      phase.dice.fieldGame = null;
      if (cmd.won) {
        advance(tx, team, rules.fieldGame.rewardWin, 'reward');
        feed(tx, '🏅', `${teamLabel(team)} gewinnt das Feld-Minispiel und zieht ${rules.fieldGame.rewardWin} Felder vor!`, team.id);
        tx.label = `Feld-Minispiel gewonnen: ${teamLabel(team)}`;
        if (checkArrival(tx, team)) return;
      } else {
        if (rules.fieldGame.penaltyLoss > 0) move(tx, team, team.position - rules.fieldGame.penaltyLoss, 'penalty');
        feed(tx, '😕', `${teamLabel(team)} verliert das Feld-Minispiel`, team.id);
        tx.label = `Feld-Minispiel verloren: ${teamLabel(team)}`;
      }
      const record = [...phase.dice.rolls].reverse().find((r) => r.teamId === team.id);
      react(tx, team, record?.from ?? team.position, start);
      advanceTurn(tx, phase);
      bump(tx, phase, start);
      return;
    }

    case 'fieldgame.cancel': {
      const phase = dicePhase(tx);
      const fg = phase.dice.fieldGame;
      if (!fg) fail('Kein Feld-Minispiel offen');
      if (fg.stage === 'running') undoDraw(tx, fg.drawn, fg.item?.playerCount ?? '1');
      phase.dice.fieldGame = null;
      tx.effects.push({ type: 'field_game', teamId: fg.teamId, stage: 'cancelled' });
      tx.label = 'Feld-Minispiel übersprungen';
      feed(tx, '⏭️', 'Feld-Minispiel übersprungen');
      advanceTurn(tx, phase);
      return;
    }

    case 'round.next': {
      if (s.phase.name !== 'round_end') fail('Die Runde ist noch nicht vorbei');
      s.phase = { name: 'idle' };
      tx.label = 'Nächste Runde';
      return;
    }

    case 'volcano.set': {
      s.volcano.pressure = Math.min(cmd.pressure, rules.volcano.threshold);
      tx.effects.push({ type: 'volcano', pressure: s.volcano.pressure, threshold: rules.volcano.threshold });
      tx.label = `Vulkandruck auf ${s.volcano.pressure} gesetzt`;
      return;
    }

    case 'volcano.erupt': {
      if (s.status !== 'running') fail('Das Spiel läuft nicht');
      erupt(tx);
      tx.label = 'Vulkanausbruch ausgelöst';
      if (s.phase.name === 'dice') s.phase.dice.busyUntil = now + effectsDuration(tx.effects);
      return;
    }
  }
}
