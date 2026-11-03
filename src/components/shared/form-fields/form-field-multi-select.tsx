import type { FieldPath, FieldValues } from 'react-hook-form';
import { FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { cn } from '@/lib/utils';
import type { BaseFieldProps, Option } from './types';

export type FormFieldMultiSelectProps<T extends FieldValues, N extends FieldPath<T>> = BaseFieldProps<T, N> & {
  options: Option[];
};

/** Several values from a short list, as toggle chips (selected = navy, per the brand rule). */
export function FormFieldMultiSelect<T extends FieldValues, N extends FieldPath<T>>({
  control,
  name,
  label,
  description,
  disabled,
  className,
  hideLabel,
  options,
}: FormFieldMultiSelectProps<T, N>) {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem className={className}>
          <FormLabel className={cn(hideLabel && 'sr-only')}>{label}</FormLabel>
          <FormControl>
            <ToggleGroup
              type="multiple"
              variant="outline"
              size="sm"
              value={(field.value as string[] | undefined) ?? []}
              onValueChange={(v) => field.onChange(v)}
              disabled={disabled}
              className="flex w-full flex-wrap justify-start gap-1.5 shadow-none"
            >
              {options.map((o) => (
                <ToggleGroupItem
                  key={o.value}
                  value={o.value}
                  disabled={o.disabled}
                  className="flex-none rounded-md! border-l! px-2.5 data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
                >
                  {o.label}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </FormControl>
          {description && <FormDescription>{description}</FormDescription>}
          <FormMessage />
        </FormItem>
      )}
    />
  );
}
