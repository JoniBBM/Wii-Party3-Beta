/** Beitritt am Handy: als Spieler anmelden (Lobby) oder mit Team-PIN / Team-QR-Code. */
import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { ArrowRight, KeyRound, UserPlus } from 'lucide-react';
import { PLAYER_EMOJIS } from '@insel/shared';
import { api } from '../../lib/api.ts';
import { uploadPhoto } from '../../lib/image.ts';
import { reauth, useLive, useLiveConnection } from '../../lib/live.ts';
import { getToken, setToken } from '../../lib/storage.ts';
import { useTheme } from '../../lib/theme.ts';
import { Button, Spinner } from '../../ui/basics.tsx';
import { IslandBackdrop } from '../../ui/IslandBackdrop.tsx';
import { PhotoPicker } from '../../ui/PhotoPicker.tsx';
import { toast } from '../../ui/toast.tsx';

function Shell({ children }: { children: React.ReactNode }) {
  const appName = useLive((s) => s.appName);
  return (
    <IslandBackdrop>
      <div className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-5 px-4 py-8">
        <h1 className="text-center text-3xl font-bold drop-shadow-sm">{appName}</h1>
        {children}
      </div>
    </IslandBackdrop>
  );
}

export function JoinPage() {
  useTheme(false);
  useLiveConnection('member', 'join');
  const navigate = useNavigate();
  const { state, session, received } = useLive();
  const [step, setStep] = useState<'start' | 'photo'>('start');
  const [mode, setMode] = useState<'register' | 'pin'>('register');

  // Schon Teil eines Teams? Dann direkt weiter.
  useEffect(() => {
    if (step === 'start' && (session?.role === 'team' || session?.role === 'player')) navigate('/team', { replace: true });
  }, [session, step, navigate]);

  if (!received) {
    return (
      <Shell>
        <div className="glass grid place-items-center rounded-[28px] p-10">
          <Spinner />
        </div>
      </Shell>
    );
  }

  if (!state) {
    return (
      <Shell>
        <div className="glass rounded-[28px] p-6 text-center">
          <p className="text-5xl">⏳</p>
          <p className="mt-3 font-display text-xl font-semibold">Gleich geht’s los</p>
          <p className="mt-1 text-ink-2">Die Spielleitung hat noch kein Spiel gestartet. Diese Seite aktualisiert sich von selbst.</p>
        </div>
      </Shell>
    );
  }

  if (step === 'photo') return <PhotoStep onDone={() => navigate('/team')} />;

  const canRegister = state.registrationOpen;
  const effective = canRegister ? mode : 'pin';

  return (
    <Shell>
      <div className="glass overflow-hidden rounded-[28px]">
        {canRegister && (
          <div className="grid grid-cols-2 border-b border-white/60 text-sm font-bold">
            <TabButton active={effective === 'register'} onClick={() => setMode('register')} icon={<UserPlus className="size-4" />}>
              Neu anmelden
            </TabButton>
            <TabButton active={effective === 'pin'} onClick={() => setMode('pin')} icon={<KeyRound className="size-4" />}>
              Team-PIN
            </TabButton>
          </div>
        )}
        <div className="p-5">
          {effective === 'register' ? (
            <RegisterForm onDone={() => setStep('photo')} />
          ) : (
            <PinForm onDone={() => navigate('/team')} hint={!canRegister} />
          )}
        </div>
      </div>
    </Shell>
  );
}

function TabButton({ active, onClick, icon, children }: { active: boolean; onClick: () => void; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center justify-center gap-2 py-3.5 transition ${active ? 'bg-white/70 text-ink' : 'text-ink-2 hover:bg-white/40'}`}
    >
      {icon}
      {children}
    </button>
  );
}

function RegisterForm({ onDone }: { onDone: () => void }) {
  const [name, setName] = useState('');
  const [emoji, setEmoji] = useState<string>(() => PLAYER_EMOJIS[Math.floor(Math.random() * PLAYER_EMOJIS.length)]!);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    try {
      const r = await api<{ token: string }>('/api/auth/register', { body: { name: name.trim(), emoji } });
      setToken('member', r.token);
      reauth();
      onDone();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Anmeldung fehlgeschlagen');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <label className="block">
        <span className="label">Wie heißt du?</span>
        <input
          className="field h-14 text-xl font-bold"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={40}
          autoComplete="given-name"
          placeholder="Vorname"
          autoFocus
        />
      </label>
      <div>
        <span className="label">Dein Zeichen</span>
        <div className="grid grid-cols-6 gap-1.5">
          {PLAYER_EMOJIS.map((e) => (
            <button
              key={e}
              type="button"
              onClick={() => setEmoji(e)}
              className={`grid aspect-square place-items-center rounded-xl text-2xl transition ${emoji === e ? 'bg-accent-soft ring-2 ring-accent' : 'bg-white/60 hover:bg-white'}`}
              aria-pressed={emoji === e}
            >
              {e}
            </button>
          ))}
        </div>
      </div>
      <Button type="submit" variant="primary" size="lg" block loading={busy} disabled={!name.trim()} icon={<ArrowRight />}>
        Los geht’s
      </Button>
    </form>
  );
}

function PinForm({ onDone, hint }: { onDone: () => void; hint: boolean }) {
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const submit = async (value = pin) => {
    if (value.length !== 4) return;
    setBusy(true);
    try {
      const r = await api<{ token: string; teamName: string }>('/api/auth/pin', { body: { pin: value } });
      setToken('member', r.token);
      reauth();
      toast.success(`Willkommen bei ${r.teamName}!`);
      onDone();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'PIN falsch');
      setPin('');
      input.current?.focus();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col items-center gap-4">
      {hint && <p className="text-center text-sm font-semibold text-ink-2">Die Anmeldung ist geschlossen. Tritt mit der PIN deines Teams bei.</p>}
      <label className="w-full">
        <span className="label text-center">Team-PIN (4 Ziffern)</span>
        <input
          ref={input}
          className="field h-20 text-center font-display text-5xl tracking-[0.5em]"
          inputMode="numeric"
          pattern="\d*"
          maxLength={4}
          value={pin}
          autoFocus
          onChange={(e) => {
            const v = e.target.value.replace(/\D/g, '').slice(0, 4);
            setPin(v);
            if (v.length === 4) void submit(v);
          }}
        />
      </label>
      <Button variant="primary" size="lg" block loading={busy} disabled={pin.length !== 4} onClick={() => void submit()}>
        Beitreten
      </Button>
    </div>
  );
}

function PhotoStep({ onDone }: { onDone: () => void }) {
  const { state, session } = useLive();
  const me = state?.players.find((p) => p.id === session?.playerId);
  const [busy, setBusy] = useState(false);
  return (
    <Shell>
      <div className="glass flex flex-col items-center gap-5 rounded-[28px] p-6 text-center">
        <div>
          <p className="font-display text-2xl font-semibold">Hallo {me?.name ?? ''}! 👋</p>
          <p className="mt-1 text-ink-2">Magst du ein Selfie machen? Es erscheint auf dem Beamer, wenn du für ein Spiel ausgelost wirst.</p>
        </div>
        <PhotoPicker
          current={me?.photo ?? null}
          emoji={me?.emoji ?? '😀'}
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
        />
        <Button variant="primary" size="lg" block onClick={onDone} disabled={busy} icon={<ArrowRight />}>
          {me?.photo ? 'Weiter' : 'Ohne Foto weiter'}
        </Button>
        <p className="text-xs text-ink-2">Fotos bleiben auf dem Spiel-Laptop und können jederzeit gelöscht werden.</p>
      </div>
    </Shell>
  );
}

export function JoinTeamLink() {
  useTheme(false);
  const { code } = useParams();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api<{ token: string; teamName: string }>('/api/auth/team-link', { body: { code } })
      .then((r) => {
        setToken('member', r.token);
        toast.success(`Willkommen bei ${r.teamName}!`);
        navigate('/team', { replace: true });
      })
      .catch((e: Error) => setError(e.message));
  }, [code, navigate]);
  return (
    <Shell>
      <div className="glass flex flex-col items-center gap-4 rounded-[28px] p-6 text-center">
        {error ? (
          <>
            <p className="font-semibold text-bad">{error}</p>
            <Button variant="primary" onClick={() => navigate('/join')}>
              Mit PIN beitreten
            </Button>
          </>
        ) : (
          <Spinner />
        )}
      </div>
    </Shell>
  );
}

export function JoinModeratorLink() {
  const { token } = useParams();
  const navigate = useNavigate();
  useEffect(() => {
    if (token) setToken('moderator', token);
    navigate('/moderator', { replace: true });
  }, [token, navigate]);
  return null;
}
