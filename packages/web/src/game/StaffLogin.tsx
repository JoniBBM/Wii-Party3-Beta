/** Anmeldung für Regie/Moderator. Bei AUTH_DISABLED wird automatisch angemeldet. */
import { useEffect, useState, type ReactNode } from 'react';
import { KeyRound } from 'lucide-react';
import { api, type SystemInfo } from '../lib/api.ts';
import { getToken, setToken, type TokenSlot } from '../lib/storage.ts';
import { Button, Card, Spinner } from '../ui/basics.tsx';

interface Me {
  session: { role: string };
}

export function StaffGate({
  slot,
  roles,
  endpoint,
  title,
  hint,
  children,
}: {
  slot: TokenSlot;
  roles: string[];
  endpoint: string;
  title: string;
  hint?: ReactNode;
  children: ReactNode;
}) {
  const [status, setStatus] = useState<'checking' | 'login' | 'ok'>('checking');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const roleKey = roles.join(',');
  useEffect(() => {
    const allowed = roleKey.split(',');
    (async () => {
      // Moderatoren dürfen auch mit Regie-Token arbeiten.
      if (slot === 'moderator' && !getToken('moderator') && getToken('admin')) setToken('moderator', getToken('admin'));
      if (getToken(slot)) {
        try {
          const me = await api<Me>('/api/auth/me', { slot });
          if (allowed.includes(me.session.role)) return setStatus('ok');
        } catch {
          /* weiter zum Login */
        }
        setToken(slot, null);
      }
      try {
        const info = await api<SystemInfo>('/api/system/info');
        if (info.authDisabled) {
          const r = await api<{ token: string }>(endpoint, { body: { password: '' } });
          setToken(slot, r.token);
          return setStatus('ok');
        }
      } catch {
        /* ignorieren */
      }
      setStatus('login');
    })();
  }, [slot, roleKey, endpoint]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ token: string }>(endpoint, { body: { password } });
      setToken(slot, r.token);
      setStatus('ok');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Anmeldung fehlgeschlagen');
    } finally {
      setBusy(false);
    }
  };

  if (status === 'checking') {
    return (
      <div className="grid min-h-dvh place-items-center">
        <Spinner className="size-10" />
      </div>
    );
  }
  if (status === 'ok') return <>{children}</>;
  return (
    <div className="grid min-h-dvh place-items-center bg-bg px-4">
      <Card className="w-full max-w-sm p-6">
        <form onSubmit={submit} className="flex flex-col gap-4">
          <div className="flex flex-col items-center gap-2 text-center">
            <span className="grid size-14 place-items-center rounded-2xl bg-accent-soft text-accent">
              <KeyRound className="size-7" />
            </span>
            <h1 className="text-2xl font-semibold">{title}</h1>
            {hint && <p className="text-sm text-muted">{hint}</p>}
          </div>
          <input
            className="field h-12 text-lg"
            type="password"
            autoComplete="current-password"
            placeholder="Passwort"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoFocus
          />
          {error && <p className="text-sm font-bold text-bad">{error}</p>}
          <Button type="submit" variant="primary" size="lg" block loading={busy} disabled={!password}>
            Anmelden
          </Button>
        </form>
      </Card>
    </div>
  );
}
