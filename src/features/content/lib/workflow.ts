// Which workflow buttons the item editor shows, per role and state (ADMIN_API.md › Content):
// admins save, discard and submit drafts, unpublish and restore; clinicians approve and request
// changes on a draft in review. An account with both roles sees both sets.
import type { ContentItem } from '../api/types';

export type WorkflowAction = 'save' | 'discard' | 'submit' | 'approve' | 'requestChanges' | 'unpublish' | 'restore';

export interface ActionState {
  visible: boolean;
  enabled: boolean;
  /** Why it is disabled (tooltip). */
  reason?: string;
}

export type Workflow = Record<WorkflowAction, ActionState>;

const hidden: ActionState = { visible: false, enabled: false };
const on: ActionState = { visible: true, enabled: true };
const off = (reason: string): ActionState => ({ visible: true, enabled: false, reason });

export function workflowFor(
  item: Pick<ContentItem, 'draft' | 'retired' | 'liveVersion'>,
  roles: readonly string[],
  opts: { dirty: boolean; valid?: boolean; busy?: boolean; stale?: boolean },
): Workflow {
  const admin = roles.includes('admin');
  const clinician = roles.includes('clinician');
  const state = item.draft?.state ?? null;
  const busy = !!opts.busy;
  // Someone else changed the item: every write waits until the latest is loaded.
  const stale = !!opts.stale;
  const wf: Workflow = {
    save: hidden,
    discard: hidden,
    submit: hidden,
    approve: hidden,
    requestChanges: hidden,
    unpublish: hidden,
    restore: hidden,
  };

  if (admin) {
    wf.save = stale
      ? off('Changed by someone else: load the latest first')
      : !opts.dirty
      ? off('No changes to save')
      : opts.valid === false
        ? off('Fix the errors first')
        : busy
          ? off('Working')
          : on;
    if (state || opts.dirty) wf.discard = busy ? off('Working') : on;
    if (state !== 'in_review') {
      wf.submit =
        !state && !opts.dirty
          ? off('Save a draft first')
          : opts.dirty
            ? off('Save the draft first')
            : busy
              ? off('Working')
              : on;
    }
    if (item.retired) wf.restore = busy ? off('Working') : on;
    else if (item.liveVersion > 0) wf.unpublish = busy ? off('Working') : on;
  }

  if (clinician && state === 'in_review') {
    wf.approve = stale
      ? off('Changed by someone else: load the latest and review it again')
      : opts.dirty
        ? off('Unsaved edits: save or discard them first')
        : busy
          ? off('Working')
          : on;
    wf.requestChanges = stale ? off('Changed by someone else: load the latest first') : busy ? off('Working') : on;
  }
  return wf;
}

/** A one-line status for the workflow bar. */
export function workflowStatus(item: Pick<ContentItem, 'draft' | 'retired' | 'liveVersion'>): string {
  const live = item.liveVersion > 0 ? `Live v${item.liveVersion}` : 'Never published';
  const hiddenNote = item.retired ? ' (unpublished, hidden from the app)' : '';
  if (!item.draft) return `${live}${hiddenNote}. No draft.`;
  const draft = {
    editing: 'Draft in progress',
    in_review: 'Draft waiting for a clinician',
    changes_requested: 'Changes requested on the draft',
  }[item.draft.state];
  return `${live}${hiddenNote}. ${draft}.`;
}
