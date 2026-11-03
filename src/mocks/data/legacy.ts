// Legacy round 1 content: the backend seeds for catalog items and experiences, plus venue links.
import type { BookingLink, CatalogItem, Experience } from '@/features/legacy-catalog/api/types';
import itemsSeed from './catalog-seed.json';
import xpSeed from './experiences-seed.json';

export interface LegacyState {
  items: CatalogItem[];
  retired: Set<number>;
  experiences: Experience[];
  retiredXp: Set<string>;
  links: Map<string, BookingLink>;
}

export const EXP_LABEL: Record<string, string> = {
  talk: 'Talk it through',
  discover: 'Discover',
  grow: 'Grow together',
  adventures: 'Adventures',
  happen: 'Make it happen',
  reflect: 'Reflect',
};

export function seedLegacy(): LegacyState {
  return {
    items: structuredClone(itemsSeed) as CatalogItem[],
    retired: new Set(),
    experiences: structuredClone(xpSeed) as Experience[],
    retiredXp: new Set(),
    links: new Map([
      [
        'pottery-for-two',
        {
          url: 'https://claystudio.example/book?ref=thirdwheel',
          paidLink: true,
          venue: 'Clay Studio',
          source: 'venue',
        },
      ],
    ]),
  };
}
