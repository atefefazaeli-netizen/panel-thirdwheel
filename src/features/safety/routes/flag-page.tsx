import { getRouteApi } from '@tanstack/react-router';
import { ErrorState, PageHeader, StatusBadge } from '@/components/shared';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useSafetyFlag } from '../api/queries';
import { FlagDetail } from '../components/flag-detail';
import { KIND_LABEL } from '../lib/labels';

const route = getRouteApi('/_app/safety/$id');

/** /safety/<flagId>: the page `crisis.alert` webhooks link to (panelUrl). */
export function FlagPage() {
  const { id } = route.useParams();
  const flag = useSafetyFlag(id);
  if (flag.error)
    return <ErrorState error={flag.error} title="Could not load this flag" onRetry={() => void flag.refetch()} />;
  if (!flag.data) return <Skeleton className="h-96" />;
  return (
    <>
      <PageHeader
        title={`${KIND_LABEL[flag.data.kind]} check`}
        meta={<StatusBadge status={flag.data.status} />}
        description={flag.data.userEmail ?? flag.data.userId}
      />
      <Card className="max-w-3xl">
        <CardContent>
          <FlagDetail flag={flag.data} />
        </CardContent>
      </Card>
    </>
  );
}
