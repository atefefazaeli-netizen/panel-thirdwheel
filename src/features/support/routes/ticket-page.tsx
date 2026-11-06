import { zodResolver } from '@hookform/resolvers/zod';
import { getRouteApi, Link } from '@tanstack/react-router';
import {
  ArrowLeftIcon,
  ImageOffIcon,
  LockKeyholeIcon,
  MessageSquareTextIcon,
  RotateCwIcon,
  SendIcon,
  StickyNoteIcon,
} from 'lucide-react';
import * as React from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { toast } from 'sonner';
import {
  Can,
  CopyButton,
  EmptyState,
  ErrorState,
  FormFieldTextarea,
  PageHeader,
  StatusBadge,
} from '@/components/shared';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Form } from '@/components/ui/form';
import { Label } from '@/components/ui/label';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Skeleton } from '@/components/ui/skeleton';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { errorMessage } from '@/lib/api';
import { formatDateTime, formatRelative } from '@/lib/format';
import { cn } from '@/lib/utils';
import { useCan } from '@/stores/session';
import {
  isTicketConflict,
  useAssignees,
  useChangeTicket,
  useDeliveryStatus,
  useScreenshot,
  useTicket,
  useTicketWrite,
  type TicketChange,
} from '../api/queries';
import {
  TICKET_PRIORITIES,
  TICKET_STATUSES,
  type Assignee,
  type SupportTicketDetail,
  type TimelineEvent,
} from '../api/types';
import { DELIVERY_LABEL, deliveryProblem, PRIORITY_LABEL, STATUS_LABEL } from '../lib/labels';
import { composerSchema, NOTE_MAX, REPLY_MAX, type ComposerValues } from '../schemas/support';
import { DeliveryProviderNotice } from '../components/delivery-notice';
import { assigneeName } from '../lib/assignee';

const route = getRouteApi('/_app/support/$id');

export function TicketPage() {
  const { id } = route.useParams();
  const ticket = useTicket(id);
  return (
    <>
      <Button asChild variant="ghost" size="sm" className="self-start">
        <Link to="/support">
          <ArrowLeftIcon />
          Support inbox
        </Link>
      </Button>
      {ticket.error ? (
        <ErrorState error={ticket.error} onRetry={() => void ticket.refetch()} />
      ) : ticket.isPending ? (
        <Skeleton className="h-96" />
      ) : ticket.data ? (
        <Ticket ticket={ticket.data} />
      ) : (
        <EmptyState title="Ticket not found" description="It may have been deleted with the account." />
      )}
    </>
  );
}

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

function Ticket({ ticket }: { ticket: SupportTicketDetail }) {
  const device = ticket.device
    ? [ticket.device.app && `app ${ticket.device.app}`, ticket.device.os, ticket.device.model]
        .filter(Boolean)
        .join(' · ')
    : null;
  return (
    <>
      <PageHeader
        title={<span className="font-mono">{ticket.ref}</span>}
        meta={
          <>
            <CopyButton value={ticket.ref} iconOnly variant="ghost" label="Copy reference" />
            <StatusBadge status={ticket.status} label={STATUS_LABEL[ticket.status]} />
            <StatusBadge status={ticket.priority} label={PRIORITY_LABEL[ticket.priority]} />
          </>
        }
        description={
          ticket.kind === 'message' ? `Contact support · ${ticket.topic ?? 'Something else'}` : 'Problem report'
        }
      />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="flex min-w-0 flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Message</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <dl className="grid grid-cols-[7rem_minmax(0,1fr)] gap-x-3 gap-y-2 text-sm">
                <dt className="text-muted-foreground">From</dt>
                <dd>
                  <Can perm="users.read" fallback={<span className="font-mono text-xs">{ticket.userId}</span>}>
                    <Link to="/users/$id" params={{ id: ticket.userId }} className="font-mono text-xs hover:underline">
                      {ticket.userId}
                    </Link>
                  </Can>
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
            </CardContent>
          </Card>
          <Timeline ticket={ticket} />
          <Can perm={['support.reply', 'support.note']}>
            <Composer ticketId={ticket.id} />
          </Can>
        </div>
        <TicketControls ticket={ticket} />
      </div>
    </>
  );
}

/* ---------- Status, priority, assignee ---------- */

function TicketControls({ ticket }: { ticket: SupportTicketDetail }) {
  const change = useChangeTicket(ticket.id);
  const people = useAssignees().data;
  const canStatus = useCan('support.resolve');
  const canPriority = useCan('support.prioritize');
  const canAssign = useCan('support.assign');

  const [problem, setProblem] = React.useState<string | null>(null);
  const run = async (c: TicketChange, done: string) => {
    setProblem(null);
    try {
      await change.mutateAsync({ change: c, version: ticket.version });
      toast.success(done);
    } catch (e) {
      // 409 TICKET_CONFLICT: nothing was changed and the ticket is read again (onSettled), so the
      // fields show the latest; the person decides again.
      setProblem(errorMessage(e));
      if (!isTicketConflict(e)) toast.error(errorMessage(e));
    }
  };

  const assigneeOptions: Assignee[] = [...(people ?? [])];
  if (ticket.assigneeId && !assigneeOptions.some((p) => p.id === ticket.assigneeId))
    assigneeOptions.push({ id: ticket.assigneeId, displayName: assigneeName(ticket, people) ?? 'Someone' });

  return (
    <Card className="h-fit">
      <CardHeader>
        <CardTitle>Ticket</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {problem && (
          <Alert variant="destructive">
            <AlertDescription>{problem}</AlertDescription>
          </Alert>
        )}
        <Field id="ticket-status" label="Status" readOnly={!canStatus} value={STATUS_LABEL[ticket.status]}>
          <NativeSelect
            id="ticket-status"
            value={ticket.status}
            disabled={change.isPending}
            onChange={(e) =>
              void run({ kind: 'status', value: e.target.value as typeof ticket.status }, 'Status changed')
            }
            className="w-full"
          >
            {TICKET_STATUSES.map((s) => (
              <NativeSelectOption key={s} value={s}>
                {STATUS_LABEL[s]}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </Field>
        <Field id="ticket-priority" label="Priority" readOnly={!canPriority} value={PRIORITY_LABEL[ticket.priority]}>
          <NativeSelect
            id="ticket-priority"
            value={ticket.priority}
            disabled={change.isPending}
            onChange={(e) =>
              void run({ kind: 'priority', value: e.target.value as typeof ticket.priority }, 'Priority changed')
            }
          >
            {TICKET_PRIORITIES.map((p) => (
              <NativeSelectOption key={p} value={p}>
                {PRIORITY_LABEL[p]}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </Field>
        <Field
          id="ticket-assignee"
          label="Assignee"
          readOnly={!canAssign}
          value={assigneeName(ticket, people) ?? 'Unassigned'}
        >
          <NativeSelect
            id="ticket-assignee"
            value={ticket.assigneeId ?? ''}
            disabled={change.isPending || !people}
            onChange={(e) =>
              void run({ kind: 'assignee', value: e.target.value || null }, e.target.value ? 'Assigned' : 'Unassigned')
            }
          >
            <NativeSelectOption value="">Unassigned</NativeSelectOption>
            {assigneeOptions.map((p) => (
              <NativeSelectOption key={p.id} value={p.id}>
                {p.displayName}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </Field>
        <p className="text-xs text-muted-foreground">
          Version {ticket.version}. Changes made by someone else since you opened the ticket are refused, and the latest
          is loaded.
        </p>
      </CardContent>
    </Card>
  );
}

function Field({
  id,
  label,
  readOnly,
  value,
  children,
}: {
  id: string;
  label: string;
  readOnly: boolean;
  value: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={readOnly ? undefined : id}>{label}</Label>
      {readOnly ? (
        <span className="text-sm" data-testid={`${id}-readonly`}>
          {value}
        </span>
      ) : (
        <div className="[&>div]:w-full">{children}</div>
      )}
    </div>
  );
}

/* ---------- Timeline ---------- */

function who(e: TimelineEvent) {
  return e.byName ?? (e.by ? 'A staff member' : 'The user');
}

function Timeline({ ticket }: { ticket: SupportTicketDetail }) {
  const people = useAssignees().data;
  const name = (id: string | null, fallback?: string | null) =>
    id ? (fallback ?? people?.find((p) => p.id === id)?.displayName ?? 'someone') : 'nobody';
  return (
    <Card>
      <CardHeader>
        <CardTitle>History</CardTitle>
      </CardHeader>
      <CardContent>
        <ol className="flex flex-col gap-3" aria-label="Ticket history">
          {ticket.timeline.map((e) => {
            const at = (
              <time dateTime={e.at} title={formatDateTime(e.at)}>
                {formatRelative(e.at)}
              </time>
            );
            if (e.type === 'note') return <NoteItem key={e.id} who={who(e)} at={at} text={e.text} />;
            if (e.type === 'reply') return <ReplyItem key={e.id} ticketId={ticket.id} event={e} at={at} />;
            let text: string;
            if (e.type === 'created') text = 'The user opened the ticket';
            else if (e.type === 'status') text = `${who(e)} set the status to ${STATUS_LABEL[e.to]}`;
            else if (e.type === 'priority') text = `${who(e)} set the priority to ${PRIORITY_LABEL[e.to]}`;
            else text = e.to ? `${who(e)} assigned it to ${name(e.to, e.toName)}` : `${who(e)} removed the assignee`;
            return (
              <li key={e.id} className="text-sm text-muted-foreground">
                {text} · {at}
              </li>
            );
          })}
        </ol>
      </CardContent>
    </Card>
  );
}

function NoteItem({ who, at, text }: { who: string; at: React.ReactNode; text: string }) {
  return (
    <li className="rounded-md border border-dashed border-warning/60 bg-warning-soft/50 p-3" data-kind="note">
      <div className="mb-1 flex flex-wrap items-center gap-2 text-xs">
        <Badge variant="outline" className="gap-1 border-warning/60">
          <LockKeyholeIcon className="size-3" aria-hidden />
          Internal, never sent
        </Badge>
        <span className="text-muted-foreground">
          {who} · {at}
        </span>
      </div>
      <p className="text-sm whitespace-pre-wrap">{text}</p>
    </li>
  );
}

function ReplyItem({
  ticketId,
  event,
  at,
}: {
  ticketId: string;
  event: Extract<TimelineEvent, { type: 'reply' }>;
  at: React.ReactNode;
}) {
  const { retry } = useTicketWrite(ticketId);
  const d = event.delivery;
  const problem = d.status === 'sent' ? null : deliveryProblem(d.lastError);
  return (
    <li className="rounded-md border bg-card p-3" data-kind="reply">
      <div className="mb-1 flex flex-wrap items-center gap-2 text-xs">
        <Badge variant="secondary" className="gap-1">
          <MessageSquareTextIcon className="size-3" aria-hidden />
          Reply to the user
        </Badge>
        {/* Only the API's word counts: "Sent" shows only when the provider accepted the reply. */}
        <StatusBadge status={d.status} label={DELIVERY_LABEL[d.status]} />
        <span className="text-muted-foreground">
          {who(event)} · {at}
        </span>
      </div>
      <p className="text-sm whitespace-pre-wrap">{event.text}</p>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        {d.status === 'sent' && d.sentAt && (
          <span>
            Sent {formatDateTime(d.sentAt)}
            {d.provider ? ` via ${d.provider}` : ''}
          </span>
        )}
        {problem && <span>{problem}</span>}
        {d.attempts > 0 && d.status !== 'sent' && <span>Attempts: {d.attempts}</span>}
        {d.status !== 'sent' && (
          <Can perm="support.reply">
            <Button
              variant="outline"
              size="sm"
              className="h-7"
              disabled={retry.isPending}
              onClick={async () => {
                try {
                  await retry.mutateAsync(event.id);
                  toast.success('Sending again');
                } catch {
                  // The mutation toasts the error.
                }
              }}
            >
              <RotateCwIcon />
              Retry
            </Button>
          </Can>
        )}
      </div>
    </li>
  );
}

/* ---------- Composer ---------- */

function Composer({ ticketId }: { ticketId: string }) {
  const canReply = useCan('support.reply');
  const canNote = useCan('support.note');
  const [mode, setMode] = React.useState<'reply' | 'note'>(canReply ? 'reply' : 'note');
  const max = mode === 'reply' ? REPLY_MAX : NOTE_MAX;
  const schema = React.useMemo(() => composerSchema(max), [max]);
  const form = useForm<ComposerValues>({ resolver: zodResolver(schema), defaultValues: { text: '' } });
  const text = useWatch({ control: form.control, name: 'text' }) ?? '';
  const { note, reply } = useTicketWrite(ticketId);
  const delivery = useDeliveryStatus().data;

  const submit = form.handleSubmit(async ({ text: t }) => {
    try {
      if (mode === 'reply') {
        await reply.mutateAsync(t);
        toast.success(
          delivery?.canSend === false
            ? 'Reply saved. It stays pending until an email provider is set up.'
            : 'Reply queued',
        );
      } else {
        await note.mutateAsync(t);
        toast.success('Internal note added');
      }
      form.reset({ text: '' });
    } catch {
      // The mutation toasts the error; the text stays.
    }
  });

  return (
    <Card className={cn(mode === 'note' && 'border-dashed border-warning/60 bg-warning-soft/30')}>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
        <CardTitle>{mode === 'reply' ? 'Reply to the user' : 'Internal note'}</CardTitle>
        <ToggleGroup
          type="single"
          variant="outline"
          size="sm"
          value={mode}
          onValueChange={(v) => v && setMode(v as 'reply' | 'note')}
          aria-label="What to write"
        >
          {canReply && (
            <ToggleGroupItem value="reply" aria-label="Reply to the user">
              <SendIcon />
              Reply
            </ToggleGroupItem>
          )}
          {canNote && (
            <ToggleGroupItem value="note" aria-label="Internal note">
              <StickyNoteIcon />
              Internal note
            </ToggleGroupItem>
          )}
        </ToggleGroup>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {mode === 'reply' ? (
          <>
            <p className="text-sm text-muted-foreground">
              The server emails this to the account&apos;s address. The panel never shows the address.
            </p>
            <DeliveryProviderNotice />
          </>
        ) : (
          <p className="flex items-center gap-2 text-sm font-medium">
            <LockKeyholeIcon className="size-4" aria-hidden />
            Internal, never sent. Only staff with access to this ticket see it.
          </p>
        )}
        <Form {...form}>
          <form onSubmit={submit} className="flex flex-col gap-3" noValidate>
            <FormFieldTextarea
              control={form.control}
              name="text"
              label={mode === 'reply' ? 'Reply' : 'Note'}
              hideLabel
              rows={5}
              maxLength={max}
            />
            <div className="flex items-center justify-end gap-2">
              <Button type="submit" disabled={form.formState.isSubmitting || !text.trim()}>
                {mode === 'reply' ? <SendIcon /> : <StickyNoteIcon />}
                {mode === 'reply' ? 'Send reply' : 'Add internal note'}
              </Button>
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
