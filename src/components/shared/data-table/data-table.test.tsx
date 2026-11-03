import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { Button } from '@/components/ui/button';
import { renderWithProviders } from '@/test/utils';
import { DataTable } from './data-table';
import { columnHelper } from './features';

type Row = { id: string; title: string; state: string };
const ALL: Row[] = Array.from({ length: 45 }, (_, i) => ({
  id: `r${i + 1}`,
  title: `Item ${i + 1}`,
  state: i % 3 === 0 ? 'live' : 'editing',
}));

const h = columnHelper<Row>();
const columns = h.columns([
  h.accessor('title', { header: 'Title', meta: { label: 'Title' }, enableHiding: false }),
  h.accessor('state', { header: 'State', meta: { label: 'State' } }),
]);

/** A server-driven table: the harness plays the API (pages and filters the rows). */
function Harness(props: { onBatch?: (ids: string[]) => void; onRowClick?: (r: Row) => void }) {
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(20);
  const [q, setQ] = React.useState('');
  const [state, setState] = React.useState<string[]>([]);
  const filtered = ALL.filter(
    (r) => (!q || r.title.toLowerCase().includes(q.toLowerCase())) && (!state.length || state.includes(r.state)),
  );
  const data = filtered.slice((page - 1) * pageSize, page * pageSize);
  return (
    <DataTable
      label="Items"
      columns={columns}
      data={data}
      getRowId={(r) => r.id}
      page={page}
      pageSize={pageSize}
      total={filtered.length}
      onPageChange={setPage}
      onPageSizeChange={(s) => {
        setPageSize(s);
        setPage(1);
      }}
      selectable
      onRowClick={props.onRowClick}
      batchActions={({ ids, clear }) => (
        <Button
          size="sm"
          onClick={() => {
            props.onBatch?.(ids);
            clear();
          }}
        >
          Archive selected
        </Button>
      )}
      toolbar={{
        search: {
          value: q,
          onChange: (v) => (setQ(v), setPage(1)),
          placeholder: 'Search items',
          label: 'Search items',
        },
        filters: [
          {
            id: 'state',
            title: 'State',
            value: state,
            onChange: (v) => (setState(v), setPage(1)),
            options: [
              { label: 'Live', value: 'live' },
              { label: 'Draft', value: 'editing' },
            ],
          },
        ],
        onReset: () => (setQ(''), setState([]), setPage(1)),
      }}
    />
  );
}

const bodyRows = () =>
  within(screen.getByRole('table', { name: 'Items' }))
    .getAllByRole('row')
    .slice(1);

describe('DataTable', () => {
  it('renders one server page and pages forward and back', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Harness />);
    expect(bodyRows()).toHaveLength(20);
    expect(screen.getByText('Page 1 of 3')).toBeInTheDocument();
    expect(screen.getByText('45 results')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Previous page' })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'Next page' }));
    expect(screen.getByText('Page 2 of 3')).toBeInTheDocument();
    expect(screen.getByText('Item 21')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Last page' }));
    expect(screen.getByText('Page 3 of 3')).toBeInTheDocument();
    expect(bodyRows()).toHaveLength(5);
    expect(screen.getByRole('button', { name: 'Next page' })).toBeDisabled();
  });

  it('debounces search and resets to page 1', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Harness />);
    await user.click(screen.getByRole('button', { name: 'Next page' }));
    await user.type(screen.getByRole('searchbox', { name: 'Search items' }), 'Item 4');
    await waitFor(() => expect(screen.getByText('7 results')).toBeInTheDocument());
    expect(screen.getByText('Page 1 of 1')).toBeInTheDocument();
  });

  it('filters with a faceted filter and resets', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Harness />);
    await user.click(screen.getByRole('button', { name: 'State' }));
    await user.click(await screen.findByRole('option', { name: 'Live' }));
    expect(screen.getByText('15 results')).toBeInTheDocument();
    await user.keyboard('{Escape}');
    await user.click(screen.getByRole('button', { name: /Reset/ }));
    expect(screen.getByText('45 results')).toBeInTheDocument();
  });

  it('selects rows and runs a batch action with the ids', async () => {
    const user = userEvent.setup();
    const onBatch = vi.fn();
    renderWithProviders(<Harness onBatch={onBatch} />);
    const checks = screen.getAllByRole('checkbox', { name: 'Select row' });
    await user.click(checks[0]!);
    await user.click(checks[2]!);
    expect(screen.getByRole('region', { name: 'Batch actions' })).toHaveTextContent('2 selected');
    await user.click(screen.getByRole('button', { name: 'Archive selected' }));
    expect(onBatch).toHaveBeenCalledWith(['r1', 'r3']);
    expect(screen.queryByRole('region', { name: 'Batch actions' })).toBeNull();
  });

  it('selects every row on the page from the header checkbox', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Harness />);
    await user.click(screen.getByRole('checkbox', { name: 'Select all rows on this page' }));
    expect(screen.getByRole('region', { name: 'Batch actions' })).toHaveTextContent('20 selected');
  });

  it('keeps row clicks separate from the selection checkbox', async () => {
    const user = userEvent.setup();
    const onRowClick = vi.fn();
    renderWithProviders(<Harness onRowClick={onRowClick} />);
    await user.click(screen.getAllByRole('checkbox', { name: 'Select row' })[0]!);
    expect(onRowClick).not.toHaveBeenCalled();
    await user.click(screen.getByText('Item 2'));
    expect(onRowClick).toHaveBeenCalledWith(expect.objectContaining({ id: 'r2' }));
  });

  it('hides a column from the view options', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Harness />);
    expect(screen.getByRole('columnheader', { name: 'State' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'View' }));
    await user.click(await screen.findByRole('menuitemcheckbox', { name: 'State' }));
    expect(screen.queryByRole('columnheader', { name: 'State' })).toBeNull();
  });

  it('shows the empty state when nothing matches', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Harness />);
    await user.type(screen.getByRole('searchbox', { name: 'Search items' }), 'zzz{Enter}');
    expect(await screen.findByText('Nothing here yet')).toBeInTheDocument();
  });

  it('shows an error state with retry', async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    renderWithProviders(
      <DataTable
        label="Broken"
        columns={columns}
        data={undefined}
        error={new Error('Boom')}
        onRetry={onRetry}
        getRowId={(r) => r.id}
        page={1}
        pageSize={20}
        total={0}
        onPageChange={() => {}}
        onPageSizeChange={() => {}}
      />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Boom');
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalled();
  });
});
