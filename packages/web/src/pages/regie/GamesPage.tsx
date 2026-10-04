/** Spiele (gespeicherte Spielstände) und Vorlagen. */
import { useCallback, useEffect, useState } from 'react';
import { Download, Play, Plus, Power, Trash2 } from 'lucide-react';
import { api, downloadFile } from '../../lib/api.ts';
import { useAsync } from '../../lib/hooks.ts';
import { reloadLibrary, useLibrary } from '../../lib/library.ts';
import { onServerChanged, useLive } from '../../lib/live.ts';
import { Badge, Button, Card, CardHeader, EmptyState, IconButton } from '../../ui/basics.tsx';
import { confirm, Modal } from '../../ui/overlay.tsx';
import { toast } from '../../ui/toast.tsx';

interface GameSummary {
  id: string;
  name: string;
  status: 'lobby' | 'running' | 'finished';
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

export function GamesPage() {
  const [games, setGames] = useState<GameSummary[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const templates = useLibrary((s) => s.templates);
  const liveId = useLive((s) => s.state?.id ?? null);
  const { busy, run } = useAsync();

  const load = useCallback(async () => {
    const r = await api<{ games: GameSummary[]; activeGameId: string | null }>('/api/games', { slot: 'admin' });
    setGames(r.games);
    setActiveId(r.activeGameId);
  }, []);
  useEffect(() => {
    void load();
    return onServerChanged((w) => w === 'games' && void load());
  }, [load]);
  useEffect(() => {
    void load();
  }, [liveId, load]);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Spiele & Vorlagen</h1>
        <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setCreating(true)}>
          Neues Spiel
        </Button>
      </div>

      <Card>
        <CardHeader title="Gespeicherte Spiele" sub="Jedes Spiel speichert Teams, Spieler, Fotos und Spielstand. Nur eines ist aktiv." />
        {games.length === 0 ? (
          <EmptyState icon="🎲" title="Noch keine Spiele" />
        ) : (
          <ul className="divide-y divide-line">
            {games.map((g) => {
              const active = g.id === activeId;
              return (
                <li key={g.id} className={`flex flex-wrap items-center gap-3 px-5 py-3 ${active ? 'bg-accent-soft/40' : ''}`}>
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2 font-bold">
                      {g.name} {active && <Badge tone="good">aktiv</Badge>} <Badge tone={STATUS[g.status].tone}>{STATUS[g.status].label}</Badge>
                    </p>
                    <p className="text-xs text-muted">
                      {g.teams} Teams · {g.players} Spieler · Runde {g.round} · zuletzt {new Date(g.updatedAt).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' })}
                    </p>
                  </div>
                  {active ? (
                    <Button size="sm" icon={<Power className="size-4" />} onClick={() => run(() => api('/api/games/deactivate', { slot: 'admin', body: {} }), 'Kein Spiel mehr aktiv').then(load)}>
                      Deaktivieren
                    </Button>
                  ) : (
                    <Button size="sm" variant="primary" icon={<Play className="size-4" />} loading={busy} onClick={() => run(() => api(`/api/games/${g.id}/activate`, { slot: 'admin', body: {} }), 'Spiel aktiviert').then(load)}>
                      Aktivieren
                    </Button>
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
            })}
          </ul>
        )}
      </Card>

      <Card>
        <CardHeader title="Vorlagen" sub="Spielfeld, Regeln, Sammlungen und Ablaufplan zum Wiederverwenden. Neue Vorlagen entstehen unter „Spiel einrichten“." />
        {templates.length === 0 ? (
          <EmptyState icon="📋" title="Keine Vorlagen" />
        ) : (
          <ul className="divide-y divide-line">
            {templates.map((t) => (
              <li key={t.id} className="flex items-center gap-3 px-5 py-3">
                <div className="min-w-0 flex-1">
                  <p className="font-bold">{t.name}</p>
                  <p className="text-xs text-muted">
                    {t.config.board.fields.length - 1} Felder · {t.config.collectionIds.length} Sammlungen{t.config.plan.length ? ` · Ablaufplan mit ${t.config.plan.length} Punkten` : ''}
                    {t.description && ` · ${t.description}`}
                  </p>
                </div>
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
              </li>
            ))}
          </ul>
        )}
      </Card>

      {creating && <NewGameModal onClose={() => setCreating(false)} onCreated={load} />}
    </div>
  );
}

function NewGameModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const templates = useLibrary((s) => s.templates);
  const [name, setName] = useState(() => `Spieleabend ${new Date().toLocaleDateString('de-DE')}`);
  const [templateId, setTemplateId] = useState((templates.find((t) => t.name.startsWith('Standard')) ?? templates[0])?.id ?? '');
  const { busy, run } = useAsync();
  return (
    <Modal
      open
      onClose={onClose}
      title="Neues Spiel"
      size="sm"
      footer={
        <Button
          variant="primary"
          loading={busy}
          disabled={!name.trim()}
          onClick={async () => {
            const r = await run(() => api('/api/games', { slot: 'admin', body: { name, ...(templateId ? { templateId } : {}) } }), 'Spiel angelegt und aktiviert');
            if (r) {
              onCreated();
              onClose();
            }
          }}
        >
          Anlegen & aktivieren
        </Button>
      }
    >
      <div className="flex flex-col gap-3">
        <input className="field" value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" />
        <select className="field" value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
          {templates.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
          <option value="">Ohne Vorlage (alle Sammlungen, 72 Felder)</option>
        </select>
        <p className="text-xs text-muted">Das bisher aktive Spiel bleibt gespeichert und kann jederzeit wieder aktiviert werden.</p>
      </div>
    </Modal>
  );
}
