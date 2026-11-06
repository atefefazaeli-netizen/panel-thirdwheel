import { getRouteApi } from '@tanstack/react-router';
import { LogOutIcon, TagIcon } from 'lucide-react';
import * as React from 'react';
import { toast } from 'sonner';
import {
  ConfirmDialog,
  DataTable,
  FormDialog,
  FormFieldText,
  PageHeader,
  RequirePermission,
  type FacetedFilterConfig,
} from '@/components/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { errorMessage } from '@/lib/api';
import { cleanSearch } from '@/lib/search';
import { useQueryClient } from '@tanstack/react-query';
import { userKeys, useUserList } from '../api/queries';
import { PLANS, type AdminUserRow } from '../api/types';
import { usersApi } from '../api/users-api';
import { usersColumns } from '../components/users-columns';
import { PLAN_LABEL } from '../lib/labels';
import { addTagSchema, type UsersSearch } from '../schemas/users';

const route = getRouteApi('/_app/users/');

export function UsersListPage() {
  return (
    <RequirePermission perm="users.read" what="users">
      <UsersList />
    </RequirePermission>
  );
}

function DateFilter({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value?: string;
  onChange: (v?: string) => void;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <Label htmlFor={id} className="text-xs font-normal text-muted-foreground">
        {label}
      </Label>
      <Input
        id={id}
        type="date"
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value || undefined)}
        className="h-8 w-[9.5rem]"
      />
    </div>
  );
}

function UsersList() {
  const search = route.useSearch();
  const navigate = route.useNavigate();
  const qc = useQueryClient();
  const page = search.page ?? 1;
  const limit = search.limit ?? 20;
  const list = useUserList({ ...search, page, limit });
  const [tagDraft, setTagDraft] = React.useState(search.tag ?? '');
  const [batch, setBatch] = React.useState<null | { kind: 'signout' | 'tag'; rows: AdminUserRow[]; clear: () => void }>(
    null,
  );

  const set = (patch: Partial<UsersSearch>, resetPage = true) =>
    navigate({
      search: (prev) => cleanSearch({ ...prev, ...(resetPage ? { page: undefined } : {}), ...patch }),
      replace: true,
    });

  const yesNo = (v?: boolean) => (v === undefined ? [] : [String(v)]);
  const filters: FacetedFilterConfig[] = [
    {
      id: 'plan',
      title: 'Plan',
      value: search.plan ? [search.plan] : [],
      onChange: (v) => set({ plan: v[0] as UsersSearch['plan'] }),
      options: PLANS.map((p) => ({ value: p, label: PLAN_LABEL[p] })),
    },
    {
      id: 'linked',
      title: 'Linked',
      value: yesNo(search.linked),
      onChange: (v) => set({ linked: v[0] === undefined ? undefined : v[0] === 'true' }),
      options: [
        { value: 'true', label: 'Linked with a partner' },
        { value: 'false', label: 'Not linked' },
      ],
    },
    {
      id: 'suspended',
      title: 'Suspended',
      value: yesNo(search.suspended),
      onChange: (v) => set({ suspended: v[0] === undefined ? undefined : v[0] === 'true' }),
      options: [
        { value: 'true', label: 'Suspended' },
        { value: 'false', label: 'Active' },
      ],
    },
  ];

  const runBatch = async (fn: (r: AdminUserRow) => Promise<unknown>, done: string) => {
    if (!batch) return;
    const results = await Promise.allSettled(batch.rows.map(fn));
    const failed = results.filter((r) => r.status === 'rejected') as PromiseRejectedResult[];
    void qc.invalidateQueries({ queryKey: userKeys.all });
    batch.clear();
    if (failed.length) toast.error(`${failed.length} failed: ${errorMessage(failed[0]!.reason)}`);
    if (results.length > failed.length) toast.success(`${done} for ${results.length - failed.length}`);
  };

  return (
    <>
      <PageHeader
        title="Users"
        description="Accounts, couples and plans. Staff see profiles without cycle data, things to avoid, answers or chats."
      />
      <DataTable
        id="users"
        label="Users"
        columns={usersColumns}
        data={list.data?.items}
        getRowId={(r) => r.userId}
        page={page}
        pageSize={limit}
        total={list.data?.meta.total ?? 0}
        onPageChange={(p) => set({ page: p }, false)}
        onPageSizeChange={(l) => set({ limit: l })}
        loading={list.isPending}
        fetching={list.isFetching}
        error={list.error}
        onRetry={() => void list.refetch()}
        onRowClick={(r) => void navigate({ to: '/users/$id', params: { id: r.userId } })}
        selectable
        batchActions={({ rows, clear }) => (
          <>
            <Button size="sm" variant="outline" className="h-8" onClick={() => setBatch({ kind: 'tag', rows, clear })}>
              <TagIcon />
              Add tag
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-8"
              onClick={() => setBatch({ kind: 'signout', rows, clear })}
            >
              <LogOutIcon />
              Sign out everywhere
            </Button>
          </>
        )}
        toolbar={{
          search: {
            value: search.q ?? '',
            onChange: (q) => set({ q: q || undefined }),
            placeholder: 'Search email or name',
            label: 'Search users',
          },
          filters,
          extra: (
            <>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  set({ tag: tagDraft.trim().toLowerCase() || undefined });
                }}
              >
                <Input
                  aria-label="Filter by tag"
                  placeholder="Tag"
                  value={tagDraft}
                  onChange={(e) => setTagDraft(e.target.value)}
                  onBlur={() => set({ tag: tagDraft.trim().toLowerCase() || undefined })}
                  className="h-8 w-28"
                />
              </form>
              <DateFilter id="reg-from" label="From" value={search.from} onChange={(from) => set({ from })} />
              <DateFilter id="reg-to" label="To" value={search.to} onChange={(to) => set({ to })} />
            </>
          ),
          onReset: () => {
            setTagDraft('');
            void navigate({ search: (prev) => cleanSearch({ limit: prev.limit }), replace: true });
          },
        }}
        empty={{ title: 'No accounts match', description: 'Try another search or clear the filters.' }}
      />
      <ConfirmDialog
        open={batch?.kind === 'signout'}
        onOpenChange={(o) => !o && setBatch(null)}
        title={`Sign out ${batch?.rows.length ?? 0} accounts everywhere?`}
        description="Every device signs out. They can sign in again with a new code."
        confirmLabel="Sign out everywhere"
        cancelLabel="Keep them signed in"
        onConfirm={() => runBatch((r) => usersApi.signOut(r.userId), 'Signed out')}
      />
      <FormDialog
        open={batch?.kind === 'tag'}
        onOpenChange={(o) => !o && setBatch(null)}
        title={`Add a tag to ${batch?.rows.length ?? 0} accounts`}
        schema={addTagSchema}
        defaultValues={{ tag: '' }}
        submitLabel="Add tag"
        onSubmit={({ tag }) =>
          runBatch((r) => usersApi.setTags(r.userId, [...new Set([...r.tags, tag])]), `Tagged ${tag}`)
        }
      >
        {(f) => (
          <FormFieldText
            control={f.control}
            name="tag"
            label="Tag"
            placeholder="beta"
            description="a to z, 0 to 9 and dashes."
          />
        )}
      </FormDialog>
    </>
  );
}
