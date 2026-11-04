import { RefreshCwIcon, UsersIcon } from 'lucide-react';
import { CopyButton } from '@/components/shared';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';

/**
 * Someone else changed the item since this screen loaded it (409 CONTENT_CONFLICT, or a newer copy
 * arrived while there were unsaved edits). Nothing was overwritten. The local edits stay in the form;
 * copy them as JSON before loading the latest version.
 */
export function ConflictBanner({
  localJson,
  onReload,
  reloading,
}: {
  localJson: string | null;
  onReload: () => void;
  reloading?: boolean;
}) {
  return (
    <Alert variant="destructive" role="alert" aria-label="Changed by someone else">
      <UsersIcon />
      <AlertTitle>Changed by someone else</AlertTitle>
      <AlertDescription>
        <p>
          This item changed after you opened it, so nothing was saved or approved. Your edits are still here.
          {localJson ? ' Copy them before you load the latest version, then apply them again.' : ''}
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          {localJson && <CopyButton value={localJson} label="Copy my edits (JSON)" />}
          <Button type="button" size="sm" variant="outline" onClick={onReload} disabled={reloading}>
            <RefreshCwIcon />
            {localJson ? 'Load the latest (drops my edits)' : 'Load the latest'}
          </Button>
        </div>
      </AlertDescription>
    </Alert>
  );
}
