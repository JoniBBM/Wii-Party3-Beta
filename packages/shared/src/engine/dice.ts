/** Würfelrunde: Wurf, Bewegung, Sonderfelder, Vulkan, Feld-Minispiele, Sieg. */
import { FIELD_GAME_MODE_LABEL, FIELD_INFO, type FieldGameMode } from '../constants.ts';
import { pick, randInt } from '../rng.ts';
import type { CommandOf } from '../schemas.ts';
import type { BarrierCondition, DiceRound, EffectInput, Phase, RollRecord, Team } from '../types.ts';
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
    if (t.position < zoneStart) continue;
    const back = randInt(tx.ctx.rng, v.knockback.min, v.knockback.max);
    const to = Math.max(0, t.position - back);
    affected.push({ teamId: t.id, from: t.position, to });
    t.position = to;
    t.blocked = null;
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
function applyField(tx: Tx, phase: DicePhase, team: Team): 'done' | 'field_game' | 'finished' {
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
      const others = s.teams.filter((t) => t.id !== team.id && t.position !== pos);
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
      return 'field_game';
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
    'dice.roll' | 'dice.skip' | 'fieldgame.setup' | 'fieldgame.result' | 'fieldgame.cancel' | 'round.next' | 'volcano.set' | 'volcano.erupt'
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
      let result: 'done' | 'field_game' | 'finished' = 'done';
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
      } else if (team.blocked) {
        if (barrierMet(rules.barrier, main)) {
          team.blocked = null;
          tx.effects.push({ type: 'barrier', teamId: team.id, roll: main, result: 'released' });
          feed(tx, '🔓', `${teamLabel(team)} würfelt ${main} und ist frei!`, team.id);
          advance(tx, team, total, 'dice');
          outcome = `Befreit, ${total} Felder`;
          result = checkArrival(tx, team) ? 'finished' : applyField(tx, phase, team);
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
        advance(tx, team, total, 'dice');
        feed(tx, '🎲', `${teamLabel(team)} würfelt ${rollText} → Feld ${team.position}`, team.id);
        outcome = `${total} Felder`;
        result = checkArrival(tx, team) ? 'finished' : applyField(tx, phase, team);
      }

      record.to = team.position;
      record.outcome = outcome;
      if (result === 'finished') {
        tx.label = `Siegeswurf ${teamLabel(team)}`;
        return;
      }
      tx.label = `Wurf ${teamLabel(team)}: ${rollText}`;
      if (result !== 'field_game') advanceTurn(tx, phase);
      if (s.phase.name === 'dice' || s.phase.name === 'round_end') bump(tx, phase, start);
      return;
    }

    case 'dice.skip': {
      const phase = dicePhase(tx);
      const id = currentTeamId(phase.dice);
      if (!id) fail('Niemand ist mehr dran');
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
