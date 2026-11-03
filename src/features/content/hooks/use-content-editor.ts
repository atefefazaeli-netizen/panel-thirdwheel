import { zodResolver } from '@hookform/resolvers/zod';
import * as React from 'react';
import { useForm } from 'react-hook-form';
import type { ContentItem, ContentSnapshot } from '../api/types';
import { editorSchema, snapshotToForm, type EditorValues } from '../schemas/editor';

const EMPTY: ContentSnapshot = { catalog: { title: '' }, body: {} };

/** The snapshot the editor starts from: the draft when there is one, else live. */
export const editableSnapshot = (item: ContentItem): ContentSnapshot => item.draft?.snapshot ?? item.live ?? EMPTY;

/** One React Hook Form over the whole snapshot. Resets when the server copy changes. */
export function useContentEditor(item: ContentItem) {
  const schema = React.useMemo(() => editorSchema(item.kind), [item.kind]);
  const form = useForm<EditorValues>({
    resolver: zodResolver(schema),
    defaultValues: snapshotToForm(editableSnapshot(item)),
    mode: 'onChange',
  });
  const version = `${item.updatedAt}|${item.draft?.at ?? ''}`;
  const last = React.useRef(version);
  React.useEffect(() => {
    if (last.current === version) return;
    last.current = version;
    form.reset(snapshotToForm(editableSnapshot(item)));
  }, [version, item, form]);
  return form;
}
