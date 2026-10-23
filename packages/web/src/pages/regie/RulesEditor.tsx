/**
 * Regeln des Spiels, aufgeteilt in die Bereiche von „Spiel einrichten“: Würfel & Sieg,
 * Sonderfelder, Mutproben, Vulkan und Fragen. Namen richten sich nach der gewählten Welt
 * (Insel: Liane, Vulkan-Inneres · Blockwelt: Ranke, Nether).
 */
import { FIELD_GAME_MODES, FIELD_GAME_MODE_LABEL, type BarrierCondition, type Rules, type Theme } from '@insel/shared';
import { settingById, settingTitle } from '../../lib/settingsIndex.ts';
import { NumberStepper, Switch } from '../../ui/basics.tsx';

export interface RulesProps {
  rules: Rules;
  onChange: (r: Rules) => void;
  theme: Theme;
}

const WORDS: Record<Theme, { toInside: string; skull: string; path: string; exit: string }> = {
  island: { toInside: 'ins Vulkan-Innere', skull: 'Totenkopf-Felder', path: 'Lava-Inseln', exit: 'Ausgangsfeld' },
  blocks: { toInside: 'in den Nether', skull: '„Boden bricht weg“-Felder', path: 'Netherziegel', exit: 'Glowstone-Feld' },
  space: { toInside: 'in die Alien-Höhle', skull: 'Wurmloch-Felder', path: 'Kristallinseln', exit: 'Teleporter-Feld' },
};

/** Eine Einstellung: Titel (mit Symbol aus dem Verzeichnis) links, Regler rechts */
export function Row({ id, theme = 'island', title, hint, children, sub }: { id?: string; theme?: Theme; title?: string; hint?: string; children: React.ReactNode; sub?: boolean }) {
  const entry = id ? settingById(id) : undefined;
  const label = title ?? (entry ? `${entry.icon} ${settingTitle(entry, theme)}` : '');
  return (
    // nebeneinander erst, wenn die Karte breit genug ist (Container-Abfrage), sonst untereinander
    <div data-setting={id} className={`flex flex-col gap-2 rounded-2xl py-4 @2xl:flex-row @2xl:items-center @2xl:justify-between @2xl:gap-4 ${sub ? 'ml-4 border-l-2 border-line pl-4' : 'border-b border-line last:border-0'}`}>
      <div className="min-w-0 @2xl:flex-1">
        <p className="font-bold">{label}</p>
        {hint && <p className="text-sm text-muted">{hint}</p>}
      </div>
      <div className="flex min-w-0 flex-wrap items-center gap-2 @2xl:max-w-[62%] @2xl:justify-end">{children}</div>
    </div>
  );
}

function RangeInput({ value, onChange, min = 0, max = 15 }: { value: { min: number; max: number }; onChange: (v: { min: number; max: number }) => void; min?: number; max?: number }) {
  return (
    <span className="flex flex-wrap items-center gap-2 text-sm font-bold">
      <NumberStepper value={value.min} min={min} max={value.max} onChange={(v) => onChange({ ...value, min: v })} />
      bis
      <NumberStepper value={value.max} min={value.min} max={max} onChange={(v) => onChange({ ...value, max: v })} />
    </span>
  );
}

const useSet = (rules: Rules, onChange: (r: Rules) => void) => <K extends keyof Rules>(k: K, v: Rules[K]) => onChange({ ...rules, [k]: v });

/** Bonuswürfel nach Platz und Siegbedingung */
export function DiceRules({ rules, onChange, theme }: RulesProps) {
  const set = useSet(rules, onChange);
  return (
    <div className="@container flex flex-col">
      <Row id="g.bonusDice" theme={theme} hint="Seitenzahl des Zusatzwürfels für Platz 1, 2, 3 … nach jedem Minispiel und jeder Frage (– = keiner).">
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
      <Row id="g.winRule" theme={theme} hint="Was am Gipfel passiert.">
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
    </div>
  );
}

/** Katapulte, Platztausch, Sperre und Feld-Minispiele */
export function FieldRules({ rules, onChange, theme }: RulesProps) {
  const set = useSet(rules, onChange);
  const barrier = rules.barrier;
  const barrierValues = barrier.mode === 'oneOf' ? barrier.values : [];
  return (
    <div className="@container flex flex-col">
      <Row id="g.catapultForward" theme={theme} hint="So viele Felder geht es nach vorne (zufällig im Bereich).">
        <RangeInput value={rules.catapultForward} onChange={(v) => set('catapultForward', v)} />
      </Row>
      <Row id="g.catapultBackward" theme={theme} hint="So viele Felder geht es zurück.">
        <RangeInput value={rules.catapultBackward} onChange={(v) => set('catapultBackward', v)} />
      </Row>
      <Row id="g.swap" theme={theme} hint="Bevorzugter Mindestabstand zum Tauschpartner (in Feldern).">
        <NumberStepper value={rules.swapMinDistance} min={0} max={30} onChange={(v) => set('swapMinDistance', v)} />
      </Row>
      <Row id="g.barrier" theme={theme} hint="Welche Zahl braucht es, um freizukommen? Zählt nur der normale Würfel.">
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
                  aria-pressed={on}
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
      <Row id="g.barrierAuto" theme={theme} hint="Nach so vielen Fehlversuchen ist man frei (0 = nie).">
        <NumberStepper value={rules.barrierMaxAttempts} min={0} max={10} onChange={(v) => set('barrierMaxAttempts', v)} />
      </Row>
      <Row id="g.fieldGames" theme={theme} hint="Welche Arten von Minispielen auf dem Minispiel-Feld vorkommen.">
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
      <Row id="g.fieldReward" theme={theme} hint="Felder vor bei Sieg · Felder zurück bei Niederlage.">
        <NumberStepper value={rules.fieldGame.rewardWin} min={0} max={20} onChange={(v) => set('fieldGame', { ...rules.fieldGame, rewardWin: v })} />
        <NumberStepper value={rules.fieldGame.penaltyLoss} min={0} max={20} onChange={(v) => set('fieldGame', { ...rules.fieldGame, penaltyLoss: v })} />
      </Row>
    </div>
  );
}

/** Liane/Ranke, Fässer oder Kisten, Lavahöhle, Kraterloch */
export function DareRules({ rules, onChange, theme }: RulesProps) {
  const set = useSet(rules, onChange);
  const w = WORDS[theme];
  return (
    <div className="@container flex flex-col">
      <Row id="g.vine" theme={theme} hint="Über den Bach: Jedes Team hält an, würfelt, wie weit es schwingt, und läuft mit dem restlichen Wurf weiter.">
        <Switch checked={rules.vine.enabled} onChange={(v) => set('vine', { ...rules.vine, enabled: v })} />
        {rules.vine.enabled && (
          <select className="field w-auto" aria-label="Würfel zum Schwingen" value={rules.vine.sides} onChange={(e) => set('vine', { ...rules.vine, sides: Number(e.target.value) })}>
            {[4, 6, 8, 10, 12].map((n) => (
              <option key={n} value={n}>
                W{n} (1–{n} Felder)
              </option>
            ))}
          </select>
        )}
      </Row>
      <Row id="g.river" theme={theme} hint="Am Wasserfall wählt jedes Team eine Seite. Bricht sie ein, schwimmt es rüber und der restliche Wurf verfällt.">
        <Switch checked={rules.river.enabled} onChange={(v) => set('river', { ...rules.river, enabled: v })} />
        {rules.river.enabled && (
          <select className="field w-auto" aria-label="Chance zum Einbrechen" value={rules.river.fallChance} onChange={(e) => set('river', { ...rules.river, fallChance: Number(e.target.value) })}>
            {[...new Set([10, 25, 33, 50, 67, 75, 100, rules.river.fallChance])].sort((x, y) => x - y).map((n) => (
              <option key={n} value={n}>
                {n} % brechen ein
              </option>
            ))}
          </select>
        )}
      </Row>
      <Row id="g.cave" theme={theme} hint={`An den Serpentinen hält jedes Team und würfelt. Mit mindestens dieser Zahl geht es weiter, sonst ${w.toInside}.`}>
        <Switch checked={rules.cave.enabled} onChange={(v) => set('cave', { ...rules.cave, enabled: v })} />
        {rules.cave.enabled && (
          <select className="field w-auto" aria-label="Nötige Zahl" value={rules.cave.need} onChange={(e) => set('cave', { ...rules.cave, need: Number(e.target.value) })}>
            {[2, 3, 4, 5, 6].map((n) => (
              <option key={n} value={n}>
                mind. {n}
              </option>
            ))}
          </select>
        )}
      </Row>
      <Row id="g.crater" theme={theme} hint="Am Kraterrand fällt man hinein und sammelt über mehrere Würfe Augen, um herauszuklettern.">
        <Switch checked={rules.crater.enabled} onChange={(v) => set('crater', { ...rules.crater, enabled: v })} />
        {rules.crater.enabled && (
          <span className="flex items-center gap-2 text-sm font-bold">
            <NumberStepper value={rules.crater.climb} min={1} max={40} onChange={(v) => set('crater', { ...rules.crater, climb: v })} />
            Augen
          </span>
        )}
      </Row>
    </div>
  );
}

/** Vulkanausbruch und Vulkan-Inneres (Nether) */
export function VolcanoRules({ rules, onChange, theme }: RulesProps) {
  const set = useSet(rules, onChange);
  const w = WORDS[theme];
  const v = rules.volcano;
  return (
    <div className="@container flex flex-col">
      <Row id="g.volcano" theme={theme} hint="Der Druck steigt jede Runde und auf Vulkanfeldern. Ist er voll, bricht der Vulkan aus.">
        <Switch checked={v.enabled} onChange={(x) => set('volcano', { ...v, enabled: x })} />
      </Row>
      {v.enabled && (
        <>
          <Row id="g.volcanoPressure" theme={theme} sub hint="Druck bis zum Ausbruch · pro Runde · pro Vulkanfeld">
            <NumberStepper value={v.threshold} min={1} max={30} onChange={(x) => set('volcano', { ...v, threshold: x })} />
            <NumberStepper value={v.pressurePerRound} min={0} max={5} onChange={(x) => set('volcano', { ...v, pressurePerRound: x })} />
            <NumberStepper value={v.pressurePerField} min={0} max={5} onChange={(x) => set('volcano', { ...v, pressurePerField: x })} />
          </Row>
          <Row id="g.volcanoZone" theme={theme} sub hint="Letzte Felder vor dem Gipfel · so viele Felder fliegt man beim Ausbruch zurück">
            <NumberStepper value={v.zoneSize} min={1} max={40} onChange={(x) => set('volcano', { ...v, zoneSize: x })} />
            <RangeInput value={v.knockback} onChange={(x) => set('volcano', { ...v, knockback: x })} max={20} />
          </Row>
        </>
      )}
      <Row
        id="g.inside"
        theme={theme}
        hint={`${w.skull} und die verpatzte Lavahöhle schicken ${w.toInside}: ein Strafweg über ${w.path}, wer genau das ${w.exit} trifft, kommt sofort raus. Danach geht es dort weiter, wo man hineingefallen ist.`}
      >
        <Switch checked={rules.inside.enabled} onChange={(x) => set('inside', { ...rules.inside, enabled: x })} />
      </Row>
      {rules.inside.enabled && (
        <Row id="g.insideLength" theme={theme} sub hint={`Länge des Strafwegs · Position des ${w.exit}s (Original: 9 und 4; 0 = ohne)`}>
          <NumberStepper value={rules.inside.length} min={3} max={20} onChange={(x) => set('inside', { ...rules.inside, length: x, shout: Math.min(rules.inside.shout, x - 1) })} />
          <NumberStepper value={rules.inside.shout} min={0} max={rules.inside.length - 1} onChange={(x) => set('inside', { ...rules.inside, shout: x })} />
        </Row>
      )}
    </div>
  );
}

/** Auswertung von Fragen */
export function AnswerRules({ rules, onChange, theme }: RulesProps) {
  const set = useSet(rules, onChange);
  return (
    <div className="@container flex flex-col">
      <Row id="g.bonusCorrect" theme={theme} hint="Bei Fragen bekommen falsche Antworten keinen Bonuswürfel.">
        <Switch checked={rules.bonusOnlyForCorrect} onChange={(v) => set('bonusOnlyForCorrect', v)} />
      </Row>
      <Row id="g.autoClose" theme={theme} hint="Die Antworten schließen, sobald alle Teams geantwortet haben.">
        <Switch checked={rules.autoCloseWhenAllAnswered} onChange={(v) => set('autoCloseWhenAllAnswered', v)} />
      </Row>
    </div>
  );
}
