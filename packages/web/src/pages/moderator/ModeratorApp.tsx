/** Moderator: Vorlese- und Steueransicht fürs Handy/Tablet der Person auf der Bühne. */
import { useState } from 'react';
import { ChevronDown, Moon, Sun } from 'lucide-react';
import { useLibrarySync } from '../../lib/library.ts';
import { useLive, useLiveConnection } from '../../lib/live.ts';
import { useSystemSync } from '../../lib/system.ts';
import { useTheme } from '../../lib/theme.ts';
import { EmptyState, IconButton, Spinner } from '../../ui/basics.tsx';
import { ConnectionDot } from '../../ui/game.tsx';
import { StaffGate } from '../../game/StaffLogin.tsx';
import { PhasePanel } from '../../game/PhasePanel.tsx';
import { Feed, Standings } from '../../game/Standings.tsx';
import { BeamerQuick } from '../../game/BeamerControl.tsx';

export default function ModeratorApp() {
  const [theme, setTheme] = useTheme(true);
  return (
    <StaffGate slot="moderator" roles={['moderator', 'admin']} endpoint="/api/auth/moderator" title="Moderator" hint="QR-Code aus der Regie scannen oder Passwort eingeben">
      <ModeratorShell dark={theme === 'dark' || (theme === 'system' && document.documentElement.dataset.theme === 'dark')} toggle={(d) => setTheme(d ? 'light' : 'dark')} />
    </StaffGate>
  );
}

function ModeratorShell({ dark, toggle }: { dark: boolean; toggle: (dark: boolean) => void }) {
  useLiveConnection('moderator', 'moderator');
  useLibrarySync('moderator');
  useSystemSync('moderator');
  const { state, status, received, appName } = useLive();
  const [showRanking, setShowRanking] = useState(false);
  return (
    <div className="min-h-dvh bg-bg">
      <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-line bg-surface/90 px-4 py-2.5 backdrop-blur">
        <span className="text-2xl">🎙️</span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-display text-lg font-semibold leading-tight">{state?.config.name ?? appName}</p>
          <ConnectionDot status={status} />
        </div>
        <IconButton label="Design wechseln" onClick={() => toggle(dark)}>
          {dark ? <Sun className="size-5" /> : <Moon className="size-5" />}
        </IconButton>
      </header>
      <main className="mx-auto flex max-w-5xl flex-col gap-4 p-3 sm:p-5">
        {!received ? (
          <div className="grid place-items-center py-24">
            <Spinner />
          </div>
        ) : !state ? (
          <EmptyState icon="🏝️" title="Kein Spiel aktiv">Die Regie muss zuerst ein Spiel anlegen.</EmptyState>
        ) : (
          <>
            <PhasePanel state={state} mode="moderator" />
            <button
              type="button"
              onClick={() => setShowRanking(!showRanking)}
              className="flex items-center justify-center gap-1.5 rounded-2xl py-2 text-sm font-bold text-muted hover:bg-bg-2"
            >
              Rangliste, Verlauf & Beamer <ChevronDown className={`size-4 transition ${showRanking ? 'rotate-180' : ''}`} />
            </button>
            {showRanking && (
              <div className="grid gap-4 md:grid-cols-2">
                <Standings state={state} />
                <Feed state={state} />
                <BeamerQuick />
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
