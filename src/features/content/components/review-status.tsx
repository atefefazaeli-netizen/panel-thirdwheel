import { Link } from '@tanstack/react-router';
import { CheckCircle2Icon, LayersIcon, ShieldAlertIcon, StethoscopeIcon } from 'lucide-react';
import { StatusBadge } from '@/components/shared';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { formatDateTime } from '@/lib/format';
import type { ContentItem, HeldMatch } from '../api/types';
import { BOARDS_WITH_BODY_CARDS, goLiveShortfall } from '../lib/boards';
import { partLabel, SEEDED_LABEL } from '../lib/review';

/** "Needs clinical review": live has parts no clinician has reviewed in this system. */
export function NeedsReviewBadge({ className }: { className?: string }) {
  return <StatusBadge status="needs_review" tone="warning" label="Needs clinical review" className={className} />;
}

/** Held-list match (title or world of content the workbook holds back). */
export function HeldBadge({ className }: { className?: string }) {
  return <StatusBadge status="held" tone="danger" label="Held content" className={className} />;
}

/**
 * Why an item needs clinical review: the provenance the server keeps for seeded items (which parts
 * are the workbook's, which were written elsewhere), and who cleared the flags.
 */
export function ProvenancePanel({ item }: { item: ContentItem }) {
  const p = item.provenance;
  if (!p && !item.liveSeeded) return null;
  if (p?.source === 'figma-board' && item.needsReview)
    return (
      <Alert className="border-warning/40 bg-warning-soft/40">
        <StethoscopeIcon />
        <AlertTitle>From the Figma board: needs clinical review</AlertTitle>
        <AlertDescription>
          <p>
            {item.liveVersion > 0
              ? `Live is version ${item.liveVersion}. `
              : 'Not live: the app does not show it until a clinician approves it. '}
            This text was drawn on the design board, not in the clinician-cleared workbook.
          </p>
          <ul className="mt-1 list-disc pl-4" aria-label="Parts that need clinical review">
            {p.needsReview.map((n) => (
              <li key={n.part}>
                <span className="font-medium">{partLabel(n.part)}</span>: {n.reason}
              </li>
            ))}
          </ul>
          {p.notes.length > 0 && (
            <ul className="mt-1 list-disc pl-4" aria-label="Notes from the board">
              {p.notes.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          )}
        </AlertDescription>
      </Alert>
    );
  if (p && item.needsReview)
    return (
      <Alert className="border-warning/40 bg-warning-soft/40">
        <StethoscopeIcon />
        <AlertTitle>Needs clinical review</AlertTitle>
        <AlertDescription>
          <p>
            Live is version {item.liveVersion}
            {item.liveSeeded ? `: ${SEEDED_LABEL.toLowerCase()}.` : '.'} These parts were not written in the
            clinician-cleared workbook and no clinician has approved them here:
          </p>
          <ul className="mt-1 list-disc pl-4" aria-label="Parts that need clinical review">
            {p.needsReview.map((n) => (
              <li key={n.part}>
                <span className="font-medium">{partLabel(n.part)}</span>: {n.reason}
              </li>
            ))}
          </ul>
          <p className="mt-1">
            A clinician clears these by approving a version of this item (submit a draft, even unchanged, for review).
            The approval clears the whole item and is recorded with their name.
          </p>
          <ProvenanceDetails item={item} />
        </AlertDescription>
      </Alert>
    );
  return (
    <Alert>
      {p?.clearedBy ? <CheckCircle2Icon /> : <ShieldAlertIcon />}
      <AlertTitle>{p?.clearedBy ? 'Clinical review flags cleared' : 'Source'}</AlertTitle>
      <AlertDescription>
        {p?.clearedBy ? (
          <p>
            Cleared by {p.clearedBy.byName ?? p.clearedBy.byEmail ?? p.clearedBy.by} on {formatDateTime(p.clearedBy.at)}{' '}
            (version {p.clearedBy.version}, {p.clearedBy.via === 'approved' ? 'approval' : p.clearedBy.via}). It
            covered: {p.flagged.map((n) => partLabel(n.part)).join(', ')}.
          </p>
        ) : item.liveSeeded ? (
          <p>{SEEDED_LABEL}. Every part is the clinician-cleared workbook's text.</p>
        ) : null}
        <ProvenanceDetails item={item} />
      </AlertDescription>
    </Alert>
  );
}

function ProvenanceDetails({ item }: { item: ContentItem }) {
  const p = item.provenance;
  if (!p || (!p.cleared.length && !p.notes.length)) return null;
  return (
    <details className="mt-1 text-xs">
      <summary className="cursor-pointer">Where the text comes from</summary>
      {p.cleared.length > 0 && <p>From the workbook word for word: {p.cleared.map(partLabel).join(', ')}.</p>}
      {p.notes.length > 0 && (
        <ul className="list-disc pl-4">
          {p.notes.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      )}
    </details>
  );
}

/** Red banner: the item matches content the workbook holds back. */
export function HeldBanner({ match }: { match: HeldMatch }) {
  return (
    <Alert variant="destructive" role="alert">
      <ShieldAlertIcon />
      <AlertTitle>Matches content held back from Release 1</AlertTitle>
      <AlertDescription>
        <ul className="list-disc pl-4">
          {match.reasons.map((r, i) => (
            <li key={i}>
              {r.field === 'title'
                ? 'Title'
                : r.field === 'category'
                  ? 'Category'
                  : r.field === 'world'
                    ? 'World'
                    : 'Sub'}{' '}
              “{r.value}” matches the held {r.held.type.toLowerCase()} “{r.held.item}” ({r.held.world}): {r.held.why}.
            </li>
          ))}
        </ul>
        <p className="mt-1">Nothing is published automatically. A clinician must confirm it before approving.</p>
      </AlertDescription>
    </Alert>
  );
}

/**
 * A new-board deck under 5 cards can't go live (409 DECK_TOO_SHORT, app v2.5.0). Shown before
 * approving (from the draft) and after the server refused (its message). Suggests adding cards in
 * the editor; the draft then goes back for review as usual.
 */
export function DeckTooShortAlert({
  body,
  message,
  itemId,
  showLink = true,
}: {
  body: unknown;
  /** The server's DECK_TOO_SHORT message, when approve was refused. */
  message?: string | null;
  itemId: string;
  showLink?: boolean;
}) {
  const local = goLiveShortfall(body);
  if (!local && !message) return null;
  const type = (body as { deck?: { type?: string } } | null)?.deck?.type;
  const tab = BOARDS_WITH_BODY_CARDS.some((t) => t === type) ? 'cards' : 'deck';
  return (
    <Alert variant={message ? 'destructive' : 'warning'} role={message ? 'alert' : undefined}>
      <LayersIcon />
      <AlertTitle>{message ? 'Not approved: the deck is too short' : 'Too short to go live'}</AlertTitle>
      <AlertDescription>
        <p>{message ?? local!.text}</p>
        <p>Add cards in the editor and save, then send it for review again.</p>
        {showLink && (
          <Button variant="outline" size="sm" className="mt-1 w-fit" asChild>
            <Link to="/content/$id" params={{ id: itemId }} search={{ tab }}>
              Add cards in the {tab === 'cards' ? 'Cards' : 'Deck'} tab
            </Link>
          </Button>
        )}
      </AlertDescription>
    </Alert>
  );
}
