/** Kleine, spielbezogene Anzeigen, die Regie, Moderator und Handy teilen. */
import { teamById, type GameState, type Team } from '@insel/shared';
import { Avatar, TeamChip } from '../ui/game.tsx';

export function DrawnPlayers({
  state,
  drawn,
  onRedraw,
  large,
}: {
  state: GameState;
  drawn: Record<string, string[]>;
  onRedraw?: (teamId: string) => void;
  large?: boolean;
}) {
  const entries = state.teams.filter((t) => drawn[t.id]);
  if (!entries.length) return null;
  return (
    <div className={`grid gap-2 ${large ? 'sm:grid-cols-2' : 'sm:grid-cols-2 xl:grid-cols-3'}`}>
      {entries.map((t) => {
        const players = (drawn[t.id] ?? []).map((id) => state.players.find((p) => p.id === id)).filter(Boolean);
        return (
          <div key={t.id} className="flex items-center gap-3 rounded-2xl border border-line bg-surface-2 px-3 py-2">
            <TeamChip team={t} size="sm" />
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1">
              {players.length === 0 && <span className="text-sm text-muted">Keine Spieler im Team</span>}
              {players.map((p) => (
                <span key={p!.id} className={`inline-flex items-center gap-1.5 font-bold ${large ? 'text-lg' : 'text-sm'}`}>
                  <Avatar player={p} size={large ? 36 : 26} />
                  {p!.name}
                </span>
              ))}
            </div>
            {onRedraw && players.length > 0 && (
              <button type="button" className="shrink-0 rounded-full px-2 py-1 text-xs font-bold text-accent hover:bg-accent-soft" onClick={() => onRedraw(t.id)}>
                neu
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function TeamName({ state, id, size }: { state: GameState; id: string | null | undefined; size?: 'sm' | 'md' | 'lg' }) {
  return <TeamChip team={teamById(state, id)} size={size} />;
}

export function teamsOrdered(state: GameState, ids: string[]): Team[] {
  return ids.map((id) => teamById(state, id)).filter((t): t is Team => !!t);
}

export const MEDALS = ['🥇', '🥈', '🥉'];
export function placeLabel(rank: number) {
  return MEDALS[rank - 1] ?? `${rank}.`;
}
