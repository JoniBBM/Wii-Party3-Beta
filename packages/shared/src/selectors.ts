/** Abgeleitete Werte für alle Oberflächen (Rangliste, Phasentexte, Statistik). */
import { CONTENT_KIND_INFO, teamColor } from './constants.ts';
import type { GameState, Player, Team } from './types.ts';

export interface Standing {
  team: Team;
  place: number;
  members: Player[];
}

export function standings(state: GameState): Standing[] {
  const sorted = [...state.teams].sort((a, b) => {
    if (state.winnerTeamId === a.id) return -1;
    if (state.winnerTeamId === b.id) return 1;
    return b.position - a.position || a.createdAt - b.createdAt;
  });
  let place = 0;
  let lastPos = -1;
  return sorted.map((team, i) => {
    if (team.position !== lastPos || state.winnerTeamId === team.id) place = i + 1;
    lastPos = team.position;
    return { team, place, members: state.players.filter((p) => p.teamId === team.id) };
  });
}

export function teamById(state: GameState, id: string | null | undefined): Team | undefined {
  return state.teams.find((t) => t.id === id);
}

export function playerById(state: GameState, id: string | null | undefined): Player | undefined {
  return state.players.find((p) => p.id === id);
}

export function teamDisplay(team: Team | undefined) {
  const c = teamColor(team?.color ?? 'red');
  return { name: team?.name ?? '?', color: c.hex, dark: c.dark, colorName: c.name };
}

export function currentTurnTeamId(state: GameState): string | null {
  if (state.phase.name !== 'dice') return null;
  return state.phase.dice.order[state.phase.dice.index] ?? null;
}

export function phaseTitle(state: GameState): string {
  const p = state.phase;
  switch (p.name) {
    case 'lobby':
      return 'Anmeldung & Teams';
    case 'idle':
      return state.round === 0 ? 'Gleich geht es los' : 'Nächste Runde wird vorbereitet';
    case 'content': {
      const info = CONTENT_KIND_INFO[p.content.item.kind];
      switch (p.content.stage) {
        case 'intro':
          return `${info.label}: ${p.content.item.title}`;
        case 'open':
          return info.isQuestion ? 'Jetzt antworten!' : 'Das Spiel läuft';
        case 'closed':
          return info.isQuestion ? 'Antworten geschlossen' : 'Spiel beendet';
        case 'revealed':
          return 'Auflösung';
      }
      break;
    }
    case 'results':
      return 'Ergebnis der Runde';
    case 'dice': {
      if (p.dice.fieldGame) return 'Feld-Minispiel';
      const t = teamById(state, currentTurnTeamId(state));
      return t ? `${t.name} würfelt` : 'Würfelrunde';
    }
    case 'round_end':
      return `Runde ${p.summary.round} beendet`;
    case 'finished':
      return 'Spiel beendet';
  }
  return '';
}

export interface TeamStats {
  teamId: string;
  wins: number;
  podiums: number;
  avgRank: number | null;
  totalRolled: number;
  rolls: number;
  bestRoll: number;
  positions: number[];
}

export function gameStats(state: GameState): TeamStats[] {
  return state.teams.map((t) => {
    const ranks = state.history.map((h) => h.ranking.find((r) => r.teamId === t.id)?.rank).filter((r): r is number => !!r);
    const rolls = state.history.flatMap((h) => h.rolls.filter((r) => r.teamId === t.id).map((r) => r.total));
    return {
      teamId: t.id,
      wins: ranks.filter((r) => r === 1).length,
      podiums: ranks.filter((r) => r <= 3).length,
      avgRank: ranks.length ? ranks.reduce((a, b) => a + b, 0) / ranks.length : null,
      totalRolled: rolls.reduce((a, b) => a + b, 0),
      rolls: rolls.length,
      bestRoll: rolls.length ? Math.max(...rolls) : 0,
      positions: [0, ...state.history.map((h) => h.positions[t.id] ?? 0)],
    };
  });
}
