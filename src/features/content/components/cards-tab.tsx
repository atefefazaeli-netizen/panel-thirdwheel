import { ChevronDownIcon, PlusIcon } from 'lucide-react';
import * as React from 'react';
import { useFieldArray, useFormContext, useWatch } from 'react-hook-form';
import {
  EmptyState,
  FormFieldNumber,
  FormFieldSelect,
  FormFieldSwitch,
  FormFieldTags,
  FormFieldText,
  FormFieldTextarea,
} from '@/components/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { FormMessage } from '@/components/ui/form';
import { cn } from '@/lib/utils';
import { emptyCard, LIMITS, type EditorValues } from '../schemas/editor';
import { ListItemControls } from './list-item-controls';

function CardFields({ index, readOnly }: { index: number; readOnly: boolean }) {
  const { control, setValue } = useFormContext<EditorValues>();
  const [more, setMore] = React.useState(false);
  const card = useWatch({ control, name: `body.cards.${index}` });
  const extras = [
    card?.intro,
    card?.secondary,
    card?.followUp,
    card?.softCheck,
    card?.early,
    card?.pick?.length,
    card?.label,
    card?.scale,
    card?.item,
    card?.items?.length,
    card?.list?.length,
  ].filter(Boolean).length;
  const moreId = `card-${index}-more`;
  return (
    <div className="flex flex-col gap-3">
      <FormFieldTextarea
        control={control}
        name={`body.cards.${index}.text`}
        label="Card text"
        hideLabel
        rows={2}
        maxLength={LIMITS.text}
      />
      <div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="-ml-2 h-7"
          aria-expanded={more}
          aria-controls={moreId}
          onClick={() => setMore((v) => !v)}
        >
          <ChevronDownIcon className={cn('transition-transform', more && 'rotate-180')} />
          More
          {extras > 0 && <Badge variant="secondary">{extras}</Badge>}
        </Button>
      </div>
      {more && (
        <div id={moreId} className="grid gap-4 rounded-md border bg-muted/40 p-3 md:grid-cols-2">
          <FormFieldText
            control={control}
            name={`body.cards.${index}.intro`}
            label="Intro line"
            placeholder="If relevant to your circumstances"
          />
          <FormFieldSelect
            control={control}
            name={`body.cards.${index}.secondary`}
            label="Extra answers"
            noneLabel="None"
            options={[
              { value: 'Everyday', label: 'Everyday (Not applicable · Prefer not to answer)' },
              { value: 'Sensitive', label: 'Sensitive (Pass · Not now)' },
            ]}
          />
          <FormFieldText
            control={control}
            name={`body.cards.${index}.followUp`}
            label="Follow-up chip"
            className="md:col-span-2"
          />
          <FormFieldSwitch
            control={control}
            name={`body.cards.${index}.softCheck`}
            label="Soft check"
            description="Both confirm they are comfortable first."
          />
          <FormFieldSwitch
            control={control}
            name={`body.cards.${index}.early`}
            label="Early in the deck"
            description="Placed before the playful cards."
          />
          <FormFieldTags
            control={control}
            name={`body.cards.${index}.pick`}
            label="Options (pick)"
            description="Only when the card spells them out."
          />
          <FormFieldText
            control={control}
            name={`body.cards.${index}.label`}
            label="Group label"
            placeholder="Analysts"
          />
          <FormFieldTags control={control} name={`body.cards.${index}.items`} label="Items on the card" />
          <FormFieldTags control={control} name={`body.cards.${index}.list`} label="Pick-list" />
          <div className="flex flex-col gap-3 md:col-span-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Scale</span>
              {!readOnly && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setValue(`body.cards.${index}.scale`, card?.scale ? null : { min: 1, max: 5, low: '', high: '' }, {
                      shouldDirty: true,
                    })
                  }
                >
                  {card?.scale ? 'Remove scale' : 'Add scale'}
                </Button>
              )}
            </div>
            {card?.scale && (
              <div className="grid gap-3 sm:grid-cols-4">
                <FormFieldNumber control={control} name={`body.cards.${index}.scale.min`} label="Min" />
                <FormFieldNumber control={control} name={`body.cards.${index}.scale.max`} label="Max" />
                <FormFieldText
                  control={control}
                  name={`body.cards.${index}.scale.low`}
                  label="Low end"
                  placeholder="Disagree"
                />
                <FormFieldText
                  control={control}
                  name={`body.cards.${index}.scale.high`}
                  label="High end"
                  placeholder="Agree"
                />
              </div>
            )}
          </div>
          <div className="flex flex-col gap-3 md:col-span-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Rank or who-does-it item</span>
              {!readOnly && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setValue(`body.cards.${index}.item`, card?.item ? null : { title: '', line: '' }, {
                      shouldDirty: true,
                    })
                  }
                >
                  {card?.item ? 'Remove item' : 'Add item'}
                </Button>
              )}
            </div>
            {card?.item && (
              <div className="grid gap-3 sm:grid-cols-2">
                <FormFieldText
                  control={control}
                  name={`body.cards.${index}.item.title`}
                  label="Item"
                  placeholder="Dishes"
                />
                <FormFieldText control={control} name={`body.cards.${index}.item.line`} label="Description" />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function CardsTab({ readOnly, plays }: { readOnly: boolean; plays: boolean }) {
  const { control, formState } = useFormContext<EditorValues>();
  const { fields, append, remove, move } = useFieldArray({ control, name: 'body.cards' });
  const rootError = formState.errors.body?.cards?.root?.message ?? formState.errors.body?.cards?.message;
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">
        {plays
          ? 'This kind plays these cards, in this order.'
          : 'This kind plays its deck, not these cards. Cards here are kept but not shown.'}
      </p>
      {rootError && <FormMessage className="text-destructive">{rootError}</FormMessage>}
      {fields.length === 0 && (
        <EmptyState title="No cards" description={plays ? 'Add the first card.' : 'This kind does not use cards.'} />
      )}
      {fields.map((f, i) => (
        <Card key={f.id} className="gap-3 py-4">
          <CardHeader className="flex flex-row items-center justify-between px-4">
            <CardTitle className="text-sm">Card {i + 1}</CardTitle>
            {!readOnly && (
              <ListItemControls
                index={i}
                count={fields.length}
                noun="card"
                onMove={(to) => move(i, to)}
                onRemove={() => remove(i)}
              />
            )}
          </CardHeader>
          <CardContent className="px-4">
            <CardFields index={i} readOnly={readOnly} />
          </CardContent>
        </Card>
      ))}
      {!readOnly && (
        <Button
          type="button"
          variant="outline"
          className="self-start"
          disabled={fields.length >= LIMITS.cards}
          onClick={() => append(emptyCard(), { shouldFocus: true })}
        >
          <PlusIcon />
          Add card
        </Button>
      )}
    </div>
  );
}
