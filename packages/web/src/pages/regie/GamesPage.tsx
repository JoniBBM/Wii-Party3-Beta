/**
 * Spiele und Vorlagen. Mehrere Spiele können gleichzeitig geöffnet sein (z. B. von verschiedenen
 * Spielleitern); die Regie und die Beamer eines Kontos zeigen dessen gewähltes Spiel.
 */
import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { Download, Play, Plus, Power, Trash2 } from 'lucide-react';
import { useAccount } from '../../lib/account.ts';
import { api, downloadFile } from '../../lib/api.ts';
import { useAsync } from '../../lib/hooks.ts';
import { reloadLibrary, useLibrary } from '../../lib/library.ts';
import { onServerChanged, useLive } from '../../lib/live.ts';
import { Badge, Button, Card, CardHeader, EmptyState, IconButton } from '../../ui/basics.tsx';
import { confirm } from '../../ui/overlay.tsx';
import { toast } from '../../ui/toast.tsx';

interface GameSummary {
  id: string;
  name: string;
  code: string;
  status: 'lobby' | 'running' | 'finished';
  open: boolean;
  ownerId: string | null;
  ownerName: string;
  mine: boolean;
  teams: number;
  players: number;
  round: number;
  createdAt: number;
  updatedAt: number;
}

const STATUS: Record<GameSummary['status'], { label: string; tone: 'accent' | 'good' | 'neutral' }> = {
  lobby: { label: 'Lobby', tone: 'accent' },
  running: { label: 'läuft', tone: 'good' },
  finished: { label: 'beendet', tone: 'neutral' },
};

/**
 * Neues Spiel mit einem Klick: Name mit Datum, Standard-Vorlage (oder die gewählte) – alles Weitere
 * (Welt, Dauer, Spielfeld, Inhalte, Handys, Name) fragt danach der Einrichtungs-Assistent ab.
 */
export function useNewGame() {
  const navigate = useNavigate();
  const templates = useLibrary((s) => s.templates);
  const { busy, run } = useAsync();
  const create = async (templateId?: string) => {
    const tpl = templateId ?? (templates.find((t) => t.name.startsWith('Standard')) ?? templates[0])?.id;
    const name = `Spieleabend ${new Date().toLocaleDateString('de-DE')}`;
    const r = await run(() => api('/api/games', { slot: 'admin', body: { name, ...(tpl ? { templateId: tpl } : {}) } }), 'Neues Spiel angelegt');
    if (r) navigate('/regie/einrichten');
  };
  return { create, busy };
}

export function GamesPage() {
  const [games, setGames] = useState<GameSummary[]>([]);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const newGame = useNewGame();
  const account = useAccount((s) => s.account);
  const templates = useLibrary((s) => s.templates);
  const liveId = useLive((s) => s.state?.id ?? null);
  const { busy, run } = useAsync();

  const load = useCallback(async () => {
    const r = await api<{ games: GameSummary[]; currentGameId: string | null }>('/api/games', { slot: 'admin' });
    setGames(r.games);
    setCurrentId(r.currentGameId);
  }, []);
  useEffect(() => {
    void load();
    return onServerChanged((w) => w === 'games' && void load());
  }, [load]);
  useEffect(() => {
    void load();
  }, [liveId, load]);

  const close = (g: GameSummary) => run(() => api(`/api/games/${g.id}/close`, { slot: 'admin', body: {} }), 'Spiel geschlossen').then(load);
  const mine = games.filter((g) => g.mine);
  const others = games.filter((g) => !g.mine);
  const row = (g: GameSummary) => {
    const current = g.id === currentId && g.open;
    return (
      <li key={g.id} className={`flex flex-wrap items-center gap-3 px-5 py-3 ${current ? 'bg-accent-soft/40' : ''}`}>
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-2 font-bold">
            <span className="truncate">{g.name}</span>
            {current && <Badge tone="good">gewählt</Badge>}
            {g.open ? <Badge tone="accent">geöffnet</Badge> : <Badge>geschlossen</Badge>}
            <Badge tone={STATUS[g.status].tone}>{STATUS[g.status].label}</Badge>
          </p>
          <p className="text-xs text-muted">
            <span className="font-mono font-bold tracking-widest text-ink-2">{g.code}</span> · {g.teams} Teams · {g.players} Spieler · Runde {g.round}
            {!g.mine && ` · ${g.ownerName}`} · zuletzt {new Date(g.updatedAt).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' })}
          </p>
        </div>
        {current ? (
          <Button
            size="sm"
            icon={<Power className="size-4" />}
            onClick={async () => {
              const text = 'Handys und Beamer kommen dann nicht mehr hinein. Der Spielstand bleibt gespeichert und lässt sich jederzeit wieder öffnen.';
              if (await confirm({ title: `„${g.name}“ schließen?`, text, confirm: 'Schließen' })) await close(g);
            }}
          >
            Schließen
          </Button>
        ) : (
          <>
            {g.open && (
              <IconButton label="Schließen" onClick={() => void close(g)}>
                <Power className="size-4" />
              </IconButton>
            )}
            <Button size="sm" variant="primary" icon={<Play className="size-4" />} loading={busy} onClick={() => run(() => api(`/api/games/${g.id}/select`, { slot: 'admin', body: {} }), 'Spiel gewählt').then(load)}>
              {g.open ? 'Wählen' : 'Öffnen'}
            </Button>
          </>
        )}
        <IconButton label="Exportieren" onClick={() => downloadFile(`/api/games/${g.id}/export`, 'admin').catch((e: Error) => toast.error(e.message))}>
          <Download className="size-4" />
        </IconButton>
        <IconButton
          label="Löschen"
          className="text-bad"
          onClick={async () => {
            if (await confirm({ title: `„${g.name}“ löschen?`, text: 'Spielstand, Teams, Spieler und alle Fotos dieses Spiels werden endgültig gelöscht.', confirm: 'Löschen', danger: true })) {
              await run(() => api(`/api/games/${g.id}`, { method: 'DELETE', slot: 'admin' }), 'Spiel gelöscht');
              await load();
            }
          }}
        >
          <Trash2 className="size-4" />
        </IconButton>
      </li>
    );
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Spiele & Vorlagen</h1>
        <Button variant="primary" icon={<Plus className="size-4" />} loading={newGame.busy} onClick={() => void newGame.create()}>
          Neues Spiel
        </Button>
      </div>

      <Card>
        <CardHeader
          title={account?.isAdmin ? 'Meine Spiele' : 'Deine Spiele'}
          sub="Jedes Spiel hat einen Spielcode (steckt in allen QR-Codes). Geöffnete Spiele laufen gleichzeitig; Regie und Beamer zeigen das gewählte."
        />
        {mine.length === 0 ? <EmptyState icon="🎲" title="Noch keine Spiele" /> : <ul className="divide-y divide-line">{mine.map(row)}</ul>}
      </Card>

      {account?.isAdmin && others.length > 0 && (
        <Card>
          <CardHeader title="Spiele der Spielleiter" sub="Als Admin kannst du jedes Spiel öffnen, steuern, schließen oder löschen." />
          <ul className="divide-y divide-line">{others.map(row)}</ul>
        </Card>
      )}

      <Card>
        <CardHeader title="Vorlagen" sub="Spielfeld, Regeln, Sammlungen und Ablaufplan zum Wiederverwenden. „Neues Spiel“ oben nimmt die Standard-Vorlage; neue Vorlagen entstehen unter „Spiel einrichten“." />
        {templates.length === 0 ? (
          <EmptyState icon="📋" title="Keine Vorlagen" />
        ) : (
          <ul className="divide-y divide-line">
            {templates.map((t) => (
              <li key={t.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                <div className="min-w-[12rem] flex-1">
                  <p className="font-bold">{t.name}</p>
                  <p className="text-xs text-muted">
                    {t.config.board.fields.length - 1} Felder · {t.config.collectionIds.length} Sammlungen{t.config.plan.length ? ` · Ablaufplan mit ${t.config.plan.length} Punkten` : ''}
                    {t.description && ` · ${t.description}`}
                  </p>
                </div>
                <Button size="sm" icon={<Plus className="size-4" />} loading={newGame.busy} onClick={() => void newGame.create(t.id)}>
                  Neues Spiel daraus
                </Button>
                {t.editable ? (
                  <IconButton
                    label="Vorlage löschen"
                    className="text-bad"
                    onClick={async () => {
                      if (await confirm({ title: `Vorlage „${t.name}“ löschen?`, confirm: 'Löschen', danger: true })) {
                        await run(() => api(`/api/templates/${t.id}`, { method: 'DELETE', slot: 'admin' }));
                        await reloadLibrary();
                      }
                    }}
                  >
                    <Trash2 className="size-4" />
                  </IconButton>
                ) : (
                  <Badge>vom Admin</Badge>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

    </div>
  );
}
