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

/** Why a reply is not sent yet, in words. The API sends codes, never a provider's message. */
export function deliveryProblem(lastError: string | null): string | null {
  switch (lastError) {
    case null:
    case undefined:
    case '':
      return null;
    case 'NO_EMAIL_PROVIDER':
      return 'No email provider is configured: this reply stays pending until one is set up.';
    case 'NO_RECIPIENT':
      return 'The account has no email address, so the reply cannot be sent.';
    case 'SEND_FAILED':
      return 'The email provider did not accept the reply. The server tries again; you can also retry.';
    default:
      return 'The reply could not be sent.';
  }
}

export const NO_PROVIDER_COPY =
  'No email provider is configured: replies stay pending until one is set up. Nothing reaches the user until then.';
