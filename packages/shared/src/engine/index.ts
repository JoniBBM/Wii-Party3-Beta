/**
 * Spiel-Engine: reine Funktion (Zustand + Befehl → neuer Zustand + Effekte).
 * Keine I/O, keine Uhr, kein Zufall von außen – alles kommt über den EngineContext.
 */
import { clone } from '../clone.ts';
import { MIN_TEAMS } from '../constants.ts';
import type { Command } from '../schemas.ts';
import type { Actor, EffectInput, GameConfig, GameState } from '../types.ts';
import { handleContentCommand } from './content.ts';
import { handleDiceCommand } from './dice.ts';
import { mayExecute } from './permissions.ts';
import { handleTeamCommand } from './teams.ts';
import { fail, feed, goalOf, teamLabel, type EngineContext, type Tx } from './tx.ts';

export { EngineError, type EngineContext } from './tx.ts';
export { mayExecute, COMMAND_ROLES, NON_UNDOABLE, NON_UNDOABLE_FROM_TEAMS } from './permissions.ts';
export { projectState, stripItemSecrets, isPrivileged } from './project.ts';
export { effectDuration, effectsDuration, DURATION } from './durations.ts';
export { currentTeamId, barrierText } from './dice.ts';
export { timerRemaining, isQuestion, computeQuestionRanking } from './content.ts';

export interface EngineResult {
  state: GameState;
  effects: EffectInput[];
  meta: Record<string, unknown>;
  label: string;
}

export function createGame(params: { id: string; config: GameConfig; now: number }): GameState {
  return {
    id: params.id,
    rev: 1,
    status: 'lobby',
    config: clone(params.config),
    registrationOpen: true,
    teams: [],
    players: [],
    round: 0,
    phase: { name: 'lobby' },
    volcano: { pressure: 0, eruptions: 0 },
    playedItemIds: [],
    planIndex: 0,
    history: [],
    feed: [],
    feedSeq: 0,
    winnerTeamId: null,
    createdAt: params.now,
    updatedAt: params.now,
  };
}

function handleGameCommand(
  tx: Tx,
  cmd: Extract<Command, { type: 'game.start' | 'game.finish' | 'game.reopenLobby' | 'plan.set' | 'config.update' }>,
) {
  const s = tx.s;
  switch (cmd.type) {
    case 'game.start': {
      if (s.status !== 'lobby') fail('Das Spiel läuft schon');
      if (s.teams.length < MIN_TEAMS) fail(`Es braucht mindestens ${MIN_TEAMS} Teams`);
      s.status = 'running';
      s.phase = { name: 'idle' };
      s.registrationOpen = false;
      tx.label = 'Spiel gestartet';
      feed(tx, '🏝️', 'Das Abenteuer beginnt!');
      return;
    }
    case 'game.finish': {
      if (s.status === 'finished') fail('Das Spiel ist schon beendet');
      const ranked = [...s.teams].sort((a, b) => b.position - a.position);
      const winner = cmd.teamId ? s.teams.find((t) => t.id === cmd.teamId) : ranked[0];
      if (!winner) fail('Kein Team vorhanden');
      s.winnerTeamId = winner.id;
      s.status = 'finished';
      s.phase = { name: 'finished' };
      tx.effects.push({ type: 'victory', teamId: winner.id });
      tx.label = 'Spiel beendet';
      feed(tx, '🏆', `Spiel beendet – ${teamLabel(winner)} gewinnt!`, winner.id);
      return;
    }
    case 'game.reopenLobby': {
      if (s.round > 0 && s.status !== 'finished') fail('Nach der ersten Runde geht das nicht mehr');
      s.status = 'lobby';
      s.phase = { name: 'lobby' };
      s.winnerTeamId = null;
      s.registrationOpen = true;
      if (s.round > 0) {
        // Neustart mit denselben Teams
        s.round = 0;
        s.history = [];
        s.playedItemIds = [];
        s.planIndex = 0;
        s.volcano = { pressure: 0, eruptions: 0 };
        for (const t of s.teams) {
          t.position = 0;
          t.bonusDie = 0;
          t.blocked = null;
        }
        for (const p of s.players) p.playCount = 0;
      }
      tx.label = 'Zurück in die Lobby';
      feed(tx, '↩️', 'Zurück in der Lobby');
      return;
    }
    case 'plan.set': {
      s.config.plan = cmd.itemIds;
      s.planIndex = Math.min(s.planIndex, cmd.itemIds.length);
      tx.label = 'Ablaufplan geändert';
      return;
    }
    case 'config.update': {
      s.config = clone(cmd.config);
      const goal = goalOf(s);
      for (const t of s.teams) t.position = Math.min(t.position, goal);
      s.volcano.pressure = Math.min(s.volcano.pressure, s.config.rules.volcano.threshold);
      s.planIndex = Math.min(s.planIndex, s.config.plan.length);
      tx.label = 'Einstellungen geändert';
      return;
    }
  }
}

export function applyCommand(state: GameState, cmd: Command, actor: Actor, ctx: EngineContext): EngineResult {
  if (!actor.system && !mayExecute(cmd.type, actor.role)) fail('Dafür fehlt die Berechtigung', 'forbidden');
  const tx: Tx = { s: clone(state), ctx, actor, effects: [], meta: {}, label: cmd.type };

  switch (cmd.type) {
    case 'registration.set':
    case 'player.register':
    case 'player.update':
    case 'player.remove':
    case 'player.assign':
    case 'team.create':
    case 'team.update':
    case 'team.remove':
    case 'team.regeneratePin':
    case 'teams.auto':
    case 'team.setPosition':
    case 'team.setBonus':
    case 'team.unblock':
      handleTeamCommand(tx, cmd);
      break;
    case 'content.select':
    case 'content.redraw':
    case 'content.open':
    case 'content.close':
    case 'content.reveal':
    case 'content.rank':
    case 'content.finish':
    case 'content.abort':
    case 'timer.start':
    case 'timer.pause':
    case 'timer.add':
    case 'answer.submit':
    case 'answer.judge':
    case 'buzz':
    case 'buzz.judge':
    case 'results.confirm':
      handleContentCommand(tx, cmd);
      break;
    case 'dice.roll':
    case 'dice.skip':
    case 'fieldgame.setup':
    case 'fieldgame.result':
    case 'fieldgame.cancel':
    case 'round.next':
    case 'volcano.set':
    case 'volcano.erupt':
      handleDiceCommand(tx, cmd);
      break;
    case 'game.start':
    case 'game.finish':
    case 'game.reopenLobby':
    case 'plan.set':
    case 'config.update':
      handleGameCommand(tx, cmd);
      break;
    default: {
      const never: never = cmd;
      fail(`Unbekannter Befehl ${(never as { type: string }).type}`);
    }
  }

  tx.s.rev = state.rev + 1;
  tx.s.updatedAt = ctx.now;
  return { state: tx.s, effects: tx.effects, meta: tx.meta, label: tx.label };
}
