import type { ContentListState, ContentPillar, DraftState } from '../api/types';
import { isBoardType } from './boards';

export const PILLAR_LABEL: Record<ContentPillar, string> = { quiz: 'Quiz', play: 'Play', do: 'Do' };

export const STATE_LABEL: Record<ContentListState, string> = {
  live: 'Live',
  editing: 'Draft',
  in_review: 'In review',
  changes_requested: 'Changes requested',
  retired: 'Unpublished',
};

export const ONLY_LABEL: Record<string, string> = {
  spicy: 'Spicy',
  kids: 'Kids at home',
  ld: 'Long distance',
  'opt-in': 'Opt-in',
};

export const WHERE_LABEL: Record<string, string> = {
  anywhere: 'Anywhere',
  home: 'At home',
  out: 'Out',
  outside: 'Outside',
  apart: 'Apart',
};

export const KIND_LABEL: Record<string, string> = {
  'type-quiz': 'Quiz type',
  'quiz-turn': 'Your turn',
  'quiz-deck': 'Card deck',
  'quiz-solo': 'Solo compare',
  'type-play': 'Game type',
  'play-live': 'Live game',
  'play-league': 'League',
  'play-shelf': 'Shelf game',
  'do-home': 'Do at home',
  'do-outside': 'Do outside',
  'do-book': 'Do booked',
  'type-do': 'Do type',
};

export const categoryLabel = (c: string | null | undefined) =>
  c
    ? c
        .replace(/-/g, ' ')
        .replace(/^\w/, (x) => x.toUpperCase())
        .replace('Know me', 'Know Me')
        .replace('Real life', 'Real Life')
    : '';

/** Which body field the app plays for a kind (ADMIN_API.md › Content). */
/**
 * Which body field the item's screen plays. Round 4 boards (deck type in BOARD_TYPES, app v2.3.0)
 * change it for Do cards: they play their board deck, not steps. Fill the blank and You or Me
 * quizzes still play their cards; the deck holds the board's settings.
 */
export function playsField(kind: string, deckType?: string | null): 'deck' | 'cards' | 'steps' | 'how' {
  if (kind.startsWith('type-')) return 'deck';
  if (isBoardType(deckType) && kind.startsWith('do-')) return 'deck';
  if (kind === 'quiz-turn' || kind === 'quiz-deck' || kind === 'quiz-solo') return 'cards';
  if (kind.startsWith('do-')) return 'steps';
  return 'how';
}

export function contentState(i: {
  retired: boolean;
  draftState?: DraftState | null;
  draft?: { state: DraftState } | null;
}): ContentListState {
  if (i.retired) return 'retired';
  return i.draftState ?? i.draft?.state ?? 'live';
}
