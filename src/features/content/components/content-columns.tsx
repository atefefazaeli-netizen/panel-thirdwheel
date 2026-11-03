import { Link } from '@tanstack/react-router';
import { Badge } from '@/components/ui/badge';
import { columnHelper } from '@/components/shared';
import { formatRelative } from '@/lib/format';
import type { ContentSummary } from '../api/types';
import { categoryLabel, contentState, KIND_LABEL, ONLY_LABEL } from '../lib/labels';
import { ContentStateBadge } from './content-state-badge';

const h = columnHelper<ContentSummary>();

export const contentColumns = h.columns([
  h.accessor('code', {
    header: 'Code',
    meta: { label: 'Code', className: 'w-24' },
    cell: (c) => <span className="font-mono text-xs text-muted-foreground">{c.getValue() ?? 'New'}</span>,
  }),
  h.accessor('title', {
    header: 'Title',
    enableHiding: false,
    meta: { label: 'Title', className: 'max-w-[22rem]' },
    cell: (c) => (
      <Link
        to="/content/$id"
        params={{ id: c.row.original.id }}
        className="block truncate font-medium hover:underline"
        onClick={(e) => e.stopPropagation()}
      >
        {c.getValue()}
      </Link>
    ),
  }),
  h.accessor('kind', {
    header: 'Kind',
    meta: { label: 'Kind' },
    cell: (c) => <span className="text-sm">{KIND_LABEL[c.getValue()] ?? c.getValue()}</span>,
  }),
  h.accessor('category', {
    header: 'Category',
    meta: { label: 'Category' },
    cell: (c) => categoryLabel(c.getValue()),
  }),
  h.accessor('type', {
    header: 'Type',
    meta: { label: 'Type' },
    cell: (c) => (c.getValue() ? <span className="font-mono text-xs">{c.getValue()}</span> : null),
  }),
  h.accessor('only', {
    header: 'Only',
    meta: { label: 'Shows only when' },
    cell: (c) => (c.getValue() ? <Badge variant="secondary">{ONLY_LABEL[c.getValue()!] ?? c.getValue()}</Badge> : null),
  }),
  h.display({
    id: 'state',
    header: 'State',
    meta: { label: 'State' },
    cell: (c) => <ContentStateBadge state={contentState(c.row.original)} version={c.row.original.liveVersion} />,
  }),
  h.accessor('liveVersion', {
    header: 'Live',
    meta: { label: 'Live version', className: 'w-16 text-right' },
    cell: (c) => <span className="tabular-nums">{c.getValue() ? `v${c.getValue()}` : '–'}</span>,
  }),
  h.accessor('updatedAt', {
    header: 'Updated',
    meta: { label: 'Updated' },
    cell: (c) => <span className="text-sm text-muted-foreground">{formatRelative(c.getValue())}</span>,
  }),
]);
