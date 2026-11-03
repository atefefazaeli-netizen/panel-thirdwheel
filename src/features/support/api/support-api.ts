import { api, normalizePage, type Paginated } from '@/lib/api';
import type { SupportTicket, TicketQuery, TicketStatus } from './types';

const t = (id: string) => `support/tickets/${encodeURIComponent(id)}`;

export const supportApi = {
  list: async (q: TicketQuery): Promise<Paginated<SupportTicket>> =>
    normalizePage(await api.get('support/tickets', { query: { ...q } })),
  setStatus: (id: string, status: TicketStatus) => api.put<SupportTicket>(`${t(id)}/status`, { status }),
  /** The screenshot, fetched with the bearer token (an <img src> could not send it). */
  screenshot: (id: string) => api.blob(`${t(id)}/screenshot`),
  /** There is no single-ticket route: look through the newest pages for it (deep links). */
  async find(id: string): Promise<SupportTicket | null> {
    for (let page = 1; page <= 5; page++) {
      const p = await supportApi.list({ page, limit: 100 });
      const hit = p.items.find((x) => x.id === id);
      if (hit) return hit;
      if (page >= p.meta.totalPages) break;
    }
    return null;
  },
};
