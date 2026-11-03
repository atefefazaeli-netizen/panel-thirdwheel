// Existing support admin routes (backend support.controller.ts): inbox, status, screenshot.
import { http, HttpResponse } from 'msw';
import { screenshotSvg } from '../data/support';
import { db } from '../db';
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

  http.put(p('support/tickets/:id/status'), ({ request, params }) =>
    guard(request, 'admin', async () => {
      const t = find(params.id);
      if (!t) return apiError(404, 'Ticket not found');
      const { status } = await readJson<{ status?: string }>(request);
      if (status !== 'open' && status !== 'closed')
        return badRequest('status must be one of the following values: open, closed');
      t.status = status;
      return HttpResponse.json(t);
    }),
  ),

  // The real API streams the stored jpeg/png/webp/heic; the mock draws a placeholder.
  http.get(p('support/tickets/:id/screenshot'), ({ request, params }) =>
    guard(request, 'admin', () => {
      const t = find(params.id);
      if (!t?.hasScreenshot) return apiError(404, 'No screenshot');
      return new HttpResponse(screenshotSvg(t), {
        headers: { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'private, no-store' },
      });
    }),
  ),
];
