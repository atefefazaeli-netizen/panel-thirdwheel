// Clinical review helpers: provenance labels, self-approval, conflicts and server field errors.
import { ApiError } from '@/lib/api';
import type { ContentItem } from '../api/types';

/** What the panel says about seeded approval (the server's `liveApprovalLabel`). */
export const SEEDED_LABEL = 'Seeded from the Release 1 bundle, not a sign-off in this system';

/** Plain names for provenance parts. */
export const PART_LABEL: Record<string, string> = {
  steps: 'Do steps',
  deck: 'Deck lines',
  'deck.options': 'Deck answer options',
  cards: 'Cards',
  'cards.options': 'Card answer options',
  followUp: 'Follow-up line',
  how: 'How it plays',
  howItPlays: 'How it plays',
  safety: 'Safety line',
};
export const partLabel = (part: string) => PART_LABEL[part] ?? part;

/** The approver is the draft's last editor (allowed; recorded as self-approved). */
export const isSelfApproval = (item: Pick<ContentItem, 'draft'>, userId: string | null | undefined) =>
  !!userId && !!item.draft && item.draft.by === userId;

export const isConflict = (e: unknown) => e instanceof ApiError && e.code === 'CONTENT_CONFLICT';

/** Who approved, in words: the seed is not a sign-off. */
export const approverLabel = (id: string | null, email: string | null) =>
  id === 'workbook' ? SEEDED_LABEL : (email ?? id ?? 'Unknown');

/**
 * Maps the server's INVALID_CONTENT `details` ("body.cards[2].text: 1 to 1000 characters") to editor
 * form paths ("body.cards.2.text"). Unknown paths stay in `unmapped` and are listed as they are.
 */
export function detailsToFieldErrors(details: readonly string[]): {
  mapped: { path: string; message: string }[];
  unmapped: string[];
} {
  const mapped: { path: string; message: string }[] = [];
  const unmapped: string[] = [];
  const CATALOG = new Set(['title', 'meta', 'emoji', 'where', 'category', 'sub', 'minutes', 'duration', 'vibes', 'play', 'only', 'price']);
  const BODY = new Set(['intro', 'howItPlays', 'how', 'safety', 'followUp', 'need', 'howYouPlay']);
  for (const d of details) {
    const i = d.indexOf(':');
    const at = i > 0 ? d.slice(0, i).trim() : '';
    const message = i > 0 ? d.slice(i + 1).trim() : d;
    let m: RegExpMatchArray | null;
    let path: string | null = null;
    if ((m = at.match(/^catalog\.([A-Za-z]+)/)) && CATALOG.has(m[1]!)) path = `catalog.${m[1]}`;
    else if ((m = at.match(/^body\.(cards|steps)\[(\d+)\]\.([A-Za-z]+)$/)))
      path = `body.${m[1]}.${m[2]}.${['title', 'body', 'text'].includes(m[3]!) ? m[3] : m[1] === 'steps' ? 'body' : 'text'}`;
    else if ((m = at.match(/^body\.(cards|steps)$/))) path = `body.${m[1]}`;
    else if (at.startsWith('body.deck')) path = 'body.deckText';
    else if ((m = at.match(/^body\.([A-Za-z]+)/)) && BODY.has(m[1]!)) path = `body.${m[1]}`;
    if (path) mapped.push({ path, message: `${message} (server)` });
    else unmapped.push(d);
  }
  return { mapped, unmapped };
}
