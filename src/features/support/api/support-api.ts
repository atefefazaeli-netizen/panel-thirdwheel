import { api, ApiError, normalizePage, type Paginated } from '@/lib/api';
import type {
  Assignee,
  DeliveryProviderStatus,
  SupportTicket,
  SupportTicketDetail,
  TicketPriority,
  TicketQuery,
  TicketStatus,
} from './types';

const t = (id: string) => `support/tickets/${encodeURIComponent(id)}`;

export const supportApi = {
  list: async (q: TicketQuery): Promise<Paginated<SupportTicket>> =>
    normalizePage(await api.get('support/tickets', { query: { ...q } })),
  get: (id: string) => api.get<SupportTicketDetail>(t(id)),
  /**
   * One ticket for the ticket page and deep links (`/support/<id>` from support.ticket.created
   * webhooks), however old. Null when it no longer exists (404 TICKET_NOT_FOUND, or an id that is
   * not a ticket id at all); other errors are thrown.
   */
  async find(id: string): Promise<SupportTicketDetail | null> {
    try {
      return await supportApi.get(id);
    } catch (e) {
      if (e instanceof ApiError && (e.code === 'TICKET_NOT_FOUND' || e.status === 404 || e.status === 400)) return null;
      throw e;
    }
  },
  /** The screenshot, fetched with the session cookie (kept only while the ticket is open). */
  screenshot: (id: string) => api.blob(`${t(id)}/screenshot`),
  assignees: () => api.get<Assignee[]>('support/assignees'),
  deliveryStatus: () => api.get<DeliveryProviderStatus>('support/delivery-status'),
  // Every write answers the ticket with its timeline (TicketDetailView).
  setStatus: (id: string, status: TicketStatus, expectedVersion: number) =>
    api.put<SupportTicketDetail>(`${t(id)}/status`, { status, expectedVersion }),
  setAssignee: (id: string, staffId: string | null, expectedVersion: number) =>
    api.put<SupportTicketDetail>(`${t(id)}/assignee`, { staffId, expectedVersion }),
  setPriority: (id: string, priority: TicketPriority, expectedVersion: number) =>
    api.put<SupportTicketDetail>(`${t(id)}/priority`, { priority, expectedVersion }),
  addNote: (id: string, text: string) => api.post<SupportTicketDetail>(`${t(id)}/notes`, { text }),
  reply: (id: string, text: string) => api.post<SupportTicketDetail>(`${t(id)}/replies`, { text }),
  retryReply: (id: string, replyId: string) =>
    api.post<SupportTicketDetail>(`${t(id)}/replies/${encodeURIComponent(replyId)}/retry`),
};
