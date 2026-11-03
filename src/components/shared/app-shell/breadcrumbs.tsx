import { Link, useMatches } from '@tanstack/react-router';
import * as React from 'react';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';

/** Built from each matched route's `staticData.crumb`. */
export function Breadcrumbs() {
  const matches = useMatches();
  const crumbs = matches
    .filter((m) => m.staticData?.crumb)
    .map((m) => {
      const c = m.staticData.crumb!;
      return { id: m.id, to: m.pathname, label: typeof c === 'function' ? c(m.params as Record<string, string>) : c };
    });
  if (crumbs.length === 0) return null;
  return (
    <Breadcrumb className="min-w-0">
      <BreadcrumbList className="flex-nowrap">
        {crumbs.map((c, i) => (
          <React.Fragment key={c.id}>
            {i > 0 && <BreadcrumbSeparator className="hidden sm:block" />}
            <BreadcrumbItem className={i < crumbs.length - 1 ? 'hidden sm:inline-flex' : 'min-w-0'}>
              {i === crumbs.length - 1 ? (
                <BreadcrumbPage className="truncate">{c.label}</BreadcrumbPage>
              ) : (
                <BreadcrumbLink asChild>
                  <Link to={c.to}>{c.label}</Link>
                </BreadcrumbLink>
              )}
            </BreadcrumbItem>
          </React.Fragment>
        ))}
      </BreadcrumbList>
    </Breadcrumb>
  );
}
