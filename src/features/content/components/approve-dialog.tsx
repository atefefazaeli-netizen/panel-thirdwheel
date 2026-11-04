import { AlertTriangleIcon, StethoscopeIcon } from 'lucide-react';
import { z } from 'zod';
import { FormDialog, FormFieldTextarea } from '@/components/shared';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Checkbox } from '@/components/ui/checkbox';
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import type { ContentItem } from '../api/types';
import { isSelfApproval, partLabel } from '../lib/review';
import { HeldBanner } from './review-status';

export interface ApproveValues {
  note: string;
  acknowledgeHeld: boolean;
}

/**
 * Approve and publish, with what the clinician must know first: approving their own draft (allowed,
 * recorded), a held-list match (needs the acknowledgement), and which review flags the approval clears.
 * The approval carries the revision on screen, so a draft changed meanwhile is refused (409).
 */
export function ApproveDialog({
  item,
  userId,
  open,
  onOpenChange,
  onApprove,
}: {
  item: ContentItem;
  userId: string | null | undefined;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onApprove: (v: { note?: string; acknowledgeHeld: boolean }) => Promise<unknown>;
}) {
  const held = item.heldMatch;
  const schema = z
    .object({ note: z.string().trim().max(2000), acknowledgeHeld: z.boolean() })
    .refine((v) => !held || v.acknowledgeHeld, {
      path: ['acknowledgeHeld'],
      message: 'Confirm you checked the held content before approving.',
    });
  const self = isSelfApproval(item, userId);
  return (
    <FormDialog<ApproveValues>
      open={open}
      onOpenChange={onOpenChange}
      title="Approve and publish"
      description={`The draft you are looking at (revision ${item.rev}) goes live as version ${item.liveVersion + 1}${item.retired ? ', but stays hidden while the item is unpublished' : ''}. The app picks it up on its next content check.`}
      schema={schema}
      defaultValues={{ note: '', acknowledgeHeld: false }}
      submitLabel="Approve and publish"
      onSubmit={(v) => onApprove({ note: v.note || undefined, acknowledgeHeld: v.acknowledgeHeld })}
    >
      {(f) => (
        <>
          {self && (
            <Alert className="border-warning/40 bg-warning-soft/40" role="alert">
              <AlertTriangleIcon />
              <AlertTitle>You last edited this draft</AlertTitle>
              <AlertDescription>
                Approving your own edit is allowed (the product owner has not decided otherwise), and the change log
                records it as self-approved. Ask another clinician if you can.
              </AlertDescription>
            </Alert>
          )}
          {item.needsReview && item.provenance && (
            <Alert>
              <StethoscopeIcon />
              <AlertTitle>This clears the clinical review flags</AlertTitle>
              <AlertDescription>
                Approving confirms the whole item, including:{' '}
                {item.provenance.needsReview.map((n) => partLabel(n.part)).join(', ')}. It is recorded with your name.
              </AlertDescription>
            </Alert>
          )}
          {held && (
            <>
              <HeldBanner match={held} />
              <FormField
                control={f.control}
                name="acknowledgeHeld"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-start gap-2">
                    <FormControl>
                      <Checkbox checked={field.value} onCheckedChange={(c) => field.onChange(c === true)} />
                    </FormControl>
                    <div className="flex flex-col gap-1">
                      <FormLabel className="font-normal">
                        I checked this against the held list and approve it anyway
                      </FormLabel>
                      <FormMessage />
                    </div>
                  </FormItem>
                )}
              />
            </>
          )}
          <FormFieldTextarea control={f.control} name="note" label="Note (optional)" rows={3} maxLength={2000} />
        </>
      )}
    </FormDialog>
  );
}
