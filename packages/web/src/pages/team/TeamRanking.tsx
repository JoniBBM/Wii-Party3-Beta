import { standings, type GameState } from '@insel/shared';
import { FigureAvatar } from '../../figure/FigurePreview.tsx';
import { Card } from '../../ui/basics.tsx';
import { BonusDieBadge, TeamChip, VolcanoMeter } from '../../ui/game.tsx';
import { placeLabel } from '../../game/bits.tsx';

export function TeamRanking({ state, teamId }: { state: GameState; teamId: string }) {
  const goal = state.config.board.fields.length - 1;
  const v = state.config.rules.volcano;
  return (
    <div className="flex flex-col gap-4">
      <Card className="overflow-hidden">
        <ul className="divide-y divide-line">
          {standings(state).map(({ team, place, members }) => (
            <li key={team.id} className={`flex items-center gap-3 px-4 py-3 ${team.id === teamId ? 'bg-accent-soft/60' : ''}`}>
              <span className="w-8 text-center font-display text-xl">{placeLabel(place)}</span>
              <FigureAvatar figure={team.figure} color={team.color} size={44} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <TeamChip team={team} size="sm" />
                  {team.blocked && <span title="gesperrt">🚧</span>}
                  {team.crater && <span title="im Krater">🕳️</span>}
                  <BonusDieBadge sides={team.bonusDie} />
                </div>
                <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-bg-2">
                  <div className="h-full rounded-full bg-accent transition-all duration-700" style={{ width: `${(team.position / goal) * 100}%` }} />
                </div>
                <p className="mt-1 truncate text-xs text-muted">{members.map((m) => m.name).join(', ')}</p>
              </div>
              <span className="font-display text-xl font-semibold tabular-nums">{team.position}</span>
            </li>
          ))}
        </ul>
      </Card>
      {v.enabled && state.status === 'running' && (
        <Card className="p-4">
          <p className="label">Vulkan</p>
          <VolcanoMeter pressure={state.volcano.pressure} threshold={v.threshold} />
          <p className="mt-2 text-xs text-muted">Bei vollem Druck bricht der Vulkan aus und wirft alle Teams auf den letzten {v.zoneSize} Feldern zurück.</p>
        </Card>
      )}
    </div>
  );
}
