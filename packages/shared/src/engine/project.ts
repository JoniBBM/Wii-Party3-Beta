/**
 * Sichten auf den Zustand je Rolle. Regie & Moderator sehen alles; Beamer und Handys
 * bekommen keine Lösungen vor der Auflösung, keine fremden PINs und keine fremden Antworten.
 */
import type { ContentItem, GameState, Session } from '../types.ts';

export function stripItemSecrets(item: ContentItem): ContentItem {
  const out = { ...item, notes: '' } as ContentItem;
  switch (out.kind) {
    case 'choice':
      out.correctIndex = -1;
      break;
    case 'text':
      out.answers = [];
      break;
    case 'estimate':
      out.target = Number.NaN;
      break;
    case 'buzzer':
      out.answer = '';
      break;
  }
  return out;
}

export function isPrivileged(role: Session['role']): boolean {
  return role === 'admin' || role === 'moderator';
}

export function projectState(state: GameState, viewer: Session): GameState {
  if (isPrivileged(viewer.role)) return state;
  const ownTeamId =
    viewer.role === 'team'
      ? (viewer.teamId ?? null)
      : viewer.role === 'player'
        ? (state.players.find((p) => p.id === viewer.playerId)?.teamId ?? null)
        : null;

  const s: GameState = {
    ...state,
    teams: state.teams.map((t) =>
      t.id === ownTeamId ? { ...t, joinToken: '' } : { ...t, pin: '', joinToken: '' },
    ),
  };

  if (state.phase.name === 'content') {
    const c = state.phase.content;
    const revealed = c.stage === 'revealed';
    const answers: typeof c.answers = {};
    for (const [teamId, a] of Object.entries(c.answers)) {
      answers[teamId] =
        revealed || teamId === ownTeamId
          ? a
          : { ...a, value: '', correct: null, byPlayerId: null };
    }
    s.phase = {
      name: 'content',
      content: {
        ...c,
        item: revealed ? { ...c.item, notes: '' } : stripItemSecrets(c.item),
        answers,
      },
    };
  } else if (state.phase.name === 'dice' && state.phase.dice.fieldGame?.item) {
    const fg = state.phase.dice.fieldGame;
    s.phase = {
      ...state.phase,
      dice: { ...state.phase.dice, fieldGame: { ...fg, item: { ...fg.item!, notes: '' } } },
    };
  }
  return s;
}
