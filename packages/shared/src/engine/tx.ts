/**
 * Transaktionskontext: Ein Befehl arbeitet auf einer Kopie des Zustands (`s`)
 * und sammelt Effekte. Alle Hilfsfunktionen der Engine bekommen diesen Kontext.
 */
import { teamColor } from '../constants.ts';
import type { Rng } from '../rng.ts';
import type { Actor, ContentItem, EffectInput, GameState, Team } from '../types.ts';

export interface EngineContext {
  now: number;
  rng: Rng;
  /** Inhalte der im Spiel aktivierten Sammlungen. */
  pool: ContentItem[];
  /** Beliebigen Bibliotheks-Inhalt per ID finden. */
  lookup: (id: string) => ContentItem | undefined;
  newId: () => string;
  newToken: () => string;
}

export interface Tx {
  s: GameState;
  ctx: EngineContext;
  actor: Actor;
  effects: EffectInput[];
  meta: Record<string, unknown>;
  /** Kurzbeschreibung für Undo/Protokoll. */
  label: string;
}

export class EngineError extends Error {
  constructor(
    message: string,
    public code: 'invalid' | 'forbidden' | 'not_found' | 'busy' = 'invalid',
  ) {
    super(message);
    this.name = 'EngineError';
  }
}

export function fail(message: string, code?: EngineError['code']): never {
  throw new EngineError(message, code);
}

export function goalOf(s: GameState): number {
  return s.config.board.fields.length - 1;
}

export function findTeam(s: GameState, teamId: string | null | undefined): Team {
  const t = s.teams.find((x) => x.id === teamId);
  if (!t) fail('Team nicht gefunden', 'not_found');
  return t;
}

export function teamLabel(t: Team): string {
  return t.name || `Team ${teamColor(t.color).name}`;
}

export function feed(tx: Tx, icon: string, text: string, teamId?: string) {
  const s = tx.s;
  s.feedSeq += 1;
  s.feed.push({ id: s.feedSeq, at: tx.ctx.now, icon, text, ...(teamId ? { teamId } : {}) });
  if (s.feed.length > 80) s.feed.splice(0, s.feed.length - 80);
}

export function isStaff(actor: Actor): boolean {
  return actor.system === true || actor.role === 'admin' || actor.role === 'moderator';
}

/** Team des Akteurs (Team-Gerät oder Spieler mit Teamzuordnung). */
export function actorTeamId(tx: Tx): string | null {
  const a = tx.actor;
  if (a.role === 'team') return a.teamId ?? null;
  if (a.role === 'player') {
    const p = tx.s.players.find((x) => x.id === a.playerId);
    return p?.teamId ?? null;
  }
  return null;
}

/**
 * Ermittelt das Team, für das ein Befehl gilt: Team-/Spieler-Geräte immer für das eigene
 * Team, Regie/Moderator für das angegebene Team.
 */
export function resolveTeamFor(tx: Tx, requested: string | undefined): Team {
  if (isStaff(tx.actor)) {
    if (!requested) fail('Kein Team angegeben');
    return findTeam(tx.s, requested);
  }
  const own = actorTeamId(tx);
  if (!own) fail('Du bist noch keinem Team zugeordnet', 'forbidden');
  if (requested && requested !== own) fail('Das darf nur das eigene Team', 'forbidden');
  return findTeam(tx.s, own);
}
