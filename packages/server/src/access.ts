/**
 * Wer darf was in welchem Spiel? Gemeinsam für HTTP und WebSocket, damit beide gleich entscheiden.
 *
 *  - Konten (Haupt-Admin über ADMIN_PASSWORD, Spielleiter/weitere Admins mit E-Mail): steuern ihr
 *    gewähltes Spiel – Spielleiter nur eigene, Admins alle. Für dieses Spiel gelten sie als „admin“.
 *  - Beamer gehören einem Konto und zeigen dessen gewähltes Spiel.
 *  - Moderator, Team und Spieler hängen an genau einem Spiel (im Token).
 *  - Gäste kommen über den Spielcode.
 */
import type { GameState, Session } from '@insel/shared';
import { staffKey, teamKey } from './auth.ts';
import { config } from './config.ts';
import * as db from './db.ts';
import type { GameHub } from './hub.ts';
import { beamerKey, gameStaffKey, userKey } from './users.ts';

export interface AccountCtx {
  /** null = Haupt-Admin (ADMIN_PASSWORD) */
  userId: string | null;
  isAdmin: boolean;
  name: string;
}

/** Geprüftes Konto hinter einem Token – sonst null (abgelaufen, gesperrt, Passwort geändert …). */
export function accountOf(database: db.DB, raw: Session | null): AccountCtx | null {
  if (!raw) return null;
  if (raw.role === 'admin' && !raw.userId) {
    return config.authDisabled || raw.key === staffKey() ? { userId: null, isAdmin: true, name: 'Admin' } : null;
  }
  if (raw.role === 'leader' && raw.userId) {
    const u = db.getUser(database, raw.userId);
    if (!u || u.status !== 'active' || !raw.key || raw.key !== userKey(u)) return null;
    return { userId: u.id, isAdmin: u.role === 'admin', name: u.name };
  }
  return null;
}

/** Darf das Konto dieses Spiel steuern? (Admins alle, Spielleiter eigene) */
export function canManage(hub: GameHub, acc: AccountCtx, gameId: string): boolean {
  if (acc.isAdmin) return true;
  const m = hub.meta(gameId);
  return !!m && m.ownerId !== null && m.ownerId === acc.userId;
}

/** Gültiger Beamer-Zugang? (gehört einem Konto bzw. dem Haupt-Admin) */
function validBeamer(database: db.DB, raw: Session): boolean {
  return raw.role === 'beamer' && !!raw.key && raw.key === beamerKey(database, raw.userId ?? null);
}

/** Zu welchem geöffneten Spiel gehört ein Gerät? */
export function gameOf(database: db.DB, hub: GameHub, raw: Session | null, opts: { code?: string | null; view?: string } = {}): string | null {
  const acc = accountOf(database, raw);
  if (acc) {
    const cur = hub.currentOf(acc.userId);
    return cur && hub.get(cur) && canManage(hub, acc, cur) ? cur : null;
  }
  if (raw && validBeamer(database, raw)) {
    const cur = hub.currentOf(raw.userId ?? null);
    return cur && hub.get(cur) ? cur : null;
  }
  if (raw && (raw.role === 'moderator' || raw.role === 'team' || raw.role === 'player') && raw.gameId && hub.get(raw.gameId)) return raw.gameId;
  // ohne Passwörter (nur zum Testen im WLAN): Beamer zeigen das Spiel des Haupt-Admins
  if (config.authDisabled && opts.view === 'beamer') {
    const cur = hub.currentOf(null);
    return cur && hub.get(cur) ? cur : null;
  }
  return opts.code ? hub.byCode(opts.code) : null;
}

/**
 * Rolle eines Geräts im Spiel `gameId`. Konten werden für ihr Spiel zu „admin“ (die Engine und
 * die Sichten kennen nur admin/moderator/beamer/team/player/guest).
 */
export function effectiveSession(database: db.DB, hub: GameHub, raw: Session | null, gameId: string | null, view = ''): Session {
  const state: GameState | null = hub.get(gameId)?.state ?? null;
  const beamerFallback = config.authDisabled && view === 'beamer';
  const fallback: Session = beamerFallback ? { role: 'beamer', gameId } : { role: 'guest', gameId };
  if (!raw) return fallback;

  const acc = accountOf(database, raw);
  if (acc) {
    if (gameId && canManage(hub, acc, gameId)) return { role: 'admin', userId: acc.userId, gameId };
    return { role: acc.isAdmin ? 'admin' : 'leader', userId: acc.userId, gameId: null };
  }
  if (raw.role === 'beamer') return validBeamer(database, raw) ? { role: 'beamer', userId: raw.userId ?? null, gameId } : fallback;
  if (!state || raw.gameId !== state.id) return fallback;

  if (raw.role === 'moderator') {
    const meta = hub.meta(state.id);
    const key = meta ? gameStaffKey(database, state.id, meta.ownerId) : null;
    return config.authDisabled || (key !== null && raw.key === key) ? { role: 'moderator', gameId: state.id } : fallback;
  }
  if (raw.role === 'team') {
    const team = state.teams.find((t) => t.id === raw.teamId);
    return team && raw.key === teamKey(team.joinToken) ? { role: 'team', gameId: state.id, teamId: team.id, key: raw.key } : fallback;
  }
  if (raw.role === 'player') {
    const player = state.players.find((p) => p.id === raw.playerId);
    if (!player) return fallback;
    // An ein Team gebundener Spieler-Token (become-player): nach „Neue PIN“ (joinToken wechselt)
    // ungültig. Lobby-Token ohne Bindung (key null) bleiben gültig.
    if (raw.key) {
      const team = state.teams.find((t) => t.id === player.teamId);
      if (!team || raw.key !== teamKey(team.joinToken)) return fallback;
    }
    return { role: 'player', gameId: state.id, playerId: player.id, key: raw.key ?? null };
  }
  return fallback;
}

/** Spielleitung (Regie oder Moderator) in diesem Spiel? */
export function isGameStaff(s: Session): boolean {
  return s.role === 'admin' || s.role === 'moderator';
}
