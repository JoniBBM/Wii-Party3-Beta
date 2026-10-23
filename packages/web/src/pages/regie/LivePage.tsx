import { useNavigate } from 'react-router';
import { PlusCircle, Sparkles } from 'lucide-react';
import { useLive } from '../../lib/live.ts';
import { Button, Card, EmptyState, Spinner } from '../../ui/basics.tsx';
import { PhasePanel } from '../../game/PhasePanel.tsx';
import { Feed, Standings } from '../../game/Standings.tsx';
import { TempoPanel } from '../../game/TempoPanel.tsx';
import { BeamerQuick } from '../../game/BeamerControl.tsx';
import { useNewGame } from './GamesPage.tsx';

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
      <div className="flex min-w-0 flex-col gap-5">
        <TempoPanel state={state} />
        <Standings state={state} editable />
        <BeamerQuick />
        <Feed state={state} />
      </div>
    </div>
  );
}

function NoGame() {
  const navigate = useNavigate();
  const newGame = useNewGame();
  return (
    <div className="mx-auto flex max-w-xl flex-col gap-5">
      <Card className="p-6">
        <EmptyState icon="🏝️" title="Kein Spiel aktiv">
          Lege ein neues Spiel an – danach führt dich der Assistent durch Welt, Spieldauer, Spielfeld und Inhalte.
        </EmptyState>
        <div className="flex flex-col gap-3">
          <Button variant="primary" size="lg" icon={<Sparkles className="size-5" />} loading={newGame.busy} onClick={() => void newGame.create()}>
            Neues Spiel
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
