/** Team-Seite am Handy: Figur gestalten, Teamname, Mitglieder, PIN zum Einladen, eigenes Profil. */
import { useState } from 'react';
import { Check, Pencil, UserRound } from 'lucide-react';
import type { GameState } from '@insel/shared';
import { api } from '../../lib/api.ts';
import { useCommand } from '../../lib/hooks.ts';
import { uploadPhoto } from '../../lib/image.ts';
import { reauth } from '../../lib/live.ts';
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
        <p className="label">Weitere Handys verbinden</p>
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
        {me.session.role === 'team' && members.length > 0 && <BecomePlayer members={members.map((m) => ({ id: m.id, name: m.name }))} />}
      </Card>

      {me.player && <MyProfile me={me} />}
    </div>
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
