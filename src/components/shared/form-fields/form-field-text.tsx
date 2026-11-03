import type { FieldPath, FieldValues } from 'react-hook-form';
import { FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import type { BaseFieldProps } from './types';

export interface FormFieldTextProps<T extends FieldValues, N extends FieldPath<T>> extends BaseFieldProps<T, N> {
  placeholder?: string;
  type?: 'text' | 'email' | 'url' | 'search' | 'date';
  autoComplete?: string;
  inputMode?: React.HTMLAttributes<HTMLInputElement>['inputMode'];
  maxLength?: number;
  /** Empty input stores null instead of "". */
  nullable?: boolean;
}

export function FormFieldText<T extends FieldValues, N extends FieldPath<T>>({
  control,
  name,
  label,
  description,
  disabled,
  className,
  hideLabel,
  placeholder,
  type = 'text',
  autoComplete,
  inputMode,
  maxLength,
  nullable,
}: FormFieldTextProps<T, N>) {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem className={className}>
          <FormLabel className={cn(hideLabel && 'sr-only')}>{label}</FormLabel>
          <FormControl>
            <Input
              {...field}
              value={(field.value as string | null | undefined) ?? ''}
              onChange={(e) => field.onChange(nullable && e.target.value === '' ? null : e.target.value)}
              type={type}
              placeholder={placeholder}
              autoComplete={autoComplete}
              inputMode={inputMode}
              maxLength={maxLength}
              disabled={disabled}
            />
          </FormControl>
          {description && <FormDescription>{description}</FormDescription>}
          <FormMessage />
        </FormItem>
      )}
    />
  );
}
