import { daysAgo } from '../utils';
import { uid } from './users';

export interface AuditEntry {
  id: string;
  actor: string;
  actorEmail: string | null;
  action: string;
  target: string;
  meta: Record<string, unknown>;
  at: string;
}

export function seedAudit(): AuditEntry[] {
  const rows: Omit<AuditEntry, 'id'>[] = [
    {
      actor: uid('lead'),
      actorEmail: 'lead@thirdwheel.app',
      action: 'content.submit',
      target: 'content:my-perfect-day',
      meta: { note: 'Reworded card 3' },
      at: daysAgo(0, 3),
    },
    {
      actor: uid('doctor'),
      actorEmail: 'dr.noor@thirdwheel.app',
      action: 'content.request_changes',
      target: 'content:money-date-30-minutes',
      meta: {},
      at: daysAgo(1, 2),
    },
    {
      actor: uid('lead'),
      actorEmail: 'lead@thirdwheel.app',
      action: 'user.plus_grant',
      target: `user:${uid('sara')}`,
      meta: { days: 30 },
      at: daysAgo(2),
    },
    {
      actor: 'apikey:n8n-sheets',
      actorEmail: null,
      action: 'content.import',
      target: 'content:*',
      meta: { created: 1, updated: 2 },
      at: daysAgo(3),
    },
    {
      actor: uid('lead'),
      actorEmail: 'lead@thirdwheel.app',
      action: 'webhook.create',
      target: 'webhook:wh_crisis',
      meta: { events: ['crisis.alert'] },
      at: daysAgo(6),
    },
    {
      actor: uid('doctor'),
      actorEmail: 'dr.noor@thirdwheel.app',
      action: 'safety.review',
      target: 'flag:flg_0003',
      meta: {},
      at: daysAgo(4),
    },
    {
      actor: uid('lead'),
      actorEmail: 'lead@thirdwheel.app',
      action: 'ai.settings_update',
      target: 'ai:settings',
      meta: { version: 3 },
      at: daysAgo(5),
    },
    {
      actor: uid('lead'),
      actorEmail: 'lead@thirdwheel.app',
      action: 'user.suspend',
      target: `user:${uid('sam')}`,
      meta: { reason: 'Spam sign-ups' },
      at: daysAgo(8),
    },
  ];
  return rows.map((r, i) => ({ id: `aud_${String(i + 1).padStart(4, '0')}`, ...r }));
}
