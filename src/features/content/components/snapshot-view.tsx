import { Badge } from '@/components/ui/badge';
import type { ContentSnapshot } from '../api/types';

/** A compact read-only view of a snapshot (catalog fields and what the body holds). */
export function SnapshotView({ snapshot }: { snapshot: ContentSnapshot }) {
  const c = snapshot.catalog;
  const b = snapshot.body;
  const deckEntries = b.deck ? Object.entries(b.deck).filter(([, v]) => Array.isArray(v)) : [];
  return (
    <div className="flex flex-col gap-4 text-sm">
      <dl className="grid grid-cols-[8rem_1fr] gap-x-3 gap-y-1.5">
        {Object.entries(c)
          .filter(([k]) => !['id', 'kind', 'pillar'].includes(k))
          .map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="text-muted-foreground">{k}</dt>
              <dd className="break-words">{typeof v === 'string' ? v : JSON.stringify(v)}</dd>
            </div>
          ))}
      </dl>
      {b.cards && (
        <div className="flex flex-col gap-1">
          <p className="font-medium">Cards ({b.cards.length})</p>
          <ol className="flex list-decimal flex-col gap-1 pl-5">
            {b.cards.map((card, i) => (
              <li key={i}>{card.text}</li>
            ))}
          </ol>
        </div>
      )}
      {b.steps && (
        <div className="flex flex-col gap-1">
          <p className="font-medium">Steps ({b.steps.length})</p>
          <ol className="flex list-decimal flex-col gap-1 pl-5">
            {b.steps.map((s, i) => (
              <li key={i}>
                <span className="font-medium">{s.title}.</span> {s.body}
              </li>
            ))}
          </ol>
        </div>
      )}
      {b.deck && (
        <div className="flex flex-col gap-1">
          <p className="flex items-center gap-2 font-medium">
            Deck <Badge variant="secondary">{String(b.deck.type)}</Badge>
          </p>
          {deckEntries.map(([k, v]) => (
            <p key={k} className="text-muted-foreground">
              {k}: {(v as unknown[]).length}
            </p>
          ))}
        </div>
      )}
      <details>
        <summary className="cursor-pointer text-xs text-muted-foreground">JSON</summary>
        <pre className="mt-2 max-h-96 overflow-auto rounded-md bg-muted p-3 font-mono text-xs">
          {JSON.stringify(snapshot, null, 2)}
        </pre>
      </details>
    </div>
  );
}
