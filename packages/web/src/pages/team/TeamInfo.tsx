/** Team-Seite am Handy: Figur gestalten, Teamname, Mitglieder, PIN zum Einladen, eigenes Profil. */
import { useState } from 'react';
import { Check, Pencil, UserPlus, UserRound } from 'lucide-react';
import type { GameState } from '@insel/shared';
import { api } from '../../lib/api.ts';
import { useCommand } from '../../lib/hooks.ts';
import { uploadPhoto } from '../../lib/image.ts';
import { reauth, useLive } from '../../lib/live.ts';
import { getToken, setToken } from '../../lib/storage.ts';
import { FigureEditor } from '../../figure/FigureEditor.tsx';
import { Button, Card, CardHeader } from '../../ui/basics.tsx';
import { Avatar } from '../../ui/game.tsx';
import { PhotoPicker } from '../../ui/PhotoPicker.tsx';
import { toast } from '../../ui/toast.tsx';
import type { Me } from './TeamApp.tsx';

export function TeamInfo({ state, me }: { state: GameState; me: Me }) {
  const team = me.team!;
  const { run, pending } = useCommand();
  const [editingName, setEditingName] = useState(false);
  const [name, setName] = useState(team.name);
  const members = state.players.filter((p) => p.teamId === team.id);
  const shared = state.config.devices === 'shared';

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader title="Eure Spielfigur" sub="So lauft ihr über die Insel." />
        <div className="p-4">
          <FigureEditor
            figure={team.figure}
            color={team.color}
            saving={pending === 'team.update'}
            onSave={(figure) => run({ type: 'team.update', figure }, { success: 'Figur gespeichert' })}
          />
        </div>
      </Card>

      <Card className="p-4">
        <p className="label">Teamname</p>
        {editingName ? (
          <form
            className="flex gap-2"
            onSubmit={async (e) => {
              e.preventDefault();
              const r = await run({ type: 'team.update', name: name.trim() });
              if (r.ok) setEditingName(false);
            }}
          >
            <input className="field" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} autoFocus />
            <Button type="submit" variant="primary" icon={<Check className="size-4" />} disabled={!name.trim()}>
              <span className="sr-only">Speichern</span>
            </Button>
          </form>
        ) : (
          <button
            type="button"
            className="flex w-full items-center gap-2 text-left font-display text-xl font-semibold"
            onClick={() => {
              setName(team.name);
              setEditingName(true);
            }}
          >
            {team.name} <Pencil className="size-4 text-muted" />
          </button>
        )}
      </Card>

      <Card className="p-4">
        <p className="label">{shared ? 'Dieses Gerät gehört eurem Team' : 'Weitere Handys verbinden'}</p>
        <p className="text-sm text-ink-2">
          Auf der Startseite „Mitspielen“ → „Team-PIN“ und diese PIN eingeben:
        </p>
        <p className="mt-2 text-center font-mono text-4xl font-bold tracking-[0.35em]">{team.pin || '••••'}</p>
      </Card>

      <Card className="p-4">
        <p className="label">Mitglieder ({members.length})</p>
        <ul className="flex flex-col gap-2">
          {members.map((p) => (
            <li key={p.id} className="flex items-center gap-3">
              <Avatar player={p} size={40} />
              <span className="flex-1 font-bold">
                {p.name} {p.id === me.player?.id && <span className="text-xs text-accent">(du)</span>}
              </span>
            </li>
          ))}
        </ul>
        {shared && me.session.role === 'team' && <AddMember />}
        {!shared && me.session.role === 'team' && members.length > 0 && <BecomePlayer members={members.map((m) => ({ id: m.id, name: m.name }))} />}
      </Card>

      {me.player && <MyProfile me={me} />}
    </div>
  );
}

/** Gruppenmodus: Nachzügler direkt am Team-Gerät anmelden (Name + optional Selfie). */
function AddMember() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [added, setAdded] = useState<{ token: string; playerId: string; name: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const state = useLive((s) => s.state);
  if (!open)
    return (
      <Button variant="ghost" size="sm" className="mt-3" icon={<UserPlus className="size-4" />} onClick={() => setOpen(true)}>
        Person hinzufügen
      </Button>
    );
  if (added) {
    const p = state?.players.find((x) => x.id === added.playerId);
    return (
      <div className="mt-3 flex flex-col items-center gap-3 rounded-2xl bg-bg-2 p-3">
        <p className="font-bold">Selfie für {added.name}?</p>
        <PhotoPicker
          current={p?.photo ?? null}
          emoji={p?.emoji ?? '😀'}
          busy={busy}
          onPick={async (blob) => {
            setBusy(true);
            try {
              await uploadPhoto(blob, added.token);
              toast.success('Foto gespeichert');
            } catch (e) {
              toast.error(e instanceof Error ? e.message : 'Upload fehlgeschlagen');
            } finally {
              setBusy(false);
            }
          }}
        />
        <Button
          variant="primary"
          onClick={() => {
            setAdded(null);
            setName('');
            setOpen(false);
          }}
        >
          Fertig
        </Button>
      </div>
    );
  }
  return (
    <form
      className="mt-3 flex gap-2"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!name.trim()) return;
        setBusy(true);
        try {
          const r = await api<{ token: string; playerId: string }>('/api/auth/register', { slot: 'member', body: { name: name.trim() } });
          setAdded({ ...r, name: name.trim() });
        } catch (err) {
          toast.error(err instanceof Error ? err.message : 'Anmeldung fehlgeschlagen');
        } finally {
          setBusy(false);
        }
      }}
    >
      <input className="field" value={name} onChange={(e) => setName(e.target.value)} placeholder="Vorname" maxLength={40} autoFocus />
      <Button type="submit" variant="primary" loading={busy} disabled={!name.trim()}>
        Hinzufügen
      </Button>
    </form>
  );
}

function BecomePlayer({ members }: { members: { id: string; name: string }[] }) {
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <Button variant="ghost" size="sm" className="mt-3" icon={<UserRound className="size-4" />} onClick={() => setOpen(true)}>
        Ich bin einer davon
      </Button>
    );
  }
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {members.map((m) => (
        <Button
          key={m.id}
          size="sm"
          onClick={async () => {
            try {
              const r = await api<{ token: string }>('/api/auth/become-player', { slot: 'member', body: { playerId: m.id } });
              setToken('member', r.token);
              reauth();
              toast.success(`Hallo ${m.name}!`);
            } catch (e) {
              toast.error(e instanceof Error ? e.message : 'Fehler');
            }
          }}
        >
          {m.name}
        </Button>
      ))}
    </div>
  );
}

function MyProfile({ me }: { me: Me }) {
  const player = me.player!;
  const [busy, setBusy] = useState(false);
  return (
    <Card>
      <CardHeader title="Dein Foto" sub="Erscheint auf dem Beamer, wenn du ausgelost wirst." />
      <div className="p-4">
        <PhotoPicker
          current={player.photo}
          emoji={player.emoji}
          busy={busy}
          onPick={async (blob) => {
            setBusy(true);
            try {
              await uploadPhoto(blob, getToken('member'));
              toast.success('Foto gespeichert');
            } catch (e) {
              toast.error(e instanceof Error ? e.message : 'Upload fehlgeschlagen');
            } finally {
              setBusy(false);
            }
          }}
          onRemove={() => void api('/api/media/photo', { method: 'DELETE', slot: 'member' }).catch((e: Error) => toast.error(e.message))}
        />
      </div>
    </Card>
  );
}
