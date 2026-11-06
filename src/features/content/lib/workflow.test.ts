import { describe, expect, it } from 'vitest';
import type { ContentItem } from '../api/types';
import { BUILTIN_ROLES } from '@/lib/permissions';
import { workflowFor, workflowStatus, type Workflow } from './workflow';

// The editing side (what the old admin role could do) and the clinical side, as permissions.
const WRITER = ['content.read', 'content.edit', 'content.submit', 'content.unpublish'];
const APPROVER = ['content.read', 'content.approve'];
const BOTH = [...WRITER, 'content.approve'];
const role = (key: string) => [...BUILTIN_ROLES.find((r) => r.key === key)!.permissions];

const snap = { catalog: { title: 'My perfect day' }, body: {} };
const item = (
  draft: NonNullable<ContentItem['draft']>['state'] | null,
  extra: Partial<ContentItem> = {},
): Pick<ContentItem, 'draft' | 'retired' | 'liveVersion'> => ({
  liveVersion: 1,
  retired: false,
  draft: draft
    ? {
        snapshot: snap,
        state: draft,
        note: null,
        by: 'stf_1',
        byEmail: 'lead@thirdwheel.app',
        at: '2026-11-03T10:00:00Z',
        source: 'panel',
      }
    : null,
  ...extra,
});
const visible = (wf: Workflow) =>
  Object.entries(wf)
    .filter(([, s]) => s.visible)
    .map(([k]) => k)
    .sort();
const enabled = (wf: Workflow) =>
  Object.entries(wf)
    .filter(([, s]) => s.enabled)
    .map(([k]) => k)
    .sort();

describe('content workflow buttons', () => {
  it('built-in roles: the editor writes and submits, the reviewer approves and unpublishes, the analyst reads', () => {
    expect(visible(workflowFor(item('editing'), role('content_editor'), { dirty: false }))).toEqual([
      'discard',
      'save',
      'submit',
    ]);
    expect(visible(workflowFor(item('in_review'), role('content_reviewer'), { dirty: false }))).toEqual([
      'approve',
      'requestChanges',
      'unpublish',
    ]);
    expect(visible(workflowFor(item('in_review'), role('analyst'), { dirty: false }))).toEqual([]);
    expect(visible(workflowFor(item('in_review'), role('owner'), { dirty: false }))).toEqual([
      'approve',
      'discard',
      'requestChanges',
      'save',
      'unpublish',
    ]);
  });

  it('admin, no draft, clean: save disabled, submit asks for a draft, unpublish available', () => {
    const wf = workflowFor(item(null), WRITER, { dirty: false });
    expect(visible(wf)).toEqual(['save', 'submit', 'unpublish']);
    expect(enabled(wf)).toEqual(['unpublish']);
    expect(wf.submit.reason).toBe('Save a draft first');
  });

  it('admin with unsaved edits: save and discard, submit waits for the save', () => {
    const wf = workflowFor(item('editing'), WRITER, { dirty: true });
    expect(enabled(wf)).toEqual(['discard', 'save', 'unpublish']);
    expect(wf.submit.reason).toBe('Save the draft first');
  });

  it('admin with a saved draft can submit for review', () => {
    expect(enabled(workflowFor(item('editing'), WRITER, { dirty: false }))).toEqual(['discard', 'submit', 'unpublish']);
    expect(enabled(workflowFor(item('changes_requested'), WRITER, { dirty: false }))).toContain('submit');
  });

  it('admin only: a draft in review cannot be approved or submitted again', () => {
    const wf = workflowFor(item('in_review'), WRITER, { dirty: false });
    expect(wf.approve.visible).toBe(false);
    expect(wf.requestChanges.visible).toBe(false);
    expect(wf.submit.visible).toBe(false);
    expect(wf.discard.enabled).toBe(true);
  });

  it('clinician only: approve and request changes on a draft in review, nothing else', () => {
    const wf = workflowFor(item('in_review'), APPROVER, { dirty: false });
    expect(visible(wf)).toEqual(['approve', 'requestChanges']);
    expect(enabled(wf)).toEqual(['approve', 'requestChanges']);
  });

  it('clinician only: no buttons when nothing is in review', () => {
    for (const s of [null, 'editing', 'changes_requested'] as const)
      expect(visible(workflowFor(item(s), APPROVER, { dirty: false }))).toEqual([]);
  });

  it('both roles see both sets on a draft in review', () => {
    expect(visible(workflowFor(item('in_review'), BOTH, { dirty: false }))).toEqual([
      'approve',
      'discard',
      'requestChanges',
      'save',
      'unpublish',
    ]);
  });

  it('approve waits while there are unsaved edits', () => {
    const wf = workflowFor(item('in_review'), BOTH, { dirty: true });
    expect(wf.approve.enabled).toBe(false);
  });

  it('retired items offer restore, not unpublish; never-published items offer neither', () => {
    const r = workflowFor(item(null, { retired: true }), WRITER, { dirty: false });
    expect(r.restore.enabled).toBe(true);
    expect(r.unpublish.visible).toBe(false);
    const n = workflowFor(item('editing', { liveVersion: 0 }), WRITER, { dirty: false });
    expect(n.unpublish.visible).toBe(false);
    expect(n.restore.visible).toBe(false);
  });

  it('disables save while the form is invalid and everything while busy', () => {
    expect(workflowFor(item('editing'), WRITER, { dirty: true, valid: false }).save.reason).toBe(
      'Fix the errors first',
    );
    expect(enabled(workflowFor(item('editing'), BOTH, { dirty: false, busy: true }))).toEqual([]);
  });

  it('describes the state in words', () => {
    expect(workflowStatus(item('in_review'))).toBe('Live v1. Draft waiting for a clinician.');
    expect(workflowStatus(item(null, { retired: true }))).toBe('Live v1 (unpublished, hidden from the app). No draft.');
    expect(workflowStatus(item('editing', { liveVersion: 0 }))).toBe('Never published. Draft in progress.');
  });
});
