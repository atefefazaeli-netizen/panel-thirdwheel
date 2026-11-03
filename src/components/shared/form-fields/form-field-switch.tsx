import type { FieldPath, FieldValues } from 'react-hook-form';
import { FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import type { BaseFieldProps } from './types';

export function FormFieldSwitch<T extends FieldValues, N extends FieldPath<T>>({
  control,
  name,
  label,
  description,
  disabled,
  className,
}: BaseFieldProps<T, N>) {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem className={cn('flex flex-row items-center justify-between gap-4 rounded-lg border p-3', className)}>
          <div className="flex flex-col gap-1">
            <FormLabel>{label}</FormLabel>
            {description && <FormDescription>{description}</FormDescription>}
            <FormMessage />
          </div>
          <FormControl>
            <Switch
              checked={!!field.value}
              onCheckedChange={field.onChange}
              onBlur={field.onBlur}
              disabled={disabled}
            />
          </FormControl>
        </FormItem>
      )}
    />
  );
}
