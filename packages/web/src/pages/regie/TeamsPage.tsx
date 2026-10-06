/** Teams & Spieler verwalten: Farben, Namen, PIN/QR, Mitglieder, Fotos, Auslosung. */
import { useEffect, useState } from 'react';
import { Dices, Pencil, Plus, Printer, QrCode as QrIcon, RefreshCw, Trash2, UserPlus } from 'lucide-react';
import { MAX_TEAMS, PLAYER_EMOJIS, TEAM_COLORS, type GameState, type Player, type Team } from '@insel/shared';
import { api } from '../../lib/api.ts';
import { useCommand } from '../../lib/hooks.ts';
import { uploadPhoto } from '../../lib/image.ts';
import { useLive } from '../../lib/live.ts';
import { getToken } from '../../lib/storage.ts';
import { useJoinUrl } from '../../lib/system.ts';
import { FigureAvatar } from '../../figure/FigurePreview.tsx';
import { Badge, Button, Card, EmptyState, IconButton, Switch } from '../../ui/basics.tsx';
import { Avatar, QrCode, TeamChip } from '../../ui/game.tsx';
import { confirm, Modal } from '../../ui/overlay.tsx';
import { PhotoPicker } from '../../ui/PhotoPicker.tsx';
import { toast } from '../../ui/toast.tsx';

export function teamJoinLink(base: string, team: Team) {
  return `${base}/join/t#c=${team.id}.${team.joinToken}`;
}

export function TeamsPage() {
  const state = useLive((s) => s.state);
  const { run } = useCommand();
  const [printing, setPrinting] = useState(false);
  if (!state) return <EmptyState icon="🏝️" title="Kein Spiel aktiv">Lege zuerst unter „Live“ ein Spiel an.</EmptyState>;
  const unassigned = state.players.filter((p) => !p.teamId);
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Teams & Spieler</h1>
          <p className="text-sm text-muted">
            {state.teams.length} Teams · {state.players.length} Spieler
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Switch checked={state.registrationOpen} onChange={(open) => run({ type: 'registration.set', open })} label="Anmeldung offen" />
          <Button icon={<Printer className="size-4" />} disabled={!state.teams.length} onClick={() => setPrinting(true)}>
            QR-Codes drucken
          </Button>
          <Button variant="primary" icon={<Plus className="size-4" />} disabled={state.teams.length >= MAX_TEAMS} onClick={() => run({ type: 'team.create' }, { success: 'Team hinzugefügt' })}>
            Team
          </Button>
        </div>
      </div>

      {unassigned.length > 0 && (
        <Card className="p-4">
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="font-display font-semibold">Ohne Team ({unassigned.length})</p>
            {state.teams.length >= 2 && (
              <Button size="sm" icon={<Dices className="size-4" />} onClick={() => run({ type: 'teams.auto', count: state.teams.length, reshuffle: false })}>
                Zufällig verteilen
              </Button>
            )}
          </div>
          <PlayerList state={state} players={unassigned} />
        </Card>
      )}

      {state.teams.length === 0 ? (
        <Card>
          <EmptyState icon="👥" title="Noch keine Teams">Teams lassen sich hier einzeln anlegen oder in der Lobby automatisch bilden.</EmptyState>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
          {state.teams.map((t) => (
            <TeamCard key={t.id} state={state} team={t} />
          ))}
        </div>
      )}
      {printing && <PrintSheet state={state} onClose={() => setPrinting(false)} />}
    </div>
  );
}

function TeamCard({ state, team }: { state: GameState; team: Team }) {
  const { run } = useCommand();
  const joinUrl = useJoinUrl();
  const [name, setName] = useState(team.name);
  const [editing, setEditing] = useState(false);
  // Änderungen von anderen Geräten übernehmen, solange hier nicht getippt wird
  useEffect(() => {
    if (!editing) setName(team.name);
  }, [team.name, editing]);
  const [qr, setQr] = useState(false);
  const [newPlayer, setNewPlayer] = useState('');
  const members = state.players.filter((p) => p.teamId === team.id);
  const used = new Set(state.teams.filter((t) => t.id !== team.id).map((t) => t.color));
  const canRemove = ['lobby', 'idle', 'round_end', 'finished'].includes(state.phase.name);

  return (
    <Card className="flex flex-col overflow-hidden">
      <div className="flex items-center gap-3 border-b border-line p-4" style={{ background: `color-mix(in srgb, ${TEAM_COLORS.find((c) => c.key === team.color)!.hex} 10%, var(--surface))` }}>
        <FigureAvatar figure={team.figure} color={team.color} size={56} />
        <div className="min-w-0 flex-1">
          <input
            className="w-full rounded-xl bg-transparent px-2 py-1 font-display text-xl font-semibold outline-none focus:bg-surface"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onFocus={() => setEditing(true)}
            onBlur={() => {
              setEditing(false);
              if (name.trim() && name !== team.name) void run({ type: 'team.update', teamId: team.id, name: name.trim() });
            }}
            onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
            aria-label="Teamname"
          />
          <div className="mt-1 flex flex-wrap gap-1 px-2">
            {TEAM_COLORS.map((c) => (
              <button
                key={c.key}
                type="button"
                disabled={used.has(c.key)}
                title={used.has(c.key) ? `${c.name} (vergeben)` : c.name}
                onClick={() => run({ type: 'team.update', teamId: team.id, color: c.key })}
                className={`size-5 rounded-full transition disabled:opacity-20 ${team.color === c.key ? 'ring-2 ring-ink ring-offset-2 ring-offset-surface' : 'hover:scale-110'}`}
                style={{ background: c.hex }}
              />
            ))}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2 border-b border-line px-4 py-2.5">
        <span className="text-xs font-extrabold uppercase tracking-wide text-muted">PIN</span>
        <span className="font-mono text-xl font-bold tracking-widest">{team.pin}</span>
        <span className="flex-1" />
        <IconButton label="QR-Code zeigen" onClick={() => setQr(true)}>
          <QrIcon className="size-5" />
        </IconButton>
        <IconButton
          label="Neue PIN"
          onClick={async () => {
            if (await confirm({ title: 'Neue PIN erzeugen?', text: 'Der alte QR-Code und die alte PIN gelten dann nicht mehr für neue Geräte.', confirm: 'Neue PIN' })) {
              void run({ type: 'team.regeneratePin', teamId: team.id });
            }
          }}
        >
          <RefreshCw className="size-4" />
        </IconButton>
        {canRemove && (
          <IconButton
            label="Team entfernen"
            className="text-bad"
            onClick={async () => {
              if (await confirm({ title: `${team.name} entfernen?`, text: 'Die Spieler bleiben erhalten und landen bei „Ohne Team“.', confirm: 'Entfernen', danger: true })) {
                void run({ type: 'team.remove', teamId: team.id });
              }
            }}
          >
            <Trash2 className="size-4" />
          </IconButton>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-3 p-4">
        <PlayerList state={state} players={members} />
        <form
          className="flex gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!newPlayer.trim()) return;
            const r = await run({ type: 'player.register', name: newPlayer.trim(), teamId: team.id });
            if (r.ok) setNewPlayer('');
          }}
        >
          <input className="field h-10" placeholder="Spieler hinzufügen" value={newPlayer} onChange={(e) => setNewPlayer(e.target.value)} maxLength={40} />
          <Button type="submit" size="sm" variant="soft" icon={<UserPlus className="size-4" />} disabled={!newPlayer.trim()} className="h-10">
            <span className="sr-only">Hinzufügen</span>
          </Button>
        </form>
      </div>
      <Modal open={qr} onClose={() => setQr(false)} title={<TeamChip team={team} size="lg" />} size="sm">
        <div className="flex flex-col items-center gap-3 text-center">
          <QrCode value={teamJoinLink(joinUrl, team)} size={240} />
          <p className="text-sm text-muted">Scannen, um diesem Team beizutreten – oder unter {joinUrl}/join die PIN eingeben:</p>
          <p className="font-mono text-4xl font-bold tracking-[0.3em]">{team.pin}</p>
        </div>
      </Modal>
    </Card>
  );
}

function PlayerList({ state, players }: { state: GameState; players: Player[] }) {
  const [edit, setEdit] = useState<Player | null>(null);
  const { run } = useCommand();
  if (!players.length) return <p className="text-sm text-muted">Noch keine Spieler.</p>;
  return (
    <>
      <ul className="flex flex-col gap-1">
        {players.map((p) => (
          <li key={p.id} className="group flex items-center gap-2 rounded-xl px-1.5 py-1 hover:bg-bg-2">
            <Avatar player={p} size={32} />
            <span className={`min-w-0 flex-1 truncate font-bold ${p.selectable ? '' : 'text-muted line-through decoration-2'}`}>{p.name}</span>
            {p.playCount > 0 && <Badge>{p.playCount}× gespielt</Badge>}
            <select
              className="h-8 max-w-28 rounded-lg border border-line bg-surface px-1 text-xs font-semibold"
              value={p.teamId ?? ''}
              onChange={(e) => run({ type: 'player.assign', playerId: p.id, teamId: e.target.value || null })}
              aria-label="Team"
            >
              <option value="">ohne Team</option>
              {state.teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
            <IconButton label="Bearbeiten" className="size-8" onClick={() => setEdit(p)}>
              <Pencil className="size-4" />
            </IconButton>
          </li>
        ))}
      </ul>
      {edit && <PlayerEdit player={state.players.find((x) => x.id === edit.id) ?? edit} onClose={() => setEdit(null)} />}
    </>
  );
}

function PlayerEdit({ player, onClose }: { player: Player; onClose: () => void }) {
  const { run } = useCommand();
  const [name, setName] = useState(player.name);
  const [busy, setBusy] = useState(false);
  return (
    <Modal
      open
      onClose={onClose}
      title={`${player.name} bearbeiten`}
      footer={
        <>
          <Button
            variant="ghost"
            className="mr-auto text-bad"
            icon={<Trash2 className="size-4" />}
            onClick={async () => {
              if (await confirm({ title: `${player.name} löschen?`, text: 'Der Spieler und sein Foto werden entfernt.', confirm: 'Löschen', danger: true })) {
                const r = await run({ type: 'player.remove', playerId: player.id });
                if (r.ok) onClose();
              }
            }}
          >
            Löschen
          </Button>
          <Button variant="primary" onClick={async () => {
            if (name.trim() && name !== player.name) await run({ type: 'player.update', playerId: player.id, name: name.trim() });
            onClose();
          }}>
            Fertig
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <PhotoPicker
          current={player.photo}
          emoji={player.emoji}
          busy={busy}
          onPick={async (blob) => {
            setBusy(true);
            try {
              await uploadPhoto(blob, getToken('admin'), player.id);
            } catch (e) {
              toast.error(e instanceof Error ? e.message : 'Upload fehlgeschlagen');
            } finally {
              setBusy(false);
            }
          }}
          onRemove={() => void api(`/api/media/photo?playerId=${player.id}`, { method: 'DELETE', slot: 'admin' }).catch((e: Error) => toast.error(e.message))}
        />
        <label className="block">
          <span className="label">Name</span>
          <input className="field" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} />
        </label>
        <div>
          <span className="label">Zeichen (wenn kein Foto)</span>
          <div className="grid grid-cols-10 gap-1">
            {PLAYER_EMOJIS.map((e) => (
              <button
                key={e}
                type="button"
                onClick={() => run({ type: 'player.update', playerId: player.id, emoji: e })}
                className={`grid aspect-square place-items-center rounded-lg text-xl ${player.emoji === e ? 'bg-accent-soft ring-2 ring-accent' : 'hover:bg-bg-2'}`}
              >
                {e}
              </button>
            ))}
          </div>
        </div>
        <Switch
          checked={player.selectable}
          onChange={(v) => run({ type: 'player.update', playerId: player.id, selectable: v })}
          label="Darf für Minispiele ausgelost werden"
        />
      </div>
    </Modal>
  );
}

function PrintSheet({ state, onClose }: { state: GameState; onClose: () => void }) {
  const joinUrl = useJoinUrl();
  return (
    <div className="fixed inset-0 z-[95] overflow-auto bg-white p-8 text-black print:static print:p-0">
      <div className="mb-6 flex items-center justify-between print:hidden">
        <h2 className="text-2xl font-semibold">QR-Codes zum Ausdrucken</h2>
        <div className="flex gap-2">
          <Button onClick={onClose}>Schließen</Button>
          <Button variant="primary" icon={<Printer className="size-4" />} onClick={() => window.print()}>
            Drucken
          </Button>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-6 print:gap-4">
        {state.teams.map((t) => (
          <div key={t.id} className="flex break-inside-avoid flex-col items-center gap-2 rounded-3xl border-4 p-5 text-center" style={{ borderColor: TEAM_COLORS.find((c) => c.key === t.color)!.hex }}>
            <p className="font-display text-3xl font-semibold">{t.name}</p>
            <QrCode value={teamJoinLink(joinUrl, t)} size={220} />
            <p className="text-sm">Scannen oder auf {joinUrl}/join die PIN eingeben</p>
            <p className="font-mono text-4xl font-bold tracking-[0.3em]">{t.pin}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
