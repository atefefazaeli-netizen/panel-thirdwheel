// Support workflow (STAFF_API.md §5, as built on feature/support-remote-config): statuses,
// priority, assignment, internal notes, replies with delivery status, optimistic concurrency
// (`version`, 409 TICKET_CONFLICT). Shapes follow the backend's TicketView / TicketDetailView.

export const TICKET_STATUSES = ['open', 'in_progress', 'waiting_for_user', 'resolved', 'closed'] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];
export const TICKET_PRIORITIES = ['low', 'normal', 'high', 'urgent'] as const;
export type TicketPriority = (typeof TICKET_PRIORITIES)[number];
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
  priority: TicketPriority;
  /** Staff id of the assignee, or null. */
  assignee: string | null;
  /** The assignee's display name (kept on the ticket, so the list stays readable if they leave). */
  assigneeName: string | null;
  /**
   * Send back as `expectedVersion` on status, assignee and priority changes. Only those bump it:
   * notes and replies never do.
   */
  version: number;
  createdAt: string;
  updatedAt: string;
}

export type DeliveryStatus = 'pending' | 'sent' | 'failed';
export type DeliveryError = 'NO_EMAIL_PROVIDER' | 'NO_RECIPIENT' | 'SEND_FAILED';

export interface ReplyDelivery {
  status: DeliveryStatus;
  provider: string | null;
  attempts: number;
  /** A code, never a provider message: NO_EMAIL_PROVIDER, NO_RECIPIENT or SEND_FAILED. */
  lastError: DeliveryError | string | null;
  sentAt: string | null;
}

interface EventBase {
  id: string;
  at: string;
  /** `staff:<id>`, or `user` for the ticket itself (the created entry). */
  actor: string;
  /** Staff display name at the time; null for the user. */
  actorName: string | null;
}

export type TimelineEvent =
  | (EventBase & { type: 'created' })
  | (EventBase & { type: 'status'; from: TicketStatus; to: TicketStatus })
  | (EventBase & {
      type: 'assignee';
      from: string | null;
      to: string | null;
      fromName: string | null;
      toName: string | null;
    })
  | (EventBase & { type: 'priority'; from: TicketPriority; to: TicketPriority })
  | (EventBase & { type: 'note'; text: string })
  | (EventBase & { type: 'reply'; text: string; delivery: ReplyDelivery });

export interface SupportTicketDetail extends SupportTicket {
  /** Oldest first, at most 500 entries (409 TICKET_TIMELINE_FULL). Never the user's email address. */
  timeline: TimelineEvent[];
}

export interface Assignee {
  id: string;
  displayName: string;
}

/** `GET support/delivery-status`: `{ provider: 'none', canSend: false }` without an email provider. */
export interface DeliveryProviderStatus {
  provider: string;
  canSend: boolean;
}

export interface TicketQuery {
  status?: TicketStatus;
  priority?: TicketPriority;
  /** `me`, `unassigned` or a staff id. */
  assignee?: string;
  userId?: string;
  q?: string;
  page?: number;
  limit?: number;
}
