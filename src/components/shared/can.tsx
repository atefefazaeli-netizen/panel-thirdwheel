import * as React from 'react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import type { Permission } from '@/lib/permissions';
import { useCan } from '@/stores/session';
import { ForbiddenState } from './forbidden-state';

export interface CanProps {
  /** The permission the children need, or several (any of them, or all with `all`). */
  perm: Permission | readonly Permission[];
  all?: boolean;
  /** hide (default): render nothing (or `fallback`). disable: render the child disabled with a hint. */
  mode?: 'hide' | 'disable';
  fallback?: React.ReactNode;
  /** Hint shown on the disabled control. */
  reason?: string;
  children: React.ReactNode;
}

/**
 * Shows, hides or disables UI by the session's permissions (STAFF_API.md §4). The server sends the
 * permissions with the session and enforces them again on every call; this only keeps people from
 * trying. Never decide on role names.
 */
export function Can({ perm, all = false, mode = 'hide', fallback = null, reason, children }: CanProps) {
  const allowed = useCan(perm, all);
  if (allowed) return <>{children}</>;
  if (mode === 'hide') return <>{fallback}</>;

  const hint = reason ?? 'Not available for your role';
  const disabled = React.Children.map(children, (child) =>
    React.isValidElement<{ disabled?: boolean; 'aria-disabled'?: boolean }>(child)
      ? React.cloneElement(child, { disabled: true, 'aria-disabled': true })
      : child,
  );
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {/* A disabled button fires no pointer events; the wrapper carries the tooltip. */}
        <span
          tabIndex={0}
          className="inline-flex cursor-not-allowed rounded-md"
          aria-label={hint}
          data-permission-gated=""
        >
          {disabled}
        </span>
      </TooltipTrigger>
      <TooltipContent>{hint}</TooltipContent>
    </Tooltip>
  );
}

export interface RequirePermissionProps {
  perm: Permission | readonly Permission[];
  all?: boolean;
  /** What the page is, for the "Not available for your role" copy. */
  what?: string;
  children: React.ReactNode;
}

/** A page-level gate: the children, or the "Not available for your role" state. */
export function RequirePermission({ perm, all, what, children }: RequirePermissionProps) {
  return (
    <Can perm={perm} all={all} fallback={<ForbiddenState what={what} />}>
      {children}
    </Can>
  );
}
