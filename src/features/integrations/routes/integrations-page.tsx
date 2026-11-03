import { getRouteApi } from '@tanstack/react-router';
import { ForbiddenState, PageHeader, RoleGate } from '@/components/shared';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cleanSearch } from '@/lib/search';
import { ApiKeysTab } from '../components/api-keys-tab';
import { DeliveriesTab } from '../components/deliveries-tab';
import { SignatureHelp } from '../components/signature-help';
import { WebhooksTab } from '../components/webhooks-tab';
import type { IntegrationsSearch } from '../schemas/integrations';

const route = getRouteApi('/_app/settings/integrations');

export function IntegrationsPage() {
  return (
    <RoleGate allow="admin" fallback={<ForbiddenState what="integrations" />}>
      <Integrations />
    </RoleGate>
  );
}

function Integrations() {
  const search = route.useSearch();
  const navigate = route.useNavigate();
  const tab = search.tab ?? 'webhooks';
  const set = (patch: Partial<IntegrationsSearch>, resetPage = true) =>
    navigate({
      search: (prev) => cleanSearch({ ...prev, ...(resetPage ? { page: undefined } : {}), ...patch }),
      replace: true,
    });

  return (
    <>
      <PageHeader
        title="Integrations"
        description="Webhooks to n8n (crisis alerts, support tickets, content and plan changes) and API keys for n8n to call Thirdwheel."
      />
      <Tabs
        value={tab}
        onValueChange={(t) => void navigate({ search: { tab: t as IntegrationsSearch['tab'] }, replace: true })}
      >
        <TabsList aria-label="Integrations">
          <TabsTrigger value="webhooks">Webhooks</TabsTrigger>
          <TabsTrigger value="deliveries">Deliveries</TabsTrigger>
          <TabsTrigger value="api-keys">API keys</TabsTrigger>
          <TabsTrigger value="verify">Verify signatures</TabsTrigger>
        </TabsList>
        <TabsContent value="webhooks" className="mt-2">
          <WebhooksTab
            onShowDeliveries={(webhookId) => void navigate({ search: { tab: 'deliveries', webhookId }, replace: true })}
          />
        </TabsContent>
        <TabsContent value="deliveries" className="mt-2">
          <DeliveriesTab
            search={search}
            set={set}
            onReset={() => void navigate({ search: { tab: 'deliveries' }, replace: true })}
          />
        </TabsContent>
        <TabsContent value="api-keys" className="mt-2">
          <ApiKeysTab />
        </TabsContent>
        <TabsContent value="verify" className="mt-2">
          <SignatureHelp />
        </TabsContent>
      </Tabs>
    </>
  );
}
