/** Anmeldung, Teams und Spieler. */
import { MAX_TEAMS, PLAYER_EMOJIS, TEAM_COLORS, teamColor, type TeamColorKey } from '../constants.ts';
import { randomFigure } from '../defaults.ts';
import { pick, randInt, shuffle } from '../rng.ts';
import type { CommandOf } from '../schemas.ts';
import type { Team } from '../types.ts';
import { teamMembers } from './draw.ts';
import { actorTeamId, fail, feed, findTeam, goalOf, isStaff, teamLabel, type Tx } from './tx.ts';

function freeColors(tx: Tx): TeamColorKey[] {
  const used = new Set(tx.s.teams.map((t) => t.color));
  return TEAM_COLORS.map((c) => c.key).filter((k) => !used.has(k));
}

function newPin(tx: Tx): string {
  const taken = new Set(tx.s.teams.map((t) => t.pin));
  for (let i = 0; i < 1000; i++) {
    const pin = String(randInt(tx.ctx.rng, 1000, 9999));
    if (!taken.has(pin)) return pin;
  }
  fail('Keine freie PIN gefunden');
}

function requireMutableTeams(tx: Tx) {
  const p = tx.s.phase.name;
  if (p !== 'lobby' && p !== 'idle' && p !== 'round_end' && p !== 'finished') {
    fail('Teams können nur zwischen den Runden hinzugefügt oder entfernt werden');
  }
}

export function createTeam(tx: Tx, name?: string, color?: TeamColorKey): Team {
  if (tx.s.teams.length >= MAX_TEAMS) fail(`Maximal ${MAX_TEAMS} Teams`);
  const free = freeColors(tx);
  const c = color ?? free[0];
  if (!c) fail('Keine Teamfarbe mehr frei');
  if (!free.includes(c)) fail('Diese Teamfarbe ist schon vergeben');
  const team: Team = {
    id: tx.ctx.newId(),
    name: name?.trim() || `Team ${teamColor(c).name}`,
    color: c,
    position: 0,
    bonusDie: 0,
    blocked: null,
    figure: randomFigure(tx.ctx.rng),
    pin: newPin(tx),
    joinToken: tx.ctx.newToken(),
    createdAt: tx.ctx.now,
  };
  tx.s.teams.push(team);
  return team;
}

export function handleTeamCommand(tx: Tx, cmd: CommandOf<
  | 'registration.set'
  | 'player.register'
  | 'player.update'
  | 'player.remove'
  | 'player.assign'
  | 'team.create'
  | 'team.update'
  | 'team.remove'
  | 'team.regeneratePin'
  | 'teams.auto'
  | 'team.setPosition'
  | 'team.setBonus'
  | 'team.unblock'
>) {
  const s = tx.s;
  switch (cmd.type) {
    case 'registration.set': {
      s.registrationOpen = cmd.open;
      tx.label = cmd.open ? 'Anmeldung geöffnet' : 'Anmeldung geschlossen';
      feed(tx, cmd.open ? '📲' : '🔒', tx.label);
      return;
    }

    case 'player.register': {
      const staff = isStaff(tx.actor);
      // Mit Team-PIN beigetretene Geräte dürfen Spieler für ihr Team anlegen.
      const ownTeam = actorTeamId(tx);
      if (!staff && !ownTeam && !s.registrationOpen) fail('Die Anmeldung ist gerade geschlossen', 'forbidden');
      const name = cmd.name.trim();
      if (s.players.some((p) => p.name.toLowerCase() === name.toLowerCase())) {
        fail(`Der Name „${name}“ ist schon vergeben`);
      }
      let teamId: string | null = null;
      if (staff && cmd.teamId) teamId = findTeam(s, cmd.teamId).id;
      else if (ownTeam) teamId = ownTeam;
      const player = {
        id: tx.ctx.newId(),
        name,
        teamId,
        emoji: cmd.emoji || pick(tx.ctx.rng, PLAYER_EMOJIS) || '😀',
        photo: null,
        selectable: true,
        playCount: 0,
        createdAt: tx.ctx.now,
      };
      s.players.push(player);
      tx.meta.playerId = player.id;
      tx.label = `Spieler ${name} angemeldet`;
      feed(tx, player.emoji, `${name} ist dabei`, teamId ?? undefined);
      return;
    }

    case 'player.update': {
      const p = s.players.find((x) => x.id === cmd.playerId);
      if (!p) fail('Spieler nicht gefunden', 'not_found');
      const self = tx.actor.role === 'player' && tx.actor.playerId === p.id;
      if (!isStaff(tx.actor) && !self) fail('Keine Berechtigung', 'forbidden');
      if (cmd.name !== undefined) {
        const name = cmd.name.trim();
        if (s.players.some((x) => x.id !== p.id && x.name.toLowerCase() === name.toLowerCase())) {
          fail(`Der Name „${name}“ ist schon vergeben`);
        }
        p.name = name;
      }
      if (cmd.emoji !== undefined) p.emoji = cmd.emoji;
      if (cmd.photo !== undefined) p.photo = cmd.photo;
      if (cmd.selectable !== undefined) {
        if (!isStaff(tx.actor)) fail('Keine Berechtigung', 'forbidden');
        p.selectable = cmd.selectable;
      }
      tx.label = `Spieler ${p.name} geändert`;
      return;
    }

    case 'player.remove': {
      const idx = s.players.findIndex((x) => x.id === cmd.playerId);
      if (idx < 0) fail('Spieler nicht gefunden', 'not_found');
      const [p] = s.players.splice(idx, 1);
      if (s.phase.name === 'content') {
        for (const ids of Object.values(s.phase.content.drawn)) {
          const i = ids.indexOf(cmd.playerId);
          if (i >= 0) ids.splice(i, 1);
        }
      }
      tx.label = `Spieler ${p!.name} entfernt`;
      tx.meta.removedPhoto = p!.photo;
      return;
    }

    case 'player.assign': {
      const p = s.players.find((x) => x.id === cmd.playerId);
      if (!p) fail('Spieler nicht gefunden', 'not_found');
      p.teamId = cmd.teamId ? findTeam(s, cmd.teamId).id : null;
      tx.label = p.teamId ? `${p.name} → ${teamLabel(findTeam(s, p.teamId))}` : `${p.name} ohne Team`;
      return;
    }

    case 'team.create': {
      requireMutableTeams(tx);
      const t = createTeam(tx, cmd.name, cmd.color);
      tx.meta.teamId = t.id;
      tx.label = `${teamLabel(t)} erstellt`;
      feed(tx, '➕', `${teamLabel(t)} ist dabei`, t.id);
      return;
    }

    case 'team.update': {
      const staff = isStaff(tx.actor);
      const t = staff ? findTeam(s, cmd.teamId) : findTeam(s, actorTeamId(tx));
      if (!staff && cmd.teamId && cmd.teamId !== t.id) fail('Nur das eigene Team', 'forbidden');
      if (cmd.name !== undefined) t.name = cmd.name.trim() || t.name;
      if (cmd.color !== undefined && cmd.color !== t.color) {
        if (!staff && s.status !== 'lobby') fail('Die Farbe kann nur vor Spielbeginn geändert werden', 'forbidden');
        if (s.teams.some((x) => x.id !== t.id && x.color === cmd.color)) fail('Diese Farbe ist schon vergeben');
        t.color = cmd.color;
      }
      if (cmd.figure !== undefined) t.figure = cmd.figure;
      tx.label = `${teamLabel(t)} geändert`;
      return;
    }

    case 'team.remove': {
      requireMutableTeams(tx);
      const t = findTeam(s, cmd.teamId);
      s.teams = s.teams.filter((x) => x.id !== t.id);
      for (const p of s.players) if (p.teamId === t.id) p.teamId = null;
      tx.label = `${teamLabel(t)} entfernt`;
      feed(tx, '➖', tx.label);
      return;
    }

    case 'team.regeneratePin': {
      const t = findTeam(s, cmd.teamId);
      t.pin = newPin(tx);
      t.joinToken = tx.ctx.newToken();
      tx.label = `Neue PIN für ${teamLabel(t)}`;
      return;
    }

    case 'teams.auto': {
      requireMutableTeams(tx);
      if (cmd.reshuffle && s.status !== 'lobby') fail('Neu mischen geht nur vor Spielbeginn');
      if (cmd.reshuffle && s.teams.length > cmd.count) {
        const keep = s.teams.slice(0, cmd.count);
        const removed = new Set(s.teams.slice(cmd.count).map((t) => t.id));
        s.teams = keep;
        for (const p of s.players) if (p.teamId && removed.has(p.teamId)) p.teamId = null;
      }
      while (s.teams.length < cmd.count) createTeam(tx);
      const targets = s.teams;
      const movers = shuffle(
        tx.ctx.rng,
        s.players.filter((p) => cmd.reshuffle || !p.teamId),
      );
      if (cmd.reshuffle) for (const p of movers) p.teamId = null;
      for (const p of movers) {
        const sizes = targets.map((t) => ({ t, n: teamMembers(tx, t.id).length }));
        const min = Math.min(...sizes.map((x) => x.n));
        const smallest = sizes.filter((x) => x.n === min).map((x) => x.t);
        p.teamId = (pick(tx.ctx.rng, smallest) ?? targets[0]!).id;
      }
      tx.label = `Teams eingeteilt (${s.teams.length})`;
      feed(tx, '🎲', `Teams eingeteilt: ${s.teams.length} Teams`);
      return;
    }

    case 'team.setPosition': {
      const t = findTeam(s, cmd.teamId);
      const to = Math.max(0, Math.min(goalOf(s), cmd.position));
      tx.effects.push({ type: 'move', teamId: t.id, from: t.position, to, reason: 'correction' });
      t.position = to;
      tx.label = `${teamLabel(t)} auf Feld ${to} gesetzt`;
      feed(tx, '✏️', tx.label, t.id);
      return;
    }

    case 'team.setBonus': {
      const t = findTeam(s, cmd.teamId);
      t.bonusDie = cmd.bonusDie;
      tx.label = `Bonuswürfel ${teamLabel(t)}: ${cmd.bonusDie ? `W${cmd.bonusDie}` : 'keiner'}`;
      return;
    }

    case 'team.unblock': {
      const t = findTeam(s, cmd.teamId);
      if (!t.blocked) fail('Team ist nicht gesperrt');
      t.blocked = null;
      tx.effects.push({ type: 'barrier', teamId: t.id, roll: 0, result: 'opened' });
      tx.label = `${teamLabel(t)} befreit`;
      feed(tx, '🔓', `${teamLabel(t)} wurde befreit`, t.id);
      return;
    }
  }
}
