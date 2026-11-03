// ADMIN_API.md › Dashboard (admin/stats) and Audit (admin/audit). admin/me lives in auth.ts.
import { http, HttpResponse } from 'msw';
import { db } from '../db';
import { guard } from '../session';
import { p, paginate } from '../utils';

const DAY = 86_400_000;

export const adminHandlers = [
  http.get(p('admin/stats'), ({ request }) =>
    guard(request, 'staff', () => {
      const d = db();
      const users = [...d.users.values()];
      const items = [...d.content.items.values()];
      const flags = d.safety.flags;
      const open = flags.filter((f) => f.status === 'open');
      const since = (iso: string | null, ms: number) => !!iso && Date.now() - Date.parse(iso) <= ms;
      return HttpResponse.json({
        accounts: users.length,
        signups7d: users.filter((u) => since(u.account.createdAt, 7 * DAY)).length,
        suspended: users.filter((u) => u.account.suspended).length,
        couples: new Set(users.map((u) => u.couple?.coupleId).filter(Boolean)).size,
        plus: users.filter((u) => u.subscription.plus).length,
        grants: users.filter((u) => u.subscription.grant).length,
        content: {
          live: items.filter((i) => !i.retired && i.liveVersion > 0).length,
          inReview: items.filter((i) => !i.retired && i.draft?.state === 'in_review').length,
          changesRequested: items.filter((i) => !i.retired && i.draft?.state === 'changes_requested').length,
          retired: items.filter((i) => i.retired).length,
        },
        safety: {
          open: open.length,
          openHigh: open.filter((f) => f.level === 'high').length,
          last24h: flags.filter((f) => since(f.lastAt, DAY)).length,
        },
        support: { open: d.support.tickets.filter((t) => t.status === 'open').length },
        webhooks: {
          failed24h: d.integrations.deliveries.filter((x) => x.status === 'failed' && since(x.createdAt, DAY)).length,
        },
      });
    }),
  ),

  http.get(p('admin/audit'), ({ request }) =>
    guard(request, 'admin', () => {
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
