// Support admin routes (backend support.controller.ts): inbox, one ticket, status, screenshot.
import { http, HttpResponse } from 'msw';
import { screenshotSvg } from '../data/support';
import { db, recordAudit } from '../db';
import { guard } from '../session';
import { apiError, badRequest, p, paginate, readJson } from '../utils';

const find = (id: unknown) => db().support.tickets.find((t) => t.id === String(id));

export const supportHandlers = [
  http.get(p('support/tickets'), ({ request }) =>
    guard(request, 'admin', () => {
      const url = new URL(request.url);
      const status = url.searchParams.get('status');
      if (status && status !== 'open' && status !== 'closed')
        return badRequest('status must be one of the following values: open, closed');
      const rows = db()
        .support.tickets.filter((t) => !status || t.status === status)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      return HttpResponse.json(paginate(rows, url));
    }),
  ),

  http.get(p('support/tickets/:id'), ({ request, params }) =>
    guard(request, 'admin', () => {
      if (!/^[a-f0-9]{24}$/.test(String(params.id))) return badRequest('id must be a mongodb id');
      const t = find(params.id);
      if (!t) return apiError(404, 'No support ticket with that id', 'TICKET_NOT_FOUND');
      return HttpResponse.json(t);
    }),
  ),

  http.put(p('support/tickets/:id/status'), ({ request, params }) =>
    guard(request, 'admin', async (me) => {
      const t = find(params.id);
      if (!t) return apiError(404, 'No support ticket with that id', 'TICKET_NOT_FOUND');
      const { status } = await readJson<{ status?: string }>(request);
      if (status !== 'open' && status !== 'closed')
        return badRequest('status must be one of the following values: open, closed');
      t.status = status;
      recordAudit(me, 'support.ticket_status', `support_ticket:${t.id}`, { userId: t.userId, status });
      return HttpResponse.json(t);
    }),
  ),

  // The real API streams the stored jpeg/png/webp/heic; the mock draws a placeholder.
  http.get(p('support/tickets/:id/screenshot'), ({ request, params }) =>
    guard(request, 'admin', () => {
      const t = find(params.id);
      if (!t) return apiError(404, 'No support ticket with that id', 'TICKET_NOT_FOUND');
      if (!t.hasScreenshot) return apiError(404, 'This ticket has no screenshot', 'SCREENSHOT_NOT_FOUND');
      return new HttpResponse(screenshotSvg(t), {
        headers: { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'private, no-store' },
      });
    }),
  ),
];
