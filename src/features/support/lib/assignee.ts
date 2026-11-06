import type { Assignee, SupportTicket } from '../api/types';

/** The assignee's name: from the ticket when the API sends it, else from support/assignees. */
export const assigneeName = (t: Pick<SupportTicket, 'assigneeId' | 'assigneeName'>, people: Assignee[] | undefined) =>
  t.assigneeId ? (t.assigneeName ?? people?.find((p) => p.id === t.assigneeId)?.displayName ?? 'Someone') : null;
