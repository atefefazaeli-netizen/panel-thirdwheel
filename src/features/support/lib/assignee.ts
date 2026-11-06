import type { Assignee, SupportTicket } from '../api/types';

/** The assignee's name: the ticket's `assigneeName`, else the name from support/assignees. */
export const assigneeName = (t: Pick<SupportTicket, 'assignee' | 'assigneeName'>, people: Assignee[] | undefined) =>
  t.assignee ? (t.assigneeName ?? people?.find((p) => p.id === t.assignee)?.displayName ?? 'Someone') : null;
