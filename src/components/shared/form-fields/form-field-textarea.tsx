import type { FieldPath, FieldValues } from 'react-hook-form';
import { FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import type { BaseFieldProps } from './types';

export interface FormFieldTextareaProps<T extends FieldValues, N extends FieldPath<T>> extends BaseFieldProps<T, N> {
  placeholder?: string;
  rows?: number;
  /** Shows a counter and stops typing past it. */
  maxLength?: number;
  nullable?: boolean;
  monospace?: boolean;
}

export function FormFieldTextarea<T extends FieldValues, N extends FieldPath<T>>({
  control,
  name,
  label,
  description,
  disabled,
  className,
  hideLabel,
  placeholder,
  rows = 3,
  maxLength,
  nullable,
  monospace,
}: FormFieldTextareaProps<T, N>) {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => {
        const text = (field.value as string | null | undefined) ?? '';
        return (
          <FormItem className={className}>
            <div className="flex items-baseline justify-between gap-2">
              <FormLabel className={cn(hideLabel && 'sr-only')}>{label}</FormLabel>
              {maxLength && (
                <span className="text-xs text-muted-foreground tabular-nums" aria-hidden>
                  {text.length}/{maxLength}
                </span>
              )}
            </div>
            <FormControl>
              <Textarea
                {...field}
                value={text}
                onChange={(e) => field.onChange(nullable && e.target.value === '' ? null : e.target.value)}
                placeholder={placeholder}
                rows={rows}
                maxLength={maxLength}
                disabled={disabled}
                className={cn(monospace && 'font-mono text-xs')}
              />
            </FormControl>
            {description && <FormDescription>{description}</FormDescription>}
            <FormMessage />
          </FormItem>
        );
      }}
    />
  );
}
