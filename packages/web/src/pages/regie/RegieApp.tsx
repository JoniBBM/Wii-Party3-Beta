/** Regie: Steuerzentrale für die Technik-Person (Laptop/Tablet). */
import { NavLink, Route, Routes, useNavigate } from 'react-router';
import {
  BookOpen,
  Clapperboard,
  ExternalLink,
  LayoutGrid,
  Moon,
  Settings,
  SlidersHorizontal,
  Sun,
  Undo2,
  Users,
} from 'lucide-react';
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

const NAV = [
  { to: '/regie', end: true, label: 'Live', icon: Clapperboard },
  { to: '/regie/teams', label: 'Teams', icon: Users },
  { to: '/regie/einrichten', label: 'Spiel einrichten', icon: SlidersHorizontal },
  { to: '/regie/bibliothek', label: 'Bibliothek', icon: BookOpen },
  { to: '/regie/spiele', label: 'Spiele', icon: LayoutGrid },
  { to: '/regie/einstellungen', label: 'Einstellungen', icon: Settings },
];

export default function RegieApp() {
  const [theme, setTheme] = useTheme(true);
  return (
    <StaffGate slot="admin" roles={['admin']} endpoint="/api/auth/admin" title="Regie" hint="Anmeldung für die Spielleitung">
      <RegieShell theme={theme} setTheme={setTheme} />
    </StaffGate>
  );
}

function RegieShell({ theme, setTheme }: { theme: string; setTheme: (t: 'light' | 'dark' | 'system') => void }) {
  useLiveConnection('admin', 'regie');
  useLibrarySync('admin');
  useSystemSync();
  const { state, status, undo, appName } = useLive();
  const navigate = useNavigate();
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
            <span className="text-xs font-bold text-muted">Regie</span>
          </span>
        </button>
        <nav className="flex flex-col gap-1 px-3">
          {NAV.map((n) => (
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
        </div>
      </aside>

      {/* Kopfzeile */}
      <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-line bg-surface/85 px-4 py-2.5 backdrop-blur lg:px-6">
        <div className="min-w-0 flex-1">
          <p className="truncate font-display text-lg font-semibold leading-tight">{state?.config.name ?? 'Kein Spiel aktiv'}</p>
          <ConnectionDot status={status} />
        </div>
        <Button size="sm" variant="soft" icon={<Undo2 className="size-4" />} disabled={!undo} onClick={doUndo} title={undo ? `Rückgängig: ${undo}` : 'Nichts rückgängig zu machen'}>
          <span className="hidden max-w-56 truncate sm:inline">{undo ? `Rückgängig: ${undo}` : 'Rückgängig'}</span>
        </Button>
        <IconButton label={dark ? 'Helles Design' : 'Dunkles Design'} onClick={() => setTheme(dark ? 'light' : 'dark')}>
          {dark ? <Sun className="size-5" /> : <Moon className="size-5" />}
        </IconButton>
      </header>

      <main className="mx-auto max-w-[1500px] p-4 lg:p-6">
        <Routes>
          <Route index element={<LivePage />} />
          <Route path="teams" element={<TeamsPage />} />
          <Route path="einrichten" element={<SetupPage />} />
          <Route path="bibliothek" element={<LibraryPage />} />
          <Route path="spiele" element={<GamesPage />} />
          <Route path="einstellungen" element={<SettingsPage />} />
        </Routes>
      </main>

      {/* Untere Leiste (Handy/Tablet) */}
      <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-6 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
        {NAV.map((n) => (
          <NavLink
            key={n.to}
            to={n.to}
            end={n.end}
            className={({ isActive }) => `flex flex-col items-center gap-0.5 py-2 text-[10px] font-bold ${isActive ? 'text-accent' : 'text-muted'}`}
          >
            <n.icon className="size-5" />
            <span className="max-w-full truncate px-1">{n.label.split(' ')[0]}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
