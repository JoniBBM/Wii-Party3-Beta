/** Hauptansicht am Handy – je nach Phase: warten, antworten, buzzern, würfeln, Ergebnis. */
import { useRef, useState } from 'react';
import { motion } from 'motion/react';
import { CheckCircle2, Send, XCircle } from 'lucide-react';
import {
  CONTENT_KIND_INFO,
  standings,
  teamById,
  type ActiveContent,
  type GameState,
} from '@insel/shared';
import { useCommand } from '../../lib/hooks.ts';
import { parseEstimate } from '../../lib/parse.ts';
import { Button, Card } from '../../ui/basics.tsx';
import { BonusDieBadge, Countdown, KindBadge, TeamChip } from '../../ui/game.tsx';
import { DrawnPlayers, placeLabel } from '../../game/bits.tsx';
import type { Me } from './TeamApp.tsx';
import { TeamDesigner } from './TeamInfo.tsx';
import { TeamDice } from './TeamDice.tsx';

const OPTION_COLORS = ['#2f7de1', '#e8423f', '#f5a623', '#3fae4f', '#8e4fd6', '#1fbcc9', '#ec5fa8', '#9a6a46'];

export function TeamPlay({ state, me }: { state: GameState; me: Me }) {
  const p = state.phase;
  return (
    <motion.div key={`${p.name}-${p.name === 'content' ? p.content.stage : ''}`} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col gap-4">
      {p.name === 'lobby' && <Lobby state={state} me={me} />}
      {(p.name === 'idle' || p.name === 'round_end') && <Between state={state} me={me} />}
      {p.name === 'content' && <ContentStage state={state} me={me} content={p.content} />}
      {p.name === 'results' && <Results state={state} me={me} />}
      {p.name === 'dice' && <TeamDice state={state} me={me} />}
      {p.name === 'finished' && <Finished state={state} me={me} />}
    </motion.div>
  );
}

function Hero({ icon, title, children }: { icon: string; title: string; children?: React.ReactNode }) {
  return (
    <Card className="flex flex-col items-center gap-2 px-5 py-8 text-center">
      <span className="text-6xl animate-float">{icon}</span>
      <p className="font-display text-2xl font-semibold">{title}</p>
      {children && <div className="text-ink-2">{children}</div>}
    </Card>
  );
}

function Lobby({ state, me }: { state: GameState; me: Me }) {
  return (
    <>
      <Hero icon="🏝️" title={`Willkommen bei ${me.team!.name}!`}>
        <p>Gleich geht es los – bis dahin: Team gestalten!</p>
        <p className="mt-2 text-sm text-muted">
          {state.players.filter((p) => p.teamId === me.team!.id).length} Spieler im Team · {state.teams.length} Teams
        </p>
      </Hero>
      <TeamDesigner team={me.team!} intro />
    </>
  );
}

function Between({ state, me }: { state: GameState; me: Me }) {
  const summary = state.phase.name === 'round_end' ? state.phase.summary : null;
  const myMove = summary?.moves.find((m) => m.teamId === me.team!.id);
  const top = standings(state).slice(0, 3);
  return (
    <>
      <Hero icon="⏳" title={state.round === 0 ? 'Gleich geht’s los!' : 'Gleich geht es weiter'}>
        {myMove && (
          <p>
            Diese Runde: Feld {myMove.from} → <b>{myMove.to}</b>
            {summary?.eruption && ' · 🌋 Der Vulkan ist ausgebrochen!'}
          </p>
        )}
      </Hero>
      {top.length > 0 && (
        <Card className="p-4">
          <p className="label">Spitzengruppe</p>
          <ul className="flex flex-col gap-1.5">
            {top.map((s) => (
              <li key={s.team.id} className="flex items-center gap-2">
                <span className="w-7 text-center text-lg">{placeLabel(s.place)}</span>
                <TeamChip team={s.team} size="sm" />
                <span className="flex-1" />
                <span className="font-bold tabular-nums">Feld {s.team.position}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}

function ContentStage({ state, me, content }: { state: GameState; me: Me; content: ActiveContent }) {
  const item = content.item;
  const team = me.team!;
  const drawnMine = content.drawn[team.id] ?? [];
  const iPlay = !!me.player && drawnMine.includes(me.player.id);
  const answer = content.answers[team.id];
  const question = 'question' in item ? item.question : null;

  return (
    <>
      <Card className="overflow-hidden">
        <div className="flex items-center justify-between gap-2 border-b border-line bg-surface-2 px-4 py-2.5">
          <KindBadge kind={item.kind} />
          {content.timer && <Countdown timer={content.timer} size="sm" />}
        </div>
        <div className="flex flex-col gap-3 p-4">
          <p className="font-display text-2xl leading-tight font-semibold">{item.title}</p>
          {question && content.stage !== 'intro' && <p className="text-xl font-bold leading-snug">{question}</p>}
          {question && content.stage === 'intro' && <p className="text-ink-2">Gleich kommt die Frage – macht euch bereit!</p>}
          {item.kind === 'game' && item.description && <p className="whitespace-pre-line text-ink-2">{item.description}</p>}
        </div>
      </Card>

      {iPlay && (
        <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} className="rounded-3xl bg-gold/25 p-4 text-center font-display text-xl font-semibold">
          ⭐ Du spielst mit, {me.player!.name}!
        </motion.div>
      )}
      {Object.keys(content.drawn).length > 0 && (
        <Card className="p-4">
          <p className="label">Ausgelost</p>
          <DrawnPlayers state={state} drawn={{ [team.id]: drawnMine }} />
        </Card>
      )}

      {content.stage === 'open' && item.kind === 'choice' && !answer && <ChoiceAnswer options={item.options} />}
      {content.stage === 'open' && item.kind === 'text' && !answer && <TextAnswer />}
      {content.stage === 'open' && item.kind === 'estimate' && !answer && <EstimateAnswer unit={item.unit} />}
      {content.stage === 'open' && item.kind === 'buzzer' && <Buzzer state={state} content={content} teamId={team.id} />}
      {content.stage === 'open' && item.kind === 'game' && <Hero icon="🎯" title="Das Spiel läuft!">Viel Erfolg!</Hero>}

      {answer && content.stage !== 'revealed' && item.kind !== 'buzzer' && (
        <Card className="flex flex-col items-center gap-2 p-5 text-center">
          <CheckCircle2 className="size-10 text-good" />
          <p className="font-display text-xl font-semibold">Antwort abgeschickt</p>
          <p className="text-ink-2">
            {item.kind === 'choice' ? `${String.fromCharCode(65 + Number(answer.value))}: ${item.options[Number(answer.value)]}` : String(answer.value)}
            {item.kind === 'estimate' && item.unit ? ` ${item.unit}` : ''}
          </p>
          <p className="text-sm text-muted">Warte auf die Auflösung …</p>
        </Card>
      )}
      {content.stage === 'closed' && !answer && item.kind !== 'game' && <Hero icon="🔒" title="Antworten geschlossen" />}
      {content.stage === 'revealed' && <Reveal content={content} teamId={team.id} />}
    </>
  );
}

function ChoiceAnswer({ options }: { options: string[] }) {
  const { run, pending } = useCommand();
  const [sel, setSel] = useState<number | null>(null);
  const lastTap = useRef<{ i: number; t: number } | null>(null);
  const submit = (i: number) => {
    if (pending === 'answer.submit') return;
    void run({ type: 'answer.submit', value: i });
  };
  // Doppelt tippen (oder Doppelklick) auf eine Antwort schickt sie sofort ab
  const tap = (i: number) => {
    const now = performance.now();
    if (lastTap.current?.i === i && now - lastTap.current.t < 450) {
      lastTap.current = null;
      setSel(i);
      submit(i);
      return;
    }
    lastTap.current = { i, t: now };
    setSel(i);
  };
  return (
    <div className="flex flex-col gap-2.5">
      {options.map((o, i) => (
        <button
          key={i}
          type="button"
          onClick={() => tap(i)}
          aria-label={`Antwort ${String.fromCharCode(65 + i)}: ${o}`}
          aria-pressed={sel === i}
          className={`flex min-h-16 touch-manipulation items-center gap-3 rounded-3xl px-4 py-3 text-left text-lg font-extrabold text-white shadow-soft transition select-none active:scale-[0.98] ${sel === i ? 'ring-4 ring-ink/70 ring-offset-2 ring-offset-bg' : sel !== null ? 'opacity-55' : ''}`}
          style={{ background: OPTION_COLORS[i % OPTION_COLORS.length] }}
        >
          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-white/25 font-display text-xl">{String.fromCharCode(65 + i)}</span>
          <span>{o}</span>
        </button>
      ))}
      <Button variant="good" size="lg" block icon={<Send className="size-5" />} disabled={sel === null} loading={pending === 'answer.submit'} onClick={() => sel !== null && submit(sel)}>
        Antwort abschicken
      </Button>
      <p className="text-center text-xs font-semibold text-muted">Tipp: Doppelt auf eine Antwort tippen schickt sie sofort ab.</p>
    </div>
  );
}

function TextAnswer() {
  const { run, pending } = useCommand();
  const [v, setV] = useState('');
  return (
    <form
      className="flex flex-col gap-2.5"
      onSubmit={(e) => {
        e.preventDefault();
        if (v.trim()) void run({ type: 'answer.submit', value: v.trim() });
      }}
    >
      <input className="field h-16 text-xl font-bold" value={v} onChange={(e) => setV(e.target.value)} placeholder="Eure Antwort" autoFocus maxLength={300} enterKeyHint="send" />
      <Button type="submit" variant="good" size="lg" block icon={<Send className="size-5" />} disabled={!v.trim()} loading={pending === 'answer.submit'}>
        Antwort abschicken
      </Button>
    </form>
  );
}

function EstimateAnswer({ unit }: { unit: string }) {
  const { run, pending } = useCommand();
  const [v, setV] = useState('');
  const n = parseEstimate(v);
  return (
    <form
      className="flex flex-col gap-2.5"
      onSubmit={(e) => {
        e.preventDefault();
        if (v && Number.isFinite(n)) void run({ type: 'answer.submit', value: n });
      }}
    >
      <div className="flex items-center gap-2">
        <input className="field h-16 text-center font-display text-3xl font-semibold" inputMode="decimal" value={v} onChange={(e) => setV(e.target.value.replace(/[^\d.,-]/g, ''))} placeholder="0" autoFocus />
        {unit && <span className="font-display text-2xl font-semibold text-muted">{unit}</span>}
      </div>
      <Button type="submit" variant="good" size="lg" block icon={<Send className="size-5" />} disabled={!v || !Number.isFinite(n)} loading={pending === 'answer.submit'}>
        Schätzung abschicken
      </Button>
    </form>
  );
}

function Buzzer({ state, content, teamId }: { state: GameState; content: ActiveContent; teamId: string }) {
  const { run } = useCommand();
  const pos = content.buzzQueue.findIndex((b) => b.teamId === teamId);
  const judged = content.buzzJudged[teamId];
  const first = content.buzzQueue[0];
  if (pos >= 0) {
    return (
      <Card className="flex flex-col items-center gap-2 p-6 text-center">
        <span className="font-display text-6xl font-semibold">#{pos + 1}</span>
        <p className="font-display text-xl font-semibold">{pos === 0 ? 'Ihr wart am schnellsten!' : 'Gebuzzert!'}</p>
        {judged === false && <p className="font-bold text-bad">Leider falsch – jetzt sind die anderen dran.</p>}
        {judged === undefined && pos === 0 && <p className="text-ink-2">Sagt jetzt laut eure Antwort!</p>}
        {judged === undefined && pos > 0 && first && <p className="text-ink-2">{teamById(state, first.teamId)?.name} antwortet zuerst.</p>}
      </Card>
    );
  }
  return (
    <div className="grid place-items-center py-4">
      <button
        type="button"
        onClick={() => run({ type: 'buzz' }, { quiet: true })}
        className="grid size-64 place-items-center rounded-full font-display text-5xl font-bold text-white shadow-lifted transition active:scale-95"
        style={{ background: 'radial-gradient(circle at 35% 30%, #ff8a80, #e8423f 55%, #a8231f)', boxShadow: '0 12px 0 #8a1c19, 0 24px 50px rgba(232,66,63,0.45)' }}
      >
        BUZZ!
      </button>
    </div>
  );
}

function Reveal({ content, teamId }: { content: ActiveContent; teamId: string }) {
  const item = content.item;
  const a = content.answers[teamId];
  const correct = item.kind === 'buzzer' ? content.buzzJudged[teamId] === true : a?.correct === true;
  const rank = content.ranking?.find((r) => r.teamId === teamId)?.rank;
  let solution = '';
  if (item.kind === 'choice') solution = `${String.fromCharCode(65 + item.correctIndex)}: ${item.options[item.correctIndex] ?? ''}`;
  if (item.kind === 'text') solution = item.answers.join(' / ');
  if (item.kind === 'estimate') solution = `${Number(item.target).toLocaleString('de-DE')} ${item.unit}`;
  if (item.kind === 'buzzer') solution = item.answer;
  const isEstimate = item.kind === 'estimate';
  return (
    <Card className="flex flex-col items-center gap-3 p-6 text-center">
      {isEstimate ? (
        <span className="text-6xl">{rank === 1 ? '🎯' : '📏'}</span>
      ) : correct ? (
        <CheckCircle2 className="size-16 text-good" />
      ) : (
        <XCircle className="size-16 text-bad" />
      )}
      <p className="font-display text-2xl font-semibold">{isEstimate ? (rank === 1 ? 'Am nächsten dran!' : `Platz ${rank ?? '–'}`) : correct ? 'Richtig! 🎉' : a || item.kind === 'buzzer' ? 'Leider falsch' : 'Keine Antwort'}</p>
      {solution && (
        <p className="rounded-2xl bg-good-soft px-4 py-2 font-bold">
          Lösung: {solution}
        </p>
      )}
      {isEstimate && a && <p className="text-sm text-muted">Eure Schätzung: {Number(a.value).toLocaleString('de-DE')}</p>}
    </Card>
  );
}

function Results({ state, me }: { state: GameState; me: Me }) {
  if (state.phase.name !== 'results') return null;
  const r = state.phase.results;
  const mine = r.entries.find((e) => e.teamId === me.team!.id);
  return (
    <>
      <Card className="flex flex-col items-center gap-2 p-6 text-center">
        <span className="text-6xl">{mine ? placeLabel(mine.rank) : '🏁'}</span>
        <p className="font-display text-2xl font-semibold">{mine?.rank === 1 ? 'Gewonnen!' : `Platz ${mine?.rank ?? '–'}`}</p>
        {mine && mine.bonusDie > 0 ? (
          <p className="flex items-center gap-2 font-bold">
            Bonuswürfel: <BonusDieBadge sides={mine.bonusDie} />
          </p>
        ) : (
          <p className="text-muted">Kein Bonuswürfel diesmal.</p>
        )}
      </Card>
      <Card className="p-4">
        <p className="label">
          {CONTENT_KIND_INFO[r.kind].icon} {r.title}
        </p>
        <ul className="flex flex-col gap-1.5">
          {r.entries.map((e) => (
            <li key={e.teamId} className={`flex items-center gap-2 rounded-2xl px-2 py-1 ${e.teamId === me.team!.id ? 'bg-accent-soft' : ''}`}>
              <span className="w-7 text-center">{placeLabel(e.rank)}</span>
              <TeamChip team={teamById(state, e.teamId)} size="sm" />
              <span className="flex-1" />
              <BonusDieBadge sides={e.bonusDie} />
            </li>
          ))}
        </ul>
      </Card>
    </>
  );
}

function Finished({ state, me }: { state: GameState; me: Me }) {
  const won = state.winnerTeamId === me.team!.id;
  const place = standings(state).find((s) => s.team.id === me.team!.id)?.place;
  return (
    <Hero icon={won ? '🏆' : placeLabel(place ?? 0)} title={won ? 'Ihr habt gewonnen!' : `Platz ${place}`}>
      {won ? 'Herzlichen Glückwunsch! Ihr seid die Herrscher der Insel.' : `${teamById(state, state.winnerTeamId)?.name} hat gewonnen. Stark gespielt!`}
    </Hero>
  );
}
