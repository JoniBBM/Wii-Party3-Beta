/** Einstellungen: eigenes Konto (Name, Passwort) und E-Mail-Versand (SMTP, nur Admins). */
import { useEffect, useState } from 'react';
import { KeyRound, Mail, Save, Send, UserRound } from 'lucide-react';
import { loadMe, useAccount } from '../../lib/account.ts';
import { api } from '../../lib/api.ts';
import { useAsync } from '../../lib/hooks.ts';
import { reauth } from '../../lib/live.ts';
import { setToken } from '../../lib/storage.ts';
import { Button, Card, CardHeader, Field } from '../../ui/basics.tsx';
import { toast } from '../../ui/toast.tsx';

export function AccountCard() {
  const account = useAccount((s) => s.account);
  const [name, setName] = useState(account?.name ?? '');
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [repeat, setRepeat] = useState('');
  const { busy, run } = useAsync();
  useEffect(() => setName(account?.name ?? ''), [account?.name]);
  if (!account) return null;

  if (account.main) {
    return (
      <Card>
        <CardHeader title="Haupt-Admin" icon={<UserRound className="size-5" />} sub="Du bist mit dem Admin-Passwort angemeldet. Es steht in der Datei .env auf dem Server (ADMIN_PASSWORD) und wird dort geändert." />
      </Card>
    );
  }

  const mismatch = !!repeat && next !== repeat;
  return (
    <Card>
      <CardHeader title="Mein Konto" icon={<UserRound className="size-5" />} sub={`Angemeldet als ${account.email ?? account.name}${account.isAdmin ? ' (Admin)' : ''}.`} />
      <div className="flex flex-col gap-5 p-5">
        <div className="flex gap-2">
          <input className="field" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} aria-label="Name" />
          <Button
            icon={<Save className="size-4" />}
            loading={busy}
            disabled={!name.trim() || name.trim() === account.name}
            onClick={() => void run(() => api('/api/account', { method: 'PUT', slot: 'admin', body: { name: name.trim() } }), 'Name gespeichert').then(() => loadMe('admin'))}
          >
            Speichern
          </Button>
        </div>
        <form
          className="flex flex-col gap-3"
          onSubmit={async (e) => {
            e.preventDefault();
            const r = await run(() => api<{ token: string }>('/api/account/password', { slot: 'admin', body: { current, next } }), 'Passwort geändert – andere Geräte sind abgemeldet');
            if (r) {
              setToken('admin', r.token);
              reauth();
              setCurrent('');
              setNext('');
              setRepeat('');
            }
          }}
        >
          <p className="flex items-center gap-2 text-sm font-bold">
            <KeyRound className="size-4" /> Passwort ändern
          </p>
          <input className="field" type="password" autoComplete="current-password" placeholder="Bisheriges Passwort" value={current} onChange={(e) => setCurrent(e.target.value)} />
          <input className="field" type="password" autoComplete="new-password" placeholder="Neues Passwort (mind. 10 Zeichen)" value={next} onChange={(e) => setNext(e.target.value)} />
          <input className="field" type="password" autoComplete="new-password" placeholder="Neues Passwort wiederholen" value={repeat} onChange={(e) => setRepeat(e.target.value)} />
          {mismatch && <p className="text-sm font-bold text-bad">Die beiden neuen Passwörter sind verschieden.</p>}
          <Button type="submit" className="self-start" loading={busy} disabled={!current || next.length < 10 || next !== repeat}>
            Passwort ändern
          </Button>
        </form>
      </div>
    </Card>
  );
}

interface Smtp {
  host: string;
  port: number;
  security: 'tls' | 'starttls' | 'none';
  user: string;
  password: string;
  fromAddress: string;
  fromName: string;
}

const EMPTY: Smtp = { host: '', port: 587, security: 'starttls', user: '', password: '', fromAddress: '', fromName: '' };

/** E-Mail-Versand für Einladungen und „Passwort vergessen“. Das Passwort kommt nie zurück in den Browser. */
export function SmtpCard() {
  const [smtp, setSmtp] = useState<Smtp>(EMPTY);
  const [configured, setConfigured] = useState(false);
  const [hasPassword, setHasPassword] = useState(false);
  const [linkBase, setLinkBase] = useState<string | null>(null);
  const [testTo, setTestTo] = useState('');
  const { busy, run } = useAsync();
  const load = async () => {
    const r = await api<{ smtp: Smtp | null; hasPassword: boolean; linkBase: string | null }>('/api/system/smtp', { slot: 'admin' });
    setSmtp(r.smtp ?? EMPTY);
    setConfigured(!!r.smtp);
    setHasPassword(r.hasPassword);
    setLinkBase(r.linkBase);
  };
  useEffect(() => {
    void load().catch((e: Error) => toast.error(e.message));
  }, []);
  const set = <K extends keyof Smtp>(k: K, v: Smtp[K]) => setSmtp((s) => ({ ...s, [k]: v }));

  return (
    <Card>
      <CardHeader
        title="E-Mail-Versand"
        icon={<Mail className="size-5" />}
        sub="Für Einladungen an Spielleiter und „Passwort vergessen“. Die Zugangsdaten bekommst du bei deinem Mail-Anbieter (SMTP)."
      />
      <form
        className="flex flex-col gap-4 p-5"
        onSubmit={async (e) => {
          e.preventDefault();
          const ok = await run(() => api('/api/system/smtp', { method: 'PUT', slot: 'admin', body: { smtp } }), 'E-Mail-Einstellungen gespeichert');
          if (ok) await load();
        }}
      >
        {!linkBase && (
          <p className="rounded-xl bg-warn-soft px-3 py-2 text-sm font-semibold text-ink-2">
            Für Links in E-Mails fehlt eine feste Adresse: Bitte oben die Beitritts-Adresse setzen (z. B. https://party.example.org) oder PUBLIC_URL in .env – sonst verschickt „Passwort vergessen“
            keine Mails.
          </p>
        )}
        <div className="grid gap-3 sm:grid-cols-[1fr_7rem]">
          <Field label="Mailserver (SMTP)">
            <input className="field" placeholder="smtp.example.org" value={smtp.host} onChange={(e) => set('host', e.target.value.trim())} />
          </Field>
          <Field label="Port">
            <input className="field" inputMode="numeric" value={smtp.port} onChange={(e) => set('port', Number(e.target.value.replace(/\D/g, '')) || 0)} />
          </Field>
        </div>
        <Field label="Verschlüsselung">
          <select
            className="field"
            value={smtp.security}
            onChange={(e) => {
              const security = e.target.value as Smtp['security'];
              setSmtp((s) => ({ ...s, security, port: security === 'tls' ? 465 : security === 'starttls' ? 587 : s.port }));
            }}
          >
            <option value="starttls">STARTTLS (meist Port 587)</option>
            <option value="tls">SSL/TLS (meist Port 465)</option>
            <option value="none">Unverschlüsselt (nur im eigenen Netz)</option>
          </select>
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Benutzername">
            <input className="field" autoComplete="off" value={smtp.user} onChange={(e) => set('user', e.target.value)} />
          </Field>
          <Field label="Passwort" hint={hasPassword ? 'Gespeichert – leer lassen, um es zu behalten.' : undefined}>
            <input className="field" type="password" autoComplete="new-password" placeholder={hasPassword ? '••••••••' : ''} value={smtp.password} onChange={(e) => set('password', e.target.value)} />
          </Field>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Absenderadresse">
            <input className="field" type="email" placeholder="insel@example.org" value={smtp.fromAddress} onChange={(e) => set('fromAddress', e.target.value.trim())} />
          </Field>
          <Field label="Absendername">
            <input className="field" placeholder="Insel der Abenteuer" value={smtp.fromName} onChange={(e) => set('fromName', e.target.value)} />
          </Field>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="submit" variant="primary" icon={<Save className="size-4" />} loading={busy} disabled={!smtp.host || !smtp.port || !smtp.fromAddress.includes('@')}>
            Speichern
          </Button>
          {configured && (
            <Button
              variant="ghost"
              onClick={async () => {
                const ok = await run(() => api('/api/system/smtp', { method: 'PUT', slot: 'admin', body: { smtp: null } }), 'E-Mail-Versand ausgeschaltet');
                if (ok) await load();
              }}
            >
              Ausschalten
            </Button>
          )}
        </div>
        {configured && (
          <div className="flex flex-wrap gap-2 border-t border-line pt-4">
            <input className="field min-w-0 flex-1" type="email" placeholder="Testmail an …" value={testTo} onChange={(e) => setTestTo(e.target.value)} />
            <Button icon={<Send className="size-4" />} loading={busy} disabled={!testTo.includes('@')} onClick={() => void run(() => api('/api/system/smtp/test', { slot: 'admin', body: { to: testTo } }), 'Testmail verschickt')}>
              Testen
            </Button>
          </div>
        )}
      </form>
    </Card>
  );
}
