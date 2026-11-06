// Which workflow buttons the item editor shows, per permission and state (STAFF_API.md §4 and
// ADMIN_API.md › Content): content.edit saves and discards drafts, content.submit sends them for
// review, content.unpublish unpublishes and restores, content.approve approves and requests changes
// on a draft in review (the clinician gate). The permissions come from the server's session.
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
  permissions: readonly string[],
  opts: { dirty: boolean; valid?: boolean; busy?: boolean; stale?: boolean },
): Workflow {
  const edit = permissions.includes('content.edit');
  const submit = permissions.includes('content.submit');
  const unpublish = permissions.includes('content.unpublish');
  const approve = permissions.includes('content.approve');
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

  if (edit) {
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
  }
  if (submit) {
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
  }
  if (unpublish) {
    if (item.retired) wf.restore = busy ? off('Working') : on;
    else if (item.liveVersion > 0) wf.unpublish = busy ? off('Working') : on;
  }

  if (approve && state === 'in_review') {
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
