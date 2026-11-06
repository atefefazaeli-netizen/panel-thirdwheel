// The mock API's in-memory database. Every handler reads and writes here; tests call resetDb()
// after each case so state never leaks between them.
import { seedAi, type AiState } from './data/ai';
import { seedAudit, type AuditEntry } from './data/audit';
import { seedContent, type ContentState } from './data/content';
import { seedIntegrations, type IntegrationsState } from './data/integrations';
import { seedLegacy, type LegacyState } from './data/legacy';
import { seedAppConfig, type AppConfigState } from './data/app-config';
import { seedSafety, type SafetyState } from './data/safety';
import { seedStaff, type StaffState } from './data/staff';
import { seedSupport, type SupportState } from './data/support';
import { seedUsers, type MockUser } from './data/users';
import { mockId, nowIso } from './utils';

function createDb() {
  const users = seedUsers();
  const emailOf = (id: string) => users.get(id)?.account.email ?? null;
  return {
    staff: seedStaff() as StaffState,
    appConfig: seedAppConfig() as AppConfigState,
    audit: seedAudit() as AuditEntry[],
    content: seedContent() as ContentState,
    users: users as Map<string, MockUser>,
    safety: seedSafety(emailOf) as SafetyState,
    support: seedSupport() as SupportState,
    ai: seedAi() as AiState,
    integrations: seedIntegrations() as IntegrationsState,
    legacy: seedLegacy() as LegacyState,
  };
}

export type MockDb = ReturnType<typeof createDb>;

let current: MockDb = createDb();

export const db = (): MockDb => current;

export function resetDb(): void {
  current = createDb();
}

/** Every staff or n8n write records an audit entry (STAFF_API.md §8: actor `staff:<id>`). */
export function recordAudit(
  actor: { userId: string; email: string | null; name?: string | null },
  action: string,
  target: string,
  meta: Record<string, unknown> = {},
): void {
  current.audit.unshift({
    id: mockId('aud_'),
    actor: actor.userId,
    actorEmail: actor.email,
    actorName: actor.name ?? null,
    action,
    target,
    meta,
    at: nowIso(),
  });
}
