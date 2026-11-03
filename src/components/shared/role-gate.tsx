import * as React from 'react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { canAccess, useSession, type StaffRole } from '@/stores/session';

export interface RoleGateProps {
  /** Roles that may use the children (any of them). */
  allow: StaffRole | StaffRole[];
  /** hide (default): render nothing (or `fallback`). disable: render the child disabled with a hint. */
  mode?: 'hide' | 'disable';
  fallback?: React.ReactNode;
  /** Hint shown on the disabled control. */
  reason?: string;
  children: React.ReactNode;
}

const defaultReason = (allow: StaffRole[]) =>
  allow.length === 1 ? `${allow[0] === 'admin' ? 'Admins' : 'Clinicians'} only` : 'Not available for your role';

/** Hides or disables UI by staff role (ADMIN_API.md › Roles). The API enforces the same rules. */
export function RoleGate({ allow, mode = 'hide', fallback = null, reason, children }: RoleGateProps) {
  const user = useSession((s) => s.user);
  const roles = Array.isArray(allow) ? allow : [allow];
  if (canAccess(user, roles)) return <>{children}</>;
  if (mode === 'hide') return <>{fallback}</>;

  const hint = reason ?? defaultReason(roles);
  const disabled = React.Children.map(children, (child) =>
    React.isValidElement<{ disabled?: boolean; 'aria-disabled'?: boolean }>(child)
      ? React.cloneElement(child, { disabled: true, 'aria-disabled': true })
      : child,
  );
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {/* A disabled button fires no pointer events; the wrapper carries the tooltip. */}
        <span tabIndex={0} className="inline-flex cursor-not-allowed rounded-md" aria-label={hint} data-role-gated="">
          {disabled}
        </span>
      </TooltipTrigger>
      <TooltipContent>{hint}</TooltipContent>
    </Tooltip>
  );
}
