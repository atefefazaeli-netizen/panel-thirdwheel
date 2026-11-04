import { api, ApiError, normalizePage, type Paginated } from '@/lib/api';
import type { SupportTicket, TicketQuery, TicketStatus } from './types';

const t = (id: string) => `support/tickets/${encodeURIComponent(id)}`;

export const supportApi = {
  list: async (q: TicketQuery): Promise<Paginated<SupportTicket>> =>
    normalizePage(await api.get('support/tickets', { query: { ...q } })),
  setStatus: (id: string, status: TicketStatus) => api.put<SupportTicket>(`${t(id)}/status`, { status }),
  /** The screenshot, fetched with the bearer token (an <img src> could not send it). */
  screenshot: (id: string) => api.blob(`${t(id)}/screenshot`),
  get: (id: string) => api.get<SupportTicket>(t(id)),
  /**
   * One ticket for the drawer and deep links (`/support/<id>` from support.ticket.created
   * webhooks), however old. Null when it no longer exists (404 TICKET_NOT_FOUND, or an id that is
   * not a ticket id at all); other errors are thrown.
   */
  async find(id: string): Promise<SupportTicket | null> {
    try {
      return await supportApi.get(id);
    } catch (e) {
      if (e instanceof ApiError && (e.code === 'TICKET_NOT_FOUND' || e.status === 404 || e.status === 400)) return null;
      throw e;
    }
  },
};
