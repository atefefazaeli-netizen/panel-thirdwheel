import { SearchIcon, XIcon } from 'lucide-react';
import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useDebouncedCallback } from '@/hooks/use-debounced-callback';
import { DataTableFacetedFilter, type FacetedFilterConfig } from './data-table-faceted-filter';

export interface DataTableSearch {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  /** Accessible name of the search box. */
  label?: string;
}

export interface DataTableToolbarProps {
  search?: DataTableSearch;
  filters?: FacetedFilterConfig[];
  /** Extra controls (date range, switches) shown after the filters. */
  extra?: React.ReactNode;
  /** Clears search and every filter. Shown when something is active. */
  onReset?: () => void;
  /** Right side, before the view options. */
  actions?: React.ReactNode;
  viewOptions?: React.ReactNode;
}

function SearchBox({ value, onChange, placeholder = 'Search', label = 'Search' }: DataTableSearch) {
  const [draft, setDraft] = React.useState(value);
  const [synced, setSynced] = React.useState(value);
  // Keep the box in step when the URL changes from elsewhere (reset, back button).
  if (value !== synced) {
    setSynced(value);
    setDraft(value);
  }
  const commit = useDebouncedCallback((v: string) => onChange(v.trim()), 300);
  return (
    <div className="relative w-full sm:w-64">
      <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        type="search"
        aria-label={label}
        placeholder={placeholder}
        value={draft}
        onChange={(e) => {
          setDraft(e.target.value);
          commit(e.target.value);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') onChange(draft.trim());
        }}
        className="h-8 pl-8"
      />
    </div>
  );
}

export function DataTableToolbar({
  search,
  filters = [],
  extra,
  onReset,
  actions,
  viewOptions,
}: DataTableToolbarProps) {
  const active = !!search?.value || filters.some((f) => f.value.length > 0);
  return (
    <div className="flex flex-wrap items-center gap-2">
      {search && <SearchBox {...search} />}
      {filters.map((f) => (
        <DataTableFacetedFilter key={f.id} {...f} />
      ))}
      {extra}
      {active && onReset && (
        <Button variant="ghost" size="sm" onClick={onReset} className="h-8 px-2 lg:px-3">
          Reset
          <XIcon />
        </Button>
      )}
      <div className="ml-auto flex items-center gap-2">
        {actions}
        {viewOptions}
      </div>
    </div>
  );
}
