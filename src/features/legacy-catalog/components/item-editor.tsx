import { zodResolver } from '@hookform/resolvers/zod';
import * as React from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { toast } from 'sonner';
import {
  DrawerPreview,
  FormFieldNumber,
  FormFieldSelect,
  FormFieldSwitch,
  FormFieldTags,
  FormFieldText,
  FormFieldTextarea,
} from '@/components/shared';
import { Button } from '@/components/ui/button';
import { Form } from '@/components/ui/form';
import { errorMessage } from '@/lib/api';
import { useSaveCatalogItem } from '../api/queries';
import { CATALOG_KINDS, type CatalogItem } from '../api/types';
import { formToItem, itemToForm } from '../lib/codec';
import { catalogItemSchema, type CatalogItemForm } from '../schemas/legacy';
import { IdeaPreview } from './idea-preview';

export function ItemEditor({
  open,
  onOpenChange,
  item,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  item: CatalogItem | null;
}) {
  const save = useSaveCatalogItem();
  const form = useForm<CatalogItemForm>({
    resolver: zodResolver(catalogItemSchema),
    defaultValues: itemToForm(item),
  });
  React.useEffect(() => {
    if (open) form.reset(itemToForm(item));
  }, [open, item, form]);
  const v = useWatch({ control: form.control });

  const submit = form.handleSubmit(async (values) => {
    try {
      await save.mutateAsync({
        item: formToItem(values),
        id: item?.id,
        sendTags: !!form.formState.dirtyFields.tags,
        sendRefPrefix: !!form.formState.dirtyFields.refPrefix,
      });
      toast.success(item ? 'Idea saved' : 'Idea added');
      onOpenChange(false);
    } catch (e) {
      toast.error(errorMessage(e));
    }
  });

  return (
    <DrawerPreview
      open={open}
      onOpenChange={onOpenChange}
      title={item ? `Edit idea ${item.id}` : 'New date idea'}
      description="Round 1 Explore idea. Release 1 Explore reads the Content CMS."
      size="xl"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => void submit()} disabled={save.isPending}>
            {item ? 'Save idea' : 'Add idea'}
          </Button>
        </div>
      }
    >
      <IdeaPreview
        title={v.title ?? ''}
        meta={v.meta ?? ''}
        reason={v.reason ?? ''}
        usd={v.usd ?? null}
        per={v.per ?? ''}
        d={v.d ?? ''}
        kind={v.kind ?? 'book'}
        where={v.where ?? 'out'}
        provider={v.provider ?? ''}
      />
      <Form {...form}>
        <form onSubmit={submit} className="grid items-start gap-4 sm:grid-cols-2" noValidate>
          <FormFieldNumber
            control={form.control}
            name="id"
            label="Id"
            min={1}
            disabled={!!item}
            description={item ? 'Never changes.' : 'Leave empty for the next free id. Never changes.'}
          />
          <FormFieldSelect
            control={form.control}
            name="kind"
            label="Kind"
            options={CATALOG_KINDS.map((k) => ({ value: k, label: k }))}
          />
          <FormFieldText control={form.control} name="title" label="Title" maxLength={120} className="sm:col-span-2" />
          <FormFieldText
            control={form.control}
            name="meta"
            label="Meta line"
            maxLength={200}
            placeholder="1 hour · 7:30 PM · 20 min away"
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
          <FormFieldSelect
            control={form.control}
            name="where"
            label="Where"
            options={[
              { value: 'out', label: 'Out' },
              { value: 'home', label: 'At home' },
            ]}
          />
          <FormFieldNumber control={form.control} name="usd" label="Price for two" min={0} suffix="USD" />
          <FormFieldText
            control={form.control}
            name="per"
            label="Price suffix"
            placeholder=" groceries, estimated"
            description="Shown right after the price."
          />
          <FormFieldNumber control={form.control} name="deposit" label="Deposit" min={0} suffix="USD" />
          <FormFieldText control={form.control} name="provider" label="Provider" />
          <FormFieldText control={form.control} name="site" label="Site" placeholder="rallypadel.com" />
          <FormFieldTextarea
            control={form.control}
            name="cancel"
            label="Cancellation"
            rows={2}
            maxLength={300}
            className="sm:col-span-2"
          />
          <FormFieldTags
            control={form.control}
            name="slots"
            label="Time slots"
            max={20}
            placeholder="7:30 PM"
            className="sm:col-span-2"
          />
          <FormFieldSwitch control={form.control} name="weekendOnly" label="Weekends only" />
          <FormFieldSwitch control={form.control} name="voucher" label="Voucher" />
          <FormFieldTextarea
            control={form.control}
            name="d"
            label="Icon (SVG path)"
            rows={2}
            monospace
            description="24×24 path data, drawn as a line icon."
            className="sm:col-span-2"
          />
          <FormFieldTags
            control={form.control}
            name="tags"
            label="Ranking tags"
            max={20}
            normalize={(s) => s.trim().toLowerCase()}
            description={
              item ? 'The public list does not return tags: they are kept unless you type new ones here.' : undefined
            }
            className="sm:col-span-2"
          />
          <FormFieldText
            control={form.control}
            name="refPrefix"
            label="Booking ref prefix"
            placeholder="TW"
            description={item ? 'Kept unless you type a new one.' : undefined}
          />
        </form>
      </Form>
    </DrawerPreview>
  );
}
