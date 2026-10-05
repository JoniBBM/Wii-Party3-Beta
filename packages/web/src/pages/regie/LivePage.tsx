import { useState } from 'react';
import { useNavigate } from 'react-router';
import { PlusCircle, Sparkles } from 'lucide-react';
import type { DeviceMode } from '@insel/shared';
import { api } from '../../lib/api.ts';
import { DeviceModePicker } from '../../game/DeviceModePicker.tsx';
import { useAsync } from '../../lib/hooks.ts';
import { useLibrary } from '../../lib/library.ts';
import { useLive } from '../../lib/live.ts';
import { Button, Card, EmptyState, Spinner } from '../../ui/basics.tsx';
import { PhasePanel } from '../../game/PhasePanel.tsx';
import { Feed, Standings } from '../../game/Standings.tsx';
import { BeamerQuick } from '../../game/BeamerControl.tsx';

export function LivePage() {
  const { state, received } = useLive();
  if (!received) {
    return (
      <div className="grid place-items-center py-24">
        <Spinner />
      </div>
    );
  }
  if (!state) return <NoGame />;
  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
      <div className="min-w-0">
        <PhasePanel state={state} mode="regie" />
      </div>
      <div className="flex flex-col gap-5">
        <Standings state={state} editable />
        <BeamerQuick />
        <Feed state={state} />
      </div>
    </div>
  );
}

function NoGame() {
  const templates = useLibrary((s) => s.templates);
  const navigate = useNavigate();
  const [name, setName] = useState(() => `Spieleabend ${new Date().toLocaleDateString('de-DE')}`);
  const [templateId, setTemplateId] = useState('');
  const [devices, setDevices] = useState<DeviceMode>('personal');
  const { busy, run } = useAsync();
  const fallback = templates.find((t) => t.name.startsWith('Standard')) ?? templates[0];
  const chosen = templateId || fallback?.id || '';
  const create = () => run(() => api('/api/games', { slot: 'admin', body: { name, devices, ...(chosen ? { templateId: chosen } : {}) } }), 'Spiel angelegt – viel Spaß!');
  return (
    <div className="mx-auto flex max-w-xl flex-col gap-5">
      <Card className="p-6">
        <EmptyState icon="🏝️" title="Kein Spiel aktiv">
          Lege ein neues Spiel an. Die Vorlage bestimmt Spielfeld, Regeln und Inhalte – alles lässt sich danach noch ändern.
        </EmptyState>
        <div className="flex flex-col gap-4">
          <label className="block">
            <span className="label">Name des Spiels</span>
            <input className="field" value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label className="block">
            <span className="label">Vorlage</span>
            <select className="field" value={chosen} onChange={(e) => setTemplateId(e.target.value)}>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
          <div>
            <span className="label">Handys</span>
            <DeviceModePicker value={devices} onChange={setDevices} />
          </div>
          <Button variant="primary" size="lg" icon={<Sparkles className="size-5" />} loading={busy} disabled={!name.trim()} onClick={create}>
            Spiel anlegen
          </Button>
          <Button variant="ghost" icon={<PlusCircle className="size-4" />} onClick={() => navigate('/regie/spiele')}>
            Gespeichertes Spiel laden
          </Button>
        </div>
      </Card>
      <BeamerQuick />
    </div>
  );
}
