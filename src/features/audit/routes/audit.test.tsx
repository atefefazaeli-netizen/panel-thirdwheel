import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { db } from '@/mocks/db';
import { renderRoute } from '@/test/utils';

describe('audit log (mock API)', () => {
  it('filters by an action prefix from the URL', async () => {
    renderRoute('/audit?action=content.', { roles: ['admin'] });
    const table = await screen.findByRole('table', { name: 'Audit log' });
    const expected = db().audit.filter((a) => a.action.startsWith('content.')).length;
    await waitFor(() => expect(within(table).getAllByRole('row')).toHaveLength(1 + expected));
    expect(within(table).getByText('apikey:n8n-sheets')).toBeInTheDocument();
  });

  it('is admin only', async () => {
    renderRoute('/audit', { roles: ['clinician'] });
    expect(await screen.findByText('Not available for your role')).toBeInTheDocument();
  });
});
