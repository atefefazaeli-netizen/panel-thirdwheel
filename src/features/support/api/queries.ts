import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError } from '@/lib/api';
import { supportApi } from './support-api';
import type { TicketPriority, TicketQuery, TicketStatus } from './types';

export const supportKeys = {
  all: ['support'] as const,
  lists: () => [...supportKeys.all, 'list'] as const,
  list: (q: TicketQuery) => [...supportKeys.lists(), q] as const,
  ticket: (id: string) => [...supportKeys.all, 'ticket', id] as const,
  screenshot: (id: string) => [...supportKeys.all, 'screenshot', id] as const,
  assignees: () => [...supportKeys.all, 'assignees'] as const,
  delivery: () => [...supportKeys.all, 'delivery-status'] as const,
};

export const useTickets = (q: TicketQuery) =>
  useQuery({ queryKey: supportKeys.list(q), queryFn: () => supportApi.list(q), placeholderData: keepPreviousData });

export const useTicket = (id: string | null) =>
  useQuery({ queryKey: supportKeys.ticket(id ?? ''), queryFn: () => supportApi.find(id!), enabled: !!id });

export const useAssignees = () =>
  useQuery({ queryKey: supportKeys.assignees(), queryFn: supportApi.assignees, staleTime: 60_000 });

export const useDeliveryStatus = () =>
  useQuery({ queryKey: supportKeys.delivery(), queryFn: supportApi.deliveryStatus, staleTime: 60_000 });

/** Blob → data URL without FileReader (works with any Blob implementation, tests included). */
export async function toDataUrl(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return `data:${blob.type || 'application/octet-stream'};base64,${btoa(bin)}`;
}

/**
 * The screenshot as a data URL. It is fetched through the API client (with the session cookie and
 * error handling) and kept only while the ticket is open.
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

export const isTicketConflict = (e: unknown) => e instanceof ApiError && e.code === 'TICKET_CONFLICT';

export type TicketChange =
  | { kind: 'status'; value: TicketStatus }
  | { kind: 'priority'; value: TicketPriority }
  | { kind: 'assignee'; value: string | null };

/**
 * Status, priority and assignee changes, each with the version this screen is based on. After any
 * answer (also a 409 TICKET_CONFLICT) the ticket is read again, so the page shows the latest.
 */
export function useChangeTicket(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ change, version }: { change: TicketChange; version: number }) => {
      if (change.kind === 'status') return supportApi.setStatus(id, change.value, version);
      if (change.kind === 'priority') return supportApi.setPriority(id, change.value, version);
      return supportApi.setAssignee(id, change.value, version);
    },
    meta: { silent: true },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: supportKeys.ticket(id) });
      void qc.invalidateQueries({ queryKey: supportKeys.lists() });
      void qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}

export function useTicketWrite(id: string) {
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: supportKeys.ticket(id) });
  return {
    note: useMutation({ mutationFn: (text: string) => supportApi.addNote(id, text), onSuccess: refresh }),
    reply: useMutation({ mutationFn: (text: string) => supportApi.reply(id, text), onSuccess: refresh }),
    retry: useMutation({ mutationFn: (replyId: string) => supportApi.retryReply(id, replyId), onSettled: refresh }),
  };
}
