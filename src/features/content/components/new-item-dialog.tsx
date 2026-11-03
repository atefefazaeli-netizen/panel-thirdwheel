import { useNavigate } from '@tanstack/react-router';
import { PlusIcon } from 'lucide-react';
import * as React from 'react';
import { useWatch, type UseFormReturn } from 'react-hook-form';
import { toast } from 'sonner';
import { FormDialog, FormFieldSelect, FormFieldText, FormFieldTextarea } from '@/components/shared';
import { Button } from '@/components/ui/button';
import { ApiError, errorMessage } from '@/lib/api';
import { KINDS_BY_PILLAR, type ContentPillar } from '../api/types';
import { useContentFacets, useCreateContent } from '../api/queries';
import { categoryLabel, KIND_LABEL, PILLAR_LABEL } from '../lib/labels';
import { newItemSchema, slugify, starterSnapshot, type NewItemValues } from '../schemas/new-item';

export function NewItemDialog({ defaultPillar = 'quiz' }: { defaultPillar?: ContentPillar }) {
  const [open, setOpen] = React.useState(false);
  const create = useCreateContent();
  const facets = useContentFacets();
  const navigate = useNavigate();

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <PlusIcon />
        New item
      </Button>
      <FormDialog<NewItemValues>
        open={open}
        onOpenChange={setOpen}
        title="New content item"
        description="It starts as a draft. A clinician approves it before it reaches the app."
        schema={newItemSchema}
        defaultValues={{
          id: '',
          code: '',
          pillar: defaultPillar,
          kind: KINDS_BY_PILLAR[defaultPillar][0],
          title: '',
          category: '',
          deckType: '',
          firstCard: '',
        }}
        submitLabel="Create draft"
        onSubmit={async (v) => {
          try {
            const item = await create.mutateAsync({
              id: v.id,
              code: v.code || null,
              pillar: v.pillar,
              kind: v.kind,
              snapshot: starterSnapshot(v),
            });
            toast.success(`Created ${item.id}`);
            await navigate({ to: '/content/$id', params: { id: item.id } });
          } catch (e) {
            toast.error(
              e instanceof ApiError && e.code === 'INVALID_CONTENT' && Array.isArray(e.details)
                ? e.details.join('; ')
                : errorMessage(e),
            );
            throw e;
          }
        }}
      >
        {(form) => <NewItemFields form={form} categories={facets.data?.categories ?? []} />}
      </FormDialog>
    </>
  );
}

function NewItemFields({ form, categories }: { form: UseFormReturn<NewItemValues>; categories: string[] }) {
  const pillar = useWatch({ control: form.control, name: 'pillar' }) as ContentPillar;
  const kind = useWatch({ control: form.control, name: 'kind' });
  const title = useWatch({ control: form.control, name: 'title' });
  const idTouched = form.formState.dirtyFields.id;

  // Suggest the id from the title until the id is edited by hand.
  React.useEffect(() => {
    if (!idTouched) form.setValue('id', slugify(title ?? ''));
  }, [title, idTouched, form]);

  // Keep the kind valid for the pillar.
  React.useEffect(() => {
    if (!KINDS_BY_PILLAR[pillar].includes(kind)) form.setValue('kind', KINDS_BY_PILLAR[pillar][0]!);
  }, [pillar, kind, form]);

  return (
    <>
      <FormFieldText control={form.control} name="title" label="Title" placeholder="Date night jar" />
      <div className="grid gap-4 sm:grid-cols-2">
        <FormFieldText
          control={form.control}
          name="id"
          label="Id"
          description="The slug the app links to. It never changes."
        />
        <FormFieldText
          control={form.control}
          name="code"
          label="Code"
          placeholder="D-1-09"
          description="Optional, like Q-1-01."
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <FormFieldSelect
          control={form.control}
          name="pillar"
          label="Pillar"
          options={(['quiz', 'play', 'do'] as const).map((p) => ({ value: p, label: PILLAR_LABEL[p] }))}
        />
        <FormFieldSelect
          control={form.control}
          name="kind"
          label="Kind"
          options={KINDS_BY_PILLAR[pillar].map((k) => ({ value: k, label: KIND_LABEL[k] ?? k }))}
        />
        <FormFieldSelect
          control={form.control}
          name="category"
          label="Category"
          options={categories.map((c) => ({ value: c, label: categoryLabel(c) }))}
        />
      </div>
      {kind.startsWith('type-') && (
        <FormFieldText
          control={form.control}
          name="deckType"
          label="Deck type"
          placeholder="V-YNM"
          description="The quiz or game type this deck plays."
        />
      )}
      {(kind === 'quiz-turn' || kind === 'quiz-deck') && (
        <FormFieldTextarea control={form.control} name="firstCard" label="First card" rows={2} maxLength={1000} />
      )}
    </>
  );
}
