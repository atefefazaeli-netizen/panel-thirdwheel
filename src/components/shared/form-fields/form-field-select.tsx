import type { FieldPath, FieldValues } from 'react-hook-form';
import { FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import type { BaseFieldProps, Option } from './types';

const NONE = '__none__';

export interface FormFieldSelectProps<T extends FieldValues, N extends FieldPath<T>> extends BaseFieldProps<T, N> {
  options: Option[];
  placeholder?: string;
  /** Adds a "None" choice that stores null. */
  noneLabel?: string;
}

export function FormFieldSelect<T extends FieldValues, N extends FieldPath<T>>({
  control,
  name,
  label,
  description,
  disabled,
  className,
  hideLabel,
  options,
  placeholder = 'Choose',
  noneLabel,
}: FormFieldSelectProps<T, N>) {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem className={className}>
          <FormLabel className={cn(hideLabel && 'sr-only')}>{label}</FormLabel>
          <Select
            value={
              field.value === null || field.value === undefined || field.value === ''
                ? noneLabel
                  ? NONE
                  : ''
                : String(field.value)
            }
            onValueChange={(v) => field.onChange(v === NONE ? null : v)}
            disabled={disabled}
          >
            <FormControl>
              <SelectTrigger className="w-full" onBlur={field.onBlur}>
                <SelectValue placeholder={placeholder} />
              </SelectTrigger>
            </FormControl>
            <SelectContent>
              <SelectGroup>
                {noneLabel && <SelectItem value={NONE}>{noneLabel}</SelectItem>}
                {options.map((o) => (
                  <SelectItem key={o.value} value={o.value} disabled={o.disabled}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
          {description && <FormDescription>{description}</FormDescription>}
          <FormMessage />
        </FormItem>
      )}
    />
  );
}
