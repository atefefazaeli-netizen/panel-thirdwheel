import { screen, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { server } from '@/mocks/node';
import { p } from '@/mocks/utils';
import { renderRoute } from '@/test/utils';

const card = (label: string) => screen.getByText(label).closest('[data-slot=card]') as HTMLElement;

describe('dashboard (mock API)', () => {
  it('shows the stats and the three previews for an admin', async () => {
    renderRoute('/', { roles: ['admin', 'clinician'] });
    expect(await screen.findByText('My perfect day')).toBeInTheDocument();
    expect(within(card('Waiting for review')).getByText('2')).toBeInTheDocument();
    expect(await screen.findByText('Failed webhook deliveries')).toBeInTheDocument();
    expect(await screen.findByText('priya@example.com')).toBeInTheDocument();
  });

  it('shows "Not available" for a part of admin/stats that failed (null)', async () => {
    server.use(
      http.get(p('admin/stats'), () =>
        HttpResponse.json({
          accounts: 34,
          signups7d: 3,
          suspended: 1,
          couples: 9,
          plus: null,
          grants: null,
          content: null,
          safety: { open: 4, openHigh: 1, last24h: 2 },
          support: { open: 3 },
          webhooks: null,
        }),
      ),
    );
    renderRoute('/', { roles: ['admin'] });
    expect(await screen.findByText('34')).toBeInTheDocument();
    expect(within(card('Plus')).getByText('Not available')).toBeInTheDocument();
    expect(within(card('Live content')).getByText('Not available')).toBeInTheDocument();
    expect(within(card('Failed webhooks (24 h)')).getByText('Not available')).toBeInTheDocument();
    expect(within(card('Open safety flags')).getByText('4')).toBeInTheDocument();
  });

  it('clinicians do not get the deliveries preview', async () => {
    renderRoute('/', { roles: ['clinician'] });
    expect(await screen.findByText('Drafts waiting for a clinician.')).toBeInTheDocument();
    expect(screen.queryByText('Failed webhook deliveries')).toBeNull();
  });

  it('puts counts on the sidebar', async () => {
    renderRoute('/', { roles: ['admin', 'clinician'] });
    expect(await screen.findByLabelText('2 waiting')).toBeInTheDocument();
  });
});
