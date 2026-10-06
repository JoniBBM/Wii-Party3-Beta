/** Würfelrunde und Feld-Minispiele steuern. */
import { useState } from 'react';
import { Check, Dices, Hand, Play, Shuffle, SkipForward, Smartphone, Unlock, X } from 'lucide-react';
import {
  barrierText,
  FIELD_GAME_MODE_LABEL,
  FIELD_INFO,
  teamById,
  type DiceRound,
  type FieldGameMode,
  type GameState,
  type RollRecord,
} from '@insel/shared';
import { useCommand, useServerNow } from '../lib/hooks.ts';
import { useLibrary } from '../lib/library.ts';
import { useLive } from '../lib/live.ts';
import { Button, Segmented } from '../ui/basics.tsx';
import { BonusDieBadge, DiceFace, TeamChip } from '../ui/game.tsx';
import { Modal } from '../ui/overlay.tsx';
import { DrawnPlayers } from './bits.tsx';
import { ContentView } from './ContentView.tsx';

export function DiceControl({ state, dice }: { state: GameState; dice: DiceRound }) {
  if (dice.fieldGame) return <FieldGameControl state={state} dice={dice} />;
  if (dice.challenge) return <ChallengeControl state={state} dice={dice} />;
  return <RollControl state={state} dice={dice} />;
}

const CHALLENGE_INFO = {
  vine: { icon: '🌿', title: 'Liane', tone: 'good' },
  river: { icon: '🛢️', title: 'Fässer oder Kisten', tone: 'accent' },
  cave: { icon: '🦇', title: 'Mutprobe Lavahöhle', tone: 'bad' },
} as const;

/** Team steht an einer Mutprobe: abwarten, für das Team würfeln/wählen oder Ergebnis eintragen. */
function ChallengeControl({ state, dice }: { state: GameState; dice: DiceRound }) {
  const { run, pending } = useCommand();
  const now = useServerNow(250);
  const presence = useLive((s) => s.presence);
  const c = dice.challenge!;
  const team = teamById(state, c.teamId);
  const info = CHALLENGE_INFO[c.kind];
  const sides = c.kind === 'vine' ? (state.config.rules.vine?.sides ?? 6) : 6;
  const busyMs = Math.max(0, dice.busyUntil - now);
  const rest = c.remaining > 0 ? ` Danach noch ${c.remaining} ${c.remaining === 1 ? 'Feld' : 'Felder'}.` : '';
  const what =
    c.kind === 'vine'
      ? `hält an der Liane und würfelt, wie weit es schwingt (W${sides}).${rest}`
      : c.kind === 'cave'
        ? `muss mindestens eine ${state.config.rules.cave.need} würfeln – sonst geht es ins Vulkan-Innere.${rest}`
        : `wählt Fässer oder Kisten.${rest}`;
  return (
    <div className="flex flex-col gap-4 rounded-3xl border-2 border-accent/40 bg-accent-soft/30 p-4">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-4xl">{info.icon}</span>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-extrabold uppercase tracking-wide text-accent">Mutprobe · {info.title}</p>
          <p className="flex flex-wrap items-center gap-2 font-bold">
            <TeamChip team={team} /> {what}
          </p>
          <p className="mt-1 inline-flex items-center gap-1 text-sm text-muted">
            <Smartphone className="size-4" /> {presence[c.teamId] ?? 0} Gerät{(presence[c.teamId] ?? 0) === 1 ? '' : 'e'} – das Team kann es selbst am Gerät machen.
          </p>
        </div>
      </div>
      {c.kind === 'river' ? (
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="primary" loading={pending === 'challenge.choose'} disabled={busyMs > 0} onClick={() => run({ type: 'challenge.choose', choice: 'barrels' })}>
            🛢️ Fässer
          </Button>
          <Button variant="primary" loading={pending === 'challenge.choose'} disabled={busyMs > 0} onClick={() => run({ type: 'challenge.choose', choice: 'crates' })}>
            📦 Kisten
          </Button>
          <span className="text-sm font-semibold text-muted">oder Ergebnis vorgeben:</span>
          <Button size="sm" variant="good" onClick={() => run({ type: 'challenge.choose', choice: 'barrels', result: 'safe', force: true })}>
            trocken rüber
          </Button>
          <Button size="sm" variant="bad" onClick={() => run({ type: 'challenge.choose', choice: 'barrels', result: 'fall', force: true })}>
            bricht ein
          </Button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="primary" icon={<Dices className="size-5" />} loading={pending === 'challenge.roll'} disabled={busyMs > 0} onClick={() => run({ type: 'challenge.roll' })}>
            {busyMs > 0 ? 'Animation läuft …' : 'Für Team würfeln'}
          </Button>
          <span className="text-sm font-semibold text-muted">oder eintragen:</span>
          {Array.from({ length: sides }, (_, i) => i + 1).map((n) => (
            <button key={n} type="button" className="grid size-9 place-items-center rounded-xl border-2 border-line font-display font-semibold hover:border-accent" onClick={() => run({ type: 'challenge.roll', value: n, force: true })}>
              {n}
            </button>
          ))}
        </div>
      )}
      <div>
        <Button size="sm" variant="ghost" icon={<SkipForward className="size-4" />} onClick={() => run({ type: 'dice.skip' })}>
          Aussetzen
        </Button>
      </div>
    </div>
  );
}

function RollControl({ state, dice }: { state: GameState; dice: DiceRound }) {
  const { run, pending } = useCommand();
  const now = useServerNow(250);
  const presence = useLive((s) => s.presence);
  const [manual, setManual] = useState(false);
  const currentId = dice.order[dice.index];
  const team = teamById(state, currentId);
  const busyMs = Math.max(0, dice.busyUntil - now);
  const last = dice.rolls.at(-1);
  const rules = state.config.rules;
  const goal = state.config.board.fields.length - 1;

  return (
    <div className="flex flex-col gap-5">
      <ol className="flex flex-wrap gap-2">
        {dice.order.map((id, i) => {
          const t = teamById(state, id);
          const roll = dice.rolls.find((r) => r.teamId === id);
          const active = i === dice.index;
          return (
            <li
              key={id}
              className={`flex items-center gap-2 rounded-full border-2 py-1 pr-3 pl-1 ${active ? 'border-accent bg-accent-soft' : roll ? 'border-line bg-surface-2 opacity-70' : 'border-line'}`}
            >
              <span className="grid size-6 place-items-center rounded-full bg-surface text-xs font-extrabold shadow-soft">{i + 1}</span>
              <TeamChip team={t} size="sm" />
              {roll && <span className="text-xs font-extrabold text-muted">{roll.total}</span>}
            </li>
          );
        })}
      </ol>

      {team && (
        <div className="flex flex-col gap-4 rounded-3xl border-2 border-accent/40 bg-accent-soft/30 p-4 sm:flex-row sm:items-center">
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <p className="text-xs font-extrabold uppercase tracking-wide text-accent">Jetzt dran</p>
            <TeamChip team={team} size="lg" />
            <div className="flex flex-wrap items-center gap-2 text-sm font-semibold text-ink-2">
              <span>
                Feld {team.position}/{goal}
              </span>
              <BonusDieBadge sides={team.bonusDie} />
              {team.blocked && <span className="font-bold text-warn">🚧 Gesperrt – braucht {barrierText(rules.barrier)}</span>}
              {team.crater && (
                <span className="font-bold text-warn">
                  🕳️ Im Krater – klettert {team.crater.climbed}/{team.crater.need} Augen
                </span>
              )}
              {rules.winRule === 'final_roll' && team.position === goal && <span className="font-bold text-good">🏆 Siegeswurf: mind. {rules.finalRollMin}</span>}
              <span className="inline-flex items-center gap-1 text-muted">
                <Smartphone className="size-4" /> {presence[team.id] ?? 0} Gerät{(presence[team.id] ?? 0) === 1 ? '' : 'e'}
              </span>
            </div>
            {busyMs > 0 && <p className="text-sm font-bold text-warn">Animation läuft noch {Math.ceil(busyMs / 1000)} s …</p>}
          </div>
          <div className="flex flex-wrap gap-2 sm:flex-col">
            <Button
              variant="primary"
              size="lg"
              icon={<Dices className="size-5" />}
              loading={pending === 'dice.roll'}
              disabled={busyMs > 0}
              onClick={() => run({ type: 'dice.roll' })}
            >
              {busyMs > 0 ? 'Animation läuft …' : 'Für Team würfeln'}
            </Button>
            <div className="flex flex-wrap gap-2">
              <UnblockButton state={state} teamId={team.id} />
              <Button size="sm" icon={<Hand className="size-4" />} onClick={() => setManual(true)}>
                Wurf eintragen
              </Button>
              <Button size="sm" variant="ghost" icon={<SkipForward className="size-4" />} onClick={() => run({ type: 'dice.skip' })}>
                Aussetzen
              </Button>
            </div>
          </div>
        </div>
      )}

      {last && <LastRoll state={state} roll={last} />}

      <ManualRollModal key={`${currentId}-${manual}`} open={manual} onClose={() => setManual(false)} bonusDie={team?.bonusDie ?? 0} onRoll={(main, bonus) => {
        setManual(false);
        void run({ type: 'dice.roll', main, ...(bonus ? { bonus } : {}), force: true });
      }} />
    </div>
  );
}

function LastRoll({ state, roll }: { state: GameState; roll: RollRecord }) {
  const team = teamById(state, roll.teamId);
  const field = state.config.board.fields[roll.to] ?? 'normal';
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-bg-2 px-4 py-3">
      <span className="text-xs font-extrabold uppercase tracking-wide text-muted">Letzter Wurf</span>
      <TeamChip team={team} size="sm" />
      <DiceFace value={roll.main} size={34} />
      {roll.bonus > 0 && (
        <>
          <span className="font-bold text-muted">+</span>
          <DiceFace value={roll.bonus} size={34} color="#ffe27a" />
        </>
      )}
      <span className="font-display text-lg font-semibold">= {roll.total}</span>
      <span className="text-sm font-semibold text-ink-2">
        Feld {roll.from} → {roll.to} {FIELD_INFO[field].icon} {roll.outcome && `· ${roll.outcome}`}
        {roll.manual && ' · eingetragen'}
      </span>
    </div>
  );
}

function ManualRollModal({ open, onClose, bonusDie, onRoll }: { open: boolean; onClose: () => void; bonusDie: number; onRoll: (main: number, bonus: number) => void }) {
  const [main, setMain] = useState(0);
  const [bonus, setBonus] = useState(0);
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Echten Würfelwurf eintragen"
      size="sm"
      footer={
        <Button variant="primary" disabled={!main || (bonusDie > 0 && !bonus)} onClick={() => onRoll(main, bonus)}>
          Übernehmen
        </Button>
      }
    >
      <p className="mb-3 text-sm text-muted">Für echte Würfel vor Ort: Augenzahl antippen.</p>
      <p className="label">Würfel</p>
      <div className="mb-4 grid grid-cols-6 gap-2">
        {[1, 2, 3, 4, 5, 6].map((n) => (
          <button key={n} type="button" onClick={() => setMain(n)} className={`rounded-2xl p-1 ${main === n ? 'bg-accent-soft ring-2 ring-accent' : ''}`}>
            <DiceFace value={n} size={44} />
          </button>
        ))}
      </div>
      {bonusDie > 0 && (
        <>
          <p className="label">Bonuswürfel (W{bonusDie})</p>
          <div className="grid grid-cols-6 gap-2">
            {Array.from({ length: bonusDie }, (_, i) => i + 1).map((n) => (
              <button key={n} type="button" onClick={() => setBonus(n)} className={`rounded-2xl p-1 ${bonus === n ? 'bg-accent-soft ring-2 ring-accent' : ''}`}>
                <DiceFace value={n} size={44} color="#ffe27a" />
              </button>
            ))}
          </div>
        </>
      )}
    </Modal>
  );
}

function FieldGameControl({ state, dice }: { state: GameState; dice: DiceRound }) {
  const fg = dice.fieldGame!;
  const { run, pending } = useCommand();
  const items = useLibrary((s) => s.items);
  const rules = state.config.rules;
  const team = teamById(state, fg.teamId);
  const [mode, setMode] = useState<FieldGameMode>(rules.fieldGame.modes[0] ?? 'vs_all');
  const [opponent, setOpponent] = useState<string>('');
  const [itemId, setItemId] = useState<string>('');
  const ids = new Set(state.config.collectionIds);
  const pool = items.filter((i) => ids.has(i.collectionId) && i.fieldModes.includes(mode));

  if (fg.stage === 'choose') {
    return (
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-3 rounded-3xl bg-[#ffe3f1] p-4 text-[#7a1f4f] dark:bg-[#3a1428] dark:text-[#ffb3d6]">
          <span className="text-4xl">🎮</span>
          <div>
            <p className="font-display text-xl font-semibold">Minispiel-Feld!</p>
            <p className="flex flex-wrap items-center gap-1.5 text-sm font-semibold">
              <TeamChip team={team} size="sm" /> ist gelandet. Gewinnt das Team, geht es {rules.fieldGame.rewardWin} Felder vor.
            </p>
          </div>
        </div>
        {rules.fieldGame.modes.length > 1 && (
          <Segmented<FieldGameMode>
            value={mode}
            onChange={(m) => {
              setMode(m);
              setItemId('');
            }}
            options={rules.fieldGame.modes.map((m) => ({ value: m, label: FIELD_GAME_MODE_LABEL[m] }))}
          />
        )}
        {mode === 'duel' && (
          <label className="block">
            <span className="label">Gegner</span>
            <select className="field" value={opponent} onChange={(e) => setOpponent(e.target.value)}>
              <option value="">🎲 Zufällig</option>
              {state.teams
                .filter((t) => t.id !== fg.teamId)
                .map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
            </select>
          </label>
        )}
        <label className="block">
          <span className="label">Minispiel</span>
          <select className="field" value={itemId} onChange={(e) => setItemId(e.target.value)}>
            <option value="">🎲 Zufällig aus {pool.length} passenden</option>
            <option value="__none">✋ Ohne Vorlage (frei ansagen)</option>
            {pool.map((i) => (
              <option key={i.id} value={i.id}>
                {state.playedItemIds.includes(i.id) ? '✓ ' : ''}
                {i.title}
              </option>
            ))}
          </select>
        </label>
        <div className="flex flex-wrap justify-end gap-2 border-t border-line pt-4">
          <Button variant="ghost" icon={<SkipForward className="size-4" />} onClick={() => run({ type: 'fieldgame.cancel' })}>
            Überspringen
          </Button>
          <Button
            variant="primary"
            size="lg"
            icon={itemId ? <Play className="size-5" /> : <Shuffle className="size-5" />}
            loading={pending === 'fieldgame.setup'}
            onClick={() =>
              run({
                type: 'fieldgame.setup',
                mode,
                ...(mode === 'duel' && opponent ? { opponentId: opponent } : {}),
                ...(itemId === '__none' ? { itemId: null } : itemId ? { itemId } : {}),
              })
            }
          >
            Minispiel starten
          </Button>
        </div>
      </div>
    );
  }

  const opponents = fg.opponentIds.map((id) => teamById(state, id));
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2 font-display text-xl font-semibold">
        <TeamChip team={team} size="lg" />
        <span className="text-muted">gegen</span>
        {fg.mode === 'duel' ? <TeamChip team={opponents[0]} size="lg" /> : <span>alle anderen</span>}
      </div>
      {fg.item ? <ContentView item={fg.item} /> : <p className="rounded-2xl bg-bg-2 p-4 font-semibold">Freies Minispiel – bitte ansagen.</p>}
      <DrawnPlayers state={state} drawn={fg.drawn} />
      <div className="flex flex-wrap justify-end gap-2 border-t border-line pt-4">
        <Button variant="bad" size="lg" icon={<X className="size-5" />} loading={pending === 'fieldgame.result'} onClick={() => run({ type: 'fieldgame.result', won: false })}>
          {team?.name} verliert
        </Button>
        <Button variant="good" size="lg" icon={<Check className="size-5" />} loading={pending === 'fieldgame.result'} onClick={() => run({ type: 'fieldgame.result', won: true })}>
          {team?.name} gewinnt
        </Button>
      </div>
    </div>
  );
}

export function UnblockButton({ state, teamId }: { state: GameState; teamId: string }) {
  const { run } = useCommand();
  const team = teamById(state, teamId);
  if (!team?.blocked && !team?.crater && !team?.inside) return null;
  return (
    <Button size="sm" icon={<Unlock className="size-4" />} onClick={() => run({ type: 'team.unblock', teamId })}>
      Befreien
    </Button>
  );
}
