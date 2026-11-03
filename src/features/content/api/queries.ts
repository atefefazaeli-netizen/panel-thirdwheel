import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { contentApi } from './content-api';
import type { ContentImportItem, ContentItem, ContentListQuery, ContentSnapshot, CreateContentInput } from './types';

/** Query keys for the content feature. Invalidate `all` after any write. */
export const contentKeys = {
  all: ['content'] as const,
  lists: () => [...contentKeys.all, 'list'] as const,
  list: (q: ContentListQuery) => [...contentKeys.lists(), q] as const,
  facets: () => [...contentKeys.all, 'facets'] as const,
  item: (id: string) => [...contentKeys.all, 'item', id] as const,
  versions: (id: string) => [...contentKeys.item(id), 'versions'] as const,
  version: (id: string, v: number) => [...contentKeys.item(id), 'versions', v] as const,
  changes: (id: string, page: number) => [...contentKeys.item(id), 'changes', page] as const,
};

export const useContentList = (q: ContentListQuery) =>
  useQuery({ queryKey: contentKeys.list(q), queryFn: () => contentApi.list(q), placeholderData: keepPreviousData });

export const useContentFacets = () =>
  useQuery({ queryKey: contentKeys.facets(), queryFn: contentApi.facets, staleTime: 5 * 60_000 });

export const useContentItem = (id: string) =>
  useQuery({ queryKey: contentKeys.item(id), queryFn: () => contentApi.get(id) });

export const useContentVersions = (id: string) =>
  useQuery({ queryKey: contentKeys.versions(id), queryFn: () => contentApi.versions(id) });

export const useContentVersion = (id: string, version: number | null) =>
  useQuery({
    queryKey: contentKeys.version(id, version ?? 0),
    queryFn: () => contentApi.version(id, version!),
    enabled: version != null,
  });

export const useContentChanges = (id: string, page: number) =>
  useQuery({
    queryKey: contentKeys.changes(id, page),
    queryFn: () => contentApi.changes(id, page),
    placeholderData: keepPreviousData,
  });

/** Every write returns the item: put it in the cache and refresh lists and history. */
function useItemWrite<V>(fn: (v: V) => Promise<ContentItem>, opts: { silent?: boolean } = {}) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    meta: { silent: opts.silent },
    onSuccess: (item) => {
      qc.setQueryData(contentKeys.item(item.id), item);
      void qc.invalidateQueries({ queryKey: contentKeys.lists() });
      void qc.invalidateQueries({ queryKey: contentKeys.versions(item.id) });
      void qc.invalidateQueries({ queryKey: [...contentKeys.item(item.id), 'changes'] });
      void qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}

export const useCreateContent = () =>
  useItemWrite((input: CreateContentInput) => contentApi.create(input), { silent: true });
export const useSaveDraft = (id: string) =>
  useItemWrite((snapshot: ContentSnapshot) => contentApi.saveDraft(id, snapshot), { silent: true });
export const useDiscardDraft = (id: string) => useItemWrite(() => contentApi.discardDraft(id));
export const useSubmitContent = (id: string) => useItemWrite((note?: string) => contentApi.submit(id, note));
export const useApproveContent = (id: string) => useItemWrite((note?: string) => contentApi.approve(id, note));
export const useRequestChanges = (id: string) => useItemWrite((note: string) => contentApi.requestChanges(id, note));
export const useUnpublishContent = (id: string) => useItemWrite(() => contentApi.unpublish(id));
export const useRestoreContent = (id: string) => useItemWrite(() => contentApi.restore(id));
export const useRollbackContent = (id: string) =>
  useItemWrite((v: { version: number; note?: string }) => contentApi.rollback(id, v.version, v.note));

export function useImportContent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { items: ContentImportItem[]; note?: string }) => contentApi.import(v.items, v.note),
    onSuccess: () => qc.invalidateQueries({ queryKey: contentKeys.all }),
  });
}
