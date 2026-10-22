/**
 * Link aus der Einladung bzw. „Passwort vergessen“: /konto#t=<einmaliger Schlüssel>.
 * Der Schlüssel steht hinter „#“ – er geht nicht in Server- oder Tunnel-Protokolle.
 */
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { KeyRound } from 'lucide-react';
import { api } from '../../lib/api.ts';
import { setToken } from '../../lib/storage.ts';
import { useTheme } from '../../lib/theme.ts';
import { Button, Card, Spinner } from '../../ui/basics.tsx';

interface LinkInfo {
  email: string;
  name: string;
  purpose: 'invite' | 'reset';
}

export function AccountLinkPage() {
  useTheme(true);
  const navigate = useNavigate();
  const [token] = useState(() => new URLSearchParams(window.location.hash.slice(1)).get('t') ?? '');
  const [info, setInfo] = useState<LinkInfo | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Schlüssel sofort aus der Adresszeile nehmen (Verlauf, Bildschirmfotos)
    window.history.replaceState(null, '', '/konto');
    if (!token) return setProblem('Dieser Link ist unvollständig. Bitte den Link aus der E-Mail vollständig öffnen.');
    api<LinkInfo>('/api/auth/link-info', { body: { token } })
      .then(setInfo)
      .catch((e: Error) => setProblem(e.message));
  }, [token]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ token: string }>('/api/auth/set-password', { body: { token, password } });
      setToken('admin', r.token);
      navigate('/regie', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Das hat nicht geklappt');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid min-h-dvh place-items-center bg-bg px-4">
      <Card className="w-full max-w-sm p-6">
        {problem ? (
          <div className="flex flex-col gap-4 text-center">
            <p className="text-5xl">🔗</p>
            <p className="font-semibold">{problem}</p>
            <Button variant="soft" block onClick={() => navigate('/regie')}>
              Zur Anmeldung
            </Button>
          </div>
        ) : !info ? (
          <div className="grid place-items-center py-10">
            <Spinner />
          </div>
        ) : (
          <form onSubmit={submit} className="flex flex-col gap-4">
            <div className="flex flex-col items-center gap-2 text-center">
              <span className="grid size-14 place-items-center rounded-2xl bg-accent-soft text-accent">
                <KeyRound className="size-7" />
              </span>
              <h1 className="text-2xl font-semibold">{info.purpose === 'invite' ? `Willkommen, ${info.name}!` : 'Neues Passwort'}</h1>
              <p className="text-sm text-muted">
                {info.purpose === 'invite' ? 'Lege ein Passwort für dein Spielleiter-Konto fest.' : 'Lege ein neues Passwort fest. Danach bist du auf allen anderen Geräten abgemeldet.'}
              </p>
            </div>
            {/* für Passwort-Manager: zu welchem Konto das Passwort gehört */}
            <input className="field h-12 text-muted" type="email" autoComplete="username" value={info.email} readOnly />
            <input
              className="field h-12"
              type="password"
              autoComplete="new-password"
              placeholder="Passwort (mindestens 10 Zeichen)"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoFocus
            />
            <input className="field h-12" type="password" autoComplete="new-password" placeholder="Passwort wiederholen" value={repeat} onChange={(e) => setRepeat(e.target.value)} />
            {repeat && repeat !== password && <p className="text-sm font-bold text-bad">Die beiden Passwörter sind verschieden.</p>}
            {error && <p className="text-sm font-bold text-bad">{error}</p>}
            <Button type="submit" variant="primary" size="lg" block loading={busy} disabled={password.length < 10 || password !== repeat}>
              Passwort festlegen
            </Button>
          </form>
        )}
      </Card>
    </div>
  );
}
