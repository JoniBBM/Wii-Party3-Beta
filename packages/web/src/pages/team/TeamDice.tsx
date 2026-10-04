/** Würfeln am Handy: großer Würfelknopf, Würfelanimation, Ergebnis, Feld-Minispiel-Hinweis. */
import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { FIELD_GAME_MODE_LABEL, FIELD_INFO, barrierText, teamById, type GameState } from '@insel/shared';
import { useCommand, useServerNow } from '../../lib/hooks.ts';
import { Button, Card } from '../../ui/basics.tsx';
import { BonusDieBadge, DiceFace, TeamChip } from '../../ui/game.tsx';
import { DrawnPlayers } from '../../game/bits.tsx';
import type { Me } from './TeamApp.tsx';
import { useTeamFx } from './useTeamEffects.ts';

export function TeamDice({ state, me }: { state: GameState; me: Me }) {
  if (state.phase.name !== 'dice') return null;
  const dice = state.phase.dice;
  const team = me.team!;
  const currentId = dice.order[dice.index];
  const mine = currentId === team.id;
  const myRoll = dice.rolls.find((r) => r.teamId === team.id);
  const myIndex = dice.order.indexOf(team.id);
  const fg = dice.fieldGame;

  if (fg) {
    const involved = fg.teamId === team.id || fg.opponentIds.includes(team.id);
    const landing = teamById(state, fg.teamId);
    return (
      <Card className="flex flex-col gap-3 p-5 text-center">
        <span className="text-6xl">🎮</span>
        <p className="font-display text-2xl font-semibold">Minispiel-Feld!</p>
        {fg.stage === 'choose' ? (
          <p className="text-ink-2">
            <TeamChip team={landing} size="sm" /> ist gelandet – das Minispiel wird gerade ausgewählt.
          </p>
        ) : (
          <>
            <p className="font-bold">
              {fg.item?.title ?? 'Freies Minispiel'} · {fg.mode ? FIELD_GAME_MODE_LABEL[fg.mode] : ''}
            </p>
            {fg.item?.description && <p className="text-left whitespace-pre-line text-ink-2">{fg.item.description}</p>}
            {involved ? (
              <div className="text-left">
                <p className="label">Von euch spielen</p>
                <DrawnPlayers state={state} drawn={{ [team.id]: fg.drawn[team.id] ?? [] }} />
              </div>
            ) : (
              <p className="text-muted">Ihr schaut diesmal zu.</p>
            )}
          </>
        )}
      </Card>
    );
  }

  return (
    <>
      {mine ? <RollPanel state={state} me={me} /> : myRoll ? <MyRoll state={state} me={me} /> : <Waiting state={state} currentId={currentId ?? null} />}
      <Card className="p-4">
        <p className="label">Reihenfolge</p>
        <ol className="flex flex-col gap-1">
          {dice.order.map((id, i) => {
            const roll = dice.rolls.find((r) => r.teamId === id);
            return (
              <li key={id} className={`flex items-center gap-2 rounded-xl px-2 py-1 ${i === dice.index ? 'bg-accent-soft' : ''} ${id === team.id ? 'font-extrabold' : ''}`}>
                <span className="w-5 text-right text-sm font-bold text-muted">{i + 1}.</span>
                <TeamChip team={teamById(state, id)} size="sm" />
                <span className="flex-1" />
                {roll ? <span className="text-sm font-bold">🎲 {roll.total}</span> : i === dice.index ? <span className="text-xs font-bold text-accent">würfelt</span> : null}
              </li>
            );
          })}
        </ol>
        {myIndex > dice.index && !myRoll && <p className="mt-2 text-center text-sm font-semibold text-muted">Ihr seid als {myIndex + 1}. dran.</p>}
      </Card>
    </>
  );
}

function RollPanel({ state, me }: { state: GameState; me: Me }) {
  const { run, pending } = useCommand();
  const now = useServerNow(200);
  const team = me.team!;
  if (state.phase.name !== 'dice') return null;
  const busy = Math.max(0, state.phase.dice.busyUntil - now);
  const rules = state.config.rules;
  const goal = state.config.board.fields.length - 1;
  return (
    <Card className="flex flex-col items-center gap-4 overflow-hidden p-6 text-center">
      <p className="font-display text-3xl font-semibold">Ihr seid dran!</p>
      {team.blocked && <p className="rounded-2xl bg-warn-soft px-3 py-2 font-bold">🚧 Ihr steckt fest. Zum Befreien braucht ihr {barrierText(rules.barrier)}.</p>}
      {rules.winRule === 'final_roll' && team.position === goal && (
        <p className="rounded-2xl bg-gold/25 px-3 py-2 font-bold">🏆 Siegeswurf! Ihr braucht mindestens eine {rules.finalRollMin}.</p>
      )}
      <motion.div animate={busy ? {} : { rotate: [0, -8, 8, -4, 0] }} transition={{ repeat: Infinity, duration: 1.6, repeatDelay: 0.8 }}>
        <DiceFace value={5} size={120} />
      </motion.div>
      {team.bonusDie > 0 && (
        <p className="flex items-center gap-2 font-bold">
          plus Bonuswürfel <BonusDieBadge sides={team.bonusDie} />
        </p>
      )}
      <Button variant="primary" size="xl" block loading={pending === 'dice.roll'} disabled={busy > 0} onClick={() => run({ type: 'dice.roll' })} className="animate-pulse-ring">
        {busy > 0 ? `Moment … ${Math.ceil(busy / 1000)}` : '🎲 Würfeln!'}
      </Button>
    </Card>
  );
}

function MyRoll({ state, me }: { state: GameState; me: Me }) {
  const lastDice = useTeamFx((s) => s.lastDice);
  const [rolling, setRolling] = useState(false);
  const [face, setFace] = useState(1);
  const team = me.team!;
  const roll = state.phase.name === 'dice' ? state.phase.dice.rolls.find((r) => r.teamId === team.id) : undefined;

  // Kurze „Würfel rollt“-Animation, wenn der Wurf gerade frisch ist
  useEffect(() => {
    if (!lastDice || lastDice.teamId !== team.id || Date.now() - lastDice.at > 4000) return;
    setRolling(true);
    const id = setInterval(() => setFace(1 + Math.floor(Math.random() * 6)), 70);
    const stop = setTimeout(() => {
      clearInterval(id);
      setRolling(false);
    }, 1300);
    return () => {
      clearInterval(id);
      clearTimeout(stop);
    };
  }, [lastDice, team.id]);

  if (!roll) return null;
  const field = state.config.board.fields[roll.to] ?? 'normal';
  return (
    <Card className="flex flex-col items-center gap-3 p-6 text-center">
      <div className="flex items-center gap-3">
        <motion.div animate={rolling ? { rotate: [0, 90, 180, 270, 360], y: [0, -20, 0] } : { rotate: 0 }} transition={{ duration: 0.4, repeat: rolling ? Infinity : 0 }}>
          <DiceFace value={rolling ? face : roll.main} size={96} />
        </motion.div>
        {roll.bonus > 0 && !rolling && (
          <>
            <span className="font-display text-3xl font-semibold text-muted">+</span>
            <DiceFace value={roll.bonus} size={72} color="#ffe27a" />
          </>
        )}
      </div>
      {!rolling && (
        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col items-center gap-1">
          <p className="font-display text-4xl font-semibold">{roll.total}</p>
          <p className="font-bold text-ink-2">
            Feld {roll.from} → {roll.to} {FIELD_INFO[field].icon}
          </p>
          {roll.outcome && <p className="text-sm text-muted">{roll.outcome}</p>}
        </motion.div>
      )}
    </Card>
  );
}

function Waiting({ state, currentId }: { state: GameState; currentId: string | null }) {
  const t = teamById(state, currentId);
  return (
    <Card className="flex flex-col items-center gap-3 p-6 text-center">
      <span className="text-5xl animate-float">🎲</span>
      <p className="font-display text-2xl font-semibold">Würfelrunde</p>
      {t && (
        <p className="flex items-center gap-2 text-ink-2">
          <TeamChip team={t} /> ist dran
        </p>
      )}
    </Card>
  );
}
