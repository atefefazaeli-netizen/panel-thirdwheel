import type { DeliveryStatus, TicketPriority, TicketStatus } from '../api/types';

export const STATUS_LABEL: Record<TicketStatus, string> = {
  open: 'Open',
  in_progress: 'In progress',
  waiting_for_user: 'Waiting for user',
  resolved: 'Resolved',
  closed: 'Closed',
};

export const PRIORITY_LABEL: Record<TicketPriority, string> = {
  low: 'Low',
  normal: 'Normal',
  high: 'High',
  urgent: 'Urgent',
};

export const DELIVERY_LABEL: Record<DeliveryStatus, string> = {
  pending: 'Pending',
  sent: 'Sent',
  failed: 'Failed',
};

/** Why a reply is not sent yet, in words. */
export function deliveryProblem(lastError: string | null): string | null {
  if (!lastError) return null;
  if (lastError === 'NO_EMAIL_PROVIDER')
    return 'No email provider is configured: this reply stays pending until one is set up.';
  return lastError;
}

export const NO_PROVIDER_COPY =
  'No email provider is configured: replies stay pending until one is set up. Nothing reaches the user until then.';
