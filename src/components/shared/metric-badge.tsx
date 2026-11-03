import { cn } from '@/lib/utils';

export interface MetricBadgeProps {
  value: number | null | undefined;
  label?: string;
  tone?: 'neutral' | 'brand' | 'success' | 'warning';
  /** Hide when the value is 0 or missing. */
  hideZero?: boolean;
  className?: string;
}

const tones = {
  neutral: 'bg-muted text-foreground',
  brand: 'bg-brand text-brand-foreground',
  success: 'bg-success-soft text-success',
  warning: 'bg-warning-soft text-warning',
} as const;

/** A compact count: "3", "12 open". */
export function MetricBadge({ value, label, tone = 'neutral', hideZero, className }: MetricBadgeProps) {
  if (hideZero && !value) return null;
  return (
    <span
      className={cn(
        'inline-flex h-5 min-w-5 items-center justify-center gap-1 rounded-full px-1.5 text-xs font-semibold tabular-nums',
        tones[tone],
        className,
      )}
    >
      {value ?? '–'}
      {label && <span className="font-medium">{label}</span>}
    </span>
  );
}
