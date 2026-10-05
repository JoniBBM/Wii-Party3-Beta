/** Würfeln am Handy: großer Würfelknopf, Würfelanimation, Ergebnis, Feld-Minispiel-Hinweis. */
import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { FIELD_GAME_MODE_LABEL, FIELD_INFO, barrierText, teamById, type GameState } from '@insel/shared';
import { useCommand, useServerNow } from '../../lib/hooks.ts';
import { useShake } from '../../lib/shake.ts';
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

  const vine = dice.vine;
  return (
    <>
      {vine && vine.teamId === team.id ? (
        <VinePanel state={state} />
      ) : mine ? (
        <RollPanel state={state} me={me} />
      ) : myRoll ? (
        <MyRoll state={state} me={me} />
      ) : (
        <Waiting state={state} currentId={currentId ?? null} />
      )}
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

/** Hinweis bzw. Freischalten des Schüttelns. */
function ShakeHint({ shake }: { shake: ReturnType<typeof useShake> }) {
  if (shake.state === 'ask')
    return (
      <Button size="sm" variant="ghost" onClick={() => void shake.enable()}>
        📳 Würfeln durch Schütteln erlauben
      </Button>
    );
  if (shake.state === 'on')
    return (
      <p className="text-sm font-bold text-ink-2">
        📳 Handy schütteln – oder tippen
        <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-bg-2">
          <span className="block h-full rounded-full bg-accent transition-all" style={{ width: `${Math.round(shake.level * 100)}%` }} />
        </span>
      </p>
    );
  return null;
}

/** Würfel wackelt umso stärker, je kräftiger geschüttelt wird. */
function ShakingDie({ busy, level, value = 5 }: { busy: boolean; level: number; value?: number }) {
  return (
    <motion.div
      animate={busy ? {} : level > 0 ? { rotate: [0, -20 * level, 20 * level, 0], x: [0, -8 * level, 8 * level, 0] } : { rotate: [0, -8, 8, -4, 0] }}
      transition={level > 0 ? { repeat: Infinity, duration: 0.25 } : { repeat: Infinity, duration: 1.6, repeatDelay: 0.8 }}
    >
      <DiceFace value={value} size={120} />
    </motion.div>
  );
}

function VinePanel({ state }: { state: GameState }) {
  const { run, pending } = useCommand();
  const now = useServerNow(200);
  const busy = state.phase.name === 'dice' ? Math.max(0, state.phase.dice.busyUntil - now) : 0;
  const sides = state.config.rules.vine?.sides ?? 6;
  const roll = () => {
    if (busy > 0 || pending) return;
    void run({ type: 'vine.roll' });
  };
  const shake = useShake(busy === 0, roll);
  return (
    <Card className="flex flex-col items-center gap-4 overflow-hidden p-6 text-center">
      <span className="text-6xl animate-float">🌿</span>
      <p className="font-display text-3xl font-semibold">Ihr hängt an der Liane!</p>
      <p className="text-ink-2">Würfelt noch einmal (W{sides}) – so viele Felder schwingt ihr nach vorne.</p>
      <ShakingDie busy={busy > 0} level={shake.level} value={sides >= 6 ? 6 : sides} />
      <Button variant="primary" size="xl" block loading={pending === 'vine.roll'} disabled={busy > 0} onClick={roll} className="animate-pulse-ring">
        {busy > 0 ? `Moment … ${Math.ceil(busy / 1000)}` : '🌿 Lianen-Wurf!'}
      </Button>
      <ShakeHint shake={shake} />
    </Card>
  );
}

function RollPanel({ state, me }: { state: GameState; me: Me }) {
  const { run, pending } = useCommand();
  const now = useServerNow(200);
  const team = me.team!;
  const busyMs = state.phase.name === 'dice' ? Math.max(0, state.phase.dice.busyUntil - now) : 0;
  const roll = () => {
    if (busyMs > 0 || pending) return;
    void run({ type: 'dice.roll' });
  };
  const shake = useShake(busyMs === 0, roll);
  if (state.phase.name !== 'dice') return null;
  const busy = busyMs;
  const rules = state.config.rules;
  const goal = state.config.board.fields.length - 1;
  return (
    <Card className="flex flex-col items-center gap-4 overflow-hidden p-6 text-center">
      <p className="font-display text-3xl font-semibold">Ihr seid dran!</p>
      {team.blocked && <p className="rounded-2xl bg-warn-soft px-3 py-2 font-bold">🚧 Ihr steckt fest. Zum Befreien braucht ihr {barrierText(rules.barrier)}.</p>}
      {team.crater && (
        <p className="rounded-2xl bg-warn-soft px-3 py-2 font-bold">
          🕳️ Ihr hängt im Krater! Noch {team.crater.need - team.crater.climbed} Augen bis zum Rand – was übrig bleibt, lauft ihr weiter.
        </p>
      )}
      {rules.winRule === 'final_roll' && team.position === goal && (
        <p className="rounded-2xl bg-gold/25 px-3 py-2 font-bold">🏆 Siegeswurf! Ihr braucht mindestens eine {rules.finalRollMin}.</p>
      )}
      <ShakingDie busy={busy > 0} level={shake.level} />
      {team.bonusDie > 0 && (
        <p className="flex items-center gap-2 font-bold">
          plus Bonuswürfel <BonusDieBadge sides={team.bonusDie} />
        </p>
      )}
      <Button variant="primary" size="xl" block loading={pending === 'dice.roll'} disabled={busy > 0} onClick={roll} className="animate-pulse-ring">
        {busy > 0 ? `Moment … ${Math.ceil(busy / 1000)}` : '🎲 Würfeln!'}
      </Button>
      <ShakeHint shake={shake} />
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
  const onVine = state.phase.name === 'dice' && state.phase.dice.vine?.teamId === currentId;
  return (
    <Card className="flex flex-col items-center gap-3 p-6 text-center">
      <span className="text-5xl animate-float">🎲</span>
      <p className="font-display text-2xl font-semibold">Würfelrunde</p>
      {t && (
        <p className="flex items-center gap-2 text-ink-2">
          <TeamChip team={t} /> {onVine ? 'hängt an der Liane 🌿' : 'ist dran'}
        </p>
      )}
    </Card>
  );
}
