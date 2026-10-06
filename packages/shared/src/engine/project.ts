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
  if (viewer.role === 'admin') return state;
  // Moderator sieht alles außer den Beitritts-Geheimnissen: ein (evtl. weitergegebener)
  // Moderator-Link soll keine Team-Tokens erzeugen können.
  if (viewer.role === 'moderator') {
    return { ...state, teams: state.teams.map((t) => ({ ...t, pin: '', joinToken: '' })) };
  }
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
  // Nicht angemeldete Geräte (auch nicht freigegebene Beamer): keine Fotos, kein Spielverlauf
  if (viewer.role === 'guest') {
    s.players = state.players.map((p) => ({ ...p, photo: null }));
    s.feed = [];
  }

  if (state.phase.name === 'content') {
    const c = state.phase.content;
    const revealed = c.stage === 'revealed';
    const answers: typeof c.answers = {};
    for (const [teamId, a] of Object.entries(c.answers)) {
      answers[teamId] =
        revealed || teamId === ownTeamId
          ? a
          : // fremde Teams vor der Auflösung: nur „hat geantwortet“, sonst nichts (auch nicht
            // der Zeitpunkt oder ob die Regie schon vorbewertet hat)
            { value: '', at: 0, byPlayerId: null, correct: null, overridden: false };
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
      dice: { ...state.phase.dice, fieldGame: { ...fg, item: stripItemSecrets(fg.item!) } },
    };
  }
  return s;
}
