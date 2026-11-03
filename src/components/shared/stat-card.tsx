import { Link } from '@tanstack/react-router';
import type { LucideIcon } from 'lucide-react';
import type * as React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

export interface StatCardProps {
  label: string;
  /** `null` = that part of the API failed: shows "Not available". */
  value: number | string | null | undefined;
  hint?: React.ReactNode;
  icon?: LucideIcon;
  tone?: 'default' | 'brand' | 'success' | 'warning';
  loading?: boolean;
  /** Makes the whole card a link. */
  to?: string;
  search?: Record<string, unknown>;
  className?: string;
}

const toneClass: Record<NonNullable<StatCardProps['tone']>, string> = {
  default: 'bg-muted text-foreground',
  brand: 'bg-brand-soft text-destructive',
  success: 'bg-success-soft text-success',
  warning: 'bg-warning-soft text-warning',
};

export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = 'default',
  loading,
  to,
  search,
  className,
}: StatCardProps) {
  const body = (
    <Card className={cn('h-full gap-2 py-4 transition-colors', to && 'hover:border-ring/60', className)}>
      <CardHeader className="flex flex-row items-center justify-between gap-2 px-4">
        <CardDescription className="font-medium">{label}</CardDescription>
        {Icon && (
          <span className={cn('flex size-7 items-center justify-center rounded-md', toneClass[tone])}>
            <Icon className="size-4" aria-hidden />
          </span>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-1 px-4">
        {loading ? (
          <Skeleton className="h-8 w-20" />
        ) : value === null || value === undefined ? (
          <CardTitle className="text-base font-medium text-muted-foreground">Not available</CardTitle>
        ) : (
          <CardTitle className="text-2xl font-bold tabular-nums">
            {typeof value === 'number' ? value.toLocaleString() : value}
          </CardTitle>
        )}
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  );
  if (!to) return body;
  return (
    <Link
      to={to}
      search={search}
      className="rounded-xl outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
      aria-label={`${label}: ${value ?? 'Not available'}`}
    >
      {body}
    </Link>
  );
}
