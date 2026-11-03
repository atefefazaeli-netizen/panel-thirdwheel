import { columnHelper, StatusBadge } from '@/components/shared';
import { formatRelative } from '@/lib/format';
import type { SafetyFlag } from '../api/types';
import { KIND_LABEL, SURFACE_LABEL } from '../lib/labels';

const h = columnHelper<SafetyFlag>();

export const flagColumns = h.columns([
  h.accessor('level', {
    header: 'Level',
    meta: { label: 'Level' },
    cell: (c) => <StatusBadge status={c.getValue()} />,
  }),
  h.accessor('kind', { header: 'Check', meta: { label: 'Check' }, cell: (c) => KIND_LABEL[c.getValue()] }),
  h.accessor('userEmail', {
    header: 'Person',
    enableHiding: false,
    meta: { label: 'Person' },
    cell: (c) => <span className="font-medium">{c.getValue() ?? c.row.original.userId}</span>,
  }),
  h.accessor('surface', { header: 'Where', meta: { label: 'Where' }, cell: (c) => SURFACE_LABEL[c.getValue()] }),
  h.accessor('helplineShown', {
    header: 'Helpline',
    meta: { label: 'Helpline shown' },
    cell: (c) => (c.getValue() ? 'Shown' : 'No'),
  }),
  h.accessor('count', {
    header: 'Times',
    meta: { label: 'Times', className: 'text-right w-16' },
    cell: (c) => <span className="tabular-nums">{c.getValue()}</span>,
  }),
  h.accessor('status', {
    header: 'Status',
    meta: { label: 'Status' },
    cell: (c) => <StatusBadge status={c.getValue()} />,
  }),
  h.accessor('notes', {
    header: 'Notes',
    meta: { label: 'Notes', className: 'text-right w-16' },
    cell: (c) => <span className="tabular-nums">{c.getValue().length}</span>,
  }),
  h.accessor('lastAt', {
    header: 'Last',
    meta: { label: 'Last' },
    cell: (c) => <span className="text-sm text-muted-foreground">{formatRelative(c.getValue())}</span>,
  }),
]);
