/** Lobby: Anmeldung öffnen, Teams bilden, Spiel starten. */
import { useState } from 'react';
import { Link } from 'react-router';
import { Play, Shuffle, Users } from 'lucide-react';
import { MIN_TEAMS, type GameState } from '@insel/shared';
import { useCommand } from '../lib/hooks.ts';
import { useJoinUrl } from '../lib/system.ts';
import { Button, NumberStepper, Switch } from '../ui/basics.tsx';
import { Avatar, QrCode, TeamChip, TeamDot } from '../ui/game.tsx';
import { confirm } from '../ui/overlay.tsx';

export function LobbyPanel({ state, mode }: { state: GameState; mode: 'regie' | 'moderator' }) {
  const { run, pending } = useCommand();
  const joinUrl = useJoinUrl();
  const [count, setCount] = useState(() => Math.max(2, state.teams.length || Math.min(6, Math.ceil(state.players.length / 4) || 2)));
  const unassigned = state.players.filter((p) => !p.teamId);
  const canStart = state.teams.length >= MIN_TEAMS;

  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-5 lg:grid-cols-[auto_minmax(0,1fr)]">
        <div className="flex flex-col items-center gap-2 rounded-3xl bg-bg-2 p-4">
          <QrCode value={`${joinUrl}/join`} size={170} />
          <p className="max-w-[210px] text-center text-[11px] font-bold break-all text-ink-2">{joinUrl.replace(/^https?:\/\//, '')}/join</p>
          {state.config.devices === 'shared' && (
            <p className="max-w-[210px] text-center text-xs font-bold text-accent">
              👥 Gruppenmodus: Diese Adresse auf der Anmeldestation öffnen – dort melden sich alle nacheinander an. Danach pro Team ein Gerät mit der Team-PIN verbinden.
            </p>
          )}
        </div>
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Switch checked={state.registrationOpen} onChange={(open) => run({ type: 'registration.set', open })} label={state.registrationOpen ? 'Anmeldung offen' : 'Anmeldung geschlossen'} />
            <span className="inline-flex items-center gap-1.5 text-sm font-bold text-muted">
              <Users className="size-4" /> {state.players.length} Spieler · {state.teams.length} Teams
            </span>
          </div>
          <div className="flex min-h-14 flex-wrap gap-1.5">
            {state.players.length === 0 && <p className="text-sm text-muted">Noch niemand angemeldet. QR-Code scannen lassen oder den Beamer zeigen!</p>}
            {state.players.map((p) => {
              const team = state.teams.find((t) => t.id === p.teamId);
              return (
                <span key={p.id} className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface py-0.5 pr-2.5 pl-0.5 text-sm font-bold">
                  <Avatar player={p} size={26} />
                  {p.name}
                  {team && <TeamDot team={team} size={8} />}
                </span>
              );
            })}
          </div>
          {mode === 'regie' && (
            <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-line p-3">
              <span className="text-sm font-bold">Anzahl Teams</span>
              <NumberStepper value={count} onChange={setCount} min={2} max={10} />
              <Button
                variant="soft"
                icon={<Shuffle className="size-4" />}
                loading={pending === 'teams.auto'}
                onClick={async () => {
                  const reshuffle = state.teams.length > 0;
                  if (reshuffle && !(await confirm({ title: 'Teams neu mischen?', text: 'Alle Spieler werden neu verteilt.', confirm: 'Neu mischen' }))) return;
                  void run({ type: 'teams.auto', count, reshuffle });
                }}
              >
                {state.teams.length ? 'Neu mischen' : 'Teams bilden'}
              </Button>
              {unassigned.length > 0 && state.teams.length > 0 && (
                <Button variant="ghost" onClick={() => run({ type: 'teams.auto', count: Math.max(state.teams.length, 2), reshuffle: false })}>
                  {unassigned.length} ohne Team verteilen
                </Button>
              )}
            </div>
          )}
        </div>
      </div>

      {state.teams.length > 0 && (
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {state.teams.map((t) => {
            const members = state.players.filter((p) => p.teamId === t.id);
            return (
              <div key={t.id} className="rounded-2xl border border-line p-3">
                <div className="flex items-center justify-between gap-2">
                  <TeamChip team={t} />
                  {mode === 'regie' && <span className="font-mono text-sm font-bold text-muted" title="Team-PIN">PIN {t.pin}</span>}
                </div>
                <div className="mt-2 flex flex-wrap gap-1">
                  {members.length === 0 && <span className="text-xs text-muted">noch leer</span>}
                  {members.map((p) => (
                    <span key={p.id} className="inline-flex items-center gap-1 text-xs font-bold">
                      <Avatar player={p} size={20} /> {p.name}
                    </span>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line pt-4">
        {mode === 'regie' && (
          <Link to="/regie/teams" className="btn btn-ghost h-11 px-5 text-sm">
            Teams im Detail bearbeiten
          </Link>
        )}
        <Button variant="good" size="lg" icon={<Play className="size-5" />} disabled={!canStart} loading={pending === 'game.start'} onClick={() => run({ type: 'game.start' })}>
          Spiel starten
        </Button>
      </div>
    </div>
  );
}
