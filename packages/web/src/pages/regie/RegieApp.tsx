/**
 * Regie: Steuerzentrale der Spielleitung (Laptop/Tablet/Handy). Spielleiter steuern ihr gewähltes
 * Spiel; Admins verwalten zusätzlich Konten, Einstellungen und alle Spiele.
 */
import { NavLink, Route, Routes, useNavigate } from 'react-router';
import {
  BookOpen,
  Clapperboard,
  ExternalLink,
  LayoutGrid,
  LogOut,
  Monitor,
  Moon,
  Settings,
  SlidersHorizontal,
  Sun,
  Undo2,
  UserCog,
  Users,
} from 'lucide-react';
import { useAccount } from '../../lib/account.ts';
import { setToken } from '../../lib/storage.ts';
import { confirm } from '../../ui/overlay.tsx';
import { useLibrarySync } from '../../lib/library.ts';
import { sendUndo, useLive, useLiveConnection } from '../../lib/live.ts';
import { useSystemSync } from '../../lib/system.ts';
import { useTheme } from '../../lib/theme.ts';
import { Button, IconButton } from '../../ui/basics.tsx';
import { ConnectionDot } from '../../ui/game.tsx';
import { toast } from '../../ui/toast.tsx';
import { StaffGate } from '../../game/StaffLogin.tsx';
import { LivePage } from './LivePage.tsx';
import { TeamsPage } from './TeamsPage.tsx';
import { SetupPage } from './SetupPage.tsx';
import { LibraryPage } from './LibraryPage.tsx';
import { GamesPage } from './GamesPage.tsx';
import { SettingsPage } from './SettingsPage.tsx';
import { UsersPage } from './UsersPage.tsx';
import { BeamerControl } from '../../game/BeamerControl.tsx';
import { SecurityNotice } from '../../game/SecurityNotice.tsx';

const NAV: { to: string; label: string; short?: string; end?: boolean; admin?: boolean; icon: typeof Settings }[] = [
  { to: '/regie', end: true, label: 'Live', icon: Clapperboard },
  { to: '/regie/beamer', label: 'Beamer', icon: Monitor },
  { to: '/regie/teams', label: 'Teams', icon: Users },
  { to: '/regie/einrichten', label: 'Spiel einrichten', short: 'Spiel', icon: SlidersHorizontal },
  // kurze Namen für die untere Leiste: 7 Spalten passen auch auf ein 375-px-Handy
  { to: '/regie/bibliothek', label: 'Bibliothek', short: 'Inhalte', icon: BookOpen },
  { to: '/regie/spiele', label: 'Spiele', icon: LayoutGrid },
  { to: '/regie/konten', label: 'Konten', icon: UserCog, admin: true },
  { to: '/regie/einstellungen', label: 'Einstellungen', short: 'Optionen', icon: Settings },
];

export default function RegieApp() {
  const [theme, setTheme] = useTheme(true);
  return (
    <StaffGate kind="regie">
      <RegieShell theme={theme} setTheme={setTheme} />
    </StaffGate>
  );
}

function RegieShell({ theme, setTheme }: { theme: string; setTheme: (t: 'light' | 'dark' | 'system') => void }) {
  useLiveConnection('admin', 'regie');
  useLibrarySync('admin');
  useSystemSync('admin');
  const { state, status, undo, appName } = useLive();
  const account = useAccount((s) => s.account);
  const nav = NAV.filter((n) => !n.admin || account?.isAdmin);
  const navigate = useNavigate();
  const logout = async () => {
    if (!(await confirm({ title: 'Abmelden?', text: 'Auf diesem Gerät abmelden. Das Spiel läuft für alle anderen weiter.', confirm: 'Abmelden' }))) return;
    setToken('admin', null);
    setToken('moderator', null);
    window.location.href = '/regie';
  };
  const dark = theme === 'dark' || (theme === 'system' && document.documentElement.dataset.theme === 'dark');

  const doUndo = async () => {
    const r = await sendUndo();
    if (r.ok) toast.info(`Rückgängig: ${String(r.meta?.label ?? '')}`);
    else toast.error(r.error ?? 'Nichts rückgängig zu machen');
  };

  return (
    <div className="min-h-dvh bg-bg pb-20 lg:pb-0 lg:pl-60">
      {/* Seitenleiste (Desktop) */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-line bg-surface lg:flex">
        <button type="button" onClick={() => navigate('/regie')} className="flex items-center gap-2.5 px-5 py-5 text-left">
          <span className="grid size-10 place-items-center rounded-2xl bg-accent-soft text-2xl">🏝️</span>
          <span className="min-w-0">
            <span className="block truncate font-display text-lg font-semibold leading-tight">{appName}</span>
            <span className="block truncate text-xs font-bold text-muted">{account ? `${account.name}${account.isAdmin && !account.main ? ' · Admin' : ''}` : 'Regie'}</span>
          </span>
        </button>
        <nav className="flex flex-col gap-1 px-3">
          {nav.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-bold transition ${isActive ? 'bg-accent-soft text-accent' : 'text-ink-2 hover:bg-bg-2'}`
              }
            >
              <n.icon className="size-5" />
              {n.label}
            </NavLink>
          ))}
        </nav>
        <div className="mt-auto flex flex-col gap-2 p-4">
          <a href="/beamer" target="insel-beamer" className="btn btn-soft h-10 px-4 text-sm">
            <ExternalLink className="size-4" /> Beamer öffnen
          </a>
          <a href="/moderator" target="insel-moderator" className="btn btn-ghost h-9 px-4 text-xs">
            Moderator-Ansicht
          </a>
          <button type="button" onClick={() => void logout()} className="btn btn-ghost h-9 px-4 text-xs text-muted">
            <LogOut className="size-3.5" /> Abmelden
          </button>
        </div>
      </aside>

      {/* Kopfzeile */}
      <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-line bg-surface/85 px-4 py-2.5 backdrop-blur lg:px-6">
        <div className="min-w-0 flex-1">
          <p className="truncate font-display text-lg font-semibold leading-tight">{state?.config.name ?? 'Kein Spiel gewählt'}</p>
          <div className="flex items-center gap-2">
            <ConnectionDot status={status} />
            {state?.code && (
              <span className="rounded-md bg-bg-2 px-1.5 py-0.5 font-mono text-xs font-bold tracking-widest text-ink-2" title="Spielcode – steckt in allen QR-Codes">
                {state.code}
              </span>
            )}
          </div>
        </div>
        <Button size="sm" variant="soft" icon={<Undo2 className="size-4" />} disabled={!undo} onClick={doUndo} title={undo ? `Rückgängig: ${undo}` : 'Nichts rückgängig zu machen'}>
          <span className="hidden max-w-56 truncate sm:inline">{undo ? `Rückgängig: ${undo}` : 'Rückgängig'}</span>
        </Button>
        <IconButton label={dark ? 'Helles Design' : 'Dunkles Design'} onClick={() => setTheme(dark ? 'light' : 'dark')}>
          {dark ? <Sun className="size-5" /> : <Moon className="size-5" />}
        </IconButton>
        <IconButton label="Abmelden" className="lg:hidden" onClick={() => void logout()}>
          <LogOut className="size-5" />
        </IconButton>
      </header>

      <main className="mx-auto max-w-[1500px] p-4 lg:p-6">
        <SecurityNotice />
        <Routes>
          <Route index element={<LivePage />} />
          <Route path="beamer" element={<BeamerControl />} />
          <Route path="teams" element={<TeamsPage />} />
          <Route path="einrichten" element={<SetupPage />} />
          <Route path="bibliothek" element={<LibraryPage />} />
          <Route path="spiele" element={<GamesPage />} />
          <Route path="einstellungen" element={<SettingsPage />} />
          {account?.isAdmin && <Route path="konten" element={<UsersPage />} />}
        </Routes>
      </main>

      {/* Untere Leiste (Handy/Tablet) */}
      <nav
        className="fixed inset-x-0 bottom-0 z-30 grid border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
        style={{ gridTemplateColumns: `repeat(${nav.length}, minmax(0, 1fr))` }}
      >
        {nav.map((n) => (
          <NavLink
            key={n.to}
            to={n.to}
            end={n.end}
            className={({ isActive }) => `flex flex-col items-center gap-0.5 py-2 text-[10px] font-bold ${isActive ? 'text-accent' : 'text-muted'}`}
          >
            <n.icon className="size-5" />
            <span className="max-w-full truncate px-0.5">{n.short ?? n.label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
