/**
 * Spiel-Tempo für Regie und Moderator: vor dem Spiel die gewünschte Spieldauer wählen, während
 * des Spiels „Spiel verlangsamen“ / „Spiel beschleunigen“. Die Teams merken davon nichts – es wird
 * für alle gleich etwas besser bzw. schlechter gewürfelt (siehe engine/tempo.ts).
 */
import { useEffect, useState } from 'react';
import { FastForward, Gauge, Rewind, Timer } from 'lucide-react';
import { tempoLabel, tempoStatus, type GameState, type TempoStatus } from '@insel/shared';
import { useCommand, useServerNow } from '../lib/hooks.ts';
import { Badge, Button, Card, CardHeader } from '../ui/basics.tsx';
import { Modal } from '../ui/overlay.tsx';

const DURATIONS = [30, 45, 60, 75, 90, 120];
const min = (m: number) => `${Math.max(0, Math.round(m))} Min.`;
const clock = (ms: number) => new Date(ms).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });

/** Gesamtdauer dieses Spielfelds ohne Vorgabe (für die Auswahl vor dem Spiel). */
function naturalMinutes(state: GameState, now: number): number {
  return tempoStatus({ ...state, config: { ...state.config, targetMinutes: null }, tempo: { ...state.tempo, manual: 0 } }, now).totalMin;
}

export function TempoPanel({ state }: { state: GameState }) {
  const now = useServerNow(15_000);
  const [dialog, setDialog] = useState<'faster' | 'slower' | null>(null);
  if (state.status === 'finished') return null;
  const st = tempoStatus(state, now);
  if (state.config.tempoEnabled === false) return state.status === 'lobby' ? <TempoOffCard /> : null;
  if (state.status === 'lobby') return <DurationCard state={state} status={st} now={now} />;

  const behind = st.target ? Math.round(st.totalMin - st.target) : 0;
  return (
    <Card>
      <CardHeader
        title="Spiel-Tempo"
        icon={<Gauge className="size-5 text-accent" />}
        actions={<Badge tone={Math.abs(st.tempo) < 0.2 ? 'neutral' : 'accent'}>{tempoLabel(st.tempo)}</Badge>}
      />
      <div className="flex flex-col gap-3 p-4">
        <p className="text-sm text-ink-2">
          <b>{min(st.elapsedMin)}</b> gespielt · noch ca. <b>{min(st.remainingMin)}</b> (Ende ca. {clock(now + st.remainingMin * 60_000)})
        </p>
        {st.target ? (
          <p className="text-sm text-muted">
            Ziel: ca. {st.target} Min.
            {st.outOfReach === 'too_short'
              ? ` – schneller geht es unauffällig nicht (ca. ${min(st.totalMin)} gesamt)`
              : st.outOfReach === 'too_long'
                ? ` – länger lässt es sich unauffällig nicht strecken (ca. ${min(st.totalMin)} gesamt)`
                : Math.abs(behind) <= 3
                  ? ' – liegt im Plan'
                  : behind > 0
                    ? ` – ca. ${behind} Min. drüber, das Tempo zieht an`
                    : ` – ca. ${-behind} Min. drunter, das Tempo bremst`}
          </p>
        ) : (
          <p className="text-sm text-muted">Keine Spieldauer vorgegeben.</p>
        )}
        <div className="grid grid-cols-2 gap-2">
          <Button size="sm" icon={<Rewind className="size-4" />} onClick={() => setDialog('slower')}>
            Spiel verlangsamen
          </Button>
          <Button size="sm" icon={<FastForward className="size-4" />} onClick={() => setDialog('faster')}>
            Spiel beschleunigen
          </Button>
        </div>
      </div>
      {dialog && <TempoDialog state={state} status={st} now={now} direction={dialog} onClose={() => setDialog(null)} />}
    </Card>
  );
}

/** Manuell eingerichtet: kein Spiel-Tempo, reine Zufallswürfe. */
function TempoOffCard() {
  const { run, pending } = useCommand();
  return (
    <Card>
      <CardHeader title="Spieldauer" icon={<Timer className="size-5 text-accent" />} sub="Manuell eingerichtet: reine Zufallswürfe, ohne Spiel-Tempo." />
      <div className="p-4 pt-0">
        <Button size="sm" disabled={!!pending} onClick={() => void run({ type: 'tempo.set', enabled: true }, { success: 'Spiel-Tempo eingeschaltet' })}>
          Spieldauer vorgeben
        </Button>
      </div>
    </Card>
  );
}

/** Vor dem Spiel: Wie lange soll es ungefähr dauern? */
function DurationCard({ state, status, now }: { state: GameState; status: TempoStatus; now: number }) {
  const { run, pending } = useCommand();
  const [custom, setCustom] = useState('');
  const natural = naturalMinutes(state, now);
  const goal = state.config.board.fields.length - 1;
  const set = (targetMinutes: number | null) => void run({ type: 'tempo.set', targetMinutes, ...(targetMinutes === null ? { manual: 0 } : {}) });
  const chip = (label: string, value: number | null) => {
    const active = (status.target ?? null) === value;
    return (
      <button
        key={label}
        type="button"
        disabled={!!pending}
        onClick={() => set(value)}
        className={`rounded-full border px-3 py-1.5 text-sm font-bold transition ${active ? 'border-accent bg-accent-soft text-accent' : 'border-line hover:border-accent/50'}`}
      >
        {label}
      </button>
    );
  };
  return (
    <Card>
      <CardHeader title="Spieldauer" icon={<Timer className="size-5 text-accent" />} sub="Wie lange soll das Spiel ungefähr dauern? Das Spiel richtet sein Tempo unauffällig danach." />
      <div className="flex flex-col gap-3 p-4">
        <div className="flex flex-wrap gap-2">
          {chip('Ohne Vorgabe', null)}
          {DURATIONS.map((d) => chip(`${d} Min.`, d))}
          <form
            className="flex items-center gap-1"
            onSubmit={(e) => {
              e.preventDefault();
              const v = Number(custom);
              if (v >= 5 && v <= 300) set(Math.round(v));
              setCustom('');
            }}
          >
            <input
              className="field h-9 w-20 py-1 text-sm"
              inputMode="numeric"
              placeholder="eigene"
              aria-label="Eigene Spieldauer in Minuten"
              value={custom}
              onChange={(e) => setCustom(e.target.value.replace(/\D/g, '').slice(0, 3))}
            />
          </form>
        </div>
        <p className="text-sm text-muted">
          Ohne Vorgabe dauert dieses Spielfeld ({goal} Felder) {state.teams.length ? `mit ${state.teams.length} Teams` : 'mit 4 Teams'} etwa <b>{min(natural)}</b> – bei ca.{' '}
          {Math.round(status.roundMin)} Minuten je Runde.
        </p>
        {status.outOfReach === 'too_short' && (
          <p className="rounded-xl bg-warn-soft px-3 py-2 text-sm font-semibold text-ink-2">
            {status.target} Minuten sind für dieses Spielfeld sehr knapp: Unauffällig schneller als ca. {min(status.totalMin)} geht es nicht. Für kürzere Spiele unter „Spiel einrichten“
            ein kürzeres Spielfeld wählen.
          </p>
        )}
        {status.outOfReach === 'too_long' && (
          <p className="rounded-xl bg-warn-soft px-3 py-2 text-sm font-semibold text-ink-2">
            Länger als ca. {min(status.totalMin)} lässt sich dieses Spielfeld nicht unauffällig strecken – für längere Spiele ein längeres Spielfeld wählen.
          </p>
        )}
        {status.target && !status.outOfReach && <p className="text-sm font-semibold text-good">Passt: Das Spiel richtet sich nach ca. {status.target} Minuten.</p>}
        <button
          type="button"
          disabled={!!pending}
          className="self-start text-xs font-semibold text-muted underline-offset-2 hover:underline"
          onClick={() => void run({ type: 'tempo.set', enabled: false }, { success: 'Spiel-Tempo aus – reine Zufallswürfe' })}
        >
          Ohne Spiel-Tempo spielen (reine Zufallswürfe)
        </button>
      </div>
    </Card>
  );
}

/** „Spiel beschleunigen“ / „Spiel verlangsamen“ */
function TempoDialog({ state, status, now, direction, onClose }: { state: GameState; status: TempoStatus; now: number; direction: 'faster' | 'slower'; onClose: () => void }) {
  const { run, pending } = useCommand();
  const [custom, setCustom] = useState('');
  const faster = direction === 'faster';
  const sign = faster ? -1 : 1;
  useEffect(() => setCustom(''), [direction]);
  const apply = async (cmd: { targetMinutes?: number | null; manual?: number }, success: string) => {
    const ack = await run({ type: 'tempo.set', ...cmd }, { success });
    if (ack.ok) onClose();
  };
  /** neue Zielzeit: nie kürzer als bereits gespielt + 5 Minuten */
  const shifted = (delta: number) => Math.max(Math.ceil(status.elapsedMin) + 5, Math.min(300, (status.target ?? Math.round(status.totalMin)) + delta));

  return (
    <Modal
      open
      onClose={onClose}
      title={faster ? 'Spiel beschleunigen' : 'Spiel verlangsamen'}
      size="sm"
      footer={
        <>
          {(status.target || status.manual !== 0) && (
            <Button variant="ghost" className="mr-auto" disabled={!!pending} onClick={() => void apply({ targetMinutes: null, manual: 0 }, 'Normales Tempo')}>
              Normales Tempo
            </Button>
          )}
          <Button variant="ghost" onClick={onClose}>
            Abbrechen
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4 text-sm">
        <p className="rounded-xl bg-bg-2 px-3 py-2">
          {min(status.elapsedMin)} gespielt · noch ca. <b>{min(status.remainingMin)}</b> · Ende ca. {clock(now + status.remainingMin * 60_000)}
          {status.target ? ` · Ziel ${status.target} Min.` : ''}
        </p>

        {status.target ? (
          <div className="flex flex-col gap-2">
            <p className="font-bold">{faster ? 'Wie viel früher soll das Spiel enden?' : 'Wie viel später darf das Spiel enden?'}</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {[5, 10, 15, 20].map((d) => {
                const target = shifted(sign * d);
                return (
                  <Button key={d} disabled={!!pending || target === status.target} onClick={() => void apply({ targetMinutes: target }, `Spieldauer jetzt ca. ${target} Minuten`)}>
                    {faster ? '−' : '+'}
                    {d} Min.
                  </Button>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <p className="font-bold">{faster ? 'Wie viel schneller?' : 'Wie viel langsamer?'}</p>
            <div className="grid grid-cols-2 gap-2">
              {[1, 2].map((level) => {
                const manual = sign * -level;
                return (
                  <Button key={level} variant={status.manual === manual ? 'primary' : 'soft'} disabled={!!pending} onClick={() => void apply({ manual }, `Tempo: ${tempoLabel(manual / 2)}`)}>
                    {level === 1 ? 'etwas' : 'deutlich'} {faster ? 'schneller' : 'langsamer'}
                  </Button>
                );
              })}
            </div>
          </div>
        )}

        <form
          className="flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const total = Number(custom);
            if (total >= 5 && total <= 300) void apply({ targetMinutes: Math.max(Math.ceil(status.elapsedMin) + 5, Math.round(total)) }, `Spieldauer jetzt ca. ${total} Minuten`);
          }}
        >
          <span className="shrink-0 text-muted">{status.target ? 'Oder Gesamtdauer:' : 'Oder Spieldauer festlegen:'}</span>
          <input
            className="field h-9 w-20 py-1"
            inputMode="numeric"
            placeholder="Min."
            aria-label="Gesamtdauer in Minuten"
            value={custom}
            onChange={(e) => setCustom(e.target.value.replace(/\D/g, '').slice(0, 3))}
          />
          <Button size="sm" type="submit" disabled={!custom || !!pending}>
            Setzen
          </Button>
        </form>

        <p className="text-xs text-muted">
          Gilt ab der nächsten Würfelrunde. Die Teams merken davon nichts: Für alle Teams gleich wird etwas {faster ? 'besser' : 'schlechter'} gewürfelt und Gefahrenfelder sind etwas
          {faster ? ' gnädiger' : ' strenger'} – egal, wer vorne liegt.
        </p>
      </div>
    </Modal>
  );
}
