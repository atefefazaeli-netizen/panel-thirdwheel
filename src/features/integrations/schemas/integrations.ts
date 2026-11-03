import { z } from 'zod';
import { optionalEnum, optionalString, pageSearch } from '@/lib/search';

export const integrationsSearchSchema = z.object({
  tab: optionalEnum(['webhooks', 'deliveries', 'api-keys', 'verify']),
  webhookId: optionalString,
  event: optionalEnum([
    'crisis.alert',
    'support.ticket.created',
    'content.published',
    'user.subscription.changed',
    'ping',
  ]),
  status: optionalEnum(['pending', 'delivered', 'failed']),
  delivery: optionalString,
  ...pageSearch,
});
export type IntegrationsSearch = z.infer<typeof integrationsSearchSchema>;

/** URL rules the server checks (400 WEBHOOK_URL_INVALID): http(s), no user name or password, ≤ 2000. */
export function webhookUrlProblem(raw: string): string | null {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return 'Enter a full URL, like https://n8n.example.com/webhook/thirdwheel.';
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return 'Use an http or https URL.';
  if (u.username || u.password) return 'No user name or password in the URL.';
  if (raw.length > 2000) return 'At most 2000 characters.';
  return null;
}

export const webhookSchema = z.object({
  name: z.string().trim().min(1, 'Give it a name.').max(80, 'At most 80 characters.'),
  url: z
    .string()
    .trim()
    .superRefine((v, ctx) => {
      const p = webhookUrlProblem(v);
      if (p) ctx.addIssue({ code: 'custom', message: p });
    }),
  events: z
    .array(z.enum(['crisis.alert', 'support.ticket.created', 'content.published', 'user.subscription.changed']))
    .min(1, 'Pick at least one event.'),
  enabled: z.boolean(),
});
export type WebhookForm = z.infer<typeof webhookSchema>;

export const apiKeySchema = z.object({
  name: z.string().trim().min(1, 'Give it a name.').max(80, 'At most 80 characters.'),
  scopes: z.array(z.enum(['users.flag', 'content.import'])).min(1, 'Pick at least one scope.'),
});
