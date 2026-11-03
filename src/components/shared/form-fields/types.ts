import type * as React from 'react';
import type { Control, FieldPath, FieldValues } from 'react-hook-form';

export interface BaseFieldProps<TValues extends FieldValues, TName extends FieldPath<TValues>> {
  control: Control<TValues>;
  name: TName;
  label: string;
  description?: React.ReactNode;
  disabled?: boolean;
  className?: string;
  /** Visually hide the label (it stays the accessible name). */
  hideLabel?: boolean;
}

export interface Option {
  label: string;
  value: string;
  disabled?: boolean;
}
