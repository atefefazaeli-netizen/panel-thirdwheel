// The support module's existing admin routes (backend support.controller.ts, AdminTicketView).

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
