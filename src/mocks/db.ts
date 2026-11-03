// The mock API's in-memory database. Every handler reads and writes here; tests call resetDb()
// after each case so state never leaks between them.
import { seedAudit, type AuditEntry } from './data/audit';
import { seedAuth, type AuthState } from './data/auth';
import { seedContent, type ContentState } from './data/content';
import { seedSafety, type SafetyState } from './data/safety';
import { seedSupport, type SupportState } from './data/support';
import { seedUsers, type MockUser } from './data/users';
import { mockId, nowIso } from './utils';

function createDb() {
  const users = seedUsers();
  const emailOf = (id: string) => users.get(id)?.account.email ?? null;
  return {
    auth: seedAuth() as AuthState,
    audit: seedAudit() as AuditEntry[],
    content: seedContent() as ContentState,
    users: users as Map<string, MockUser>,
    safety: seedSafety(emailOf) as SafetyState,
    support: seedSupport() as SupportState,
  };
}

export type MockDb = ReturnType<typeof createDb>;

let current: MockDb = createDb();

export const db = (): MockDb => current;

export function resetDb(): void {
  current = createDb();
}

/** Every admin, clinician or n8n write records an audit entry (ADMIN_API.md › Audit). */
export function recordAudit(
  actor: { userId: string; email: string | null },
  action: string,
  target: string,
  meta: Record<string, unknown> = {},
): void {
  current.audit.unshift({
    id: mockId('aud_'),
    actor: actor.userId,
    actorEmail: actor.email,
    action,
    target,
    meta,
    at: nowIso(),
  });
}
