import { AlertTriangleIcon, RotateCwIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { errorMessage, isApiError, isPermissionRefusal } from '@/lib/api';
import { cn } from '@/lib/utils';
import { ForbiddenState } from './forbidden-state';

export interface ErrorStateProps {
  error: unknown;
  title?: string;
  onRetry?: () => void;
  className?: string;
}

export function ErrorState({ error, title = 'Could not load this', onRetry, className }: ErrorStateProps) {
  // A permission refusal is a state, not an error (the session re-reads its permissions meanwhile).
  if (isPermissionRefusal(error)) return <ForbiddenState />;
  const requestId = isApiError(error) ? error.requestId : null;
  return (
    <div
      role="alert"
      className={cn('flex flex-col items-center gap-3 rounded-lg border bg-card px-6 py-10 text-center', className)}
    >
      <div className="flex size-10 items-center justify-center rounded-full bg-brand-soft text-destructive">
        <AlertTriangleIcon className="size-5" aria-hidden />
      </div>
      <div className="flex max-w-md flex-col gap-1">
        <p className="font-semibold">{title}</p>
        <p className="text-sm text-muted-foreground">{errorMessage(error)}</p>
        {requestId && <p className="font-mono text-xs text-muted-foreground">Request {requestId}</p>}
      </div>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry}>
          <RotateCwIcon />
          Try again
        </Button>
      )}
    </div>
  );
}
