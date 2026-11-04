import { zodResolver } from '@hookform/resolvers/zod';
import * as React from 'react';
import { useForm, useFormState } from 'react-hook-form';
import type { ContentItem, ContentSnapshot } from '../api/types';
import { editorSchema, snapshotToForm, type EditorValues } from '../schemas/editor';

const EMPTY: ContentSnapshot = { catalog: { title: '' }, body: {} };

/** The snapshot the editor starts from: the draft when there is one, else live. */
export const editableSnapshot = (item: ContentItem): ContentSnapshot => item.draft?.snapshot ?? item.live ?? EMPTY;

/**
 * One React Hook Form over the whole snapshot, based on one revision of the item (`baseRev`, sent as
 * `expectedRev` on every write). A newer server copy replaces the form only while there are no
 * unsaved edits; with edits the form is `stale` and keeps them (the page shows the conflict). Call
 * `resetTo(item)` after this screen's own writes and to load the latest on purpose; wrap writes in
 * `setWriting` so the cache update they cause does not read as someone else's change.
 */
export function useContentEditor(item: ContentItem) {
  const schema = React.useMemo(() => editorSchema(item.kind), [item.kind]);
  const form = useForm<EditorValues>({
    resolver: zodResolver(schema),
    defaultValues: snapshotToForm(editableSnapshot(item)),
    mode: 'onChange',
  });
  const { isDirty } = useFormState({ control: form.control });
  const [base, setBase] = React.useState(() => ({ rev: item.rev, item }));
  const [conflict, setConflict] = React.useState(false);
  const [writing, setWriting] = React.useState(false);

  // A newer server copy and a clean form: take it (state adjusted while rendering, not in an effect).
  if (item.rev !== base.rev && !isDirty && !writing && !conflict) setBase({ rev: item.rev, item });

  // The form follows the base it is built on.
  React.useEffect(() => {
    form.reset(snapshotToForm(editableSnapshot(base.item)));
  }, [base, form]);

  const resetTo = React.useCallback((next: ContentItem) => {
    setBase({ rev: next.rev, item: next });
    setConflict(false);
  }, []);

  const stale = conflict || (item.rev !== base.rev && isDirty && !writing);
  return { form, baseRev: base.rev, stale, markConflict: () => setConflict(true), resetTo, setWriting };
}
