/**
 * Anmeldung für Regie und Moderator.
 *  - Regie: Spielleiter mit E-Mail und Passwort, der Haupt-Admin mit dem Passwort aus .env.
 *    „Passwort vergessen?“ schickt einen Link per E-Mail.
 *  - Moderator: QR-Code aus der Regie – oder Spielcode + Moderator-Passwort.
 * Bei AUTH_DISABLED wird automatisch angemeldet.
 */
import { useEffect, useState, type ReactNode } from 'react';
import { KeyRound, Mail } from 'lucide-react';
import { loadMe } from '../lib/account.ts';
import { api, type SystemInfo } from '../lib/api.ts';
import { getToken, setToken, type TokenSlot } from '../lib/storage.ts';
import { Button, Card, Spinner } from '../ui/basics.tsx';

type Kind = 'regie' | 'moderator';

export function StaffGate({ kind, children }: { kind: Kind; children: ReactNode }) {
  const slot: TokenSlot = kind === 'regie' ? 'admin' : 'moderator';
  const [status, setStatus] = useState<'checking' | 'login' | 'ok'>('checking');

  useEffect(() => {
    (async () => {
      // Moderatoren dürfen auch mit dem Zugang der Regie arbeiten (gleiches Gerät).
      if (slot === 'moderator' && !getToken('moderator') && getToken('admin')) setToken('moderator', getToken('admin'));
      if (getToken(slot)) {
        try {
          const me = await loadMe(slot);
          const ok = kind === 'regie' ? !!me.account : ['moderator', 'admin', 'leader'].includes(me.session.role);
          if (ok) return setStatus('ok');
        } catch {
          /* weiter zum Login */
        }
        setToken(slot, null);
      }
      try {
        const info = await api<SystemInfo>('/api/system/info');
        if (info.authDisabled) {
          const r = await api<{ token: string }>('/api/auth/admin', { body: { password: '' } });
          setToken(slot, r.token);
          if (slot === 'admin') await loadMe('admin');
          return setStatus('ok');
        }
      } catch {
        /* ignorieren */
      }
      setStatus('login');
    })();
  }, [kind, slot]);

  if (status === 'checking') {
    return (
      <div className="grid min-h-dvh place-items-center">
        <Spinner className="size-10" />
      </div>
    );
  }
  if (status === 'ok') return <>{children}</>;
  const done = async (token: string) => {
    setToken(slot, token);
    if (slot === 'admin') await loadMe('admin').catch(() => {});
    setStatus('ok');
  };
  return (
    <div className="grid min-h-dvh place-items-center bg-bg px-4">
      <Card className="w-full max-w-sm p-6">{kind === 'regie' ? <RegieLogin onDone={done} /> : <ModeratorLogin onDone={done} />}</Card>
    </div>
  );
}

function Head({ title, hint, icon = <KeyRound className="size-7" /> }: { title: string; hint?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 text-center">
      <span className="grid size-14 place-items-center rounded-2xl bg-accent-soft text-accent">{icon}</span>
      <h1 className="text-2xl font-semibold">{title}</h1>
      {hint && <p className="text-sm text-muted">{hint}</p>}
    </div>
  );
}

function useSubmit() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Anmeldung fehlgeschlagen');
    } finally {
      setBusy(false);
    }
  };
  return { busy, error, submit, setError };
}

function RegieLogin({ onDone }: { onDone: (token: string) => Promise<void> }) {
  const [mode, setMode] = useState<'account' | 'admin' | 'forgot' | 'sent'>('account');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const { busy, error, submit, setError } = useSubmit();
  const switchTo = (m: typeof mode) => {
    setMode(m);
    setError(null);
    setPassword('');
  };

  if (mode === 'sent') {
    return (
      <div className="flex flex-col gap-4">
        <Head title="E-Mail unterwegs" icon={<Mail className="size-7" />} hint="Wenn es zu dieser Adresse ein Konto gibt, kommt gleich eine E-Mail mit einem Link zum Zurücksetzen (gültig 1 Stunde). Bitte auch im Spam-Ordner nachsehen." />
        <Button variant="soft" block onClick={() => switchTo('account')}>
          Zurück zur Anmeldung
        </Button>
      </div>
    );
  }

  if (mode === 'forgot') {
    return (
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          void submit(async () => {
            await api('/api/auth/forgot', { body: { email } });
            setMode('sent');
          });
        }}
      >
        <Head title="Passwort vergessen" icon={<Mail className="size-7" />} hint="Gib die E-Mail-Adresse deines Kontos ein – du bekommst einen Link, um ein neues Passwort festzulegen." />
        <input className="field h-12" type="email" autoComplete="email" placeholder="E-Mail" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
        {error && <p className="text-sm font-bold text-bad">{error}</p>}
        <Button type="submit" variant="primary" size="lg" block loading={busy} disabled={!email.includes('@')}>
          Link schicken
        </Button>
        <button type="button" className="text-sm font-bold text-accent" onClick={() => switchTo('account')}>
          Zurück zur Anmeldung
        </button>
      </form>
    );
  }

  const admin = mode === 'admin';
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        void submit(async () => {
          const r = admin
            ? await api<{ token: string }>('/api/auth/admin', { body: { password } })
            : await api<{ token: string }>('/api/auth/login', { body: { email, password } });
          await onDone(r.token);
        });
      }}
    >
      <Head title={admin ? 'Admin' : 'Regie'} hint={admin ? 'Mit dem Admin-Passwort aus der Datei .env' : 'Anmeldung für Spielleiterinnen und Spielleiter'} />
      {!admin && <input className="field h-12" type="email" autoComplete="username" placeholder="E-Mail" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />}
      <input
        className="field h-12"
        type="password"
        autoComplete="current-password"
        placeholder={admin ? 'Admin-Passwort' : 'Passwort'}
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        autoFocus={admin}
      />
      {error && <p className="text-sm font-bold text-bad">{error}</p>}
      <Button type="submit" variant="primary" size="lg" block loading={busy} disabled={!password || (!admin && !email.includes('@'))}>
        Anmelden
      </Button>
      <div className="flex flex-wrap justify-between gap-2 text-sm font-bold">
        {admin ? (
          <button type="button" className="text-accent" onClick={() => switchTo('account')}>
            Mit E-Mail anmelden
          </button>
        ) : (
          <>
            <button type="button" className="text-accent" onClick={() => switchTo('forgot')}>
              Passwort vergessen?
            </button>
            <button type="button" className="text-muted hover:text-ink" onClick={() => switchTo('admin')}>
              Admin-Passwort
            </button>
          </>
        )}
      </div>
    </form>
  );
}

function ModeratorLogin({ onDone }: { onDone: (token: string) => Promise<void> }) {
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const { busy, error, submit } = useSubmit();
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        void submit(async () => {
          const r = await api<{ token: string }>('/api/auth/moderator', { body: { code, password } });
          await onDone(r.token);
        });
      }}
    >
      <Head title="Moderator" hint="Am einfachsten den QR-Code aus der Regie scannen. Sonst Spielcode und Moderator-Passwort eingeben." />
      <input
        className="field h-12 text-center font-mono text-lg uppercase tracking-[0.3em]"
        autoComplete="off"
        autoCapitalize="characters"
        placeholder="Spielcode"
        maxLength={8}
        value={code}
        onChange={(e) => setCode(e.target.value.replace(/[^a-z0-9]/gi, '').toUpperCase())}
        autoFocus
      />
      <input className="field h-12" type="password" autoComplete="current-password" placeholder="Passwort" value={password} onChange={(e) => setPassword(e.target.value)} />
      {error && <p className="text-sm font-bold text-bad">{error}</p>}
      <Button type="submit" variant="primary" size="lg" block loading={busy} disabled={!password || code.length < 4}>
        Anmelden
      </Button>
    </form>
  );
}
