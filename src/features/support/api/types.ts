// The support module's admin routes (backend support.controller.ts, AdminTicketView):
// list, one ticket (GET support/tickets/:id), status and screenshot. There are no replies,
// internal notes, assignment or priority: support replies by email (open product decisions).

export type TicketStatus = 'open' | 'closed';
export type TicketKind = 'message' | 'problem';

export interface SupportTicket {
  id: string;
  ref: string;
  userId: string;
  kind: TicketKind;
  /** Contact support only; problem reports have no topic. */
  topic: 'Account' | 'Subscription' | 'Bookings' | 'Something else' | null;
  text: string;
  device: { app: string | null; os: string | null; model: string | null } | null;
  hasScreenshot: boolean;
  status: TicketStatus;
  createdAt: string;
}

export interface TicketQuery {
  status?: TicketStatus;
  page?: number;
  limit?: number;
}
