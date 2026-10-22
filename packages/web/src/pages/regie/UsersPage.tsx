/**
 * Konten (nur Admins): Spielleiter einladen, Links zum Passwort-Zurücksetzen schicken, sperren,
 * überall abmelden, zum Admin machen oder löschen. Ohne E-Mail-Versand zeigt die Seite die Links
 * zum Weitergeben an.
 */
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router';
import { Copy, KeyRound, LogOut, Mail, MoreHorizontal, Pencil, Shield, ShieldOff, Trash2, UserPlus } from 'lucide-react';
import type { Account } from '@insel/shared';
import { useAccount } from '../../lib/account.ts';
import { api } from '../../lib/api.ts';
import { useAsync } from '../../lib/hooks.ts';
import { onServerChanged } from '../../lib/live.ts';
import { Badge, Button, Card, CardHeader, EmptyState, Field, IconButton } from '../../ui/basics.tsx';
import { confirm, Modal } from '../../ui/overlay.tsx';
import { toast } from '../../ui/toast.tsx';

interface Row extends Account {
  games: number;
}

interface Delivery {
  link: string | null;
  mailed: boolean;
  mailError?: string;
}

const STATUS: Record<Account['status'], { label: string; tone: 'good' | 'warn' | 'bad' }> = {
  active: { label: 'aktiv', tone: 'good' },
  invited: { label: 'eingeladen', tone: 'warn' },
  disabled: { label: 'gesperrt', tone: 'bad' },
};

const when = (t: number | null) => (t ? new Date(t).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' }) : 'noch nie');

export function UsersPage() {
  const me = useAccount((s) => s.account);
  const [rows, setRows] = useState<Row[]>([]);
  const [mailReady, setMailReady] = useState(true);
  const [inviting, setInviting] = useState(false);
  const [editing, setEditing] = useState<Row | null>(null);
  const [delivery, setDelivery] = useState<{ user: Row | Account; purpose: 'invite' | 'reset'; result: Delivery } | null>(null);
  const { busy, run } = useAsync();

  const load = useCallback(async () => {
    const r = await api<{ users: Row[]; mailReady: boolean }>('/api/users', { slot: 'admin' });
    setRows(r.users);
    setMailReady(r.mailReady);
  }, []);
  useEffect(() => {
    void load().catch((e: Error) => toast.error(e.message));
    return onServerChanged((w) => (w === 'users' || w === 'games') && void load().catch(() => {}));
  }, [load]);

  const sendLink = async (u: Row) => {
    const r = await run(() => api<Delivery>(`/api/users/${u.id}/link`, { slot: 'admin', body: {} }));
    if (r) setDelivery({ user: u, purpose: u.status === 'invited' ? 'invite' : 'reset', result: r });
  };
  const update = (u: Row, patch: Record<string, unknown>, success: string) => run(() => api(`/api/users/${u.id}`, { method: 'PUT', slot: 'admin', body: patch }), success).then(load);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Konten</h1>
        <Button variant="primary" icon={<UserPlus className="size-4" />} onClick={() => setInviting(true)}>
          Spielleiter einladen
        </Button>
      </div>

      {!mailReady && (
        <p className="rounded-2xl bg-warn-soft px-4 py-3 text-sm font-semibold text-ink-2">
          Der E-Mail-Versand ist noch nicht eingerichtet. Einladungen und Links zum Zurücksetzen erscheinen deshalb hier zum Weitergeben (z. B. per Messenger).{' '}
          <Link to="/regie/einstellungen" className="font-bold text-accent underline">
            E-Mail einrichten
          </Link>
        </p>
      )}

      <Card>
        <CardHeader
          title="Spielleiter und Admins"
          sub="Spielleiter legen eigene Spiele und Sammlungen an und sehen nur ihre eigenen Spiele. Admins verwalten alles. Du selbst meldest dich als Haupt-Admin mit dem Passwort aus der Datei .env an."
        />
        {rows.length === 0 ? (
          <EmptyState icon="🧑‍🏫" title="Noch keine Konten">
            Lade die erste Spielleiterin oder den ersten Spielleiter ein.
          </EmptyState>
        ) : (
          <ul className="divide-y divide-line">
            {rows.map((u) => (
              <li key={u.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 font-bold">
                    <span className="truncate">{u.name}</span>
                    {u.role === 'admin' && <Badge tone="accent">Admin</Badge>}
                    <Badge tone={STATUS[u.status].tone}>{STATUS[u.status].label}</Badge>
                    {u.id === me?.id && <Badge>du</Badge>}
                  </p>
                  <p className="truncate text-xs text-muted">
                    {u.email} · {u.games} {u.games === 1 ? 'Spiel' : 'Spiele'} · zuletzt angemeldet {when(u.lastLoginAt)}
                  </p>
                </div>
                {u.status !== 'disabled' && (
                  <Button size="sm" icon={u.status === 'invited' ? <Mail className="size-4" /> : <KeyRound className="size-4" />} loading={busy} onClick={() => void sendLink(u)}>
                    {u.status === 'invited' ? 'Einladung erneut' : 'Passwort-Link'}
                  </Button>
                )}
                <UserMenu
                  user={u}
                  self={u.id === me?.id}
                  onEdit={() => setEditing(u)}
                  onRole={() => void update(u, { role: u.role === 'admin' ? 'leader' : 'admin' }, u.role === 'admin' ? `${u.name} ist jetzt Spielleiter` : `${u.name} ist jetzt Admin`)}
                  onToggle={() => void update(u, { disabled: u.status !== 'disabled' }, u.status === 'disabled' ? `${u.name} entsperrt` : `${u.name} gesperrt und abgemeldet`)}
                  onLogout={() => void run(() => api(`/api/users/${u.id}/logout`, { slot: 'admin', body: {} }), `${u.name} ist auf allen Geräten abgemeldet`)}
                  onDelete={async () => {
                    const ok = await confirm({
                      title: `${u.name} löschen?`,
                      text: 'Das Konto wird gelöscht. Seine Spiele, Sammlungen und Vorlagen bleiben erhalten und gehören danach dem Admin.',
                      confirm: 'Löschen',
                      danger: true,
                    });
                    if (ok) await run(() => api(`/api/users/${u.id}`, { method: 'DELETE', slot: 'admin' }), 'Konto gelöscht').then(load);
                  }}
                />
              </li>
            ))}
          </ul>
        )}
      </Card>

      <InviteModal
        open={inviting}
        onClose={() => setInviting(false)}
        onDone={(account, result) => {
          setInviting(false);
          void load();
          setDelivery({ user: account, purpose: 'invite', result });
        }}
      />
      <EditModal user={editing} onClose={() => setEditing(null)} onSaved={() => void load()} />
      <DeliveryModal delivery={delivery} onClose={() => setDelivery(null)} />
    </div>
  );
}

function UserMenu({
  user,
  self,
  onEdit,
  onRole,
  onToggle,
  onLogout,
  onDelete,
}: {
  user: Row;
  self: boolean;
  onEdit: () => void;
  onRole: () => void;
  onToggle: () => void;
  onLogout: () => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const item = (icon: React.ReactNode, label: string, fn: () => void, danger = false, disabled = false) => (
    <button
      type="button"
      disabled={disabled}
      onClick={() => {
        setOpen(false);
        fn();
      }}
      className={`flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-semibold hover:bg-bg-2 disabled:opacity-40 ${danger ? 'text-bad' : ''}`}
    >
      {icon}
      {label}
    </button>
  );
  return (
    <div className="relative">
      <IconButton label="Weitere Aktionen" onClick={() => setOpen((o) => !o)}>
        <MoreHorizontal className="size-5" />
      </IconButton>
      {open && (
        <>
          <button type="button" aria-label="Menü schließen" className="fixed inset-0 z-30 cursor-default" onClick={() => setOpen(false)} />
          <div className="card absolute right-0 z-40 mt-1 w-60 p-1.5 shadow-lifted">
            {item(<Pencil className="size-4" />, 'Name / E-Mail ändern', onEdit)}
            {item(user.role === 'admin' ? <ShieldOff className="size-4" /> : <Shield className="size-4" />, user.role === 'admin' ? 'Zum Spielleiter machen' : 'Zum Admin machen', onRole, false, self)}
            {item(<LogOut className="size-4" />, 'Überall abmelden', onLogout, false, user.status !== 'active')}
            {item(<ShieldOff className="size-4" />, user.status === 'disabled' ? 'Entsperren' : 'Sperren', onToggle, user.status !== 'disabled', self)}
            {item(<Trash2 className="size-4" />, 'Konto löschen', onDelete, true, self)}
          </div>
        </>
      )}
    </div>
  );
}

function InviteModal({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: (account: Account, result: Delivery) => void }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'leader' | 'admin'>('leader');
  const { busy, run } = useAsync();
  useEffect(() => {
    if (open) {
      setName('');
      setEmail('');
      setRole('leader');
    }
  }, [open]);
  const submit = async () => {
    const r = await run(() => api<{ account: Account } & Delivery>('/api/users', { slot: 'admin', body: { name, email, role } }));
    if (r) onDone(r.account, r);
  };
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Spielleiter einladen"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Abbrechen
          </Button>
          <Button variant="primary" loading={busy} disabled={!name.trim() || !email.includes('@')} onClick={() => void submit()}>
            Einladen
          </Button>
        </>
      }
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <Field label="Name">
          <input className="field" value={name} onChange={(e) => setName(e.target.value)} placeholder="z. B. Lea" autoFocus />
        </Field>
        <Field label="E-Mail" hint="Dorthin geht die Einladung. Damit meldet sich die Person später an.">
          <input className="field" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="lea@example.org" />
        </Field>
        <Field label="Rolle">
          <select className="field" value={role} onChange={(e) => setRole(e.target.value as 'leader' | 'admin')}>
            <option value="leader">Spielleiter – eigene Spiele und Sammlungen</option>
            <option value="admin">Admin – verwaltet zusätzlich alle Spiele, Konten und Einstellungen</option>
          </select>
        </Field>
        <button type="submit" className="hidden" />
      </form>
    </Modal>
  );
}

function EditModal({ user, onClose, onSaved }: { user: Row | null; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const { busy, run } = useAsync();
  useEffect(() => {
    if (user) {
      setName(user.name);
      setEmail(user.email);
    }
  }, [user]);
  return (
    <Modal
      open={!!user}
      onClose={onClose}
      title="Konto bearbeiten"
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Abbrechen
          </Button>
          <Button
            variant="primary"
            loading={busy}
            disabled={!name.trim() || !email.includes('@')}
            onClick={async () => {
              const r = await run(() => api(`/api/users/${user!.id}`, { method: 'PUT', slot: 'admin', body: { name, email } }), 'Gespeichert');
              if (r) {
                onSaved();
                onClose();
              }
            }}
          >
            Speichern
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="Name">
          <input className="field" value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="E-Mail">
          <input className="field" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}

/** Ergebnis einer Einladung bzw. eines Passwort-Links: verschickt – oder Link zum Kopieren. */
function DeliveryModal({ delivery, onClose }: { delivery: { user: Row | Account; purpose: 'invite' | 'reset'; result: Delivery } | null; onClose: () => void }) {
  if (!delivery) return null;
  const { user, purpose, result } = delivery;
  const what = purpose === 'invite' ? 'Einladung' : 'Link zum Passwort-Zurücksetzen';
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(result.link ?? '');
      toast.success('Link kopiert');
    } catch {
      toast.info('Bitte den Link markieren und kopieren');
    }
  };
  return (
    <Modal
      open
      onClose={onClose}
      title={result.mailed ? `${what} verschickt` : `${what} für ${user.name}`}
      footer={
        <Button variant="primary" onClick={onClose}>
          Fertig
        </Button>
      }
    >
      <div className="flex flex-col gap-3 text-sm">
        {result.mailed ? (
          <p>
            Die E-Mail ist an <b>{user.email}</b> unterwegs. Der Link gilt {purpose === 'invite' ? '7 Tage' : '1 Stunde'} und nur einmal.
          </p>
        ) : (
          <>
            {result.mailError && <p className="rounded-xl bg-bad-soft px-3 py-2 font-semibold text-bad">E-Mail fehlgeschlagen: {result.mailError}</p>}
            {result.link ? (
              <>
                <p>
                  Gib diesen Link an <b>{user.name}</b> weiter. Er gilt {purpose === 'invite' ? '7 Tage' : '1 Stunde'} und nur einmal – wer ihn hat, kann das Passwort festlegen.
                </p>
                <div className="flex gap-2">
                  <input className="field font-mono text-xs" readOnly value={result.link} onFocus={(e) => e.currentTarget.select()} />
                  <IconButton label="Link kopieren" onClick={() => void copy()}>
                    <Copy className="size-4" />
                  </IconButton>
                </div>
              </>
            ) : (
              <p>Für Links fehlt eine feste Adresse. Bitte unter Optionen die Beitritts-Adresse setzen (oder PUBLIC_URL in .env).</p>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}
