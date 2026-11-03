import { useFormContext, Controller } from 'react-hook-form';
import { JsonEditor } from '@/components/shared';
import { deckIssues, type EditorValues } from '../schemas/editor';

export function DeckTab({ readOnly, required }: { readOnly: boolean; required: boolean }) {
  const { control } = useFormContext<EditorValues>();
  return (
    <Controller
      control={control}
      name="body.deckText"
      render={({ field }) => (
        <JsonEditor
          label="Deck (advanced)"
          description={
            required
              ? 'Type items play this deck: an object with a "type" (V-YNM, L-PP…) and its rounds or questions. Edit with care; the app reads it as is.'
              : 'Optional for this kind. Leave empty for no deck.'
          }
          value={field.value}
          onChange={field.onChange}
          readOnly={readOnly}
          allowEmpty={!required}
          rows={22}
          validate={(v) => {
            const issue = deckIssues(JSON.stringify(v), required);
            return issue ? [issue] : [];
          }}
        />
      )}
    />
  );
}
