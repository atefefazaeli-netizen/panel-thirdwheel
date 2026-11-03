import type { ApiKeyScope, DeliveryEvent } from '../api/types';

export const EVENT_LABEL: Record<DeliveryEvent, string> = {
  'crisis.alert': 'Crisis alert',
  'support.ticket.created': 'Support ticket created',
  'content.published': 'Content published',
  'user.subscription.changed': 'Subscription changed',
  ping: 'Test ping',
};

export const EVENT_HELP: Record<Exclude<DeliveryEvent, 'ping'>, string> = {
  'crisis.alert': 'High and medium safety flags, and every escalation. Metadata only.',
  'support.ticket.created': 'A new Contact support message or problem report.',
  'content.published': 'Content went live, rolled back, unpublished or restored.',
  'user.subscription.changed': 'A plan changed (store, grant or partner).',
};

export const SCOPE_LABEL: Record<ApiKeyScope, string> = {
  'users.flag': 'users.flag: suspend, unsuspend and tag accounts',
  'content.import': 'content.import: send drafts for review',
};
