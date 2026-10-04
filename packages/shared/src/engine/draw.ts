/** Faire Auslosung von Spielern: wer seltener dran war, kommt zuerst. */
import type { PlayerCount } from '../constants.ts';
import { shuffle } from '../rng.ts';
import type { Tx } from './tx.ts';

export function teamMembers(tx: Tx, teamId: string) {
  return tx.s.players.filter((p) => p.teamId === teamId);
}

export function drawForTeam(tx: Tx, teamId: string, count: PlayerCount): string[] {
  const members = teamMembers(tx, teamId);
  if (members.length === 0) return [];
  if (count === 'all') return members.map((m) => m.id);
  const n = Number(count);
  const pool = members.filter((m) => m.selectable);
  const candidates = pool.length > 0 ? pool : members;
  // Nach Spielanzahl gruppieren, innerhalb der Gruppe mischen.
  const sorted = shuffle(tx.ctx.rng, candidates).sort((a, b) => a.playCount - b.playCount);
  const chosen = sorted.slice(0, Math.min(n, sorted.length));
  for (const p of chosen) p.playCount += 1;
  return chosen.map((p) => p.id);
}

export function drawForTeams(tx: Tx, teamIds: string[], count: PlayerCount): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const id of teamIds) out[id] = drawForTeam(tx, id, count);
  return out;
}

/** Vorherige Auslosung zurücknehmen (für „Neu auslosen“). */
export function undoDraw(tx: Tx, drawn: Record<string, string[]>, count: PlayerCount) {
  if (count === 'all') return;
  for (const ids of Object.values(drawn)) {
    for (const id of ids) {
      const p = tx.s.players.find((x) => x.id === id);
      if (p && p.playCount > 0) p.playCount -= 1;
    }
  }
}
