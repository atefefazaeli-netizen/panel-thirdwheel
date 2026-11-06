import {
  ArchiveRestoreIcon,
  CheckCircle2Icon,
  EyeOffIcon,
  MessageSquareWarningIcon,
  SaveIcon,
  SendIcon,
  Undo2Icon,
} from 'lucide-react';
import * as React from 'react';
import { z } from 'zod';
import { ConfirmDialog, FormDialog, FormFieldTextarea } from '@/components/shared';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import type { ContentItem } from '../api/types';
import { workflowStatus, type ActionState, type Workflow } from '../lib/workflow';
import { ApproveDialog } from './approve-dialog';

const optionalNote = z.object({ note: z.string().trim().max(2000) });
const requiredNote = z.object({ note: z.string().trim().min(1, 'Say what needs to change.').max(2000) });

type Dialog = null | 'submit' | 'approve' | 'changes' | 'discard' | 'unpublish' | 'restore';

export interface WorkflowBarProps {
  item: ContentItem;
  /** The signed-in staff id (self-approval warning). */
  userId?: string | null;
  workflow: Workflow;
  dirty: boolean;
  onSave: () => void;
  onResetLocal: () => void;
  onDiscard: () => Promise<unknown>;
  onSubmit: (note?: string) => Promise<unknown>;
  onApprove: (v: { note?: string; acknowledgeHeld: boolean }) => Promise<unknown>;
  onRequestChanges: (note: string) => Promise<unknown>;
  onUnpublish: () => Promise<unknown>;
  onRestore: () => Promise<unknown>;
}

function Action({ state, children, ...props }: { state: ActionState } & React.ComponentProps<typeof Button>) {
  if (!state.visible) return null;
  const button = (
    <Button size="sm" disabled={!state.enabled} {...props}>
      {children}
    </Button>
  );
  if (state.enabled || !state.reason) return button;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span tabIndex={0} className="rounded-md">
          {button}
        </span>
      </TooltipTrigger>
      <TooltipContent>{state.reason}</TooltipContent>
    </Tooltip>
  );
}

/** Save, discard, submit, approve, request changes, unpublish and restore, by role and state. */
export function WorkflowBar({
  item,
  userId,
  workflow: wf,
  dirty,
  onSave,
  onResetLocal,
  onDiscard,
  onSubmit,
  onApprove,
  onRequestChanges,
  onUnpublish,
  onRestore,
}: WorkflowBarProps) {
  const [dialog, setDialog] = React.useState<Dialog>(null);
  const close = (open: boolean) => !open && setDialog(null);
  const hasDraft = !!item.draft;

  return (
    <div
      role="region"
      aria-label="Workflow"
      className="sticky top-14 z-10 -mx-1 flex flex-col gap-2 rounded-lg border bg-card px-3 py-2 shadow-xs sm:flex-row sm:items-center sm:justify-between"
    >
      <p className="text-sm text-muted-foreground" aria-live="polite">
        {dirty && <span className="mr-1 font-semibold text-warning">Unsaved changes.</span>}
        {workflowStatus(item)}
        {item.draft?.note && item.draft.state !== 'editing' && (
          <span className="block text-xs text-foreground sm:inline sm:pl-1">Note: “{item.draft.note}”</span>
        )}
      </p>
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Action state={wf.discard} variant="ghost" onClick={() => (hasDraft ? setDialog('discard') : onResetLocal())}>
          <Undo2Icon />
          {hasDraft ? 'Discard draft' : 'Discard changes'}
        </Action>
        <Action state={wf.unpublish} variant="outline" onClick={() => setDialog('unpublish')}>
          <EyeOffIcon />
          Unpublish
        </Action>
        <Action state={wf.restore} variant="outline" onClick={() => setDialog('restore')}>
          <ArchiveRestoreIcon />
          Restore
        </Action>
        <Action state={wf.save} variant="outline" onClick={onSave}>
          <SaveIcon />
          Save draft
        </Action>
        <Action state={wf.submit} onClick={() => setDialog('submit')}>
          <SendIcon />
          Submit for review
        </Action>
        <Action state={wf.requestChanges} variant="outline" onClick={() => setDialog('changes')}>
          <MessageSquareWarningIcon />
          Request changes
        </Action>
        <Action
          state={wf.approve}
          className="bg-success text-success-foreground hover:bg-success/90"
          onClick={() => setDialog('approve')}
        >
          <CheckCircle2Icon />
          Approve and publish
        </Action>
      </div>

      <FormDialog
        open={dialog === 'submit'}
        onOpenChange={close}
        title="Submit for review"
        description="A clinician reviews the draft. Nothing reaches the app until they approve it."
        schema={optionalNote}
        defaultValues={{ note: '' }}
        submitLabel="Submit for review"
        onSubmit={(v) => onSubmit(v.note || undefined)}
      >
        {(f) => (
          <FormFieldTextarea
            control={f.control}
            name="note"
            label="Note for the clinician (optional)"
            rows={3}
            maxLength={2000}
          />
        )}
      </FormDialog>
      <ApproveDialog
        item={item}
        userId={userId}
        open={dialog === 'approve'}
        onOpenChange={close}
        onApprove={onApprove}
      />
      <FormDialog
        open={dialog === 'changes'}
        onOpenChange={close}
        title="Request changes"
        description="The draft goes back to the editor with your note."
        schema={requiredNote}
        defaultValues={{ note: '' }}
        submitLabel="Send back"
        onSubmit={(v) => onRequestChanges(v.note)}
      >
        {(f) => (
          <FormFieldTextarea control={f.control} name="note" label="What needs to change" rows={4} maxLength={2000} />
        )}
      </FormDialog>
      <ConfirmDialog
        open={dialog === 'discard'}
        onOpenChange={close}
        title="Discard the draft?"
        description="The draft and any unsaved edits are thrown away. Live stays as it is."
        confirmLabel="Discard draft"
        cancelLabel="Keep draft"
        destructive
        onConfirm={onDiscard}
      />
      <ConfirmDialog
        open={dialog === 'unpublish'}
        onOpenChange={close}
        title="Unpublish this item?"
        description="It disappears from the app and Explore. Live and the draft are kept, and Restore brings it back."
        confirmLabel="Unpublish"
        cancelLabel="Keep it live"
        destructive
        onConfirm={onUnpublish}
      />
      <ConfirmDialog
        open={dialog === 'restore'}
        onOpenChange={close}
        title="Restore this item?"
        description={`Live version ${item.liveVersion} shows in the app and Explore again.`}
        confirmLabel="Restore"
        onConfirm={onRestore}
      />
    </div>
  );
}
