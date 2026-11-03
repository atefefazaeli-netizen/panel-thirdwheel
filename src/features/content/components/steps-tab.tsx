import { PlusIcon } from 'lucide-react';
import { useFieldArray, useFormContext, useWatch } from 'react-hook-form';
import { EmptyState, FormFieldNumber, FormFieldText, FormFieldTextarea } from '@/components/shared';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { emptyStep, LIMITS, type EditorValues } from '../schemas/editor';
import { ListItemControls } from './list-item-controls';

function StepFields({ index, readOnly }: { index: number; readOnly: boolean }) {
  const { control, setValue } = useFormContext<EditorValues>();
  const swap = useWatch({ control, name: `body.steps.${index}.swap` });
  return (
    <div className="grid items-start gap-4 md:grid-cols-4">
      <FormFieldText
        control={control}
        name={`body.steps.${index}.title`}
        label="Title"
        maxLength={LIMITS.stepTitle}
        className="md:col-span-4"
      />
      <FormFieldTextarea
        control={control}
        name={`body.steps.${index}.body`}
        label="Instruction"
        rows={3}
        maxLength={LIMITS.text}
        className="md:col-span-4"
      />
      <FormFieldNumber
        control={control}
        name={`body.steps.${index}.minutes`}
        label="Timer"
        suffix="min"
        min={1}
        description="Empty = no timer."
      />
      <FormFieldNumber
        control={control}
        name={`body.steps.${index}.swapAt`}
        label="Swap at"
        suffix="min"
        min={1}
        description="Swap buzz."
      />
      <FormFieldText
        control={control}
        name={`body.steps.${index}.lead`}
        label="Lead line"
        placeholder="talks first"
        className="md:col-span-2"
      />
      <div className="flex flex-col gap-3 md:col-span-4">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">Hand-over at the swap</span>
          {!readOnly && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                setValue(`body.steps.${index}.swap`, swap ? null : { verb: '', verbIng: '', object: '' }, {
                  shouldDirty: true,
                })
              }
            >
              {swap ? 'Remove hand-over' : 'Add hand-over'}
            </Button>
          )}
        </div>
        {swap && (
          <div className="grid items-start gap-3 sm:grid-cols-3">
            <FormFieldText control={control} name={`body.steps.${index}.swap.verb`} label="Verb" placeholder="kneads" />
            <FormFieldText
              control={control}
              name={`body.steps.${index}.swap.verbIng`}
              label="-ing form"
              placeholder="kneading"
            />
            <FormFieldText
              control={control}
              name={`body.steps.${index}.swap.object`}
              label="What is handed over"
              placeholder="the dough"
            />
          </div>
        )}
      </div>
    </div>
  );
}

export function StepsTab({ readOnly, plays }: { readOnly: boolean; plays: boolean }) {
  const { control } = useFormContext<EditorValues>();
  const { fields, append, remove, move } = useFieldArray({ control, name: 'body.steps' });
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">
        {plays ? 'The Do screens build their step by step from these.' : 'This kind does not play steps.'}
      </p>
      {fields.length === 0 && (
        <EmptyState
          title="No steps"
          description={plays ? 'Add the first step.' : 'Nothing to edit here for this kind.'}
        />
      )}
      {fields.map((f, i) => (
        <Card key={f.id} className="gap-3 py-4">
          <CardHeader className="flex flex-row items-center justify-between px-4">
            <CardTitle className="text-sm">Step {i + 1}</CardTitle>
            {!readOnly && (
              <ListItemControls
                index={i}
                count={fields.length}
                noun="step"
                onMove={(to) => move(i, to)}
                onRemove={() => remove(i)}
              />
            )}
          </CardHeader>
          <CardContent className="px-4">
            <StepFields index={i} readOnly={readOnly} />
          </CardContent>
        </Card>
      ))}
      {!readOnly && (
        <Button
          type="button"
          variant="outline"
          className="self-start"
          disabled={fields.length >= LIMITS.steps}
          onClick={() => append(emptyStep(), { shouldFocus: true })}
        >
          <PlusIcon />
          Add step
        </Button>
      )}
    </div>
  );
}
