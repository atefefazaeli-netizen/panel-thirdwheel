// ADMIN_API.md › Dashboard (admin/stats) and Audit (admin/audit), with STAFF_API.md §4: each part
// of the stats is null unless the caller also holds that area's read permission.
import { http, HttpResponse } from 'msw';
import { db } from '../db';
import { guard, holds } from '../session';
import { p, paginate } from '../utils';

const DAY = 86_400_000;

export const adminHandlers = [
  http.get(p('admin/stats'), ({ request }) =>
    guard(request, 'dashboard.read', (me) => {
      const d = db();
      const users = [...d.users.values()];
      const items = [...d.content.items.values()];
      const flags = d.safety.flags;
      const open = flags.filter((f) => f.status === 'open');
      const since = (iso: string | null, ms: number) => !!iso && Date.now() - Date.parse(iso) <= ms;
      const users_ = holds(me, 'users.read');
      return HttpResponse.json({
        accounts: users_ ? users.length : null,
        signups7d: users_ ? users.filter((u) => since(u.account.createdAt, 7 * DAY)).length : null,
        suspended: users_ ? users.filter((u) => u.account.suspended).length : null,
        couples: users_ ? new Set(users.map((u) => u.couple?.coupleId).filter(Boolean)).size : null,
        plus: users_ ? users.filter((u) => u.subscription.plus).length : null,
        grants: users_ ? users.filter((u) => u.subscription.grant).length : null,
        content: holds(me, 'content.read')
          ? {
              live: items.filter((i) => !i.retired && i.liveVersion > 0).length,
              inReview: items.filter((i) => !i.retired && i.draft?.state === 'in_review').length,
              changesRequested: items.filter((i) => !i.retired && i.draft?.state === 'changes_requested').length,
              retired: items.filter((i) => i.retired).length,
            }
          : null,
        safety: holds(me, 'safety.read')
          ? {
              open: open.length,
              openHigh: open.filter((f) => f.level === 'high').length,
              last24h: flags.filter((f) => since(f.lastAt, DAY)).length,
            }
          : null,
        support: holds(me, 'support.read')
          ? { open: d.support.tickets.filter((t) => t.status !== 'resolved' && t.status !== 'closed').length }
          : null,
        webhooks: holds(me, 'integrations.read')
          ? {
              failed24h: d.integrations.deliveries.filter((x) => x.status === 'failed' && since(x.createdAt, DAY))
                .length,
            }
          : null,
      });
    }),
  ),

  http.get(p('admin/audit'), ({ request }) =>
    guard(request, 'audit.read', () => {
      const url = new URL(request.url);
      const q = url.searchParams;
      // actor exact; action and target exact or as a prefix ("content." finds every content action).
      const match = (v: string, f: string | null) => !f || v === f || v.startsWith(f);
      const rows = db()
        .audit.filter(
          (a) =>
            (!q.get('actor') || a.actor === q.get('actor')) &&
            match(a.action, q.get('action')) &&
            match(a.target, q.get('target')),
        )
        .sort((a, b) => b.at.localeCompare(a.at));
      return HttpResponse.json(paginate(rows, url));
    }),
  ),
];
