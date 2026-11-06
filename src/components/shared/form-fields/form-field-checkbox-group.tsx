import * as React from 'react';
import type { FieldPath, FieldValues } from 'react-hook-form';
import { Checkbox } from '@/components/ui/checkbox';
import { FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { cn } from '@/lib/utils';
import type { BaseFieldProps } from './types';

export interface CheckboxOption {
  value: string;
  label: string;
  description?: React.ReactNode;
  disabled?: boolean;
  /** Short note next to a disabled option ("Owner only"). */
  hint?: string;
}

export interface FormFieldCheckboxGroupProps<T extends FieldValues, N extends FieldPath<T>> extends BaseFieldProps<
  T,
  N
> {
  options: CheckboxOption[];
  /** Optional sections (permission areas); options not in a group are listed first. */
  groups?: { label: string; values: string[] }[];
  columns?: 1 | 2;
}

/** A list of checkboxes bound to a string array (roles, permissions). */
export function FormFieldCheckboxGroup<T extends FieldValues, N extends FieldPath<T>>({
  control,
  name,
  label,
  description,
  disabled,
  className,
  hideLabel,
  options,
  groups,
  columns = 1,
}: FormFieldCheckboxGroupProps<T, N>) {
  const baseId = React.useId();
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => {
        const value = new Set((field.value as string[] | undefined) ?? []);
        const toggle = (v: string, on: boolean) => {
          const next = new Set(value);
          if (on) next.add(v);
          else next.delete(v);
          field.onChange(options.map((o) => o.value).filter((x) => next.has(x)));
        };
        const item = (o: CheckboxOption) => {
          const id = `${baseId}-${o.value}`;
          const off = disabled || o.disabled;
          return (
            <li key={o.value} className="flex items-start gap-2">
              <Checkbox
                id={id}
                checked={value.has(o.value)}
                disabled={off}
                onCheckedChange={(c) => toggle(o.value, c === true)}
                aria-describedby={o.description || o.hint ? `${id}-desc` : undefined}
                className="mt-0.5"
              />
              <span className={cn('flex flex-col text-sm', off && 'opacity-60')}>
                <label htmlFor={id} className="font-medium">
                  {o.label}
                </label>
                {(o.description || o.hint) && (
                  <span id={`${id}-desc`} className="text-xs text-muted-foreground">
                    {o.hint && <span className="mr-1 font-medium">{o.hint}.</span>}
                    {o.description}
                  </span>
                )}
              </span>
            </li>
          );
        };
        const list = (opts: CheckboxOption[]) => (
          <ul className={cn('grid gap-2', columns === 2 && 'sm:grid-cols-2')}>{opts.map(item)}</ul>
        );
        const grouped = new Set(groups?.flatMap((g) => g.values) ?? []);
        return (
          <FormItem className={className}>
            <FormLabel className={cn(hideLabel && 'sr-only')}>{label}</FormLabel>
            {description && <FormDescription>{description}</FormDescription>}
            <FormControl>
              <div role="group" aria-label={label} className="flex flex-col gap-3">
                {list(options.filter((o) => !grouped.has(o.value)))}
                {groups?.map((g) => (
                  <fieldset key={g.label} className="flex flex-col gap-2 rounded-md border p-3">
                    <legend className="px-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                      {g.label}
                    </legend>
                    {list(options.filter((o) => g.values.includes(o.value)))}
                  </fieldset>
                ))}
              </div>
            </FormControl>
            <FormMessage />
          </FormItem>
        );
      }}
    />
  );
}
