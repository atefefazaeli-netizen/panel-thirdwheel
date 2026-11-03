import { Link } from '@tanstack/react-router';
import {
  BookOpenCheckIcon,
  CrownIcon,
  FlagIcon,
  HeartIcon,
  LibraryBigIcon,
  LifeBuoyIcon,
  UserXIcon,
  UsersIcon,
  WebhookIcon,
} from 'lucide-react';
import { ErrorState, PageHeader, StatCard, StatusBadge } from '@/components/shared';
import { formatRelative } from '@/lib/format';
import { useRoles } from '@/stores/session';
import { KIND_LABEL } from '@/features/content/lib/labels';
import { EVENT_LABEL } from '@/features/integrations/lib/labels';
import { KIND_LABEL as FLAG_KIND } from '@/features/safety/lib/labels';
import { useAdminStats, useFailedDeliveries, useHighFlagsPreview, useReviewPreview } from '../api/queries';
import { PreviewCard } from '../components/preview-card';

export function DashboardPage() {
  const { user, isAdmin } = useRoles();
  const stats = useAdminStats();
  const review = useReviewPreview();
  const flags = useHighFlagsPreview();
  const failed = useFailedDeliveries(isAdmin);
  const s = stats.data;
  const loading = stats.isPending;

  return (
    <>
      <PageHeader title="Dashboard" description={`Signed in as ${user?.email ?? ''}. Numbers refresh every minute.`} />
      {stats.error ? (
        <ErrorState error={stats.error} title="Could not load the stats" onRetry={() => void stats.refetch()} />
      ) : (
        <section aria-label="Stats" className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
          <StatCard
            label="Accounts"
            value={s?.accounts}
            loading={loading}
            icon={UsersIcon}
            hint={s?.signups7d != null ? `${s.signups7d} new this week` : undefined}
            to={isAdmin ? '/users' : undefined}
          />
          <StatCard label="Couples" value={s?.couples} loading={loading} icon={HeartIcon} tone="brand" />
          <StatCard
            label="Plus"
            value={s?.plus}
            loading={loading}
            icon={CrownIcon}
            tone="success"
            hint={s?.grants != null ? `${s.grants} by admin grant` : undefined}
          />
          <StatCard label="Suspended" value={s?.suspended} loading={loading} icon={UserXIcon} />
          <StatCard
            label="Live content"
            value={s?.content ? s.content.live : s === undefined ? undefined : null}
            loading={loading}
            icon={LibraryBigIcon}
            hint={s?.content ? `${s.content.retired} unpublished` : undefined}
            to="/content"
          />
          <StatCard
            label="Waiting for review"
            value={s?.content ? s.content.inReview : s === undefined ? undefined : null}
            loading={loading}
            icon={BookOpenCheckIcon}
            tone="warning"
            hint={s?.content ? `${s.content.changesRequested} sent back for changes` : undefined}
            to="/review"
          />
          <StatCard
            label="Open safety flags"
            value={s?.safety ? s.safety.open : s === undefined ? undefined : null}
            loading={loading}
            icon={FlagIcon}
            tone="brand"
            hint={s?.safety ? `${s.safety.openHigh} high · ${s.safety.last24h} in the last 24 hours` : undefined}
            to="/safety"
            search={{ status: 'open' }}
          />
          {isAdmin ? (
            <StatCard
              label="Open support tickets"
              value={s?.support ? s.support.open : s === undefined ? undefined : null}
              loading={loading}
              icon={LifeBuoyIcon}
              to="/support"
            />
          ) : (
            <StatCard
              label="Open support tickets"
              value={s?.support ? s.support.open : s === undefined ? undefined : null}
              loading={loading}
              icon={LifeBuoyIcon}
            />
          )}
          <StatCard
            label="Failed webhooks (24 h)"
            value={s?.webhooks ? s.webhooks.failed24h : s === undefined ? undefined : null}
            loading={loading}
            icon={WebhookIcon}
            tone={s?.webhooks?.failed24h ? 'brand' : 'default'}
            to={isAdmin ? '/settings/integrations' : undefined}
            search={isAdmin ? { tab: 'deliveries', status: 'failed' } : undefined}
          />
        </section>
      )}
      <div className="grid items-start gap-4 lg:grid-cols-2 xl:grid-cols-3">
        <PreviewCard
          title="Review queue"
          description="Drafts waiting for a clinician."
          to="/review"
          query={review}
          empty="Nothing waiting for review"
          getKey={(i) => i.id}
          render={(i) => (
            <Link
              to="/review"
              search={{ id: i.id }}
              className="-mx-2 flex items-center justify-between gap-2 rounded-md px-2 py-1 hover:bg-muted/50"
            >
              <span className="flex min-w-0 flex-col">
                <span className="truncate text-sm font-medium">{i.title}</span>
                <span className="text-xs text-muted-foreground">
                  <span className="font-mono">{i.code ?? 'New'}</span> · {KIND_LABEL[i.kind] ?? i.kind}
                </span>
              </span>
              <span className="shrink-0 text-xs text-muted-foreground">{formatRelative(i.updatedAt)}</span>
            </Link>
          )}
        />
        <PreviewCard
          title="Open high flags"
          description="Crisis checks nobody has reviewed yet."
          to="/safety"
          search={{ status: 'open', level: 'high' }}
          query={flags}
          empty="No open high flags"
          getKey={(f) => f.id}
          render={(f) => (
            <Link
              to="/safety"
              search={{ status: 'open', level: 'high', flag: f.id }}
              className="-mx-2 flex items-center justify-between gap-2 rounded-md px-2 py-1 hover:bg-muted/50"
            >
              <span className="flex min-w-0 flex-col">
                <span className="truncate text-sm font-medium">{f.userEmail ?? f.userId}</span>
                <span className="text-xs text-muted-foreground">
                  {FLAG_KIND[f.kind]} · {f.helplineShown ? 'helpline shown' : 'no helpline'} · {f.count}×
                </span>
              </span>
              <span className="shrink-0 text-xs text-muted-foreground">{formatRelative(f.lastAt)}</span>
            </Link>
          )}
        />
        {isAdmin && (
          <PreviewCard
            title="Failed webhook deliveries"
            description="Gave up after 6 attempts."
            to="/settings/integrations"
            search={{ tab: 'deliveries', status: 'failed' }}
            query={failed}
            empty="No failed deliveries"
            getKey={(d) => d.id}
            render={(d) => (
              <Link
                to="/settings/integrations"
                search={{ tab: 'deliveries', status: 'failed', delivery: d.id }}
                className="-mx-2 flex items-center justify-between gap-2 rounded-md px-2 py-1 hover:bg-muted/50"
              >
                <span className="flex min-w-0 flex-col">
                  <span className="truncate text-sm font-medium">{EVENT_LABEL[d.event]}</span>
                  <span className="truncate text-xs text-muted-foreground">
                    {d.lastError ?? `HTTP ${d.lastStatusCode}`}
                  </span>
                </span>
                <StatusBadge status={d.status} />
              </Link>
            )}
          />
        )}
      </div>
    </>
  );
}
