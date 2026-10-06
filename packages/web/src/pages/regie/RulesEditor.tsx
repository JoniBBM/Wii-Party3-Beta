/** Regeln des Spiels bearbeiten. */
import { FIELD_GAME_MODES, FIELD_GAME_MODE_LABEL, type BarrierCondition, type Rules } from '@insel/shared';
import { NumberStepper, Switch } from '../../ui/basics.tsx';

function Row({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2 border-b border-line py-4 last:border-0 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="font-bold">{title}</p>
        {hint && <p className="text-sm text-muted">{hint}</p>}
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}

function RangeInput({ value, onChange, min = 0, max = 15 }: { value: { min: number; max: number }; onChange: (v: { min: number; max: number }) => void; min?: number; max?: number }) {
  return (
    <span className="flex items-center gap-2 text-sm font-bold">
      <NumberStepper value={value.min} min={min} max={value.max} onChange={(v) => onChange({ ...value, min: v })} />
      bis
      <NumberStepper value={value.max} min={value.min} max={max} onChange={(v) => onChange({ ...value, max: v })} />
    </span>
  );
}

export function RulesEditor({ rules, onChange }: { rules: Rules; onChange: (r: Rules) => void }) {
  const set = <K extends keyof Rules>(k: K, v: Rules[K]) => onChange({ ...rules, [k]: v });
  const barrier = rules.barrier;
  const barrierValues = barrier.mode === 'oneOf' ? barrier.values : [];
  return (
    <div className="flex flex-col">
      <Row title="Bonuswürfel nach Platz" hint="Seitenzahl des Zusatzwürfels für Platz 1, 2, 3 … (0 = keiner)">
        {rules.bonusDice.map((d, i) => (
          <label key={i} className="flex items-center gap-1 text-sm font-bold">
            {i + 1}.
            <select className="field h-9 w-auto py-1" value={d} onChange={(e) => set('bonusDice', rules.bonusDice.map((x, j) => (j === i ? Number(e.target.value) : x)))}>
              {[0, 2, 3, 4, 6, 8, 10, 12].map((n) => (
                <option key={n} value={n}>
                  {n ? `W${n}` : '–'}
                </option>
              ))}
            </select>
          </label>
        ))}
        <button type="button" className="text-sm font-bold text-accent" onClick={() => rules.bonusDice.length < 10 && set('bonusDice', [...rules.bonusDice, 0])}>
          + Platz
        </button>
        {rules.bonusDice.length > 1 && (
          <button type="button" className="text-sm font-bold text-muted" onClick={() => set('bonusDice', rules.bonusDice.slice(0, -1))}>
            − Platz
          </button>
        )}
      </Row>
      <Row title="Bonus nur für richtige Antworten" hint="Bei Fragen bekommen falsche Antworten keinen Bonuswürfel.">
        <Switch checked={rules.bonusOnlyForCorrect} onChange={(v) => set('bonusOnlyForCorrect', v)} />
      </Row>
      <Row title="Siegbedingung">
        <select className="field w-auto" value={rules.winRule} onChange={(e) => set('winRule', e.target.value as Rules['winRule'])}>
          <option value="final_roll">Auf dem Gipfel stehen, dann Siegeswurf</option>
          <option value="reach">Wer den Gipfel erreicht, gewinnt sofort</option>
          <option value="exact">Gipfel genau treffen (sonst zurückprallen)</option>
        </select>
        {rules.winRule === 'final_roll' && (
          <span className="flex items-center gap-2 text-sm font-bold">
            mind.
            <NumberStepper value={rules.finalRollMin} min={2} max={12} onChange={(v) => set('finalRollMin', v)} />
          </span>
        )}
      </Row>
      <Row title="🚀 Katapult vorwärts" hint="Felder nach vorne">
        <RangeInput value={rules.catapultForward} onChange={(v) => set('catapultForward', v)} />
      </Row>
      <Row title="💥 Katapult rückwärts" hint="Felder zurück">
        <RangeInput value={rules.catapultBackward} onChange={(v) => set('catapultBackward', v)} />
      </Row>
      <Row title="🔄 Platztausch" hint="Bevorzugter Mindestabstand zum Tauschpartner">
        <NumberStepper value={rules.swapMinDistance} min={0} max={30} onChange={(v) => set('swapMinDistance', v)} />
      </Row>
      <Row title="🚧 Sperre: zum Befreien würfeln" hint="Zählt nur der normale Würfel.">
        <select
          className="field w-auto"
          value={barrier.mode}
          onChange={(e) => {
            const mode = e.target.value as BarrierCondition['mode'];
            set('barrier', mode === 'oneOf' ? { mode, values: [4, 5, 6] } : { mode, value: mode === 'atLeast' ? 4 : 2 });
          }}
        >
          <option value="oneOf">bestimmte Zahlen</option>
          <option value="atLeast">mindestens</option>
          <option value="atMost">höchstens</option>
        </select>
        {barrier.mode === 'oneOf' ? (
          <span className="flex gap-1">
            {[1, 2, 3, 4, 5, 6].map((n) => {
              const on = barrierValues.includes(n);
              return (
                <button
                  key={n}
                  type="button"
                  onClick={() => {
                    const values = on ? barrierValues.filter((x) => x !== n) : [...barrierValues, n].sort();
                    if (values.length >= 1 && values.length <= 5) set('barrier', { mode: 'oneOf', values });
                  }}
                  className={`size-9 rounded-xl border-2 font-display font-semibold ${on ? 'border-accent bg-accent-soft' : 'border-line'}`}
                >
                  {n}
                </button>
              );
            })}
          </span>
        ) : (
          <NumberStepper value={barrier.value} min={1} max={6} onChange={(v) => set('barrier', { mode: barrier.mode, value: v })} />
        )}
      </Row>
      <Row title="Sperre öffnet sich automatisch" hint="Nach so vielen Fehlversuchen (0 = nie)">
        <NumberStepper value={rules.barrierMaxAttempts} min={0} max={10} onChange={(v) => set('barrierMaxAttempts', v)} />
      </Row>
      <Row title="🎮 Feld-Minispiele" hint="Erlaubte Modi und Belohnung">
        {FIELD_GAME_MODES.map((m) => (
          <label key={m} className="flex items-center gap-1.5 text-sm font-bold">
            <input
              type="checkbox"
              className="size-4 accent-[var(--accent)]"
              checked={rules.fieldGame.modes.includes(m)}
              onChange={(e) => {
                const modes = e.target.checked ? [...rules.fieldGame.modes, m] : rules.fieldGame.modes.filter((x) => x !== m);
                if (modes.length) set('fieldGame', { ...rules.fieldGame, modes });
              }}
            />
            {FIELD_GAME_MODE_LABEL[m]}
          </label>
        ))}
      </Row>
      <Row title="Belohnung / Strafe Feld-Minispiel" hint="Felder vor bei Sieg · zurück bei Niederlage">
        <NumberStepper value={rules.fieldGame.rewardWin} min={0} max={20} onChange={(v) => set('fieldGame', { ...rules.fieldGame, rewardWin: v })} />
        <NumberStepper value={rules.fieldGame.penaltyLoss} min={0} max={20} onChange={(v) => set('fieldGame', { ...rules.fieldGame, penaltyLoss: v })} />
      </Row>
      <Row title="🌋 Vulkan aktiv" hint="Druck steigt jede Runde und auf Vulkanfeldern. Bei vollem Druck: Ausbruch!">
        <Switch checked={rules.volcano.enabled} onChange={(v) => set('volcano', { ...rules.volcano, enabled: v })} />
      </Row>
      {rules.volcano.enabled && (
        <>
          <Row title="Druck bis zum Ausbruch" hint="Pro Runde · pro Vulkanfeld">
            <NumberStepper value={rules.volcano.threshold} min={1} max={30} onChange={(v) => set('volcano', { ...rules.volcano, threshold: v })} />
            <NumberStepper value={rules.volcano.pressurePerRound} min={0} max={5} onChange={(v) => set('volcano', { ...rules.volcano, pressurePerRound: v })} />
            <NumberStepper value={rules.volcano.pressurePerField} min={0} max={5} onChange={(v) => set('volcano', { ...rules.volcano, pressurePerField: v })} />
          </Row>
          <Row title="Gefahrenzone & Rückschlag" hint="Letzte Felder vor dem Gipfel · Felder zurück">
            <NumberStepper value={rules.volcano.zoneSize} min={1} max={40} onChange={(v) => set('volcano', { ...rules.volcano, zoneSize: v })} />
            <RangeInput value={rules.volcano.knockback} onChange={(v) => set('volcano', { ...rules.volcano, knockback: v })} max={20} />
          </Row>
        </>
      )}
      <Row title="🛢️ Fässer oder Kisten" hint="Mutprobe am Wasserfall: Jedes Team hält am Ufer und wählt. Bricht die Seite ein, schwimmt es rüber und der restliche Wurf verfällt.">
        <Switch checked={rules.river.enabled} onChange={(v) => set('river', { ...rules.river, enabled: v })} />
      </Row>
      {rules.river.enabled && (
        <Row title="Chance zum Einbrechen" hint="Wahrscheinlichkeit, dass die gewählte Seite einbricht (Original: 50 %)">
          <select className="field w-auto" value={rules.river.fallChance} onChange={(e) => set('river', { ...rules.river, fallChance: Number(e.target.value) })}>
            {[...new Set([10, 25, 33, 50, 67, 75, 100, rules.river.fallChance])].sort((x, y) => x - y).map((n) => (
              <option key={n} value={n}>
                {n} %
              </option>
            ))}
          </select>
        </Row>
      )}
      <Row title="🌿 Liane" hint="Mutprobe über den Bach: Jedes Team hält an, würfelt, wie weit es schwingt, und läuft dann mit dem restlichen Wurf weiter.">
        <Switch checked={rules.vine.enabled} onChange={(v) => set('vine', { ...rules.vine, enabled: v })} />
        {rules.vine.enabled && (
          <select className="field w-auto" value={rules.vine.sides} onChange={(e) => set('vine', { ...rules.vine, sides: Number(e.target.value) })}>
            {[4, 6, 8, 10, 12].map((n) => (
              <option key={n} value={n}>
                W{n} (1–{n} Felder)
              </option>
            ))}
          </select>
        )}
      </Row>
      <Row title="🦇 Lavahöhle – Vulkan oder nicht" hint="Mutprobe an den Serpentinen: Jedes Team hält an und würfelt. Mit mindestens dieser Zahl geht es weiter, sonst fällt es ins Vulkan-Innere.">
        <Switch checked={rules.cave.enabled} onChange={(v) => set('cave', { ...rules.cave, enabled: v })} />
        {rules.cave.enabled && (
          <select className="field w-auto" value={rules.cave.need} onChange={(e) => set('cave', { ...rules.cave, need: Number(e.target.value) })}>
            {[2, 3, 4, 5, 6].map((n) => (
              <option key={n} value={n}>
                mind. {n}
              </option>
            ))}
          </select>
        )}
      </Row>
      <Row title="🌋 Vulkan-Inneres" hint="Totenkopf-Felder und die verpatzte Mutprobe schicken ins Innere: Strafweg über Lava-Inseln, genau aufs Ausgangsfeld = sofort raus. Danach zurück, wo man hineingefallen ist.">
        <Switch checked={rules.inside.enabled} onChange={(v) => set('inside', { ...rules.inside, enabled: v })} />
      </Row>
      {rules.inside.enabled && (
        <Row title="Länge des Strafwegs · Ausgangsfeld" hint="Original: 9 Felder, Ausgangsfeld auf Feld 4 (0 = ohne Ausgangsfeld)">
          <NumberStepper value={rules.inside.length} min={3} max={20} onChange={(v) => set('inside', { ...rules.inside, length: v, shout: Math.min(rules.inside.shout, v - 1) })} />
          <NumberStepper value={rules.inside.shout} min={0} max={rules.inside.length - 1} onChange={(v) => set('inside', { ...rules.inside, shout: v })} />
        </Row>
      )}
      <Row title="🕳️ Kraterloch" hint="Am Kraterrand fällt man in den Krater und muss Augen sammeln, um herauszuklettern.">
        <Switch checked={rules.crater.enabled} onChange={(v) => set('crater', { ...rules.crater, enabled: v })} />
      </Row>
      {rules.crater.enabled && (
        <Row title="Augen zum Herausklettern" hint="Über mehrere Würfe gesammelt; was übrig bleibt, geht es weiter.">
          <NumberStepper value={rules.crater.climb} min={1} max={40} onChange={(v) => set('crater', { ...rules.crater, climb: v })} />
        </Row>
      )}
      <Row title="Antworten automatisch schließen" hint="Sobald alle Teams geantwortet haben">
        <Switch checked={rules.autoCloseWhenAllAnswered} onChange={(v) => set('autoCloseWhenAllAnswered', v)} />
      </Row>
    </div>
  );
}
