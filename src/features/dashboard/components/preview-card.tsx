import { Link } from '@tanstack/react-router';
import { ArrowRightIcon } from 'lucide-react';
import type * as React from 'react';
import { EmptyState, ErrorState } from '@/components/shared';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

export interface PreviewCardProps<T> {
  title: string;
  description?: string;
  to: string;
  search?: Record<string, unknown>;
  query: { data?: { items: T[] }; error: unknown; isPending: boolean; refetch: () => unknown };
  empty: string;
  render: (item: T) => React.ReactNode;
  getKey: (item: T) => string;
}

/** A short list on the dashboard (five rows) with a link to the full page. */
export function PreviewCard<T>({ title, description, to, search, query, empty, render, getKey }: PreviewCardProps<T>) {
  return (
    <Card className="gap-3">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
        <CardAction>
          <Button variant="ghost" size="sm" asChild>
            <Link to={to} search={search}>
              View all
              <ArrowRightIcon />
            </Link>
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        {query.error ? (
          <ErrorState error={query.error} onRetry={() => void query.refetch()} className="border-0 py-4" />
        ) : query.isPending ? (
          <div className="flex flex-col gap-2">
            <Skeleton className="h-10" />
            <Skeleton className="h-10" />
            <Skeleton className="h-10" />
          </div>
        ) : query.data!.items.length === 0 ? (
          <EmptyState title={empty} className="border-0 py-6" />
        ) : (
          <ul className="flex flex-col divide-y">
            {query.data!.items.map((i) => (
              <li key={getKey(i)} className="py-2.5 first:pt-0 last:pb-0">
                {render(i)}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
