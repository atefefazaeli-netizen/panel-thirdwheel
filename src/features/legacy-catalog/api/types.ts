// Legacy round 1 content (existing admin routes): date ideas (catalog/items), experiences and
// venue booking links. Release 1 Explore reads the Content CMS instead.

export type CatalogKind = 'book' | 'guided' | 'home' | 'place';
export const CATALOG_KINDS: readonly CatalogKind[] = ['book', 'guided', 'home', 'place'];

/** CatalogItemRef: what `catalog/admin/items` and every write answer (the public list strips tags and refPrefix). */
export interface CatalogItem {
  id: number;
  title: string;
  where: 'home' | 'out';
  usd: number;
  per?: string;
  reason: string;
  meta: string;
  kind: CatalogKind;
  provider?: string;
  site?: string;
  deposit?: number;
  cancel?: string;
  slots?: string[];
  weekendOnly?: boolean;
  voucher?: boolean;
  /** SVG path data for the icon (24×24). */
  d: string;
  src?: string;
  srcName?: string;
  link?: string;
  area?: string;
  tags?: string[];
  refPrefix?: string;
}

/**
 * What the panel sends (CreateItemDto / UpdateItemDto): the public fields minus the ones the DTO
 * does not take (src, srcName, link, area belong to imported social links). Without `id` the
 * server takes the next free one.
 */
export type CatalogItemInput = Omit<CatalogItem, 'id' | 'src' | 'srcName' | 'link' | 'area'> & { id?: number };

export interface CatalogQuery {
  where?: 'home' | 'out';
  kind?: CatalogKind;
  maxUsd?: number;
  page?: number;
  limit?: number;
}

export const EXP_KEYS = ['talk', 'discover', 'grow', 'adventures', 'happen', 'reflect'] as const;
export type ExpKey = (typeof EXP_KEYS)[number];
export const DUR_VALUES = ['crush', 'u6', '6to12', '1to3', '3to7', '7plus'] as const;
export const KIDS_VALUES = ['none', 'home', 'some'] as const;
export const LIVING_VALUES = ['together', 'same', 'long'] as const;

export interface Experience {
  id: string;
  exp: ExpKey;
  title: string;
  meta: string;
  reason: string;
  d?: string;
  cmd?: { screen: string; [k: string]: unknown };
  items?: string[];
  tag?: string;
  only?: Partial<{ dur: string[]; kids: string[]; living: string[] }>;
  no?: string[];
  p?: Record<string, number>;
  kind?: string;
}

export interface ExperienceQuery {
  exp?: ExpKey;
  page?: number;
  limit?: number;
}

export interface BookingLink {
  url: string;
  paidLink: boolean;
  venue: string | null;
  source: 'venue' | 'search';
}
