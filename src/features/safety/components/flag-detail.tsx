import { zodResolver } from '@hookform/resolvers/zod';
import { Link } from '@tanstack/react-router';
import { CheckCircle2Icon, LockIcon, SirenIcon } from 'lucide-react';
import * as React from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { FormDialog, FormFieldTextarea, RoleGate, StatusBadge } from '@/components/shared';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Form } from '@/components/ui/form';
import { Separator } from '@/components/ui/separator';
import { formatDateTime, formatRelative } from '@/lib/format';
import { useAddFlagNote, useEscalateFlag, useReviewFlag } from '../api/queries';
import type { SafetyFlag } from '../api/types';
import { KIND_LABEL, SURFACE_LABEL } from '../lib/labels';
import { escalateSchema, noteSchema, reviewSchema } from '../schemas/safety';

function NoteForm({ flagId }: { flagId: string }) {
  const add = useAddFlagNote();
  const form = useForm({ resolver: zodResolver(noteSchema), defaultValues: { text: '' } });
  const submit = form.handleSubmit(async ({ text }) => {
    await add.mutateAsync({ id: flagId, text });
    form.reset({ text: '' });
    toast.success('Note added');
  });
  return (
    <Form {...form}>
      <form onSubmit={submit} className="flex flex-col gap-2" noValidate>
        <FormFieldTextarea
          control={form.control}
          name="text"
          label="Add a note"
          rows={3}
          maxLength={2000}
          description="Staff only. Write what you did, not what they typed."
        />
        <Button type="submit" size="sm" variant="outline" className="self-end" disabled={form.formState.isSubmitting}>
          Add note
        </Button>
      </form>
    </Form>
  );
}

/** One flag: metadata, escalations, the notes thread and the review and escalate actions. */
export function FlagDetail({ flag }: { flag: SafetyFlag }) {
  const [dialog, setDialog] = React.useState<null | 'review' | 'escalate'>(null);
  const review = useReviewFlag();
  const escalate = useEscalateFlag();
  const rows: [string, React.ReactNode][] = [
    [
      'Person',
      <span key="p" className="flex flex-col">
        <RoleGate allow="admin" fallback={<span className="font-medium">{flag.userEmail ?? flag.userId}</span>}>
          <Link to="/users/$id" params={{ id: flag.userId }} className="font-medium hover:underline">
            {flag.userEmail ?? flag.userId}
          </Link>
        </RoleGate>
        <span className="font-mono text-xs text-muted-foreground">{flag.userId}</span>
      </span>,
    ],
    ['Check', `${KIND_LABEL[flag.kind]}`],
    ['Level', <StatusBadge key="l" status={flag.level} />],
    ['Where', SURFACE_LABEL[flag.surface]],
    ['Helpline shown', flag.helplineShown ? 'Yes' : 'No'],
    ['Times', flag.count === 1 ? 'Once' : `${flag.count} times (repeats within 10 minutes fold in)`],
    ['First', formatDateTime(flag.firstAt)],
    ['Last', `${formatDateTime(flag.lastAt)} (${formatRelative(flag.lastAt)})`],
    ['Status', <StatusBadge key="s" status={flag.status} />],
    ['Reviewed', flag.reviewedAt ? formatDateTime(flag.reviewedAt) : 'Not yet'],
  ];
  return (
    <div className="flex flex-col gap-4">
      <Alert>
        <LockIcon />
        <AlertTitle>Metadata only</AlertTitle>
        <AlertDescription>
          Thirdwheel never stores what was typed. A flag records that a check fired, where and when.
        </AlertDescription>
      </Alert>
      <dl className="grid grid-cols-[8rem_minmax(0,1fr)] gap-x-3 gap-y-2 text-sm">
        {rows.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-muted-foreground">{k}</dt>
            <dd className="min-w-0 break-words">{v}</dd>
          </div>
        ))}
      </dl>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={() => setDialog('review')} disabled={flag.status === 'reviewed'}>
          <CheckCircle2Icon />
          Mark reviewed
        </Button>
        <Button size="sm" variant="destructive" onClick={() => setDialog('escalate')}>
          <SirenIcon />
          Escalate
        </Button>
      </div>
      {flag.escalations.length > 0 && (
        <>
          <Separator />
          <div className="flex flex-col gap-2">
            <h3 className="text-sm font-semibold">Escalations</h3>
            <ul className="flex flex-col gap-2 text-sm">
              {flag.escalations.map((e, i) => (
                <li key={i} className="border-l-2 border-destructive/60 pl-3">
                  <span className="text-muted-foreground">
                    {formatDateTime(e.at)} · <span className="font-mono text-xs">{e.by}</span>
                  </span>
                  {e.note && <p>{e.note}</p>}
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
      <Separator />
      <div className="flex flex-col gap-3">
        <h3 className="text-sm font-semibold">Notes ({flag.notes.length})</h3>
        {flag.notes.length === 0 ? (
          <p className="text-sm text-muted-foreground">No notes yet.</p>
        ) : (
          <ol className="flex flex-col gap-3" aria-label="Notes">
            {flag.notes.map((n) => (
              <li key={n.id} className="rounded-md bg-muted/50 p-3 text-sm">
                <p className="mb-1 text-xs text-muted-foreground">
                  {n.byEmail ?? n.by} · <time dateTime={n.at}>{formatRelative(n.at)}</time>
                </p>
                <p className="whitespace-pre-wrap">{n.text}</p>
              </li>
            ))}
          </ol>
        )}
        <NoteForm flagId={flag.id} />
      </div>

      <FormDialog
        open={dialog === 'review'}
        onOpenChange={(o) => !o && setDialog(null)}
        title="Mark reviewed"
        description="Closes the flag as handled. A note is optional."
        schema={reviewSchema}
        defaultValues={{ note: '' }}
        submitLabel="Mark reviewed"
        onSubmit={async ({ note }) => {
          await review.mutateAsync({ id: flag.id, note: note || undefined });
          toast.success('Marked reviewed');
        }}
      >
        {(f) => <FormFieldTextarea control={f.control} name="note" label="Note (optional)" rows={3} maxLength={2000} />}
      </FormDialog>
      <FormDialog
        open={dialog === 'escalate'}
        onOpenChange={(o) => !o && setDialog(null)}
        title="Escalate this flag?"
        description="Sends a crisis alert to the on-call integrations (n8n) with your note."
        schema={escalateSchema}
        defaultValues={{ note: '' }}
        submitLabel="Escalate"
        destructive
        onSubmit={async ({ note }) => {
          await escalate.mutateAsync({ id: flag.id, note: note || undefined });
          toast.success('Escalated');
        }}
      >
        {(f) => <FormFieldTextarea control={f.control} name="note" label="Note (optional)" rows={3} maxLength={500} />}
      </FormDialog>
    </div>
  );
}
