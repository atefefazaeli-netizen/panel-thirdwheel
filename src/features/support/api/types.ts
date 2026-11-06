// Support workflow (STAFF_API.md §5): statuses, priority, assignment, internal notes, replies with
// delivery status, optimistic concurrency (`version`, 409 TICKET_CONFLICT).

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
  assigneeId: string | null;
  /** The assignee's display name when the API sends it (else looked up in support/assignees). */
  assigneeName?: string | null;
  /** Send back as `expectedVersion` on status, assignee and priority changes. */
  version: number;
  createdAt: string;
  updatedAt?: string;
}

export type DeliveryStatus = 'pending' | 'sent' | 'failed';

export interface ReplyDelivery {
  status: DeliveryStatus;
  provider: string | null;
  attempts: number;
  /** `NO_EMAIL_PROVIDER` while no email provider is configured. */
  lastError: string | null;
  sentAt: string | null;
}

interface EventBase {
  id: string;
  at: string;
  /** `staff:<id>`, or null for the app user's own events (created). */
  by: string | null;
  byName?: string | null;
}

export type TimelineEvent =
  | (EventBase & { type: 'created' })
  | (EventBase & { type: 'status'; from: TicketStatus | null; to: TicketStatus })
  | (EventBase & {
      type: 'assignee';
      from: string | null;
      to: string | null;
      fromName?: string | null;
      toName?: string | null;
    })
  | (EventBase & { type: 'priority'; from: TicketPriority | null; to: TicketPriority })
  | (EventBase & { type: 'note'; text: string })
  | (EventBase & { type: 'reply'; text: string; delivery: ReplyDelivery });

export interface SupportTicketDetail extends SupportTicket {
  /** Oldest first. Never includes the user's email address. */
  timeline: TimelineEvent[];
}

export interface Assignee {
  id: string;
  displayName: string;
}

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
