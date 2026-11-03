import type { FieldPath, FieldValues } from 'react-hook-form';
import { FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import type { BaseFieldProps } from './types';

export interface FormFieldNumberProps<T extends FieldValues, N extends FieldPath<T>> extends BaseFieldProps<T, N> {
  min?: number;
  max?: number;
  step?: number;
  placeholder?: string;
  /** Text after the field ("min", "days"). */
  suffix?: string;
}

/** Stores a number, or null when the field is empty. */
export function FormFieldNumber<T extends FieldValues, N extends FieldPath<T>>({
  control,
  name,
  label,
  description,
  disabled,
  className,
  hideLabel,
  min,
  max,
  step = 1,
  placeholder,
  suffix,
}: FormFieldNumberProps<T, N>) {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem className={className}>
          <FormLabel className={cn(hideLabel && 'sr-only')}>{label}</FormLabel>
          <div className="flex items-center gap-2">
            <FormControl>
              <Input
                name={field.name}
                ref={field.ref}
                onBlur={field.onBlur}
                type="number"
                inputMode="decimal"
                value={
                  field.value === null || field.value === undefined || Number.isNaN(field.value)
                    ? ''
                    : String(field.value)
                }
                onChange={(e) => field.onChange(e.target.value === '' ? null : Number(e.target.value))}
                min={min}
                max={max}
                step={step}
                placeholder={placeholder}
                disabled={disabled}
                className="w-full max-w-40"
              />
            </FormControl>
            {suffix && <span className="text-sm text-muted-foreground">{suffix}</span>}
          </div>
          {description && <FormDescription>{description}</FormDescription>}
          <FormMessage />
        </FormItem>
      )}
    />
  );
}
