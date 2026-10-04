/** Handy-Ansicht für Teams und Spieler. */
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { Gamepad2, LogOut, Trophy, Users } from 'lucide-react';
import { standings, teamColor, type GameState, type Player, type Session, type Team } from '@insel/shared';
import { useLive, useLiveConnection } from '../../lib/live.ts';
import { setToken } from '../../lib/storage.ts';
import { useTheme } from '../../lib/theme.ts';
import { FigureAvatar } from '../../figure/FigurePreview.tsx';
import { IconButton, Spinner } from '../../ui/basics.tsx';
import { ConnectionDot } from '../../ui/game.tsx';
import { confirm } from '../../ui/overlay.tsx';
import { TeamPlay } from './TeamPlay.tsx';
import { TeamInfo } from './TeamInfo.tsx';
import { TeamRanking } from './TeamRanking.tsx';
import { WaitingForTeam } from './WaitingForTeam.tsx';
import { useTeamEffects } from './useTeamEffects.ts';

export interface Me {
  session: Session;
  player: Player | null;
  team: Team | null;
}

export function resolveMe(state: GameState, session: Session): Me {
  const player = state.players.find((p) => p.id === session.playerId) ?? null;
  const teamId = session.role === 'team' ? session.teamId : player?.teamId;
  const team = state.teams.find((t) => t.id === teamId) ?? null;
  return { session, player, team };
}

type Tab = 'play' | 'ranking' | 'team';

export default function TeamApp() {
  useTheme(false);
  useLiveConnection('member', 'team');
  const navigate = useNavigate();
  const { state, session, received, status } = useLive();
  const [tab, setTab] = useState<Tab>('play');

  const member = session?.role === 'team' || session?.role === 'player';
  useEffect(() => {
    if (received && !member) navigate('/join', { replace: true });
  }, [received, member, navigate]);

  const me = state && session && member ? resolveMe(state, session) : null;
  useTeamEffects(me?.team?.id ?? null);

  if (!received || !state || !me) {
    return (
      <div className="grid min-h-dvh place-items-center bg-bg">
        <Spinner className="size-10" />
      </div>
    );
  }
  if (!me.team) return <WaitingForTeam state={state} me={me} />;

  const team = me.team;
  const c = teamColor(team.color);
  const goal = state.config.board.fields.length - 1;
  const place = standings(state).find((s) => s.team.id === team.id)?.place ?? 0;

  return (
    <div className="flex min-h-dvh flex-col bg-bg">
      <header
        className="sticky top-0 z-20 px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3 text-white shadow-lifted"
        style={{ background: `linear-gradient(135deg, ${c.hex} 0%, ${c.dark} 100%)` }}
      >
        <div className="mx-auto flex max-w-lg items-center gap-3">
          <FigureAvatar figure={team.figure} color={team.color} size={48} className="ring-2 ring-white/70" />
          <div className="min-w-0 flex-1">
            <p className="truncate font-display text-xl font-semibold leading-tight drop-shadow-sm">{team.name}</p>
            <p className="text-sm font-bold text-white/85">
              {me.player ? `${me.player.name} · ` : ''}Feld {team.position}/{goal} · Platz {place}
            </p>
          </div>
          <span className="rounded-full bg-white/20 px-2 py-1 [&_span]:text-white">
            <ConnectionDot status={status} />
          </span>
          <IconButton
            label="Abmelden"
            className="text-white hover:bg-white/15"
            onClick={async () => {
              if (await confirm({ title: 'Von diesem Gerät abmelden?', text: 'Du kannst jederzeit mit der Team-PIN wieder beitreten.', confirm: 'Abmelden' })) {
                setToken('member', null);
                navigate('/join');
              }
            }}
          >
            <LogOut className="size-5" />
          </IconButton>
        </div>
        <div className="mx-auto mt-2 h-2 max-w-lg overflow-hidden rounded-full bg-black/15">
          <div className="h-full rounded-full bg-white transition-all duration-700" style={{ width: `${(team.position / goal) * 100}%` }} />
        </div>
      </header>

      <main className="mx-auto w-full max-w-lg flex-1 px-4 pt-4 pb-28">
        {tab === 'play' && <TeamPlay state={state} me={me} />}
        {tab === 'ranking' && <TeamRanking state={state} teamId={team.id} />}
        {tab === 'team' && <TeamInfo state={state} me={me} />}
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
        <div className="mx-auto grid max-w-lg grid-cols-3">
          {(
            [
              ['play', 'Spiel', Gamepad2],
              ['ranking', 'Rangliste', Trophy],
              ['team', 'Team', Users],
            ] as const
          ).map(([key, label, Icon]) => (
            <button key={key} type="button" onClick={() => setTab(key)} className={`flex flex-col items-center gap-0.5 py-2.5 text-xs font-bold ${tab === key ? 'text-accent' : 'text-muted'}`}>
              <Icon className="size-6" />
              {label}
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}
