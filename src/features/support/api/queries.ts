import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supportApi } from './support-api';
import type { TicketQuery, TicketStatus } from './types';

export const supportKeys = {
  all: ['support'] as const,
  lists: () => [...supportKeys.all, 'list'] as const,
  list: (q: TicketQuery) => [...supportKeys.lists(), q] as const,
  ticket: (id: string) => [...supportKeys.all, 'ticket', id] as const,
  screenshot: (id: string) => [...supportKeys.all, 'screenshot', id] as const,
};

export const useTickets = (q: TicketQuery) =>
  useQuery({ queryKey: supportKeys.list(q), queryFn: () => supportApi.list(q), placeholderData: keepPreviousData });

export const useTicket = (id: string | null) =>
  useQuery({ queryKey: supportKeys.ticket(id ?? ''), queryFn: () => supportApi.find(id!), enabled: !!id });

const toDataUrl = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error ?? new Error('Could not read the image'));
    r.readAsDataURL(blob);
  });

/**
 * The screenshot as a data URL. It is fetched with the bearer token (an <img src> pointing at the
 * API could not send it) and kept only while the ticket is open.
 */
export function useScreenshot(id: string | null) {
  const q = useQuery({
    queryKey: supportKeys.screenshot(id ?? ''),
    queryFn: async () => toDataUrl(await supportApi.screenshot(id!)),
    enabled: !!id,
    staleTime: Infinity,
    gcTime: 60_000,
  });
  return { ...q, url: q.data ?? null };
}

export function useSetTicketStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { id: string; status: TicketStatus }) => supportApi.setStatus(v.id, v.status),
    onSuccess: (t) => {
      qc.setQueryData(supportKeys.ticket(t.id), t);
      void qc.invalidateQueries({ queryKey: supportKeys.lists() });
      void qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}
