/**
 * Mehrere Spiele gleichzeitig: Jedes geöffnete Spiel hat seine eigene Laufzeit (GameRuntime).
 * Ein Spiel gehört einem Konto (Spielleiter) oder dem Haupt-Admin (ownerId null). Jedes Konto
 * hat ein „gewähltes Spiel“ – das steuert seine Regie, und das zeigen seine Beamer. Die
 * Beamer-Einstellungen (Grafik, Ton, Kommentator …) gehören dem Konto, nicht dem einzelnen Spiel:
 * Sie gelten für alle seine Spiele und lassen sich auch ohne gewähltes Spiel einstellen.
 */
import { EventEmitter } from 'node:events';
import { createGame, parseShow, type Effect, type GameConfig, type GameState, type ShowSettings, type Team } from '@insel/shared';
import { newId } from './auth.ts';
import * as db from './db.ts';
import { GameRuntime } from './runtime.ts';

export interface HubEvents {
  /** Zustand eines Spiels geändert; null = Spiel geschlossen/gelöscht */
  state: [gameId: string, state: GameState | null];
  effects: [gameId: string, effects: Effect[]];
  /** Ein Konto hat ein anderes Spiel gewählt (null = Haupt-Admin) */
  current: [ownerId: string | null];
}

interface Meta {
  ownerId: string | null;
  code: string;
}

export class GameHub extends EventEmitter<HubEvents> {
  private runtimes = new Map<string, GameRuntime>();
  private metas = new Map<string, Meta>();
  private shows = new Map<string, ShowSettings>();

  constructor(private readonly database: db.DB) {
    super();
  }

  /** Beim Start: alle geöffneten Spiele laden. */
  boot() {
    for (const id of db.openGameIds(this.database)) this.load(id);
  }

  private load(id: string): GameRuntime | null {
    const state = db.getGame(this.database, id);
    const meta = db.getGameMeta(this.database, id);
    if (!state || !meta) return null;
    const rt = new GameRuntime(this.database, state);
    rt.reactions = this.ownerShow(meta.ownerId).reactions;
    rt.on('state', (s) => this.emit('state', id, s));
    rt.on('effects', (e) => this.emit('effects', id, e));
    this.runtimes.set(id, rt);
    this.metas.set(id, { ownerId: meta.ownerId, code: meta.code });
    return rt;
  }

  /** Laufzeit eines geöffneten Spiels. */
  get(id: string | null | undefined): GameRuntime | undefined {
    return id ? this.runtimes.get(id) : undefined;
  }

  openIds(): string[] {
    return [...this.runtimes.keys()];
  }

  /** Besitzer und Spielcode (auch für geschlossene Spiele). */
  meta(id: string): Meta | undefined {
    const cached = this.metas.get(id);
    if (cached) return cached;
    const m = db.getGameMeta(this.database, id);
    return m ? { ownerId: m.ownerId, code: m.code } : undefined;
  }

  /** Spiel öffnen: Handys und Beamer können beitreten. */
  open(id: string): GameRuntime {
    let rt = this.runtimes.get(id);
    if (!rt) {
      rt = this.load(id) ?? undefined;
      if (!rt) throw new Error('Spiel nicht gefunden');
      db.setGameOpen(this.database, id, true);
      this.emit('state', id, rt.state);
    }
    return rt;
  }

  /** Spiel schließen: läuft nicht mehr, bleibt aber gespeichert. */
  close(id: string) {
    const rt = this.runtimes.get(id);
    if (rt) {
      rt.shutdown();
      rt.removeAllListeners();
      this.runtimes.delete(id);
      this.metas.delete(id);
    }
    db.setGameOpen(this.database, id, false);
    this.emit('state', id, null);
  }

  /** Neues Spiel anlegen, öffnen und für den Besitzer wählen. */
  create(config: GameConfig, ownerId: string | null): GameState {
    const code = db.freeCode(this.database);
    const state = createGame({ id: newId(), config, now: Date.now(), code });
    db.insertGame(this.database, state, ownerId, null);
    this.open(state.id);
    this.setCurrent(ownerId, state.id);
    return state;
  }

  delete(id: string) {
    this.close(id);
    db.deleteGame(this.database, id);
  }

  /** Geöffnetes Spiel zu einem Spielcode. */
  byCode(code: string): string | null {
    const id = db.gameIdByCode(this.database, code.trim().toUpperCase());
    return id && this.runtimes.has(id) ? id : null;
  }

  /** Team in einem der geöffneten Spiele (Team-IDs sind zufällig und eindeutig). */
  findTeam(teamId: string): { gameId: string; team: Team } | null {
    for (const [gameId, rt] of this.runtimes) {
      const team = rt.state.teams.find((t) => t.id === teamId);
      if (team) return { gameId, team };
    }
    return null;
  }

  /** Gewähltes Spiel eines Kontos (null = Haupt-Admin). */
  currentOf(ownerId: string | null): string | null {
    if (ownerId) return db.getUser(this.database, ownerId)?.currentGameId ?? null;
    return db.getSettings(this.database).adminGameId;
  }

  setCurrent(ownerId: string | null, gameId: string | null) {
    if (this.currentOf(ownerId) === gameId) return;
    if (ownerId) db.updateUser(this.database, ownerId, { currentGameId: gameId });
    else db.setSettings(this.database, { adminGameId: gameId });
    this.emit('current', ownerId);
  }

  /** Beamer-Einstellungen eines Kontos (Haupt-Admin: bisherige Einstellung „show“). */
  ownerShow(ownerId: string | null): ShowSettings {
    const key = ownerId ? `show:${ownerId}` : 'show';
    let show = this.shows.get(key);
    if (!show) {
      show = parseShow(db.getSetting(this.database, key));
      this.shows.set(key, show);
    }
    return show;
  }

  setOwnerShow(ownerId: string | null, show: ShowSettings) {
    const key = ownerId ? `show:${ownerId}` : 'show';
    db.setSetting(this.database, key, show);
    this.shows.set(key, show);
    // Reaktionen nach jedem Zug: gilt für alle laufenden Spiele dieses Kontos
    for (const [id, rt] of this.runtimes) if ((this.metas.get(id)?.ownerId ?? null) === ownerId) rt.reactions = show.reactions;
  }

  /** Besitzer haben sich geändert (Konto gelöscht, Spiel übergeben) – zwischengespeicherte Angaben neu laden. */
  refreshMeta() {
    for (const [id, rt] of this.runtimes) {
      const m = db.getGameMeta(this.database, id);
      const cached = this.metas.get(id);
      if (m && cached) cached.ownerId = m.ownerId;
      rt.reactions = this.ownerShow(m?.ownerId ?? null).reactions;
    }
  }

  shutdown() {
    for (const rt of this.runtimes.values()) rt.shutdown();
  }
}
