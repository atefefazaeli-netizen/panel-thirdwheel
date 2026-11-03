import { describe, expect, it } from 'vitest';
import type { ContentItem } from '../api/types';
import { workflowFor, workflowStatus, type Workflow } from './workflow';

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
  it('admin, no draft, clean: save disabled, submit asks for a draft, unpublish available', () => {
    const wf = workflowFor(item(null), ['admin'], { dirty: false });
    expect(visible(wf)).toEqual(['save', 'submit', 'unpublish']);
    expect(enabled(wf)).toEqual(['unpublish']);
    expect(wf.submit.reason).toBe('Save a draft first');
  });

  it('admin with unsaved edits: save and discard, submit waits for the save', () => {
    const wf = workflowFor(item('editing'), ['admin'], { dirty: true });
    expect(enabled(wf)).toEqual(['discard', 'save', 'unpublish']);
    expect(wf.submit.reason).toBe('Save the draft first');
  });

  it('admin with a saved draft can submit for review', () => {
    expect(enabled(workflowFor(item('editing'), ['admin'], { dirty: false }))).toEqual([
      'discard',
      'submit',
      'unpublish',
    ]);
    expect(enabled(workflowFor(item('changes_requested'), ['admin'], { dirty: false }))).toContain('submit');
  });

  it('admin only: a draft in review cannot be approved or submitted again', () => {
    const wf = workflowFor(item('in_review'), ['admin'], { dirty: false });
    expect(wf.approve.visible).toBe(false);
    expect(wf.requestChanges.visible).toBe(false);
    expect(wf.submit.visible).toBe(false);
    expect(wf.discard.enabled).toBe(true);
  });

  it('clinician only: approve and request changes on a draft in review, nothing else', () => {
    const wf = workflowFor(item('in_review'), ['clinician'], { dirty: false });
    expect(visible(wf)).toEqual(['approve', 'requestChanges']);
    expect(enabled(wf)).toEqual(['approve', 'requestChanges']);
  });

  it('clinician only: no buttons when nothing is in review', () => {
    for (const s of [null, 'editing', 'changes_requested'] as const)
      expect(visible(workflowFor(item(s), ['clinician'], { dirty: false }))).toEqual([]);
  });

  it('both roles see both sets on a draft in review', () => {
    expect(visible(workflowFor(item('in_review'), ['admin', 'clinician'], { dirty: false }))).toEqual([
      'approve',
      'discard',
      'requestChanges',
      'save',
      'unpublish',
    ]);
  });

  it('approve waits while there are unsaved edits', () => {
    const wf = workflowFor(item('in_review'), ['admin', 'clinician'], { dirty: true });
    expect(wf.approve.enabled).toBe(false);
  });

  it('retired items offer restore, not unpublish; never-published items offer neither', () => {
    const r = workflowFor(item(null, { retired: true }), ['admin'], { dirty: false });
    expect(r.restore.enabled).toBe(true);
    expect(r.unpublish.visible).toBe(false);
    const n = workflowFor(item('editing', { liveVersion: 0 }), ['admin'], { dirty: false });
    expect(n.unpublish.visible).toBe(false);
    expect(n.restore.visible).toBe(false);
  });

  it('disables save while the form is invalid and everything while busy', () => {
    expect(workflowFor(item('editing'), ['admin'], { dirty: true, valid: false }).save.reason).toBe(
      'Fix the errors first',
    );
    expect(enabled(workflowFor(item('editing'), ['admin', 'clinician'], { dirty: false, busy: true }))).toEqual([]);
  });

  it('describes the state in words', () => {
    expect(workflowStatus(item('in_review'))).toBe('Live v1. Draft waiting for a clinician.');
    expect(workflowStatus(item(null, { retired: true }))).toBe('Live v1 (unpublished, hidden from the app). No draft.');
    expect(workflowStatus(item('editing', { liveVersion: 0 }))).toBe('Never published. Draft in progress.');
  });
});
