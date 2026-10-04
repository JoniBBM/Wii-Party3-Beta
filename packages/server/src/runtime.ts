/**
 * Laufzeit des aktiven Spiels: hält den Zustand im Speicher, führt Befehle über die Engine
 * aus, speichert jede Änderung, verwaltet Rückgängig-Schritte und den Countdown.
 */
import { randomInt } from 'node:crypto';
import { EventEmitter } from 'node:events';
import {
  applyCommand,
  createGame,
  EngineError,
  NON_UNDOABLE,
  timerRemaining,
  type Actor,
  type Command,
  type ContentItem,
  type Effect,
  type EffectInput,
  type EngineContext,
  type GameConfig,
  type GameState,
  type Rng,
} from '@insel/shared';
import { newId, newSecretToken } from './auth.ts';
import * as db from './db.ts';
import { removeFile } from './media.ts';

const cryptoRng: Rng = { next: () => randomInt(0, 2 ** 32) / 2 ** 32 };
const UNDO_LIMIT = 40;

export interface DispatchResult {
  ok: true;
  meta: Record<string, unknown>;
}

export interface RuntimeEvents {
  state: [GameState | null];
  effects: [Effect[]];
}

export class GameRuntime extends EventEmitter<RuntimeEvents> {
  state: GameState | null = null;
  private undoStack: { state: GameState; label: string }[] = [];
  private effectSeq = 0;
  private timer: NodeJS.Timeout | null = null;

  constructor(private readonly database: db.DB) {
    super();
  }

  /** Aktives Spiel aus den Einstellungen laden (beim Start). */
  boot() {
    const { activeGameId } = db.getSettings(this.database);
    if (activeGameId) this.activate(activeGameId);
  }

  activate(gameId: string | null) {
    this.clearTimer();
    this.undoStack = [];
    this.state = gameId ? (db.getGame(this.database, gameId) ?? null) : null;
    db.setSettings(this.database, { activeGameId: this.state?.id ?? null });
    this.scheduleTimer();
    this.emit('state', this.state);
  }

  createGame(config: GameConfig): GameState {
    const state = createGame({ id: newId(), config, now: Date.now() });
    db.saveGame(this.database, state);
    this.activate(state.id);
    return state;
  }

  get undoLabel(): string | null {
    return this.undoStack.at(-1)?.label ?? null;
  }

  private context(state: GameState): EngineContext {
    const database = this.database;
    let pool: ContentItem[] | null = null;
    return {
      now: Date.now(),
      rng: cryptoRng,
      get pool() {
        pool ??= db.listItems(database, state.config.collectionIds);
        return pool;
      },
      lookup: (id) => db.getItem(database, id),
      newId: () => newId(),
      newToken: () => newSecretToken(),
    };
  }

  dispatch(cmd: Command, actor: Actor): DispatchResult {
    const before = this.state;
    if (!before) throw new EngineError('Es ist kein Spiel aktiv. Bitte in der Regie ein Spiel anlegen.', 'not_found');
    const result = applyCommand(before, cmd, actor, this.context(before));
    this.state = result.state;

    if (!NON_UNDOABLE.has(cmd.type)) {
      this.undoStack.push({ state: before, label: result.label });
      if (this.undoStack.length > UNDO_LIMIT) this.undoStack.shift();
    }

    db.saveGame(this.database, result.state);
    db.appendLog(this.database, {
      gameId: result.state.id,
      at: result.state.updatedAt,
      actor: actor.system ? 'system' : actor.role,
      command: cmd,
      label: result.label,
      effects: result.effects.map((e) => e.type),
    });

    if (typeof result.meta.removedPhoto === 'string') removeFile(result.meta.removedPhoto);
    this.scheduleTimer();
    this.emit('state', this.state);
    if (result.effects.length) this.emitEffects(result.effects);
    return { ok: true, meta: result.meta };
  }

  undo(): string {
    const entry = this.undoStack.pop();
    if (!entry || !this.state) throw new EngineError('Es gibt nichts rückgängig zu machen');
    this.state = { ...entry.state, rev: this.state.rev + 1, updatedAt: Date.now() };
    db.saveGame(this.database, this.state);
    db.appendLog(this.database, {
      gameId: this.state.id,
      at: this.state.updatedAt,
      actor: 'admin',
      command: { type: 'undo' },
      label: `Rückgängig: ${entry.label}`,
      effects: ['undo'],
    });
    this.scheduleTimer();
    this.emit('state', this.state);
    this.emitEffects([{ type: 'undo' }]);
    return entry.label;
  }

  /** Zustand ohne Befehl ändern (z. B. Foto-Aufräumen). Nicht rückgängig machbar. */
  mutate(fn: (s: GameState) => void) {
    if (!this.state) return;
    const next = structuredClone(this.state);
    fn(next);
    next.rev = this.state.rev + 1;
    next.updatedAt = Date.now();
    this.state = next;
    db.saveGame(this.database, next);
    this.emit('state', next);
  }

  private emitEffects(inputs: EffectInput[]) {
    const at = Date.now();
    this.emit('effects', inputs.map((e) => ({ ...e, id: ++this.effectSeq, at })));
  }

  private clearTimer() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  /** Läuft ein Countdown, schließt der Server die Antworten automatisch bei 0. */
  private scheduleTimer() {
    this.clearTimer();
    const s = this.state;
    if (!s || s.phase.name !== 'content') return;
    const c = s.phase.content;
    if (!c.timer || c.timer.startedAt === null || c.stage !== 'open') return;
    const remaining = timerRemaining(c.timer, Date.now());
    this.timer = setTimeout(() => {
      this.timer = null;
      try {
        this.dispatch({ type: 'content.close' }, { role: 'admin', system: true });
      } catch {
        /* Zustand hat sich inzwischen geändert */
      }
    }, remaining + 50);
  }

  shutdown() {
    this.clearTimer();
  }
}
