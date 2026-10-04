/** Inhalte einer Runde: Auswahl, Antworten, Buzzer, Auflösung, Platzierung, Ergebnis. */
import { isTextAnswerCorrect } from '../answers.ts';
import { CONTENT_KIND_INFO } from '../constants.ts';
import { buildItem } from '../defaults.ts';
import { pick, shuffle } from '../rng.ts';
import type { CommandOf } from '../schemas.ts';
import type {
  ActiveContent,
  ContentItem,
  RankEntry,
  ResultEntry,
  RoundResults,
  TeamAnswer,
  Timer,
} from '../types.ts';
import { drawForTeams, undoDraw } from './draw.ts';
import { fail, feed, findTeam, isStaff, resolveTeamFor, teamLabel, type Tx } from './tx.ts';

export function isQuestion(item: ContentItem): boolean {
  return CONTENT_KIND_INFO[item.kind].isQuestion;
}

export function timerRemaining(timer: Timer | null, now: number): number {
  if (!timer) return 0;
  if (timer.startedAt === null) return Math.max(0, timer.remainingMs);
  return Math.max(0, timer.remainingMs - (now - timer.startedAt));
}

function pauseTimer(timer: Timer | null, now: number) {
  if (!timer || timer.startedAt === null) return;
  timer.remainingMs = timerRemaining(timer, now);
  timer.startedAt = null;
}

function activeContent(tx: Tx): ActiveContent {
  if (tx.s.phase.name !== 'content') fail('Gerade läuft kein Inhalt');
  return tx.s.phase.content;
}

function shouldDraw(item: ContentItem): boolean {
  return item.kind === 'game' || item.playerCount !== 'all';
}

function chooseItem(tx: Tx, cmd: CommandOf<'content.select'>): ContentItem {
  const s = tx.s;
  switch (cmd.source) {
    case 'manual': {
      if (!cmd.itemId) fail('Kein Inhalt gewählt');
      const item = tx.ctx.lookup(cmd.itemId);
      if (!item) fail('Inhalt nicht gefunden', 'not_found');
      return item;
    }
    case 'random': {
      const kinds = cmd.kinds?.length ? new Set(cmd.kinds) : null;
      const pool = tx.ctx.pool.filter((i) => i.roundUse && (!kinds || kinds.has(i.kind)));
      if (pool.length === 0) fail(kinds ? 'Keine passenden Inhalte in den gewählten Sammlungen' : 'In den gewählten Sammlungen gibt es keine Inhalte');
      let fresh = pool.filter((i) => !s.playedItemIds.includes(i.id));
      if (fresh.length === 0) {
        const ids = new Set(pool.map((i) => i.id));
        s.playedItemIds = s.playedItemIds.filter((id) => !ids.has(id));
        fresh = pool;
        feed(tx, '♻️', 'Alle Inhalte gespielt – der Stapel wurde neu gemischt');
      }
      return pick(tx.ctx.rng, fresh)!;
    }
    case 'plan': {
      const plan = s.config.plan;
      while (s.planIndex < plan.length) {
        const item = tx.ctx.lookup(plan[s.planIndex]!);
        s.planIndex += 1;
        if (item) return item;
      }
      fail('Der Ablaufplan ist zu Ende');
    }
    case 'adhoc': {
      if (!cmd.adhoc) fail('Spontaner Inhalt fehlt');
      return buildItem(cmd.adhoc, { id: `adhoc-${tx.ctx.newId()}`, collectionId: 'adhoc', now: tx.ctx.now });
    }
  }
}

function evaluate(item: ContentItem, value: number | string): boolean | null {
  switch (item.kind) {
    case 'choice':
      return Number(value) === item.correctIndex;
    case 'text':
      return isTextAnswerCorrect(String(value), item.answers);
    default:
      return null;
  }
}

/** Platzierung für Fragen berechnen (bei Auflösung). */
export function computeQuestionRanking(tx: Tx, content: ActiveContent): RankEntry[] {
  const teams = tx.s.teams;
  const item = content.item;
  const ranking: RankEntry[] = [];
  const answered = (id: string) => content.answers[id];

  if (item.kind === 'estimate') {
    const withAnswer = teams
      .filter((t) => answered(t.id) && Number.isFinite(Number(answered(t.id)!.value)))
      .map((t) => ({ t, d: Math.abs(Number(answered(t.id)!.value) - item.target), at: answered(t.id)!.at }))
      .sort((a, b) => a.d - b.d || a.at - b.at);
    let rank = 0;
    let lastD = -1;
    withAnswer.forEach((x, i) => {
      if (x.d !== lastD) rank = i + 1;
      lastD = x.d;
      ranking.push({ teamId: x.t.id, rank });
    });
    const rest = teams.filter((t) => !withAnswer.some((x) => x.t.id === t.id));
    for (const t of rest) ranking.push({ teamId: t.id, rank: withAnswer.length + 1 });
    return ranking;
  }

  if (item.kind === 'buzzer') {
    const correct = content.buzzQueue.filter((b) => content.buzzJudged[b.teamId] === true);
    const wrong = content.buzzQueue.filter((b) => content.buzzJudged[b.teamId] !== true);
    let rank = 1;
    for (const b of correct) ranking.push({ teamId: b.teamId, rank: rank++ });
    for (const b of wrong) ranking.push({ teamId: b.teamId, rank: rank++ });
    const rest = teams.filter((t) => !content.buzzQueue.some((b) => b.teamId === t.id));
    for (const t of rest) ranking.push({ teamId: t.id, rank });
    return ranking;
  }

  // choice / text: richtige nach Zeit, dann falsche nach Zeit, dann ohne Antwort.
  const list = teams.map((t) => ({ t, a: answered(t.id) }));
  const correct = list.filter((x) => x.a?.correct === true).sort((a, b) => a.a!.at - b.a!.at);
  const wrong = list.filter((x) => x.a && x.a.correct !== true).sort((a, b) => a.a!.at - b.a!.at);
  const none = list.filter((x) => !x.a);
  let rank = 1;
  for (const x of correct) ranking.push({ teamId: x.t.id, rank: rank++ });
  for (const x of wrong) ranking.push({ teamId: x.t.id, rank: rank++ });
  for (const x of none) ranking.push({ teamId: x.t.id, rank });
  return ranking;
}

function correctness(content: ActiveContent, teamId: string): boolean | null {
  const item = content.item;
  if (item.kind === 'game' || item.kind === 'estimate') {
    return item.kind === 'estimate' && !content.answers[teamId] ? false : null;
  }
  if (item.kind === 'buzzer') return content.buzzJudged[teamId] === true;
  const a = content.answers[teamId];
  return a ? a.correct === true : false;
}

function answerDetail(content: ActiveContent, teamId: string): string {
  const item = content.item;
  const a = content.answers[teamId];
  if (item.kind === 'choice' && a) return item.options[Number(a.value)] ?? '';
  if (item.kind === 'estimate' && a) return `${a.value}${item.unit ? ` ${item.unit}` : ''}`;
  if (item.kind === 'text' && a) return String(a.value);
  if (item.kind === 'buzzer') {
    const i = content.buzzQueue.findIndex((b) => b.teamId === teamId);
    return i >= 0 ? `Buzzer #${i + 1}` : '';
  }
  return '';
}

export function buildResults(tx: Tx, content: ActiveContent, ranking: RankEntry[]): RoundResults {
  const rules = tx.s.config.rules;
  const known = new Map(ranking.map((r) => [r.teamId, r.rank]));
  const maxRank = Math.max(0, ...ranking.map((r) => r.rank));
  const question = isQuestion(content.item);
  const entries: ResultEntry[] = tx.s.teams.map((t) => {
    const rank = known.get(t.id) ?? maxRank + 1;
    const correct = correctness(content, t.id);
    let bonusDie = rules.bonusDice[rank - 1] ?? 0;
    if (question && rules.bonusOnlyForCorrect && correct === false) bonusDie = 0;
    return { teamId: t.id, rank, bonusDie, correct, detail: answerDetail(content, t.id) };
  });
  // Würfelreihenfolge: nach Platz, Gleichstände ausgelost.
  const order = shuffle(tx.ctx.rng, entries)
    .sort((a, b) => a.rank - b.rank)
    .map((e) => e.teamId);
  entries.sort((a, b) => a.rank - b.rank || order.indexOf(a.teamId) - order.indexOf(b.teamId));
  return { itemId: content.item.id, title: content.item.title, kind: content.item.kind, entries, order };
}

function allAnswered(tx: Tx, content: ActiveContent): boolean {
  return tx.s.teams.every((t) => content.answers[t.id]);
}

function closeAnswers(tx: Tx, content: ActiveContent) {
  content.stage = 'closed';
  pauseTimer(content.timer, tx.ctx.now);
  tx.effects.push({ type: 'content', stage: 'closed', kind: content.item.kind, title: content.item.title });
}

function reveal(tx: Tx, content: ActiveContent) {
  pauseTimer(content.timer, tx.ctx.now);
  for (const [teamId, a] of Object.entries(content.answers)) {
    if (!a.overridden) a.correct = evaluate(content.item, a.value);
    void teamId;
  }
  content.stage = 'revealed';
  content.ranking = computeQuestionRanking(tx, content);
  tx.effects.push({ type: 'content', stage: 'revealed', kind: content.item.kind, title: content.item.title });
  const right = tx.s.teams.filter((t) => correctness(content, t.id) === true).map(teamLabel);
  if (content.item.kind === 'estimate') {
    const best = content.ranking.find((r) => r.rank === 1 && content.answers[r.teamId]);
    feed(tx, '📏', best ? `Am nächsten dran: ${teamLabel(findTeam(tx.s, best.teamId))}` : 'Niemand hat geschätzt');
  } else {
    feed(tx, '✅', right.length ? `Richtig: ${right.join(', ')}` : 'Niemand lag richtig');
  }
}

export function handleContentCommand(
  tx: Tx,
  cmd: CommandOf<
    | 'content.select'
    | 'content.redraw'
    | 'content.open'
    | 'content.close'
    | 'content.reveal'
    | 'content.rank'
    | 'content.finish'
    | 'content.abort'
    | 'timer.start'
    | 'timer.pause'
    | 'timer.add'
    | 'answer.submit'
    | 'answer.judge'
    | 'buzz'
    | 'buzz.judge'
    | 'results.confirm'
  >,
) {
  const s = tx.s;
  const now = tx.ctx.now;
  switch (cmd.type) {
    case 'content.select': {
      const p = s.phase;
      const replacing = p.name === 'content' && p.content.stage === 'intro';
      if (!(p.name === 'idle' || p.name === 'round_end' || replacing)) {
        fail('Ein neuer Inhalt kann nur zwischen den Runden gewählt werden');
      }
      if (s.status !== 'running') fail('Das Spiel läuft nicht');
      if (replacing) {
        undoDraw(tx, p.content.drawn, p.content.item.playerCount);
        s.playedItemIds = s.playedItemIds.filter((id) => id !== p.content.item.id);
        s.planIndex = p.content.planIndexBefore;
      } else {
        s.round += 1;
      }
      const planIndexBefore = s.planIndex;
      const item = chooseItem(tx, cmd);
      const drawn = shouldDraw(item) ? drawForTeams(tx, s.teams.map((t) => t.id), item.playerCount) : {};
      if (!s.playedItemIds.includes(item.id)) s.playedItemIds.push(item.id);
      for (const t of s.teams) t.bonusDie = 0;
      s.phase = {
        name: 'content',
        content: {
          item,
          source: cmd.source,
          stage: 'intro',
          drawn,
          timer: item.timerSec ? { durationMs: item.timerSec * 1000, startedAt: null, remainingMs: item.timerSec * 1000 } : null,
          answers: {},
          buzzQueue: [],
          buzzJudged: {},
          ranking: null,
          startedAt: now,
          planIndexBefore,
        },
      };
      tx.effects.push({ type: 'content', stage: 'intro', kind: item.kind, title: item.title });
      if (Object.keys(drawn).length) tx.effects.push({ type: 'drawn' });
      tx.label = `Inhalt: ${item.title}`;
      feed(tx, CONTENT_KIND_INFO[item.kind].icon, `Runde ${s.round}: ${item.title}`);
      return;
    }

    case 'content.redraw': {
      const c = activeContent(tx);
      if (c.stage === 'revealed') fail('Nach der Auflösung kann nicht neu ausgelost werden');
      const teamIds = cmd.teamId ? [findTeam(s, cmd.teamId).id] : s.teams.map((t) => t.id);
      const previous: Record<string, string[]> = {};
      for (const id of teamIds) previous[id] = c.drawn[id] ?? [];
      undoDraw(tx, previous, c.item.playerCount);
      Object.assign(c.drawn, drawForTeams(tx, teamIds, c.item.playerCount));
      tx.effects.push({ type: 'drawn' });
      tx.label = 'Neu ausgelost';
      return;
    }

    case 'content.open': {
      const c = activeContent(tx);
      if (c.stage !== 'intro') fail('Der Inhalt läuft bereits');
      c.stage = 'open';
      if (c.timer) c.timer.startedAt = now;
      tx.effects.push({ type: 'content', stage: 'open', kind: c.item.kind, title: c.item.title });
      if (c.timer) tx.effects.push({ type: 'timer', action: 'start' });
      tx.label = isQuestion(c.item) ? 'Antworten freigegeben' : 'Spiel gestartet';
      return;
    }

    case 'content.close': {
      const c = activeContent(tx);
      if (c.stage !== 'open') {
        if (tx.actor.system) return; // Timer kam zu spät – ignorieren
        fail('Es sind keine Antworten offen');
      }
      closeAnswers(tx, c);
      if (tx.actor.system) tx.effects.push({ type: 'timer', action: 'end' });
      tx.label = 'Antworten geschlossen';
      return;
    }

    case 'content.reveal': {
      const c = activeContent(tx);
      if (!isQuestion(c.item)) fail('Spiele werden nicht aufgelöst – bitte Platzierung eintragen');
      if (c.stage === 'intro') fail('Die Frage wurde noch nicht gestartet');
      if (c.stage === 'revealed') fail('Schon aufgelöst');
      reveal(tx, c);
      tx.label = 'Aufgelöst';
      return;
    }

    case 'content.rank': {
      const c = activeContent(tx);
      const ids = new Set(s.teams.map((t) => t.id));
      const seen = new Set<string>();
      for (const r of cmd.ranking) {
        if (!ids.has(r.teamId)) fail('Unbekanntes Team in der Platzierung');
        if (seen.has(r.teamId)) fail('Ein Team ist doppelt platziert');
        seen.add(r.teamId);
      }
      c.ranking = [...cmd.ranking].sort((a, b) => a.rank - b.rank);
      tx.label = 'Platzierung eingetragen';
      return;
    }

    case 'content.finish': {
      const c = activeContent(tx);
      if (isQuestion(c.item) && c.stage !== 'revealed') fail('Bitte zuerst auflösen');
      if (!c.ranking || c.ranking.length === 0) fail('Bitte zuerst die Platzierung eintragen');
      pauseTimer(c.timer, now);
      const results = buildResults(tx, c, c.ranking);
      s.phase = { name: 'results', results };
      tx.effects.push({ type: 'results' });
      tx.label = 'Ergebnis angezeigt';
      const winners = results.entries.filter((e) => e.rank === 1).map((e) => teamLabel(findTeam(s, e.teamId)));
      feed(tx, '🏅', `Sieger: ${winners.join(', ')}`);
      return;
    }

    case 'content.abort': {
      const c = activeContent(tx);
      undoDraw(tx, c.drawn, c.item.playerCount);
      s.playedItemIds = s.playedItemIds.filter((id) => id !== c.item.id);
      s.planIndex = c.planIndexBefore ?? s.planIndex;
      s.round = Math.max(0, s.round - 1);
      s.phase = { name: 'idle' };
      tx.label = 'Inhalt abgebrochen';
      feed(tx, '⏹️', `Abgebrochen: ${c.item.title}`);
      return;
    }

    case 'timer.start': {
      const c = activeContent(tx);
      if (cmd.seconds) c.timer = { durationMs: cmd.seconds * 1000, startedAt: null, remainingMs: cmd.seconds * 1000 };
      if (!c.timer) fail('Kein Countdown eingestellt');
      if (c.timer.startedAt !== null) return;
      if (timerRemaining(c.timer, now) <= 0) c.timer.remainingMs = c.timer.durationMs;
      c.timer.startedAt = now;
      tx.effects.push({ type: 'timer', action: 'start' });
      tx.label = 'Countdown gestartet';
      return;
    }

    case 'timer.pause': {
      const c = activeContent(tx);
      pauseTimer(c.timer, now);
      tx.effects.push({ type: 'timer', action: 'pause' });
      tx.label = 'Countdown pausiert';
      return;
    }

    case 'timer.add': {
      const c = activeContent(tx);
      if (!c.timer) fail('Kein Countdown eingestellt');
      const remaining = timerRemaining(c.timer, now);
      const running = c.timer.startedAt !== null;
      c.timer.remainingMs = Math.max(0, remaining + cmd.seconds * 1000);
      c.timer.durationMs = Math.max(c.timer.durationMs, c.timer.remainingMs);
      c.timer.startedAt = running ? now : null;
      tx.label = `Countdown ${cmd.seconds > 0 ? '+' : ''}${cmd.seconds}s`;
      return;
    }

    case 'answer.submit': {
      const c = activeContent(tx);
      const team = resolveTeamFor(tx, cmd.teamId);
      const item = c.item;
      if (item.kind === 'game' || item.kind === 'buzzer') fail('Hier gibt es keine Antworteingabe');
      if (c.stage !== 'open' && !(isStaff(tx.actor) && c.stage === 'closed')) fail('Antworten sind gerade nicht möglich');
      if (c.answers[team.id] && !isStaff(tx.actor)) fail('Euer Team hat schon geantwortet');
      let value: number | string = cmd.value;
      if (typeof value === 'string' && !value.trim()) fail('Bitte eine Antwort eingeben');
      if (item.kind === 'choice') {
        const idx = Number(value);
        if (!Number.isInteger(idx) || idx < 0 || idx >= item.options.length) fail('Ungültige Antwort');
        value = idx;
      } else if (item.kind === 'estimate') {
        const n = typeof value === 'number' ? value : Number(String(value).replace(',', '.'));
        if (!Number.isFinite(n)) fail('Bitte eine Zahl eingeben');
        value = n;
      } else {
        value = String(value).trim();
        if (!value) fail('Bitte eine Antwort eingeben');
      }
      const answer: TeamAnswer = {
        value,
        at: now,
        byPlayerId: tx.actor.role === 'player' ? (tx.actor.playerId ?? null) : null,
        correct: null,
        overridden: false,
      };
      c.answers[team.id] = answer;
      tx.effects.push({ type: 'answer', teamId: team.id });
      tx.label = `Antwort von ${teamLabel(team)}`;
      if (c.stage === 'open' && s.config.rules.autoCloseWhenAllAnswered && allAnswered(tx, c)) closeAnswers(tx, c);
      return;
    }

    case 'answer.judge': {
      const c = activeContent(tx);
      const team = findTeam(s, cmd.teamId);
      if (c.item.kind === 'game' || c.item.kind === 'estimate') fail('Hier gibt es nichts zu bewerten');
      if (c.item.kind === 'buzzer') {
        c.buzzJudged[team.id] = cmd.correct;
      } else {
        const a = c.answers[team.id] ?? { value: '', at: now, byPlayerId: null, correct: null, overridden: false };
        a.correct = cmd.correct;
        a.overridden = true;
        c.answers[team.id] = a;
      }
      if (c.stage === 'revealed') c.ranking = computeQuestionRanking(tx, c);
      tx.label = `${teamLabel(team)} als ${cmd.correct ? 'richtig' : 'falsch'} gewertet`;
      return;
    }

    case 'buzz': {
      const c = activeContent(tx);
      if (c.item.kind !== 'buzzer') fail('Das ist keine Buzzer-Frage');
      if (c.stage !== 'open') fail('Der Buzzer ist nicht aktiv');
      const team = resolveTeamFor(tx, cmd.teamId);
      if (c.buzzQueue.some((b) => b.teamId === team.id)) return; // doppelt gedrückt – egal
      if (c.buzzJudged[team.id] === false) fail('Euer Team hat schon falsch geantwortet');
      const waiting = c.buzzQueue.some((b) => c.buzzJudged[b.teamId] === undefined);
      c.buzzQueue.push({ teamId: team.id, at: now });
      tx.effects.push({ type: 'buzz', teamId: team.id, position: c.buzzQueue.length });
      tx.label = `Buzzer: ${teamLabel(team)}`;
      if (!waiting) pauseTimer(c.timer, now);
      return;
    }

    case 'buzz.judge': {
      const c = activeContent(tx);
      if (c.item.kind !== 'buzzer') fail('Das ist keine Buzzer-Frage');
      const team = findTeam(s, cmd.teamId);
      if (!c.buzzQueue.some((b) => b.teamId === team.id)) fail('Dieses Team hat nicht gebuzzert');
      c.buzzJudged[team.id] = cmd.correct;
      tx.effects.push({ type: 'buzz_judged', teamId: team.id, correct: cmd.correct });
      tx.label = `${teamLabel(team)}: ${cmd.correct ? 'richtig' : 'falsch'}`;
      if (cmd.correct) {
        reveal(tx, c);
      } else {
        feed(tx, '❌', `${teamLabel(team)} lag daneben`, team.id);
        const remaining = s.teams.filter((t) => c.buzzJudged[t.id] !== false);
        if (remaining.length === 0) closeAnswers(tx, c);
        else if (c.timer && c.stage === 'open' && c.buzzQueue.every((b) => c.buzzJudged[b.teamId] !== undefined)) {
          c.timer.startedAt = now; // weiterlaufen lassen
        }
      }
      return;
    }

    case 'results.confirm': {
      if (s.phase.name !== 'results') fail('Gerade wird kein Ergebnis angezeigt');
      const results = s.phase.results;
      for (const e of results.entries) {
        const t = s.teams.find((x) => x.id === e.teamId);
        if (t) t.bonusDie = e.bonusDie;
      }
      const order = results.order.filter((id) => s.teams.some((t) => t.id === id));
      s.phase = {
        name: 'dice',
        dice: { order, index: 0, rolls: [], fieldGame: null, busyUntil: now },
        results,
      };
      tx.effects.push({ type: 'turn', teamId: order[0]! });
      tx.label = 'Würfelrunde gestartet';
      feed(tx, '🎲', 'Würfelrunde beginnt');
      return;
    }
  }
}
