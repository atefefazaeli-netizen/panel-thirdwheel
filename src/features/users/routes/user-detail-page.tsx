import { getRouteApi, Link } from '@tanstack/react-router';
import { CircleOffIcon, HeartIcon, LifeBuoyIcon, ShieldAlertIcon } from 'lucide-react';
import type * as React from 'react';
import {
  CopyButton,
  EmptyState,
  ErrorState,
  ForbiddenState,
  PageHeader,
  RoleGate,
  StatusBadge,
} from '@/components/shared';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { formatDate, formatDateTime, formatRelative } from '@/lib/format';
import { useUser } from '../api/queries';
import { UserActions } from '../components/user-actions';
import { DUR_LABEL, KIDS_LABEL, LIVING_LABEL, PLAN_LABEL } from '../lib/labels';

const route = getRouteApi('/_app/users/$id');

function Fields({ rows }: { rows: [string, React.ReactNode][] }) {
  return (
    <dl className="grid grid-cols-[9rem_minmax(0,1fr)] gap-x-3 gap-y-2 text-sm">
      {rows.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-muted-foreground">{k}</dt>
          <dd className="min-w-0 break-words">{v ?? <span className="text-muted-foreground">Not set</span>}</dd>
        </div>
      ))}
    </dl>
  );
}

export function UserDetailPage() {
  return (
    <RoleGate allow="admin" fallback={<ForbiddenState what="users" />}>
      <UserDetail />
    </RoleGate>
  );
}

function UserDetail() {
  const { id } = route.useParams();
  const q = useUser(id);
  if (q.error)
    return <ErrorState error={q.error} title="Could not load this account" onRetry={() => void q.refetch()} />;
  if (!q.data)
    return (
      <div className="grid gap-4 lg:grid-cols-2" aria-busy="true">
        <Skeleton className="h-10 w-64 lg:col-span-2" />
        <Skeleton className="h-56" />
        <Skeleton className="h-56" />
      </div>
    );
  const { account, profile, couple, subscription, safety, support } = q.data;
  const staff = account.roles.filter((r) => r === 'admin' || r === 'clinician');

  return (
    <>
      <PageHeader
        title={profile?.name ?? account.email ?? account.userId}
        meta={
          <>
            {subscription && (
              <StatusBadge status={subscription.state} label={PLAN_LABEL[subscription.state]} dot={false} />
            )}
            {account.suspended && <StatusBadge status="suspended" />}
            {staff.map((r) => (
              <Badge key={r} variant="outline" className="capitalize">
                {r}
              </Badge>
            ))}
          </>
        }
        description={account.email}
        actions={<UserActions user={q.data} />}
      />
      {account.suspended && (
        <Alert variant="destructive">
          <CircleOffIcon />
          <AlertTitle>Suspended</AlertTitle>
          <AlertDescription>{account.suspendedReason ?? 'No reason given.'} They cannot sign in.</AlertDescription>
        </Alert>
      )}
      <div className="grid items-start gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Account</CardTitle>
          </CardHeader>
          <CardContent>
            <Fields
              rows={[
                [
                  'User id',
                  <span key="id" className="flex items-center gap-1 font-mono text-xs">
                    {account.userId}
                    <CopyButton value={account.userId} iconOnly variant="ghost" label="Copy user id" />
                  </span>,
                ],
                ['Email', account.email],
                ['Registered', formatDateTime(account.createdAt)],
                ['Sign-in', account.providers.length ? `Email code, ${account.providers.join(', ')}` : 'Email code'],
                ['Roles', account.roles.length ? account.roles.join(', ') : 'None (app user)'],
                [
                  'Tags',
                  account.tags.length ? (
                    <span className="flex flex-wrap gap-1">
                      {account.tags.map((t) => (
                        <Badge key={t} variant="secondary" className="font-mono">
                          {t}
                        </Badge>
                      ))}
                    </span>
                  ) : null,
                ],
              ]}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Subscription</CardTitle>
            <CardDescription>
              Store purchases are managed in the stores. Admins can grant Plus for a set time.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {subscription ? (
              <Fields
                rows={[
                  ['Plan', PLAN_LABEL[subscription.state]],
                  ['Plus', subscription.plus ? 'Yes' : 'No'],
                  ['Renews or ends', subscription.renewsAt ? formatDate(subscription.renewsAt) : null],
                  [
                    'Admin grant',
                    subscription.grant ? (
                      <span key="g">
                        Until {formatDate(subscription.grant.until)} by{' '}
                        <span className="font-mono text-xs">{subscription.grant.by}</span>
                        {subscription.grant.note && (
                          <span className="block text-muted-foreground">“{subscription.grant.note}”</span>
                        )}
                      </span>
                    ) : (
                      'None'
                    ),
                  ],
                  [
                    'Free experiences used',
                    subscription.experiencesUsed == null
                      ? 'Not counted on Plus'
                      : `${subscription.experiencesUsed} of 3`,
                  ],
                ]}
              />
            ) : (
              <EmptyState title="Not available" description="The subscription service did not answer." />
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Profile</CardTitle>
            <CardDescription>What staff may see. No cycle data, things to avoid, answers or chats.</CardDescription>
          </CardHeader>
          <CardContent>
            {profile ? (
              <Fields
                rows={[
                  ['Name', profile.name],
                  ['Photo', profile.photo ? 'Yes' : 'No'],
                  ['Gender', profile.gender],
                  ['Birthday', profile.birthday ? formatDate(profile.birthday) : null],
                  ['From', profile.from],
                  ['City', profile.city],
                  ['Job', profile.job],
                  ['Interests', profile.interests.length ? profile.interests.join(', ') : null],
                  ['Goals', profile.goals.length ? profile.goals.join(', ') : null],
                  [
                    'Together',
                    `${DUR_LABEL[profile.sit.dur] ?? profile.sit.dur}${profile.togetherSince ? ` (since ${formatDate(profile.togetherSince)})` : ''}`,
                  ],
                  [
                    'Situation',
                    `${LIVING_LABEL[profile.sit.living] ?? profile.sit.living} · ${KIDS_LABEL[profile.sit.kids] ?? profile.sit.kids}`,
                  ],
                  ['Spicy', profile.spicy ? 'On' : 'Off'],
                  ['Onboarded', profile.onboarded ? 'Yes' : 'Not finished'],
                ]}
              />
            ) : (
              <EmptyState title="No profile yet" description="They signed up but have not set up a profile." />
            )}
          </CardContent>
        </Card>
        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <HeartIcon className="size-4 text-brand" aria-hidden />
                Couple
              </CardTitle>
            </CardHeader>
            <CardContent>
              {couple ? (
                <Fields
                  rows={[
                    [
                      'Partner',
                      <Link
                        key="p"
                        to="/users/$id"
                        params={{ id: couple.partner.userId }}
                        className="font-medium hover:underline"
                      >
                        {couple.partner.name ?? couple.partner.userId}
                      </Link>,
                    ],
                    ['Partner email', couple.partner.email],
                    ['Linked', formatDateTime(couple.linkedAt)],
                    [
                      'Couple id',
                      <span key="c" className="font-mono text-xs">
                        {couple.coupleId}
                      </span>,
                    ],
                  ]}
                />
              ) : (
                <p className="text-sm text-muted-foreground">Not linked with a partner.</p>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ShieldAlertIcon className="size-4" aria-hidden />
                Safety
              </CardTitle>
              <CardDescription>Metadata only. Thirdwheel never stores what was typed.</CardDescription>
              <CardAction>
                <Button variant="outline" size="sm" asChild>
                  <a href={`/safety?userId=${encodeURIComponent(account.userId)}`}>View flags</a>
                </Button>
              </CardAction>
            </CardHeader>
            <CardContent>
              <Fields
                rows={[
                  ['Open flags', String(safety.open)],
                  ['All flags', String(safety.total)],
                  ['Last flag', safety.lastAt ? formatRelative(safety.lastAt) : 'Never'],
                ]}
              />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <LifeBuoyIcon className="size-4" aria-hidden />
                Support
              </CardTitle>
              <CardAction>
                <Button variant="outline" size="sm" asChild>
                  <a href="/support">Open inbox</a>
                </Button>
              </CardAction>
            </CardHeader>
            <CardContent>
              <Fields
                rows={[
                  ['Open tickets', String(support.open)],
                  ['All tickets', String(support.total)],
                ]}
              />
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
