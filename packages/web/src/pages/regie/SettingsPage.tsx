/** Einstellungen: Name, Beitritts-Adresse, Moderator-Link, Datenschutz, Darstellung. */
import { useState } from 'react';
import { Globe, ImageOff, Link2, Mic, Moon, Save, Sun, Wifi } from 'lucide-react';
import { api } from '../../lib/api.ts';
import { useAsync } from '../../lib/hooks.ts';
import { useLive } from '../../lib/live.ts';
import { reloadSystem, useJoinUrl, useSystem } from '../../lib/system.ts';
import { useTheme } from '../../lib/theme.ts';
import { Button, Card, CardHeader, Segmented } from '../../ui/basics.tsx';
import { QrCode } from '../../ui/game.tsx';
import { confirm, Modal } from '../../ui/overlay.tsx';

export function SettingsPage() {
  const info = useSystem((s) => s.info);
  const state = useLive((s) => s.state);
  const joinUrl = useJoinUrl();
  const [appName, setAppName] = useState(info?.appName ?? '');
  const [custom, setCustom] = useState('');
  const [modLink, setModLink] = useState<string | null>(null);
  const [theme, setTheme] = useTheme(true);
  const { busy, run } = useAsync();

  const saveSettings = (patch: { appName?: string; joinUrl?: string }) =>
    run(() => api('/api/system/settings', { method: 'PUT', slot: 'admin', body: patch }), 'Gespeichert').then(() => reloadSystem());

  return (
    <div className="flex max-w-3xl flex-col gap-5">
      <h1 className="text-2xl font-semibold">Einstellungen</h1>

      <Card>
        <CardHeader title="Name des Spiels" sub="Erscheint auf Beamer, Startseite und Handys." />
        <div className="flex gap-2 p-5">
          <input className="field" value={appName || info?.appName || ''} onChange={(e) => setAppName(e.target.value)} maxLength={60} />
          <Button variant="primary" icon={<Save className="size-4" />} loading={busy} disabled={!appName.trim()} onClick={() => saveSettings({ appName: appName.trim() })}>
            Speichern
          </Button>
        </div>
      </Card>

      <Card>
        <CardHeader title="Beitritts-Adresse" sub="Diese Adresse steckt in allen QR-Codes. Die Handys müssen sie erreichen können." icon={<Wifi className="size-5" />} />
        <div className="flex flex-col gap-3 p-5">
          <div className="flex items-center gap-4 rounded-2xl bg-bg-2 p-3">
            <QrCode value={`${joinUrl}/join`} size={96} />
            <div className="min-w-0">
              <p className="text-xs font-extrabold uppercase tracking-wide text-muted">Aktuell</p>
              <p className="break-all font-mono text-lg font-bold">{joinUrl}</p>
            </div>
          </div>
          <ul className="flex flex-col gap-1.5">
            {(info?.joinUrls ?? []).map((u) => (
              <li key={u.url} className="flex items-center gap-3 rounded-2xl border border-line px-3 py-2">
                {u.kind === 'tunnel' || u.kind === 'public' ? <Globe className="size-4 text-accent" /> : <Wifi className="size-4 text-muted" />}
                <span className="min-w-0 flex-1">
                  <span className="block text-xs font-bold text-muted">{u.label}</span>
                  <span className="block truncate font-mono text-sm">{u.url}</span>
                </span>
                {u.url !== joinUrl && (
                  <Button size="sm" onClick={() => saveSettings({ joinUrl: u.url })}>
                    Verwenden
                  </Button>
                )}
              </li>
            ))}
          </ul>
          <div className="flex gap-2">
            <input className="field" placeholder="Eigene Adresse, z. B. https://insel.example.org" value={custom} onChange={(e) => setCustom(e.target.value)} />
            <Button disabled={!custom.trim()} onClick={() => saveSettings({ joinUrl: custom.trim() })}>
              Setzen
            </Button>
          </div>
          <Button variant="ghost" size="sm" className="self-start" onClick={() => saveSettings({ joinUrl: '' })}>
            Automatisch wählen
          </Button>
          <p className="text-sm text-muted">
            Für Zugriff übers Internet (Handys ohne WLAN, Kamera ohne Warnungen) den Tunnel starten: <code className="rounded bg-bg-2 px-1.5">./start.sh online</code> – die
            Tunnel-Adresse erscheint dann hier automatisch.
          </p>
        </div>
      </Card>

      <Card>
        <CardHeader title="Moderator verbinden" sub="Für die Person, die vorliest: QR-Code mit dem Handy scannen – kein Passwort nötig. 24 Stunden gültig." icon={<Mic className="size-5" />} />
        <div className="p-5">
          <Button
            variant="primary"
            icon={<Link2 className="size-4" />}
            loading={busy}
            onClick={async () => {
              const r = await run(() => api<{ token: string }>('/api/auth/moderator-link', { slot: 'admin', body: {} }));
              if (r) setModLink(`${joinUrl}/join/m/${r.token}`);
            }}
          >
            Moderator-QR-Code erzeugen
          </Button>
        </div>
      </Card>

      <Card>
        <CardHeader title="Datenschutz" sub="Fotos werden nur auf diesem Rechner gespeichert und nie exportiert." icon={<ImageOff className="size-5" />} />
        <div className="p-5">
          <Button
            variant="bad"
            disabled={!state}
            onClick={async () => {
              if (!state) return;
              if (await confirm({ title: 'Alle Fotos löschen?', text: `Alle Spielerfotos von „${state.config.name}“ werden endgültig gelöscht. Spieler zeigen danach ihr Emoji.`, confirm: 'Fotos löschen', danger: true })) {
                await run(() => api(`/api/games/${state.id}/photos/delete`, { slot: 'admin', body: {} }), 'Fotos gelöscht');
              }
            }}
          >
            Alle Fotos dieses Spiels löschen
          </Button>
        </div>
      </Card>

      <Card>
        <CardHeader title="Darstellung der Regie" />
        <div className="p-5">
          <Segmented
            value={theme}
            onChange={setTheme}
            options={[
              { value: 'light', label: <span className="inline-flex items-center gap-1.5"><Sun className="size-4" />Hell</span> },
              { value: 'dark', label: <span className="inline-flex items-center gap-1.5"><Moon className="size-4" />Dunkel</span> },
              { value: 'system', label: 'System' },
            ]}
          />
          <p className="mt-3 text-sm text-muted">Die Grafikqualität des Beamers stellst du direkt auf dem Beamer ein (Taste Q oder Zahnrad).</p>
        </div>
      </Card>

      <p className="text-center text-xs text-muted">
        Version {info?.version} · 3D-Modelle und Klänge: Kenney, Quaternius, Poly Haven (CC0) sowie einige Tiere von Poly by Google u. a. (CC BY 3.0) –{' '}
        <a className="underline" href="/assets/LICENSES.md" target="_blank" rel="noreferrer">
          Lizenzen & Namensnennung
        </a>
      </p>

      <Modal open={!!modLink} onClose={() => setModLink(null)} title="Moderator verbinden" size="sm">
        {modLink && (
          <div className="flex flex-col items-center gap-3 text-center">
            <QrCode value={modLink} size={240} />
            <p className="text-sm text-muted">Mit dem Handy der vorlesenden Person scannen.</p>
          </div>
        )}
      </Modal>
    </div>
  );
}
