import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { legacyApi } from './legacy-api';
import type { CatalogItem, CatalogQuery, Experience, ExperienceQuery } from './types';

export const legacyKeys = {
  all: ['legacy'] as const,
  items: (q: CatalogQuery) => [...legacyKeys.all, 'items', q] as const,
  experiences: (q: ExperienceQuery) => [...legacyKeys.all, 'experiences', q] as const,
  experienceMeta: () => [...legacyKeys.all, 'experience-meta'] as const,
  bookingLink: (id: string) => [...legacyKeys.all, 'booking-link', id] as const,
};

export const useCatalogItems = (q: CatalogQuery) =>
  useQuery({ queryKey: legacyKeys.items(q), queryFn: () => legacyApi.items(q), placeholderData: keepPreviousData });
export const useExperiences = (q: ExperienceQuery) =>
  useQuery({
    queryKey: legacyKeys.experiences(q),
    queryFn: () => legacyApi.experiences(q),
    placeholderData: keepPreviousData,
  });
export const useExperienceMeta = () =>
  useQuery({ queryKey: legacyKeys.experienceMeta(), queryFn: legacyApi.experienceMeta, staleTime: Infinity });
export const useBookingLink = (id: string | null) =>
  useQuery({
    queryKey: legacyKeys.bookingLink(id ?? ''),
    queryFn: () => legacyApi.bookingLink(id!),
    enabled: !!id,
    retry: false,
  });

function useWrite<V, R>(fn: (v: V) => Promise<R>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    meta: { silent: true },
    onSuccess: () => qc.invalidateQueries({ queryKey: legacyKeys.all }),
  });
}

/** PATCH merges, so optional fields left empty are sent as null to clear them. */
const ITEM_OPTIONAL = ['per', 'provider', 'site', 'deposit', 'cancel', 'slots', 'weekendOnly', 'voucher'] as const;
const XP_OPTIONAL = ['d', 'cmd', 'items', 'tag', 'only', 'no', 'p', 'kind'] as const;
const withNulls = <T extends object>(v: T, keys: readonly string[]) => ({
  ...Object.fromEntries(keys.map((k) => [k, null])),
  ...v,
});

export const useSaveCatalogItem = () =>
  useWrite((v: { item: CatalogItem; isNew: boolean; sendTags?: boolean; sendRefPrefix?: boolean }) => {
    if (v.isNew) return legacyApi.createItem(v.item);
    // The public list hides tags and refPrefix, so an edit only sends them when they were changed.
    const { id, tags, refPrefix, ...rest } = v.item;
    const patch: Partial<CatalogItem> = { ...(withNulls(rest, ITEM_OPTIONAL) as Partial<CatalogItem>) };
    if (v.sendTags) patch.tags = tags ?? [];
    if (v.sendRefPrefix && refPrefix) patch.refPrefix = refPrefix;
    return legacyApi.updateItem(id, patch);
  });
export const useDeleteCatalogItem = () => useWrite((id: number) => legacyApi.deleteItem(id));
export const useSaveExperience = () =>
  useWrite((v: { x: Experience; isNew: boolean }) => {
    const { id, ...rest } = v.x;
    return v.isNew
      ? legacyApi.createExperience(v.x)
      : legacyApi.updateExperience(id, withNulls(rest, XP_OPTIONAL) as Partial<Experience>);
  });
export const useDeleteExperience = () => useWrite((id: string) => legacyApi.deleteExperience(id));
export const useSetBookingLink = () =>
  useWrite((v: { id: string; url: string; venue: string | null; paid: boolean }) =>
    legacyApi.setBookingLink(v.id, { url: v.url, venue: v.venue, paid: v.paid }),
  );
export const useRemoveBookingLink = () => useWrite((id: string) => legacyApi.removeBookingLink(id));
