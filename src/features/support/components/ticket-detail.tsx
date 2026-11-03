import { Link } from '@tanstack/react-router';
import { ImageOffIcon, LockOpenIcon, LockIcon } from 'lucide-react';
import { toast } from 'sonner';
import { CopyButton, RoleGate, StatusBadge } from '@/components/shared';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { errorMessage } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import { useScreenshot, useSetTicketStatus } from '../api/queries';
import type { SupportTicket } from '../api/types';

function Screenshot({ id }: { id: string }) {
  const shot = useScreenshot(id);
  if (shot.error)
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <ImageOffIcon className="size-4" aria-hidden />
        Could not load the screenshot: {errorMessage(shot.error)}
      </p>
    );
  if (!shot.url) return <Skeleton className="h-72 w-40" />;
  return (
    <a href={shot.url} target="_blank" rel="noreferrer" className="block w-fit">
      <img src={shot.url} alt="Screenshot sent with the ticket" className="max-h-96 rounded-md border" />
    </a>
  );
}

export function TicketDetail({ ticket }: { ticket: SupportTicket }) {
  const setStatus = useSetTicketStatus();
  const toggle = async () => {
    const status = ticket.status === 'open' ? 'closed' : 'open';
    try {
      await setStatus.mutateAsync({ id: ticket.id, status });
      toast.success(status === 'closed' ? 'Ticket closed' : 'Ticket reopened');
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };
  const device = ticket.device
    ? [ticket.device.app && `app ${ticket.device.app}`, ticket.device.os, ticket.device.model]
        .filter(Boolean)
        .join(' · ')
    : null;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge status={ticket.status} />
        <span className="font-mono text-sm">{ticket.ref}</span>
        <CopyButton value={ticket.ref} iconOnly variant="ghost" label="Copy reference" />
      </div>
      <dl className="grid grid-cols-[7rem_minmax(0,1fr)] gap-x-3 gap-y-2 text-sm">
        <dt className="text-muted-foreground">Type</dt>
        <dd>
          {ticket.kind === 'message' ? `Contact support · ${ticket.topic ?? 'Something else'}` : 'Problem report'}
        </dd>
        <dt className="text-muted-foreground">From</dt>
        <dd>
          <RoleGate allow="admin" fallback={<span className="font-mono text-xs">{ticket.userId}</span>}>
            <Link to="/users/$id" params={{ id: ticket.userId }} className="font-mono text-xs hover:underline">
              {ticket.userId}
            </Link>
          </RoleGate>
        </dd>
        <dt className="text-muted-foreground">Received</dt>
        <dd>{formatDateTime(ticket.createdAt)}</dd>
        <dt className="text-muted-foreground">Device</dt>
        <dd>{device ?? <span className="text-muted-foreground">Not shared</span>}</dd>
      </dl>
      <div className="rounded-md bg-muted/50 p-3 text-sm whitespace-pre-wrap">{ticket.text}</div>
      {ticket.hasScreenshot && (
        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold">Screenshot</h3>
          <Screenshot id={ticket.id} />
        </div>
      )}
      <Button
        variant={ticket.status === 'open' ? 'default' : 'outline'}
        className="self-start"
        onClick={toggle}
        disabled={setStatus.isPending}
      >
        {ticket.status === 'open' ? <LockIcon /> : <LockOpenIcon />}
        {ticket.status === 'open' ? 'Close ticket' : 'Reopen ticket'}
      </Button>
    </div>
  );
}
