import { XIcon } from 'lucide-react';
import * as React from 'react';
import type { FieldPath, FieldValues } from 'react-hook-form';
import { Badge } from '@/components/ui/badge';
import { FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import type { BaseFieldProps } from './types';

export interface FormFieldTagsProps<T extends FieldValues, N extends FieldPath<T>> extends BaseFieldProps<T, N> {
  placeholder?: string;
  max?: number;
  /** Lower-cases and trims each tag before it is added. */
  normalize?: (raw: string) => string;
  /** Suggestions shown under the field. */
  suggestions?: string[];
}

const defaultNormalize = (s: string) => s.trim();

/** A list of short strings: type and press Enter or comma to add, Backspace to remove the last. */
export function FormFieldTags<T extends FieldValues, N extends FieldPath<T>>({
  control,
  name,
  label,
  description,
  disabled,
  className,
  hideLabel,
  placeholder = 'Type and press Enter',
  max,
  normalize = defaultNormalize,
  suggestions,
}: FormFieldTagsProps<T, N>) {
  const [draft, setDraft] = React.useState('');
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => {
        const tags = ((field.value as string[] | undefined) ?? []).filter(Boolean);
        const add = (raw: string) => {
          const parts = raw.split(',').map(normalize).filter(Boolean);
          const next = [...tags];
          for (const t of parts) if (!next.includes(t) && (!max || next.length < max)) next.push(t);
          field.onChange(next);
          setDraft('');
        };
        const remove = (t: string) => field.onChange(tags.filter((x) => x !== t));
        const unused = suggestions?.filter((s) => !tags.includes(s)) ?? [];
        return (
          <FormItem className={className}>
            <FormLabel className={cn(hideLabel && 'sr-only')}>{label}</FormLabel>
            <div className="flex min-h-9 flex-wrap items-center gap-1.5 rounded-md border border-input px-2 py-1 focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50 dark:bg-input/30">
              {tags.map((t) => (
                <Badge key={t} variant="secondary" className="gap-1 pr-1">
                  {t}
                  <button
                    type="button"
                    onClick={() => remove(t)}
                    disabled={disabled}
                    className="rounded-sm p-0.5 hover:bg-muted-foreground/20"
                    aria-label={`Remove ${t}`}
                  >
                    <XIcon className="size-3" />
                  </button>
                </Badge>
              ))}
              <FormControl>
                <Input
                  ref={field.ref}
                  name={field.name}
                  value={draft}
                  disabled={disabled || (!!max && tags.length >= max)}
                  placeholder={tags.length ? '' : placeholder}
                  onChange={(e) => setDraft(e.target.value)}
                  onBlur={() => {
                    if (draft.trim()) add(draft);
                    field.onBlur();
                  }}
                  onKeyDown={(e) => {
                    if ((e.key === 'Enter' || e.key === ',') && draft.trim()) {
                      e.preventDefault();
                      add(draft);
                    } else if (e.key === 'Backspace' && !draft && tags.length) {
                      remove(tags[tags.length - 1]!);
                    }
                  }}
                  className="h-7 min-w-24 flex-1 border-0 bg-transparent px-1 shadow-none focus-visible:ring-0 dark:bg-transparent"
                />
              </FormControl>
            </div>
            {unused.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {unused.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => add(s)}
                    className="rounded border border-dashed px-1.5 text-xs text-muted-foreground hover:text-foreground"
                  >
                    + {s}
                  </button>
                ))}
              </div>
            )}
            {description && <FormDescription>{description}</FormDescription>}
            <FormMessage />
          </FormItem>
        );
      }}
    />
  );
}
