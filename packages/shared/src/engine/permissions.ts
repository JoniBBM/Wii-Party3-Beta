import type { CommandType } from '../schemas.ts';
import type { Role } from '../types.ts';

const STAFF: Role[] = ['admin', 'moderator'];
const ADMIN: Role[] = ['admin'];
const TEAMISH: Role[] = ['team', 'player'];

/**
 * Wer darf welchen Befehl schicken? Feinere Prüfungen (z. B. „nur das eigene Team“)
 * passieren in der Engine selbst.
 */
export const COMMAND_ROLES: Record<CommandType, Role[]> = {
  'registration.set': STAFF,
  'player.register': [...STAFF, ...TEAMISH, 'guest'],
  'player.update': [...STAFF, 'player'],
  'player.remove': ADMIN,
  'player.assign': ADMIN,
  'team.create': ADMIN,
  'team.update': [...STAFF, ...TEAMISH],
  'team.remove': ADMIN,
  'team.regeneratePin': ADMIN,
  'teams.auto': ADMIN,
  'team.setPosition': ADMIN,
  'team.setBonus': ADMIN,
  'team.unblock': STAFF,

  'game.start': STAFF,
  'game.finish': ADMIN,
  'game.reopenLobby': ADMIN,
  'content.select': STAFF,
  'content.redraw': STAFF,
  'content.open': STAFF,
  'content.close': STAFF,
  'content.reveal': STAFF,
  'content.rank': STAFF,
  'content.finish': STAFF,
  'content.abort': STAFF,
  'timer.start': STAFF,
  'timer.pause': STAFF,
  'timer.add': STAFF,
  'answer.submit': [...STAFF, ...TEAMISH],
  'answer.judge': STAFF,
  buzz: TEAMISH,
  'buzz.judge': STAFF,
  'results.confirm': STAFF,
  'dice.roll': [...STAFF, ...TEAMISH],
  'dice.skip': STAFF,
  'fieldgame.setup': STAFF,
  'fieldgame.result': STAFF,
  'fieldgame.cancel': STAFF,
  'round.next': STAFF,
  'volcano.set': ADMIN,
  'volcano.erupt': ADMIN,
  'plan.set': ADMIN,
  'config.update': ADMIN,
};

export function mayExecute(type: CommandType, role: Role): boolean {
  return COMMAND_ROLES[type]?.includes(role) ?? false;
}

/** Befehle, die nie ein eigener Rückgängig-Schritt sind (hochfrequent). */
export const NON_UNDOABLE: ReadonlySet<CommandType> = new Set<CommandType>([
  'timer.start',
  'timer.pause',
  'timer.add',
]);

/**
 * Von Teams/Spielern stammende Befehle, die nicht auf den Rückgängig-Stapel kommen –
 * sonst würde „Rückgängig“ der Regie stillschweigend eine Antwort statt der eigenen Aktion löschen.
 * Würfelwürfe der Teams bleiben rückgängig machbar (häufigste Korrektur).
 */
export const NON_UNDOABLE_FROM_TEAMS: ReadonlySet<CommandType> = new Set<CommandType>([
  'answer.submit',
  'buzz',
  'player.register',
  'player.update',
  'team.update',
]);
