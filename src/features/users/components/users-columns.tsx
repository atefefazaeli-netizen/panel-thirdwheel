import { Link } from '@tanstack/react-router';
import { HeartIcon } from 'lucide-react';
import { columnHelper, StatusBadge } from '@/components/shared';
import { Badge } from '@/components/ui/badge';
import { formatDate } from '@/lib/format';
import type { AdminUserRow } from '../api/types';
import { PLAN_LABEL } from '../lib/labels';

const h = columnHelper<AdminUserRow>();

export const usersColumns = h.columns([
  h.accessor('email', {
    header: 'Account',
    enableHiding: false,
    meta: { label: 'Account' },
    cell: (c) => (
      <div className="flex min-w-0 flex-col">
        <Link
          to="/users/$id"
          params={{ id: c.row.original.userId }}
          className="truncate font-medium hover:underline"
          onClick={(e) => e.stopPropagation()}
        >
          {c.row.original.name ?? 'No name yet'}
        </Link>
        <span className="truncate text-xs text-muted-foreground">{c.getValue() ?? 'No email'}</span>
      </div>
    ),
  }),
  h.accessor('plan', {
    header: 'Plan',
    meta: { label: 'Plan' },
    cell: (c) => {
      const plan = c.getValue();
      return plan ? (
        <StatusBadge status={plan} label={PLAN_LABEL[plan]} dot={false} />
      ) : (
        <span className="text-sm text-muted-foreground">Not available</span>
      );
    },
  }),
  h.accessor('partner', {
    header: 'Partner',
    meta: { label: 'Partner' },
    cell: (c) =>
      c.getValue() ? (
        <span className="flex items-center gap-1.5 text-sm">
          <HeartIcon className="size-3.5 text-brand" aria-label="Linked with" />
          {c.getValue()!.name ?? c.getValue()!.userId}
        </span>
      ) : (
        <span className="text-sm text-muted-foreground">
          {c.row.original.linked === null ? 'Not available' : 'Not linked'}
        </span>
      ),
  }),
  h.accessor('suspended', {
    header: 'Status',
    meta: { label: 'Status' },
    cell: (c) => (c.getValue() ? <StatusBadge status="suspended" /> : <StatusBadge status="active" />),
  }),
  h.accessor('tags', {
    header: 'Tags',
    meta: { label: 'Tags' },
    cell: (c) => (
      <div className="flex max-w-56 flex-wrap gap-1">
        {c.getValue().map((t) => (
          <Badge key={t} variant="secondary" className="font-mono text-[11px]">
            {t}
          </Badge>
        ))}
      </div>
    ),
  }),
  h.accessor('createdAt', {
    header: 'Registered',
    meta: { label: 'Registered' },
    cell: (c) => <span className="text-sm text-muted-foreground">{formatDate(c.getValue())}</span>,
  }),
]);
