import { daysAgo, oid } from '../utils';
import { staffId } from './staff';
import { uid } from './users';

export interface AuditEntry {
  id: string;
  actor: string;
  actorEmail: string | null;
  actorName?: string | null;
  action: string;
  target: string;
  meta: Record<string, unknown>;
  at: string;
}

export function seedAudit(): AuditEntry[] {
  const rows: Omit<AuditEntry, 'id'>[] = [
    {
      actor: `staff:${staffId('editor')}`,
      actorEmail: null,
      actorName: 'Huda Karim',
      action: 'content.submit',
      target: 'content:my-perfect-day',
      meta: { note: 'Reworded card 3' },
      at: daysAgo(0, 3),
    },
    {
      actor: `staff:${staffId('reviewer')}`,
      actorEmail: null,
      actorName: 'Dr. Noor Rahman',
      action: 'content.request_changes',
      target: 'content:money-date-30-minutes',
      meta: {},
      at: daysAgo(1, 2),
    },
    {
      actor: `staff:${staffId('editor')}`,
      actorEmail: null,
      actorName: 'Huda Karim',
      action: 'user.plus_grant',
      target: `user:${uid('sara')}`,
      meta: { days: 30 },
      at: daysAgo(2),
    },
    {
      actor: 'apikey:n8n-sheets',
      actorEmail: null,
      action: 'content.import',
      target: 'content:import',
      meta: { created: 1, updated: 2, rejected: 0, source: 'n8n' },
      at: daysAgo(3),
    },
    {
      actor: `staff:${staffId('editor')}`,
      actorEmail: null,
      actorName: 'Huda Karim',
      action: 'webhook.create',
      target: `webhook:${oid('wh:crisis')}`,
      meta: { events: ['crisis.alert'] },
      at: daysAgo(6),
    },
    {
      actor: `staff:${staffId('reviewer')}`,
      actorEmail: null,
      actorName: 'Dr. Noor Rahman',
      action: 'safety.review',
      target: `safety_flag:${oid('flag:4')}`,
      meta: {},
      at: daysAgo(4),
    },
    {
      actor: `staff:${staffId('editor')}`,
      actorEmail: null,
      actorName: 'Huda Karim',
      action: 'ai.settings.update',
      target: 'ai-settings:3',
      meta: { version: 3 },
      at: daysAgo(5),
    },
    {
      actor: `staff:${staffId('editor')}`,
      actorEmail: null,
      actorName: 'Huda Karim',
      action: 'user.suspend',
      target: `user:${uid('sam')}`,
      meta: { reason: 'Spam sign-ups' },
      at: daysAgo(8),
    },
  ];
  return rows.map((r, i) => ({ id: `aud_${String(i + 1).padStart(4, '0')}`, ...r }));
}
