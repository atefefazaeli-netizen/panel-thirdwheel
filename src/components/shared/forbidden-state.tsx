import { LockIcon } from 'lucide-react';
import { EmptyState } from './empty-state';

/** Shown in place of a page the signed-in role cannot use. */
export function ForbiddenState({ what = 'this page' }: { what?: string }) {
  return (
    <EmptyState
      icon={LockIcon}
      title="Not available for your role"
      description={`Your account can't open ${what}. Ask an Owner if you need it.`}
    />
  );
}
