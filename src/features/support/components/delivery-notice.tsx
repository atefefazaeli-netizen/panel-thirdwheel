import { MailWarningIcon } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useDeliveryStatus } from '../api/queries';
import { NO_PROVIDER_COPY } from '../lib/labels';

/** Shown wherever replies are written or listed while no email provider is configured (§5). */
export function DeliveryProviderNotice() {
  const delivery = useDeliveryStatus();
  if (!delivery.data || delivery.data.canSend) return null;
  return (
    <Alert variant="warning" data-testid="no-email-provider">
      <MailWarningIcon />
      <AlertTitle>Replies are not being sent</AlertTitle>
      <AlertDescription>{NO_PROVIDER_COPY}</AlertDescription>
    </Alert>
  );
}
