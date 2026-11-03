import { screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Button } from '@/components/ui/button';
import { useSession } from '@/stores/session';
import { renderWithProviders } from '@/test/utils';
import { RoleGate } from './role-gate';

const as = (roles: string[]) => useSession.getState().signIn({ userId: 'u', email: 'x@thirdwheel.app', roles });

describe('RoleGate', () => {
  afterEach(() => useSession.setState({ status: 'unknown', user: null }));

  it('renders children for an allowed role', () => {
    as(['admin']);
    renderWithProviders(
      <RoleGate allow="admin">
        <Button>Suspend</Button>
      </RoleGate>,
    );
    expect(screen.getByRole('button', { name: 'Suspend' })).toBeEnabled();
  });

  it('hides children (or shows the fallback) for other roles', () => {
    as(['clinician']);
    renderWithProviders(
      <RoleGate allow="admin" fallback={<p>Read only</p>}>
        <Button>Suspend</Button>
      </RoleGate>,
    );
    expect(screen.queryByRole('button', { name: 'Suspend' })).toBeNull();
    expect(screen.getByText('Read only')).toBeInTheDocument();
  });

  it('accepts any of several roles', () => {
    as(['clinician']);
    renderWithProviders(
      <RoleGate allow={['admin', 'clinician']}>
        <Button>Review</Button>
      </RoleGate>,
    );
    expect(screen.getByRole('button', { name: 'Review' })).toBeInTheDocument();
  });

  it('disables with a hint in disable mode', () => {
    as(['admin']);
    renderWithProviders(
      <RoleGate allow="clinician" mode="disable">
        <Button>Approve and publish</Button>
      </RoleGate>,
    );
    expect(screen.getByRole('button', { name: 'Approve and publish' })).toBeDisabled();
    expect(screen.getByLabelText('Clinicians only')).toBeInTheDocument();
  });

  it('shows nothing when signed out', () => {
    renderWithProviders(
      <RoleGate allow={['admin', 'clinician']}>
        <Button>Anything</Button>
      </RoleGate>,
    );
    expect(screen.queryByRole('button')).toBeNull();
  });
});
