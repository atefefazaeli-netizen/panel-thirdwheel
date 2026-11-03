import { zodResolver } from '@hookform/resolvers/zod';
import * as React from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import {
  DrawerPreview,
  FormFieldMultiSelect,
  FormFieldSelect,
  FormFieldTags,
  FormFieldText,
  FormFieldTextarea,
} from '@/components/shared';
import { Button } from '@/components/ui/button';
import { Form } from '@/components/ui/form';
import { errorMessage } from '@/lib/api';
import { useSaveExperience } from '../api/queries';
import { DUR_VALUES, EXP_KEYS, KIDS_VALUES, LIVING_VALUES, type Experience } from '../api/types';
import { formToXp, xpToForm } from '../lib/codec';
import { experienceSchema, type ExperienceForm } from '../schemas/legacy';

const opts = (vals: readonly string[]) => vals.map((v) => ({ value: v, label: v }));

export function ExperienceEditor({
  open,
  onOpenChange,
  experience,
  labels,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  experience: Experience | null;
  labels: Record<string, string>;
}) {
  const save = useSaveExperience();
  const form = useForm<ExperienceForm>({
    resolver: zodResolver(experienceSchema),
    defaultValues: xpToForm(experience),
  });
  React.useEffect(() => {
    if (open) form.reset(xpToForm(experience));
  }, [open, experience, form]);

  const submit = form.handleSubmit(async (values) => {
    try {
      await save.mutateAsync({ x: formToXp(values), isNew: !experience });
      toast.success(experience ? 'Experience saved' : 'Experience added');
      onOpenChange(false);
    } catch (e) {
      toast.error(errorMessage(e));
    }
  });

  return (
    <DrawerPreview
      open={open}
      onOpenChange={onOpenChange}
      title={experience ? `Edit ${experience.id}` : 'New experience'}
      description="Round 1 experience pool. Shown only when every 'only' field matches the couple."
      size="xl"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => void submit()} disabled={save.isPending}>
            {experience ? 'Save experience' : 'Add experience'}
          </Button>
        </div>
      }
    >
      <Form {...form}>
        <form onSubmit={submit} className="grid items-start gap-4 sm:grid-cols-2" noValidate>
          <FormFieldText control={form.control} name="id" label="Id" placeholder="x-picnic" disabled={!!experience} />
          <FormFieldSelect
            control={form.control}
            name="exp"
            label="Bucket"
            options={EXP_KEYS.map((k) => ({ value: k, label: labels[k] ?? k }))}
          />
          <FormFieldText control={form.control} name="title" label="Title" maxLength={140} className="sm:col-span-2" />
          <FormFieldText
            control={form.control}
            name="meta"
            label="Meta line"
            maxLength={160}
            className="sm:col-span-2"
          />
          <FormFieldTextarea
            control={form.control}
            name="reason"
            label="Why it fits"
            rows={2}
            maxLength={300}
            className="sm:col-span-2"
          />
          <FormFieldTags control={form.control} name="items" label="Items" max={12} className="sm:col-span-2" />
          <FormFieldText control={form.control} name="tag" label="Tag" maxLength={40} />
          <FormFieldText control={form.control} name="kind" label="Kind" maxLength={20} />
          <FormFieldMultiSelect
            control={form.control}
            name="onlyDur"
            label="Only for (how long together)"
            options={opts(DUR_VALUES)}
            className="sm:col-span-2"
          />
          <FormFieldMultiSelect
            control={form.control}
            name="onlyKids"
            label="Only for (kids)"
            options={opts(KIDS_VALUES)}
          />
          <FormFieldMultiSelect
            control={form.control}
            name="onlyLiving"
            label="Only for (living)"
            options={opts(LIVING_VALUES)}
          />
          <FormFieldMultiSelect
            control={form.control}
            name="no"
            label="Hidden for (how long together)"
            options={opts(DUR_VALUES)}
            className="sm:col-span-2"
          />
          <FormFieldTextarea
            control={form.control}
            name="pText"
            label="Score weights (JSON)"
            rows={2}
            monospace
            description='Like {"talk": 3, "crush": 2}.'
          />
          <FormFieldTextarea
            control={form.control}
            name="cmdText"
            label="Opens (JSON)"
            rows={2}
            monospace
            description='Like {"screen": "chat", "mode": "vent"}.'
          />
          <FormFieldTextarea
            control={form.control}
            name="d"
            label="Icon (SVG path)"
            rows={2}
            monospace
            className="sm:col-span-2"
          />
        </form>
      </Form>
    </DrawerPreview>
  );
}
