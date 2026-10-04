/** Angemeldeter Spieler ohne Team: warten auf die Einteilung (Lobby). */
import { useState } from 'react';
import type { GameState } from '@insel/shared';
import { api } from '../../lib/api.ts';
import { uploadPhoto } from '../../lib/image.ts';
import { getToken } from '../../lib/storage.ts';
import { Avatar } from '../../ui/game.tsx';
import { IslandBackdrop } from '../../ui/IslandBackdrop.tsx';
import { PhotoPicker } from '../../ui/PhotoPicker.tsx';
import { toast } from '../../ui/toast.tsx';
import type { Me } from './TeamApp.tsx';

export function WaitingForTeam({ state, me }: { state: GameState; me: Me }) {
  const [busy, setBusy] = useState(false);
  const player = me.player;
  return (
    <IslandBackdrop>
      <div className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-5 px-4 py-8">
        <div className="glass flex flex-col items-center gap-4 rounded-[28px] p-6 text-center">
          <p className="font-display text-2xl font-semibold">Du bist dabei{player ? `, ${player.name}` : ''}! 🎉</p>
          <p className="text-ink-2">Gleich werden die Teams eingeteilt. Diese Seite wechselt dann automatisch.</p>
          {player && (
            <PhotoPicker
              current={player.photo}
              emoji={player.emoji}
              busy={busy}
              onPick={async (blob) => {
                setBusy(true);
                try {
                  await uploadPhoto(blob, getToken('member'));
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : 'Upload fehlgeschlagen');
                } finally {
                  setBusy(false);
                }
              }}
              onRemove={() => void api('/api/media/photo', { method: 'DELETE', slot: 'member' }).catch(() => {})}
            />
          )}
        </div>
        <div className="glass rounded-[28px] p-4">
          <p className="label text-center">{state.players.length} Spieler angemeldet</p>
          <div className="flex flex-wrap justify-center gap-2">
            {state.players.map((p) => (
              <span key={p.id} className="inline-flex items-center gap-1.5 rounded-full bg-white/70 py-0.5 pr-2.5 pl-0.5 text-sm font-bold">
                <Avatar player={p} size={26} /> {p.name}
              </span>
            ))}
          </div>
        </div>
      </div>
    </IslandBackdrop>
  );
}
