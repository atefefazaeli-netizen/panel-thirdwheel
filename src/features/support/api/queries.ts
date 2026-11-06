import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError } from '@/lib/api';
import { supportApi } from './support-api';
import type { SupportTicketDetail, TicketPriority, TicketQuery, TicketStatus } from './types';

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

/**
 * One ticket. While a reply waits for an email provider that is configured (it is queued
 * server-side), the ticket is read again every 5 seconds so Sent or Failed shows without a reload.
 */
export const useTicket = (id: string | null, pollPending = false) =>
  useQuery({
    queryKey: supportKeys.ticket(id ?? ''),
    queryFn: () => supportApi.find(id!),
    enabled: !!id,
    refetchInterval: (q) =>
      pollPending && q.state.data?.timeline.some((e) => e.type === 'reply' && e.delivery.status === 'pending')
        ? 5_000
        : false,
  });

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
 * Status, priority and assignee changes, each with the version this screen is based on. The answer
 * is the ticket as it is now; after a 409 TICKET_CONFLICT the ticket is read again.
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
    onSuccess: (t) => qc.setQueryData(supportKeys.ticket(id), t),
    onError: () => void qc.invalidateQueries({ queryKey: supportKeys.ticket(id) }),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: supportKeys.lists() });
      void qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}

/** Notes, replies and retries: each answers the ticket with its timeline (no version bump). */
export function useTicketWrite(id: string) {
  const qc = useQueryClient();
  const show = (t: SupportTicketDetail) => qc.setQueryData(supportKeys.ticket(id), t);
  const reread = () => void qc.invalidateQueries({ queryKey: supportKeys.ticket(id) });
  return {
    note: useMutation({ mutationFn: (text: string) => supportApi.addNote(id, text), onSuccess: show }),
    reply: useMutation({ mutationFn: (text: string) => supportApi.reply(id, text), onSuccess: show }),
    // REPLY_ALREADY_SENT / REPLY_NOT_FOUND: read the ticket again to show where the reply is.
    retry: useMutation({
      mutationFn: (replyId: string) => supportApi.retryReply(id, replyId),
      onSuccess: show,
      onError: reread,
    }),
  };
}
