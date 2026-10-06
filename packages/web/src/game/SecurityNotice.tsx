/**
 * Warnhinweis in der Regie, wenn der Server unsicher eingerichtet ist (schwaches oder bekanntes
 * Passwort, Anmeldung abgeschaltet). Übers Internet startet der Server so gar nicht erst.
 */
import { useEffect, useState } from 'react';
import { ShieldAlert, X } from 'lucide-react';
import { api } from '../lib/api.ts';

interface Security {
  weakAdminPassword: boolean;
  weakModeratorPassword: boolean;
  authDisabled: boolean;
  online: boolean;
}

const HIDE_KEY = 'insel.security.hidden';

export function SecurityNotice() {
  const [sec, setSec] = useState<Security | null>(null);
  const [hidden, setHidden] = useState(() => {
    try {
      return window.sessionStorage.getItem(HIDE_KEY) === '1';
    } catch {
      return false;
    }
  });
  useEffect(() => {
    api<Security>('/api/system/security', { slot: 'admin' }).then(setSec).catch(() => {});
  }, []);
  if (!sec || hidden) return null;
  const problems: string[] = [];
  if (sec.authDisabled) problems.push('Die Anmeldung ist abgeschaltet (AUTH_DISABLED) – jeder im Netz kann die Regie bedienen.');
  if (sec.weakAdminPassword) problems.push('Das Regie-Passwort ist zu kurz oder allgemein bekannt.');
  if (sec.weakModeratorPassword) problems.push('Das Moderator-Passwort ist zu kurz oder allgemein bekannt.');
  if (!problems.length) return null;
  const hide = () => {
    setHidden(true);
    try {
      window.sessionStorage.setItem(HIDE_KEY, '1');
    } catch {
      /* egal */
    }
  };
  return (
    <div role="alert" className="mb-4 flex items-start gap-3 rounded-2xl border border-warn/40 bg-warn-soft px-4 py-3 text-sm">
      <ShieldAlert className="mt-0.5 size-5 shrink-0 text-warn" />
      <div className="min-w-0 flex-1">
        <p className="font-bold">Sicherheit: bitte vor dem Spiel übers Internet beheben</p>
        <ul className="mt-1 list-disc pl-5 font-semibold text-ink-2">
          {problems.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
        <p className="mt-1 text-ink-2">
          In der Datei <code>.env</code> ein langes Passwort setzen (mindestens 10 Zeichen) und mit <code>./start.sh</code> neu starten. Im eigenen WLAN geht es so weiter, übers Internet
          (<code>./start.sh online</code>) startet der Server erst danach.
        </p>
      </div>
      <button type="button" onClick={hide} className="rounded-lg p-1 text-muted hover:bg-black/5" aria-label="Hinweis ausblenden">
        <X className="size-4" />
      </button>
    </div>
  );
}
