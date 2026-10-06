/** Große Beamer-Einblendungen je nach Spielphase. */
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  CONTENT_KIND_INFO,
  FIELD_GAME_MODE_LABEL,
  gameStats,
  standings,
  teamById,
  teamColor,
  type ActiveContent,
  type GameState,
  type Player,
} from '@insel/shared';
import { FigureAvatar } from '../../figure/FigurePreview.tsx';
import { useJoinUrl } from '../../lib/system.ts';
import { useSpotlight } from '../../lib/spotlight.ts';
import { Avatar, BonusDieBadge, Countdown, QrCode } from '../../ui/game.tsx';
import { placeLabel } from '../../game/bits.tsx';

const OPTION_COLORS = ['#2f7de1', '#e8423f', '#f5a623', '#3fae4f', '#8e4fd6', '#1fbcc9', '#ec5fa8', '#9a6a46'];

function Panel({ children, className = '', k }: { children: React.ReactNode; className?: string; k: string }) {
  return (
    <motion.div
      key={k}
      initial={{ x: -40, opacity: 0, scale: 0.96 }}
      animate={{ x: 0, opacity: 1, scale: 1 }}
      exit={{ x: -30, opacity: 0, scale: 0.97 }}
      transition={{ type: 'spring', stiffness: 260, damping: 28 }}
      className={`glass pointer-events-auto overflow-hidden rounded-[2rem] ${className}`}
    >
      {children}
    </motion.div>
  );
}

export function PhaseOverlay({ state }: { state: GameState }) {
  const p = state.phase;
  let content: React.ReactNode = null;
  let key: string = p.name;
  if (p.name === 'lobby') content = <Lobby state={state} />;
  else if (p.name === 'content') {
    key = `content-${p.content.item.id}`;
    content = <ContentPanel state={state} content={p.content} />;
  } else if (p.name === 'results') content = <Results state={state} />;
  else if (p.name === 'dice' && p.dice.fieldGame && p.dice.fieldGame.stage === 'running') {
    key = 'fieldgame';
    content = <FieldGamePanel state={state} />;
  } else if (p.name === 'finished') content = <Finished state={state} />;
  else if (p.name === 'idle' && state.round === 0) content = <Welcome />;

  return (
    <div className="pointer-events-none absolute top-[6.5rem] bottom-[9rem] left-6 z-10 flex w-[min(46rem,52vw)] flex-col justify-start">
      <AnimatePresence mode="wait">{content && <Panel k={key}>{content}</Panel>}</AnimatePresence>
    </div>
  );
}

function Welcome() {
  return (
    <div className="px-8 py-7">
      <p className="font-display text-5xl font-semibold text-ink">Willkommen auf der Insel! 🌴</p>
      <p className="mt-3 text-2xl font-bold text-ink-2">Gleich startet die erste Runde. Wer zuerst den Vulkangipfel erklimmt, gewinnt!</p>
    </div>
  );
}

function Lobby({ state }: { state: GameState }) {
  const joinUrl = useJoinUrl();
  const short = joinUrl.replace(/^https?:\/\//, '');
  const teams = state.teams;
  return (
    <div className="flex flex-col gap-5 p-7">
      <div className="flex items-center gap-7">
        <QrCode value={`${joinUrl}/join`} size={250} className="shrink-0 shadow-lifted" />
        <div className="min-w-0">
          <p className="font-display text-6xl leading-none font-semibold text-ink">Mitspielen!</p>
          <p className="mt-3 text-2xl font-bold text-ink-2">QR-Code scannen oder im Browser öffnen:</p>
          <p className="mt-1 font-mono text-3xl font-bold break-all text-accent">{short}/join</p>
          <p className="mt-3 text-xl font-bold text-ink-2">
            {!state.registrationOpen ? '🔒 Beitritt mit Team-PIN' : state.config.devices === 'shared' ? '👥 Anmeldung an der Anmeldestation' : '📲 Die Anmeldung ist offen'}
          </p>
        </div>
      </div>
      {teams.length === 0 ? (
        <PlayerCloud players={state.players} />
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {teams.map((t) => {
            const c = teamColor(t.color);
            const members = state.players.filter((p) => p.teamId === t.id);
            return (
              <motion.div layout key={t.id} className="flex items-center gap-3 rounded-3xl bg-white/80 p-2.5" style={{ boxShadow: `inset 0 0 0 3px ${c.hex}` }}>
                <FigureAvatar figure={t.figure} color={t.color} size={56} />
                <div className="min-w-0">
                  <p className="truncate font-display text-2xl font-semibold" style={{ color: c.dark }}>
                    {t.name}
                  </p>
                  <div className="flex -space-x-2">
                    {members.slice(0, 8).map((m) => (
                      <Avatar key={m.id} player={m} size={34} ring="#fff" />
                    ))}
                    {members.length > 8 && <span className="grid size-[34px] place-items-center rounded-full bg-white text-sm font-bold">+{members.length - 8}</span>}
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function PlayerCloud({ players }: { players: Player[] }) {
  if (!players.length) return <p className="text-2xl font-bold text-ink-2">Noch niemand da … wer ist zuerst? 👀</p>;
  return (
    <div className="flex flex-wrap gap-2.5">
      <AnimatePresence>
        {players.map((p) => (
          <motion.span
            key={p.id}
            initial={{ scale: 0, rotate: -10 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ type: 'spring', stiffness: 400, damping: 18 }}
            className="inline-flex items-center gap-2 rounded-full bg-white/85 py-1 pr-4 pl-1 font-display text-xl font-semibold text-ink shadow-soft"
          >
            <Avatar player={p} size={40} />
            {p.name}
          </motion.span>
        ))}
      </AnimatePresence>
    </div>
  );
}

function Faces({ state, drawn }: { state: GameState; drawn: Record<string, string[]> }) {
  const groups = state.teams.filter((t) => drawn[t.id]?.length);
  if (!groups.length) return null;
  return (
    <div className="flex flex-wrap gap-3">
      {groups.map((t, gi) => {
        const c = teamColor(t.color);
        return (
          <div key={t.id} className="flex items-center gap-2 rounded-full bg-white/80 py-1.5 pr-4 pl-1.5" style={{ boxShadow: `inset 0 0 0 3px ${c.hex}` }}>
            {(drawn[t.id] ?? []).map((id, i) => {
              const p = state.players.find((x) => x.id === id);
              if (!p) return null;
              return (
                <motion.span
                  key={id}
                  initial={{ scale: 0, y: 20 }}
                  animate={{ scale: 1, y: 0 }}
                  transition={{ delay: 0.15 * (gi * 2 + i), type: 'spring', stiffness: 380, damping: 16 }}
                  className="flex items-center gap-2"
                >
                  <Avatar player={p} size={62} ring={c.hex} />
                  <span className="font-display text-2xl font-semibold text-ink">{p.name}</span>
                </motion.span>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

// Ausflug zur Tafel: Ziel kommt erst beim Ausblenden (über `custom` von AnimatePresence)
const SPOT_VARIANTS = {
  enter: { scale: 0.55, opacity: 0, x: 0, y: 40 },
  show: { scale: 1, opacity: 1, x: 0, y: 0, transition: { type: 'spring' as const, stiffness: 220, damping: 22 } },
  fly: (f: { x: number; y: number; scale: number }) => ({
    x: f.x,
    y: f.y,
    scale: f.scale,
    opacity: [1, 1, 0],
    transition: { duration: 0.85, ease: [0.45, 0, 0.2, 1] as const, opacity: { duration: 0.85, times: [0, 0.75, 1] } },
  }),
};

/** Große Frage in der Mitte (nach dem Öffnen), wandert dann in die Tafel oben links. */
export function QuestionSpotlight({ state }: { state: GameState }) {
  const p = state.phase;
  const content = p.name === 'content' ? p.content : null;
  const item = content?.item;
  const question = item && 'question' in item ? item.question : null;
  const key = content && item && question && content.stage === 'open' ? item.id : null;
  const spot = useSpotlight((s) => s.id);
  const holdMs = useSpotlight((s) => s.holdMs);
  const seen = useRef(new Set<string>());
  const card = useRef<HTMLDivElement>(null);
  const [fly, setFly] = useState<{ x: number; y: number; scale: number }>({ x: -600, y: -300, scale: 0.4 });

  // neue Frage geöffnet → groß zeigen (jede Frage nur einmal)
  useEffect(() => {
    if (!key || !question || seen.current.has(key)) return;
    seen.current.add(key);
    useSpotlight.setState({ id: key });
  }, [key, question]);
  // nach der Lesezeit (oder Sprachaufnahme) an den Platz in der Tafel fliegen
  useEffect(() => {
    if (!spot || !question) return;
    const ms = holdMs ?? Math.min(9000, Math.max(3800, 1800 + question.length * 42));
    const t = window.setTimeout(() => {
      const target = useSpotlight.getState().target;
      const r = card.current?.getBoundingClientRect();
      if (target && r && r.width > 0) {
        setFly({
          x: target.left + target.width / 2 - (r.left + r.width / 2),
          y: target.top + target.height / 2 - (r.top + r.height / 2),
          scale: Math.max(0.2, Math.min(1, target.width / r.width)),
        });
      }
      useSpotlight.setState({ id: null });
    }, ms);
    return () => window.clearTimeout(t);
  }, [spot, question, holdMs]);
  // Frage geschlossen, bevor sie geflogen ist → sofort weg
  useEffect(() => {
    if (spot && spot !== key) useSpotlight.setState({ id: null });
  }, [spot, key]);

  const info = item ? CONTENT_KIND_INFO[item.kind] : null;
  return (
    <AnimatePresence custom={fly}>
      {spot && spot === key && question && info && (
        <motion.div key={spot} className="pointer-events-none absolute inset-0 z-20 grid place-items-center px-[8vw]">
          {/* leichte Abdunklung, damit nur die Frage zählt */}
          <motion.div
            className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(10,30,50,0.42),rgba(10,30,50,0.18))]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1, transition: { duration: 0.35 } }}
            exit={{ opacity: 0, transition: { duration: 0.5 } }}
          />
          <motion.div
            ref={card}
            custom={fly}
            variants={SPOT_VARIANTS}
            initial="enter"
            animate="show"
            exit="fly"
            className="relative max-w-[78rem] rounded-[2.6rem] bg-white/95 px-14 py-11 text-center shadow-lifted ring-1 ring-white/60"
          >
            <span className="inline-flex items-center gap-2 rounded-full bg-accent px-5 py-1.5 font-display text-2xl font-semibold text-white">
              {info.icon} {info.label}
            </span>
            <p className="mt-6 font-display text-[3.6rem] leading-[1.12] font-semibold text-balance text-ink">{question}</p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** Was als richtig gilt – für die große Auflösung. */
function solutionOf(item: ActiveContent['item']): { letter?: string; color?: string; text: string; also?: string } | null {
  switch (item.kind) {
    case 'choice':
      return { letter: String.fromCharCode(65 + item.correctIndex), color: OPTION_COLORS[item.correctIndex % OPTION_COLORS.length], text: item.options[item.correctIndex] ?? '' };
    case 'text':
      return { text: item.answers[0] ?? '', also: item.answers.length > 1 ? item.answers.slice(1, 4).join(' · ') : undefined };
    case 'estimate':
      return { text: `${Number(item.target).toLocaleString('de-DE')}${item.unit ? ` ${item.unit}` : ''}` };
    case 'buzzer':
      return item.answer ? { text: item.answer } : null;
    default:
      return null;
  }
}

/**
 * Auflösung groß in der Bildmitte: die richtige Antwort und wer richtig lag (bei Schätzfragen:
 * wer am nächsten dran war). Nach ein paar Sekunden wieder weg – die Tafel zeigt die Lösung weiter.
 */
export function RevealSpotlight({ state }: { state: GameState }) {
  const p = state.phase;
  const content = p.name === 'content' ? p.content : null;
  const item = content?.item;
  const key = content && item && item.kind !== 'game' && content.stage === 'revealed' ? item.id : null;
  const [shown, setShown] = useState<string | null>(null);
  const seen = useRef(new Set<string>());
  useEffect(() => {
    if (!key || seen.current.has(key)) return;
    seen.current.add(key);
    setShown(key);
  }, [key]);
  useEffect(() => {
    if (!shown) return;
    if (shown !== key) {
      setShown(null);
      return;
    }
    const t = window.setTimeout(() => setShown(null), 5800);
    return () => window.clearTimeout(t);
  }, [shown, key]);

  const sol = item ? solutionOf(item) : null;
  const visible = !!(shown && shown === key && content && item && sol);
  let right: GameState['teams'] = [];
  let note = '';
  if (visible && content && item) {
    if (item.kind === 'estimate') {
      const best = (content.ranking ?? []).filter((r) => r.rank === 1).map((r) => teamById(state, r.teamId)).filter((t): t is GameState['teams'][number] => !!t);
      right = best;
      const a = best[0] ? content.answers[best[0].id] : undefined;
      note = best.length ? `Am nächsten dran${a ? ` mit ${Number(a.value).toLocaleString('de-DE')}` : ''}` : 'Keine Schätzung abgegeben';
    } else if (item.kind === 'buzzer') {
      right = state.teams.filter((t) => content.buzzJudged[t.id] === true);
      note = right.length ? 'Richtig beantwortet' : 'Niemand hatte die Lösung';
    } else {
      right = state.teams.filter((t) => content.answers[t.id]?.correct === true);
      const answered = state.teams.filter((t) => content.answers[t.id]).length;
      note = right.length === 0 ? (answered ? 'Diesmal lag kein Team richtig 😅' : 'Keine Antworten') : right.length === state.teams.length ? 'Alle Teams lagen richtig! 🎉' : 'Richtig lagen';
    }
  }
  return (
    <AnimatePresence>
      {visible && sol && (
        <motion.div key={`reveal-${shown}`} className="pointer-events-none absolute inset-0 z-20 grid place-items-center px-[8vw]">
          <motion.div
            className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(10,40,25,0.42),rgba(10,30,20,0.16))]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1, transition: { duration: 0.35 } }}
            exit={{ opacity: 0, transition: { duration: 0.5 } }}
          />
          <motion.div
            initial={{ scale: 0.6, opacity: 0, y: 30 }}
            animate={{ scale: 1, opacity: 1, y: 0, transition: { type: 'spring', stiffness: 240, damping: 20 } }}
            exit={{ scale: 0.9, opacity: 0, y: -20, transition: { duration: 0.45 } }}
            className="relative flex max-w-[80rem] flex-col items-center gap-6 rounded-[2.6rem] bg-white/95 px-14 py-10 text-center shadow-lifted ring-4 ring-good/60"
          >
            <span className="inline-flex items-center gap-2 rounded-full bg-good px-6 py-2 font-display text-3xl font-semibold text-white">✅ Richtig ist</span>
            <div className="flex items-center gap-6">
              {sol.letter && (
                <span className="grid size-28 shrink-0 place-items-center rounded-full font-display text-7xl font-semibold text-white shadow-lifted" style={{ background: sol.color }}>
                  {sol.letter}
                </span>
              )}
              <p className="font-display text-[4.6rem] leading-[1.05] font-semibold text-balance text-ink">{sol.text}</p>
            </div>
            {sol.also && <p className="text-2xl font-bold text-ink-2">Auch richtig: {sol.also}</p>}
            <div className="flex flex-col items-center gap-3">
              <p className="text-2xl font-bold text-ink-2">{note}</p>
              {right.length > 0 && (
                <div className="flex max-w-[70rem] flex-wrap justify-center gap-3">
                  {right.map((t) => (
                    <motion.span
                      key={t.id}
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ delay: 0.5, type: 'spring', stiffness: 400, damping: 18 }}
                      className="inline-flex items-center gap-2 rounded-full px-5 py-2 font-display text-3xl font-semibold text-white shadow"
                      style={{ background: teamColor(t.color).hex }}
                    >
                      {t.name}
                    </motion.span>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function ContentPanel({ state, content }: { state: GameState; content: ActiveContent }) {
  const item = content.item;
  const spot = useSpotlight((s) => s.id) === item.id;
  const qRef = useRef<HTMLParagraphElement>(null);
  // Platz der Frage in der Tafel merken (Ziel des Flugs aus der Bildmitte)
  useLayoutEffect(() => {
    if (qRef.current) useSpotlight.setState({ target: qRef.current.getBoundingClientRect() });
  });
  const info = CONTENT_KIND_INFO[item.kind];
  const revealed = content.stage === 'revealed';
  const showQuestion = 'question' in item && content.stage !== 'intro';
  const answeredCount = Object.keys(content.answers).length;
  return (
    <div className="flex flex-col gap-4 p-7">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <span className="inline-flex items-center gap-2 rounded-full bg-accent px-4 py-1 font-display text-lg font-semibold text-white">
            {info.icon} {info.label}
          </span>
          <p className="mt-3 font-display text-5xl leading-tight font-semibold text-ink">{item.title}</p>
        </div>
        {content.timer && content.stage !== 'revealed' && <Countdown timer={content.timer} size="lg" />}
      </div>

      {showQuestion && (
        <motion.p
          ref={qRef}
          initial={false}
          animate={{ opacity: spot ? 0 : 1 }}
          transition={{ duration: 0.35, delay: spot ? 0 : 0.55 }}
          className="text-4xl leading-snug font-bold text-ink"
        >
          {(item as { question: string }).question}
        </motion.p>
      )}
      {showQuestion && item.kind === 'estimate' && item.unit && !revealed && <p className="text-2xl font-bold text-ink-2">Antwort in: {item.unit}</p>}
      {!showQuestion && 'question' in item && <p className="text-3xl font-bold text-ink-2">Gleich kommt die Frage …</p>}
      {item.kind === 'game' && item.description && <p className="text-2xl leading-relaxed font-semibold whitespace-pre-line text-ink-2">{item.description}</p>}
      {item.kind === 'game' && item.materials && <p className="text-xl font-bold text-ink-2">🧰 {item.materials}</p>}

      {item.kind === 'choice' && content.stage !== 'intro' && (
        <div className="grid grid-cols-2 gap-3">
          {item.options.map((o, i) => {
            const right = revealed && i === item.correctIndex;
            const chosenBy = revealed ? state.teams.filter((t) => Number(content.answers[t.id]?.value) === i && content.answers[t.id]?.value !== '') : [];
            return (
              <div
                key={i}
                className={`relative flex items-center gap-3 rounded-3xl px-4 py-3 text-2xl font-extrabold text-white transition ${revealed && !right ? 'opacity-35 saturate-50' : ''} ${right ? 'ring-8 ring-white' : ''}`}
                style={{ background: OPTION_COLORS[i % OPTION_COLORS.length] }}
              >
                <span className="grid size-12 shrink-0 place-items-center rounded-full bg-white/25 font-display text-2xl">{String.fromCharCode(65 + i)}</span>
                <span className="flex-1">{o}</span>
                {right && <span className="text-4xl">✅</span>}
                {chosenBy.length > 0 && (
                  <span className="absolute -top-3 right-3 flex gap-1">
                    {chosenBy.map((t) => (
                      <span key={t.id} className="size-6 rounded-full border-2 border-white" style={{ background: teamColor(t.color).hex }} title={t.name} />
                    ))}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}

      {revealed && (item.kind === 'text' || item.kind === 'buzzer') && (
        <p className="rounded-3xl bg-good px-5 py-3 font-display text-4xl font-semibold text-white">✅ {item.kind === 'text' ? item.answers[0] : item.answer}</p>
      )}
      {revealed && item.kind === 'estimate' && <EstimateReveal state={state} content={content} />}
      {item.kind === 'buzzer' && content.buzzQueue.length > 0 && <BuzzQueue state={state} content={content} />}

      {Object.keys(content.drawn).length > 0 && <Faces state={state} drawn={content.drawn} />}

      {'question' in item && content.stage === 'open' && item.kind !== 'buzzer' && (
        <div className="flex items-center gap-3">
          <span className="text-xl font-bold text-ink-2">
            {answeredCount}/{state.teams.length} Teams haben geantwortet
          </span>
          <span className="flex gap-1.5">
            {state.teams.map((t) => (
              <motion.span
                key={t.id}
                animate={{ scale: content.answers[t.id] ? [1, 1.4, 1] : 1 }}
                className="size-7 rounded-full border-[3px] border-white shadow-soft"
                style={{ background: content.answers[t.id] ? teamColor(t.color).hex : 'rgba(0,0,0,0.12)' }}
                title={t.name}
              />
            ))}
          </span>
        </div>
      )}
      {revealed && item.kind !== 'choice' && item.kind !== 'estimate' && item.kind !== 'buzzer' && <TeamVerdicts state={state} content={content} />}
    </div>
  );
}

function TeamVerdicts({ state, content }: { state: GameState; content: ActiveContent }) {
  return (
    <div className="flex flex-wrap gap-2">
      {state.teams.map((t) => {
        const a = content.answers[t.id];
        const ok = a?.correct === true;
        return (
          <span key={t.id} className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xl font-bold ${ok ? 'bg-good-soft text-good' : 'bg-white/70 text-ink-2'}`}>
            <span className="size-4 rounded-full" style={{ background: teamColor(t.color).hex }} />
            {t.name}: {a ? String(a.value) : '–'} {ok ? '✅' : a ? '❌' : ''}
          </span>
        );
      })}
    </div>
  );
}

function EstimateReveal({ state, content }: { state: GameState; content: ActiveContent }) {
  const item = content.item;
  if (item.kind !== 'estimate') return null;
  const rows = (content.ranking ?? [])
    .map((r) => ({ r, t: teamById(state, r.teamId), a: content.answers[r.teamId] }))
    .filter((x) => x.a)
    .sort((a, b) => a.r.rank - b.r.rank);
  return (
    <div className="flex flex-col gap-2">
      <p className="rounded-3xl bg-good px-5 py-3 font-display text-4xl font-semibold text-white">
        🎯 {Number(item.target).toLocaleString('de-DE')} {item.unit}
      </p>
      {rows.map(({ r, t, a }) => (
        <div key={r.teamId} className="flex items-center gap-3 rounded-2xl bg-white/80 px-4 py-1.5 text-2xl font-bold">
          <span className="w-10">{placeLabel(r.rank)}</span>
          <span className="size-5 rounded-full" style={{ background: teamColor(t?.color ?? 'red').hex }} />
          <span className="flex-1 text-ink">{t?.name}</span>
          <span className="text-ink-2 tabular-nums">
            {Number(a!.value).toLocaleString('de-DE')} {item.unit}
          </span>
          <span className="w-40 text-right text-lg text-muted tabular-nums">
            {Number(a!.value) === item.target ? 'genau!' : `${Number(a!.value) > item.target ? '+' : '−'}${Math.abs(Number(a!.value) - item.target).toLocaleString('de-DE')}`}
          </span>
        </div>
      ))}
    </div>
  );
}

function BuzzQueue({ state, content }: { state: GameState; content: ActiveContent }) {
  return (
    <div className="flex flex-col gap-2">
      {content.buzzQueue.map((b, i) => {
        const t = teamById(state, b.teamId);
        const j = content.buzzJudged[b.teamId];
        return (
          <motion.div
            key={b.teamId}
            initial={{ x: -30, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            className={`flex items-center gap-3 rounded-3xl px-4 py-2 font-display text-3xl font-semibold ${j === false ? 'bg-white/50 text-muted line-through' : 'bg-white/85 text-ink'}`}
          >
            <span className="grid size-11 place-items-center rounded-full text-white" style={{ background: teamColor(t?.color ?? 'red').hex }}>
              {i + 1}
            </span>
            {t?.name}
            <span className="ml-auto">{j === true ? '✅' : j === false ? '❌' : i === 0 ? '🔔' : ''}</span>
          </motion.div>
        );
      })}
    </div>
  );
}

function Results({ state }: { state: GameState }) {
  if (state.phase.name !== 'results') return null;
  const r = state.phase.results;
  return (
    <div className="flex flex-col gap-4 p-7">
      <p className="font-display text-5xl font-semibold text-ink">🏅 Ergebnis</p>
      <p className="text-2xl font-bold text-ink-2">
        {CONTENT_KIND_INFO[r.kind].icon} {r.title}
      </p>
      <div className="flex flex-col gap-2">
        {r.entries.map((e, i) => {
          const t = teamById(state, e.teamId);
          return (
            <motion.div
              key={e.teamId}
              initial={{ x: -50, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              transition={{ delay: 0.25 + i * 0.18, type: 'spring', stiffness: 300, damping: 24 }}
              className={`flex items-center gap-4 rounded-3xl px-4 py-2 ${e.rank === 1 ? 'bg-gold/40' : 'bg-white/80'}`}
            >
              <span className="w-14 text-center font-display text-4xl">{placeLabel(e.rank)}</span>
              {t && <FigureAvatar figure={t.figure} color={t.color} size={52} />}
              <span className="flex-1 font-display text-3xl font-semibold text-ink">{t?.name}</span>
              {e.detail && <span className="text-xl font-bold text-ink-2">{e.detail}</span>}
              {e.bonusDie > 0 && (
                <span className="scale-150">
                  <BonusDieBadge sides={e.bonusDie} />
                </span>
              )}
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}

function FieldGamePanel({ state }: { state: GameState }) {
  if (state.phase.name !== 'dice' || !state.phase.dice.fieldGame) return null;
  const fg = state.phase.dice.fieldGame;
  const team = teamById(state, fg.teamId);
  const opponents = fg.opponentIds.map((id) => teamById(state, id));
  return (
    <div className="flex flex-col gap-4 p-7">
      <span className="self-start rounded-full bg-[#ff6fb5] px-4 py-1 font-display text-lg font-semibold text-white">🎮 Minispiel-Feld · {fg.mode ? FIELD_GAME_MODE_LABEL[fg.mode] : ''}</span>
      <p className="font-display text-5xl leading-tight font-semibold text-ink">{fg.item?.title ?? 'Minispiel!'}</p>
      <div className="flex flex-wrap items-center gap-3 font-display text-3xl font-semibold">
        <span style={{ color: teamColor(team?.color ?? 'red').dark }}>{team?.name}</span>
        <span className="text-ink-2">gegen</span>
        {fg.mode === 'duel' ? <span style={{ color: teamColor(opponents[0]?.color ?? 'red').dark }}>{opponents[0]?.name}</span> : <span className="text-ink">alle anderen</span>}
      </div>
      {fg.item?.description && <p className="text-2xl leading-relaxed font-semibold whitespace-pre-line text-ink-2">{fg.item.description}</p>}
      <Faces state={state} drawn={fg.drawn} />
    </div>
  );
}

function Finished({ state }: { state: GameState }) {
  const table = standings(state);
  const stats = gameStats(state);
  // Sieger steht groß im Banner oben – hier die Schlusstabelle
  return (
    <div className="flex flex-col gap-3 p-7">
      <p className="font-display text-4xl font-semibold text-ink">🏁 Endstand</p>
      <div className="flex flex-col gap-1.5">
        {table.map(({ team, place }) => {
          const st = stats.find((s) => s.teamId === team.id);
          const c = teamColor(team.color);
          return (
            <div
              key={team.id}
              className="flex items-center gap-3 rounded-2xl px-3 py-1.5 text-2xl font-bold"
              style={{ background: `linear-gradient(90deg, color-mix(in srgb, ${c.hex} 30%, white), rgba(255,255,255,0.85) 70%)`, boxShadow: `inset 0 0 0 2.5px ${c.hex}` }}
            >
              <span className="w-12 text-center">{placeLabel(place)}</span>
              <FigureAvatar figure={team.figure} color={team.color} size={40} />
              <span className="flex-1 font-display" style={{ color: c.dark }}>
                {team.name}
              </span>
              <span className="text-lg text-ink-2">{st?.wins ?? 0}× Rundensieg · bester Wurf {st?.bestRoll ?? 0}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function RoundEnd({ state }: { state: GameState }) {
  if (state.phase.name !== 'round_end') return null;
  const s = state.phase.summary;
  const moves = [...s.moves].sort((a, b) => b.to - b.from - (a.to - a.from));
  return (
    <div className="flex flex-col gap-3 p-7">
      <p className="font-display text-5xl font-semibold text-ink">🏁 Runde {s.round} geschafft!</p>
      {s.eruption && <p className="rounded-2xl bg-bad px-4 py-2 font-display text-2xl font-semibold text-white">🌋 Der Vulkan ist ausgebrochen!</p>}
      <div className="flex flex-col gap-1.5">
        {moves.map((m, i) => {
          const t = teamById(state, m.teamId);
          const d = m.to - m.from;
          return (
            <motion.div
              key={m.teamId}
              initial={{ x: -30, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              transition={{ delay: 0.1 * i }}
              className="flex items-center gap-3 rounded-2xl bg-white/80 px-4 py-1.5 text-2xl font-bold"
            >
              <span className="size-5 rounded-full" style={{ background: teamColor(t?.color ?? 'red').hex }} />
              <span className="flex-1 font-display text-ink">{t?.name}</span>
              <span className="text-ink-2 tabular-nums">
                {m.from} → {m.to}
              </span>
              <span className={`w-16 text-right tabular-nums ${d > 0 ? 'text-good' : d < 0 ? 'text-bad' : 'text-muted'}`}>{d > 0 ? `+${d}` : d}</span>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}

/** Kleines Banner oben in der Mitte während der Würfelrunde. */
export function DiceBanner({ state }: { state: GameState }) {
  const show = state.phase.name === 'dice' && !(state.phase.dice.fieldGame && state.phase.dice.fieldGame.stage === 'running');
  return (
    <div className="pointer-events-none absolute top-5 left-1/2 z-10 -translate-x-1/2">
      <AnimatePresence>
        {show && state.phase.name === 'dice' && (
          <motion.div initial={{ y: -40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -40, opacity: 0 }} className="glass flex items-center gap-2 rounded-full px-4 py-2">
            <span className="mr-1 font-display text-xl font-semibold text-ink">🎲 Würfelrunde</span>
            {state.phase.dice.order.map((id, i) => {
              const t = teamById(state, id);
              const dice = state.phase.name === 'dice' ? state.phase.dice : null;
              const done = !!dice?.rolls.some((r) => r.teamId === id);
              const active = dice?.index === i;
              return (
                <span
                  key={id}
                  className={`flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-base font-bold transition ${active ? 'scale-110 text-white shadow-soft' : done ? 'bg-white/50 text-muted' : 'bg-white/80 text-ink-2'}`}
                  style={active ? { background: teamColor(t?.color ?? 'red').hex } : undefined}
                >
                  {!active && <span className="size-3 rounded-full" style={{ background: teamColor(t?.color ?? 'red').hex }} />}
                  {t?.name}
                  {active && dice?.challenge?.teamId === id && (dice.challenge.kind === 'vine' ? ' 🌿' : dice.challenge.kind === 'river' ? ' 🛢️' : ' 🦇')}
                  {t?.inside && ' 🌋'}
                  {done && ' ✓'}
                </span>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** Großer Siegerbanner oben in der Mitte (zum Podest im Krater). */
export function VictoryBanner({ state }: { state: GameState }) {
  const winner = state.phase.name === 'finished' ? teamById(state, state.winnerTeamId) : undefined;
  const c = teamColor(winner?.color ?? 'red');
  return (
    <div className="pointer-events-none absolute top-6 left-1/2 z-20 -translate-x-1/2">
      <AnimatePresence>
        {winner && (
          <motion.div
            key={winner.id}
            initial={{ y: -160, scale: 0.6, opacity: 0 }}
            animate={{ y: 0, scale: 1, opacity: 1 }}
            exit={{ y: -120, opacity: 0 }}
            transition={{ delay: 2.6, type: 'spring', stiffness: 220, damping: 14 }}
            className="flex items-center gap-5 rounded-[2.5rem] border-[6px] border-white px-10 py-4 text-white shadow-[0_18px_60px_rgba(0,0,0,0.35)]"
            style={{ background: `linear-gradient(180deg, color-mix(in srgb, ${c.hex} 70%, white), ${c.hex} 55%, ${c.dark})` }}
          >
            <motion.span className="text-7xl drop-shadow-lg" animate={{ rotate: [-8, 8, -8], y: [0, -8, 0] }} transition={{ duration: 1.6, repeat: Infinity }}>
              🏆
            </motion.span>
            <FigureAvatar figure={winner.figure} color={winner.color} size={96} className="ring-[5px] ring-gold" />
            <div>
              <p className="font-display text-2xl font-semibold text-white/90">Sieger der Insel</p>
              <p className="font-display text-7xl leading-none font-semibold drop-shadow-md">{winner.name}</p>
            </div>
            <motion.span className="text-7xl drop-shadow-lg" animate={{ rotate: [8, -8, 8], y: [0, -8, 0] }} transition={{ duration: 1.6, repeat: Infinity, delay: 0.3 }}>
              🎉
            </motion.span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
