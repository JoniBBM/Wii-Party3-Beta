/** Rangliste (Seitenleiste) und Ereignis-Ticker für Regie & Moderator. */
import { useState } from 'react';
import { Lock, MapPin, Smartphone } from 'lucide-react';
import { currentTurnTeamId, standings, type GameState, type Team } from '@insel/shared';
import { useCommand } from '../lib/hooks.ts';
import { useLive } from '../lib/live.ts';
import { FigureAvatar } from '../figure/FigurePreview.tsx';
import { Button, Card, CardHeader, NumberStepper } from '../ui/basics.tsx';
import { BonusDieBadge, TeamChip, VolcanoMeter } from '../ui/game.tsx';
import { Modal } from '../ui/overlay.tsx';

export function Standings({ state, editable }: { state: GameState; editable?: boolean }) {
  const presence = useLive((s) => s.presence);
  const [edit, setEdit] = useState<Team | null>(null);
  const goal = state.config.board.fields.length - 1;
  const turn = currentTurnTeamId(state);
  const rows = standings(state);
  const v = state.config.rules.volcano;
  return (
    <Card>
      <CardHeader title="Rangliste" sub={`Ziel: Feld ${goal}`} />
      <ul className="flex flex-col divide-y divide-line">
        {rows.length === 0 && <li className="px-5 py-6 text-center text-sm text-muted">Noch keine Teams</li>}
        {rows.map(({ team, place, members }) => {
          const pct = (team.position / goal) * 100;
          const devices = presence[team.id] ?? 0;
          return (
            <li key={team.id}>
              <button
                type="button"
                disabled={!editable}
                onClick={() => setEdit(team)}
                className={`flex w-full items-center gap-3 px-4 py-2.5 text-left transition enabled:hover:bg-bg-2 ${turn === team.id ? 'bg-accent-soft/50' : ''}`}
              >
                <span className="w-5 text-center font-display text-lg font-semibold text-muted">{place}</span>
                <FigureAvatar figure={team.figure} color={team.color} size={38} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    <TeamChip team={team} size="sm" />
                    {team.blocked && <Lock className="size-3.5 text-warn" aria-label="gesperrt" />}
                    {team.crater && <span title={`im Krater (${team.crater.climbed}/${team.crater.need})`}>🕳️</span>}
                    <BonusDieBadge sides={team.bonusDie} />
                  </span>
                  <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-bg-2">
                    <span className="block h-full rounded-full bg-accent transition-all duration-700" style={{ width: `${pct}%` }} />
                  </span>
                </span>
                <span className="flex flex-col items-end">
                  <span className="font-display text-lg font-semibold tabular-nums">{team.position}</span>
                  <span className={`inline-flex items-center gap-0.5 text-[11px] font-bold ${devices ? 'text-good' : 'text-muted'}`} title={`${devices} Geräte verbunden · ${members.length} Spieler`}>
                    <Smartphone className="size-3" />
                    {devices}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      {v.enabled && state.status !== 'lobby' && (
        <div className="border-t border-line px-5 py-3">
          <VolcanoMeter pressure={state.volcano.pressure} threshold={v.threshold} />
        </div>
      )}
      {edit && <TeamQuickEdit state={state} team={state.teams.find((t) => t.id === edit.id) ?? edit} onClose={() => setEdit(null)} />}
    </Card>
  );
}

function TeamQuickEdit({ state, team, onClose }: { state: GameState; team: Team; onClose: () => void }) {
  const { run } = useCommand();
  const goal = state.config.board.fields.length - 1;
  const [pos, setPos] = useState(team.position);
  const [bonus, setBonus] = useState(team.bonusDie);
  return (
    <Modal open onClose={onClose} title={<TeamChip team={team} size="lg" />} size="sm">
      <div className="flex flex-col gap-5">
        <div>
          <p className="label flex items-center gap-1.5">
            <MapPin className="size-3.5" /> Position korrigieren
          </p>
          <div className="flex items-center gap-3">
            <NumberStepper value={pos} onChange={setPos} min={0} max={goal} />
            <Button
              size="sm"
              variant="primary"
              disabled={pos === team.position}
              onClick={async () => {
                const r = await run({ type: 'team.setPosition', teamId: team.id, position: pos }, { success: 'Position gesetzt' });
                if (r.ok) onClose();
              }}
            >
              Setzen
            </Button>
          </div>
        </div>
        <div>
          <p className="label">Bonuswürfel</p>
          <div className="flex flex-wrap items-center gap-2">
            {[0, 2, 4, 6].map((n) => (
              <button key={n} type="button" onClick={() => setBonus(n)} className={`rounded-full border-2 px-3 py-1 text-sm font-bold ${bonus === n ? 'border-accent bg-accent-soft' : 'border-line'}`}>
                {n ? `W${n}` : 'keiner'}
              </button>
            ))}
            <Button size="sm" disabled={bonus === team.bonusDie} onClick={() => run({ type: 'team.setBonus', teamId: team.id, bonusDie: bonus }, { success: 'Bonuswürfel gesetzt' })}>
              Übernehmen
            </Button>
          </div>
        </div>
        {(team.blocked || team.crater) && (
          <Button variant="primary" onClick={() => run({ type: 'team.unblock', teamId: team.id }).then((r) => r.ok && onClose())}>
            {team.crater ? 'Aus dem Krater holen' : 'Aus der Sperre befreien'}
          </Button>
        )}
      </div>
    </Modal>
  );
}

export function Feed({ state, limit = 14 }: { state: GameState; limit?: number }) {
  const items = state.feed.slice(-limit).reverse();
  return (
    <Card>
      <CardHeader title="Was passiert ist" />
      <ul className="scroll-thin flex max-h-80 flex-col gap-0.5 overflow-y-auto px-3 py-2">
        {items.length === 0 && <li className="px-2 py-4 text-center text-sm text-muted">Noch nichts passiert.</li>}
        {items.map((f) => (
          <li key={f.id} className="flex items-start gap-2 rounded-xl px-2 py-1.5 text-sm">
            <span className="w-5 text-center">{f.icon}</span>
            <span className="flex-1 text-ink-2">{f.text}</span>
            <span className="shrink-0 text-[11px] tabular-nums text-muted">{new Date(f.at).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
