import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { customRoleProblems } from '@/lib/permissions';
import { db } from '@/mocks/db';
import { server } from '@/mocks/node';
import { p } from '@/mocks/utils';
import { renderRoute } from '@/test/utils';
import { roleSchema } from '../schemas/staff';

describe('custom role rules (mirrors customRoleProblems)', () => {
  it('needs a valid key, a name and at least one non-owner permission from the catalog', () => {
    const ok = roleSchema.safeParse({
      key: 'night_shift',
      name: 'Night shift',
      description: '',
      permissions: ['support.read'],
    });
    expect(ok.success).toBe(true);
    const bad = (v: object) =>
      roleSchema.safeParse({ key: 'night_shift', name: 'N', description: '', permissions: ['support.read'], ...v });
    expect(bad({ key: '1abc' }).success).toBe(false);
    expect(bad({ key: 'ab' }).success).toBe(false);
    expect(bad({ key: 'Night' }).success).toBe(false);
    expect(bad({ permissions: [] }).error?.issues[0]?.message).toBe('Choose at least one permission.');
    expect(bad({ permissions: ['staff.manage'] }).error?.issues[0]?.message).toBe(
      'Only the Owner role can hold staff.manage.',
    );
    expect(bad({ permissions: ['users.everything'] }).error?.issues[0]?.message).toBe(
      'Unknown permission: users.everything',
    );
    expect(customRoleProblems(['roles.manage', 'staff.read'])).toHaveLength(2);
  });
});

describe('roles page (Owner, mock API)', () => {
  it('built-in roles are read-only with holder counts; custom roles have Edit and Delete', async () => {
    renderRoute('/staff/roles', { roles: ['owner'] });
    const owner = await screen.findByTestId('role-owner');
    expect(within(owner).getByText('Built-in')).toBeInTheDocument();
    expect(within(owner).queryByRole('button', { name: 'Edit' })).toBeNull();
    expect(within(owner).getByText(/holders?$/)).toBeInTheDocument();
    const lead = screen.getByTestId('role-support_lead');
    expect(within(lead).getByText('1 holder')).toBeInTheDocument();
    expect(within(lead).getByRole('button', { name: 'Edit' })).toBeInTheDocument();
    // In use: delete is disabled with the reason.
    expect(within(lead).getByRole('button', { name: 'Delete' })).toBeDisabled();
    expect(within(screen.getByTestId('role-qa_reader')).getByRole('button', { name: 'Delete' })).toBeEnabled();
  });

  it('creates a custom role from the catalog grouped by area; owner-only permissions cannot be picked', async () => {
    const user = userEvent.setup();
    renderRoute('/staff/roles', { roles: ['owner'] });
    await user.click(await screen.findByRole('button', { name: 'New custom role' }));
    const dialog = await screen.findByRole('dialog', { name: 'New custom role' });
    expect(within(dialog).getByText('Support', { selector: 'legend' })).toBeInTheDocument();
    expect(within(dialog).getByRole('checkbox', { name: 'List staff accounts and roles' })).toBeDisabled();
    expect(within(dialog).getByRole('checkbox', { name: 'Create and change custom roles' })).toBeDisabled();

    await user.type(within(dialog).getByLabelText('Key'), 'Night');
    await user.type(within(dialog).getByLabelText('Name'), 'Night shift');
    await user.click(within(dialog).getByRole('button', { name: 'Create role' }));
    expect(await within(dialog).findByText(/Start with a letter/)).toBeInTheDocument();
    expect(within(dialog).getByText('Choose at least one permission.')).toBeInTheDocument();

    await user.clear(within(dialog).getByLabelText('Key'));
    await user.type(within(dialog).getByLabelText('Key'), 'night_shift');
    await user.click(within(dialog).getByRole('checkbox', { name: 'Read support tickets and their history' }));
    await user.click(within(dialog).getByRole('checkbox', { name: 'Add internal notes (never sent to the user)' }));
    await user.click(within(dialog).getByRole('button', { name: 'Create role' }));
    await waitFor(() =>
      expect(db().staff.customRoles.find((r) => r.key === 'night_shift')).toMatchObject({
        name: 'Night shift',
        permissions: ['support.read', 'support.note'],
      }),
    );
    expect(await screen.findByTestId('role-night_shift')).toBeInTheDocument();
  });

  it('server refusals read clearly: INVALID_PERMISSIONS, ROLE_IN_USE, BUILTIN_ROLE', async () => {
    const user = userEvent.setup();
    server.use(
      http.delete(p('admin/roles/:key'), () =>
        HttpResponse.json({ statusCode: 409, message: 'x', code: 'ROLE_IN_USE' }, { status: 409 }),
      ),
      http.patch(p('admin/roles/:key'), () =>
        HttpResponse.json(
          {
            statusCode: 400,
            message: 'x',
            code: 'INVALID_PERMISSIONS',
            details: ['Only the Owner role can hold staff.read.'],
          },
          { status: 400 },
        ),
      ),
    );
    renderRoute('/staff/roles', { roles: ['owner'] });
    const qa = await screen.findByTestId('role-qa_reader');
    await user.click(within(qa).getByRole('button', { name: 'Delete' }));
    const confirm = await screen.findByRole('alertdialog');
    await user.click(within(confirm).getByRole('button', { name: 'Delete role' }));
    // The confirm stays open after a refusal; the role is still there.
    await waitFor(() => expect(within(confirm).getByRole('button', { name: 'Delete role' })).toBeEnabled());
    expect(db().staff.customRoles.some((r) => r.key === 'qa_reader')).toBe(true);

    const { errorMessage, ApiError } = await import('@/lib/api');
    expect(errorMessage(new ApiError('http', { status: 409, body: { code: 'ROLE_IN_USE' } }))).toMatch(
      /Someone still holds this role/,
    );
    expect(errorMessage(new ApiError('http', { status: 409, body: { code: 'BUILTIN_ROLE' } }))).toBe(
      'Built-in roles cannot be changed or deleted.',
    );
  });

  it('the mock enforces the rules too: built-ins are fixed, a held role cannot go, owner-only is refused', async () => {
    const { api } = await import('@/lib/api');
    renderRoute('/staff/roles', { roles: ['owner'] });
    await screen.findByTestId('role-owner');
    const codeOf = (p: Promise<unknown>) => p.then(() => null).catch((e: { code: string }) => e.code);
    expect(await codeOf(api.patch('admin/roles/analyst', { name: 'x' }))).toBe('BUILTIN_ROLE');
    expect(await codeOf(api.delete('admin/roles/support_lead'))).toBe('ROLE_IN_USE');
    expect(
      await codeOf(api.post('admin/roles', { key: 'sneaky', name: 'Sneaky', permissions: ['staff.manage'] })),
    ).toBe('INVALID_PERMISSIONS');
  });
});
