import * as React from 'react';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import type { ContentSnapshot } from '../api/types';
import { snapshotDiff, type DiffRow } from '../lib/diff';

const KIND_LABEL: Record<DiffRow['kind'], string> = {
  same: 'Same',
  changed: 'Changed',
  added: 'Added',
  removed: 'Removed',
};

/** Live and draft side by side, one row per field (cards, steps and deck rounds one by one). */
export function DiffView({
  before,
  after,
  beforeLabel = 'Live',
  afterLabel = 'Draft',
}: {
  before: ContentSnapshot | null;
  after: ContentSnapshot | null;
  beforeLabel?: string;
  afterLabel?: string;
}) {
  const [all, setAll] = React.useState(false);
  const rows = React.useMemo(() => snapshotDiff(before, after), [before, after]);
  const changed = rows.filter((r) => r.kind !== 'same');
  const shown = all ? rows : changed;
  const id = React.useId();
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm" aria-live="polite">
          <span className="font-semibold">{changed.length}</span>{' '}
          {changed.length === 1 ? 'field differs' : 'fields differ'}
          {!before && ' (new item, nothing live yet)'}
        </p>
        <div className="flex items-center gap-2">
          <Switch id={id} checked={all} onCheckedChange={setAll} />
          <Label htmlFor={id}>Show unchanged</Label>
        </div>
      </div>
      <div className="overflow-x-auto rounded-md border">
        <table
          className="w-full min-w-[640px] table-fixed text-sm"
          aria-label={`${beforeLabel} and ${afterLabel} compared`}
        >
          <thead className="bg-muted/40">
            <tr className="border-b text-left">
              <th scope="col" className="w-40 px-3 py-2 font-medium">
                Field
              </th>
              <th scope="col" className="px-3 py-2 font-medium">
                {beforeLabel}
              </th>
              <th scope="col" className="px-3 py-2 font-medium">
                {afterLabel}
              </th>
            </tr>
          </thead>
          <tbody>
            {shown.length === 0 && (
              <tr>
                <td colSpan={3} className="px-3 py-6 text-center text-muted-foreground">
                  No differences.
                </td>
              </tr>
            )}
            {shown.map((r) => (
              <tr key={r.path} className="border-b align-top last:border-0">
                <th scope="row" className="px-3 py-2 text-left font-normal">
                  <span className="block font-medium">{r.label}</span>
                  <span
                    className={cn(
                      'text-xs',
                      r.kind === 'same'
                        ? 'text-muted-foreground'
                        : r.kind === 'removed'
                          ? 'text-destructive'
                          : 'text-success',
                    )}
                  >
                    {KIND_LABEL[r.kind]}
                  </span>
                </th>
                <td
                  className={cn(
                    'px-3 py-2 break-words whitespace-pre-wrap',
                    r.kind === 'changed' || r.kind === 'removed' ? 'bg-brand-soft/60' : '',
                  )}
                >
                  {r.before ?? <span className="text-muted-foreground italic">empty</span>}
                </td>
                <td
                  className={cn(
                    'px-3 py-2 break-words whitespace-pre-wrap',
                    r.kind === 'changed' || r.kind === 'added' ? 'bg-success-soft/60' : '',
                  )}
                >
                  {r.after ?? <span className="text-muted-foreground italic">empty</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
