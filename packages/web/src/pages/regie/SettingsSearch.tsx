/**
 * Suche über alle Einstellungen der Regie (Spiel, Beamer, Einstellungen, weitere Seiten): Knopf in
 * der Kopfzeile oder Strg/⌘+K öffnet ein Suchfenster; Pfeiltasten wählen, Enter springt hin.
 * Begriffe beider Welten werden gefunden („Nether“ → Vulkan-Inneres), angezeigt wird der Name in
 * der Welt des aktuellen Spiels.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router';
import { CornerDownLeft, Search, X } from 'lucide-react';
import { useAccount } from '../../lib/account.ts';
import { useLive } from '../../lib/live.ts';
import { goToSetting, otherNames, searchSettings, settingById, settingPlace, settingTitle, SUGGESTED, type SettingEntry } from '../../lib/settingsIndex.ts';

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);

export function SettingsSearch() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  return (
    <>
      {/* breit: sieht aus wie ein Suchfeld; schmaler: nur die Lupe */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="hidden h-10 w-64 items-center gap-2 rounded-full border border-line bg-bg-2/70 px-3.5 text-left text-sm text-muted transition hover:border-accent/40 xl:flex"
      >
        <Search className="size-4 shrink-0" />
        <span className="flex-1 truncate">Einstellungen suchen …</span>
        <kbd className="rounded-md border border-line bg-surface px-1.5 font-sans text-xs font-bold">{isMac ? '⌘K' : 'Strg K'}</kbd>
      </button>
      <button type="button" onClick={() => setOpen(true)} aria-label="Einstellungen suchen" title={`Einstellungen suchen (${isMac ? '⌘K' : 'Strg+K'})`} className="inline-grid size-10 shrink-0 place-items-center rounded-full text-ink-2 transition hover:bg-ink/5 xl:hidden">
        <Search className="size-5" />
      </button>
      {/* an <body> hängen: die Kopfzeile (backdrop-blur) wäre sonst Bezugsrahmen für „fixed“ */}
      {open && createPortal(<SearchPalette onClose={() => setOpen(false)} />, document.body)}
    </>
  );
}

function SearchPalette({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const theme = useLive((s) => s.state?.config.theme ?? 'island');
  const admin = useAccount((s) => !!s.account?.isAdmin);
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const picked = useRef(false);
  const query = q.trim();
  const results = useMemo<SettingEntry[]>(
    () => (query ? searchSettings(query, theme, admin).slice(0, 10) : SUGGESTED.map(settingById).filter((e): e is SettingEntry => !!e)),
    [query, theme, admin],
  );
  useEffect(() => setActive(0), [query]);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    input.current?.focus();
    // nach einem Sprung nicht zurück zum alten Element (sonst Fokusrahmen dort)
    return () => {
      if (!picked.current) prev?.focus?.({ preventScroll: true });
    };
  }, []);
  useEffect(() => {
    list.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const pick = (e: SettingEntry) => {
    picked.current = true;
    (document.activeElement as HTMLElement | null)?.blur();
    onClose();
    goToSetting(navigate, e);
  };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((a) => Math.min(results.length - 1, a + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(0, a - 1));
    } else if (e.key === 'Enter' && results[active]) {
      e.preventDefault();
      pick(results[active]);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-center bg-black/35 px-4 pt-[8vh] backdrop-blur-[2px]" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-label="Einstellungen suchen" className="flex max-h-[80vh] w-full max-w-xl flex-col self-start overflow-hidden rounded-3xl border border-line bg-surface shadow-lifted" onKeyDown={onKey}>
        <div className="flex items-center gap-3 border-b border-line px-4">
          <Search className="size-5 shrink-0 text-muted" />
          <input
            ref={input}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Einstellung suchen, z. B. Welt, Lautstärke, Nether …"
            aria-label="Suchbegriff"
            aria-controls="settings-results"
            aria-activedescendant={results[active] ? `setting-result-${active}` : undefined}
            className="h-14 min-w-0 flex-1 bg-transparent text-base font-semibold outline-none placeholder:font-normal placeholder:text-muted"
            autoComplete="off"
            spellCheck={false}
          />
          <button type="button" onClick={onClose} aria-label="Schließen" className="inline-grid size-9 shrink-0 place-items-center rounded-full text-muted hover:bg-ink/5">
            <X className="size-5" />
          </button>
        </div>
        <div className="min-h-0 overflow-y-auto p-2">
          {!query && <p className="px-3 pt-1 pb-2 text-xs font-extrabold tracking-wide text-muted uppercase">Vorschläge</p>}
          {query && results.length === 0 ? (
            <p className="px-3 py-8 text-center text-sm text-muted">Nichts gefunden für „{query}“.</p>
          ) : (
            <ul ref={list} id="settings-results" role="listbox" className="flex flex-col gap-0.5">
              {results.map((e, i) => (
                <li key={e.id} id={`setting-result-${i}`} role="option" aria-selected={i === active} data-index={i}>
                  <button
                    type="button"
                    onMouseMove={() => setActive(i)}
                    onClick={() => pick(e)}
                    className={`flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition ${i === active ? 'bg-accent-soft' : ''}`}
                  >
                    <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-bg-2 text-lg" aria-hidden>
                      {e.icon}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className={`block truncate font-bold ${i === active ? 'text-accent' : ''}`}>{settingTitle(e, theme)}</span>
                      <span className="block truncate text-xs text-muted">
                        {settingPlace(e, theme)}
                        {e.alt && ` · ${otherNames(e, theme)}`}
                        {e.hint && ` · ${e.hint}`}
                      </span>
                    </span>
                    {i === active && <CornerDownLeft className="hidden size-4 shrink-0 text-accent sm:block" />}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <p className="hidden border-t border-line px-4 py-2 text-xs text-muted sm:block">↑ ↓ auswählen · Enter öffnen · Esc schließen</p>
      </div>
    </div>
  );
}
