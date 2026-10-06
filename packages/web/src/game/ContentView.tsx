/** Inhalt mit Lösung – für Regie und Moderator (Vorlesetext groß, Lösung markiert). */
import { CheckCircle2, Clock, Package, StickyNote, Users } from 'lucide-react';
import { PLAYER_COUNT_LABEL, type ContentItem } from '@insel/shared';
import { KindBadge } from '../ui/game.tsx';

export function ContentView({ item, large, showSolution = true, hideNotes }: { item: ContentItem; large?: boolean; showSolution?: boolean; hideNotes?: boolean }) {
  const text = large ? 'text-xl leading-relaxed' : 'text-base';
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <KindBadge kind={item.kind} />
        {item.kind === 'game' && (
          <span className="inline-flex items-center gap-1 text-xs font-bold text-muted">
            <Users className="size-3.5" /> {PLAYER_COUNT_LABEL[item.playerCount]}
          </span>
        )}
        {item.timerSec && (
          <span className="inline-flex items-center gap-1 text-xs font-bold text-muted">
            <Clock className="size-3.5" /> {item.timerSec} s
          </span>
        )}
      </div>
      <h3 className={`${large ? 'text-3xl' : 'text-2xl'} font-semibold leading-tight`}>{item.title}</h3>

      {'question' in item && <p className={`${large ? 'text-2xl' : 'text-lg'} font-bold leading-snug`}>{item.question}</p>}

      {item.kind === 'choice' && (
        <ol className="grid gap-2 sm:grid-cols-2">
          {item.options.map((o, i) => {
            const right = showSolution && i === item.correctIndex;
            return (
              <li
                key={i}
                className={`flex items-center gap-3 rounded-2xl border-2 px-3 py-2.5 font-bold ${large ? 'text-lg' : ''} ${
                  right ? 'border-good bg-good-soft' : 'border-line bg-surface-2'
                }`}
              >
                <span className="grid size-8 shrink-0 place-items-center rounded-full bg-surface font-display text-sm shadow-soft">{String.fromCharCode(65 + i)}</span>
                <span className="flex-1">{o}</span>
                {right && <CheckCircle2 className="size-5 text-good" />}
              </li>
            );
          })}
        </ol>
      )}

      {showSolution && item.kind === 'text' && (
        <Solution large={large}>
          {item.answers.join(' / ')}
        </Solution>
      )}
      {showSolution && item.kind === 'estimate' && (
        <Solution large={large}>
          {item.target.toLocaleString('de-DE')} {item.unit}
        </Solution>
      )}
      {showSolution && item.kind === 'buzzer' && item.answer && <Solution large={large}>{item.answer}</Solution>}

      {item.description && <p className={`whitespace-pre-line text-ink-2 ${text}`}>{item.description}</p>}

      {item.materials && (
        <p className="flex items-start gap-2 rounded-2xl bg-bg-2 px-3 py-2 text-sm">
          <Package className="mt-0.5 size-4 shrink-0 text-muted" />
          <span>
            <b>Material:</b> {item.materials}
          </span>
        </p>
      )}
      {showSolution && item.notes && !hideNotes && (
        <p className="flex items-start gap-2 rounded-2xl bg-warn-soft px-3 py-2 text-sm">
          <StickyNote className="mt-0.5 size-4 shrink-0 text-warn" />
          <span>{item.notes}</span>
        </p>
      )}
    </div>
  );
}

function Solution({ children, large }: { children: React.ReactNode; large?: boolean }) {
  return (
    <p className={`flex items-center gap-2 rounded-2xl border-2 border-good bg-good-soft px-3 py-2.5 font-bold ${large ? 'text-xl' : ''}`}>
      <CheckCircle2 className="size-5 shrink-0 text-good" />
      <span>
        <span className="text-xs font-extrabold uppercase tracking-wide text-good">Lösung · </span>
        {children}
      </span>
    </p>
  );
}
