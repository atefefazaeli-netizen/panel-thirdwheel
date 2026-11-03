import { zodResolver } from '@hookform/resolvers/zod';
import { ExternalLinkIcon, LinkIcon } from 'lucide-react';
import * as React from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { ConfirmDialog, FormFieldSwitch, FormFieldText, StatusBadge } from '@/components/shared';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Form } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { errorMessage } from '@/lib/api';
import { useBookingLink, useRemoveBookingLink, useSetBookingLink } from '../api/queries';
import { bookingLinkSchema } from '../schemas/legacy';

/** "Book on the venue's site" links for Do cards (PUT/DELETE ideas/:id/booking-link). */
export function BookingLinksCard() {
  const [draft, setDraft] = React.useState('pottery-for-two');
  const [cardId, setCardId] = React.useState<string | null>('pottery-for-two');
  const link = useBookingLink(cardId);
  const set = useSetBookingLink();
  const remove = useRemoveBookingLink();
  const [confirm, setConfirm] = React.useState(false);
  const form = useForm({
    resolver: zodResolver(bookingLinkSchema),
    defaultValues: { id: cardId ?? '', url: '', venue: '', paid: false },
  });

  React.useEffect(() => {
    if (link.data && cardId)
      form.reset({
        id: cardId,
        url: link.data.source === 'venue' ? link.data.url : '',
        venue: link.data.venue ?? '',
        paid: link.data.paidLink,
      });
  }, [link.data, cardId, form]);

  const submit = form.handleSubmit(async (v) => {
    try {
      await set.mutateAsync({ id: v.id, url: v.url, venue: v.venue || null, paid: v.paid });
      toast.success('Booking link saved');
    } catch (e) {
      toast.error(errorMessage(e));
    }
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <LinkIcon className="size-4" aria-hidden />
          Venue booking links
        </CardTitle>
        <CardDescription>
          The "Book on the venue's site" link on a Do card. Without one, the app opens a web search for the venue.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <form
          className="flex items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            setCardId(draft.trim() || null);
          }}
        >
          <div className="flex flex-1 flex-col gap-2">
            <Label htmlFor="booking-card">Do card id</Label>
            <Input
              id="booking-card"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="pottery-for-two"
            />
          </div>
          <Button type="submit" variant="outline">
            Look up
          </Button>
        </form>
        {link.error && <p className="text-sm text-destructive">{errorMessage(link.error)}</p>}
        {link.data && (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <StatusBadge
              status={link.data.source === 'venue' ? 'active' : 'pending'}
              label={link.data.source === 'venue' ? 'Venue link' : 'Web search (no link yet)'}
            />
            {link.data.paidLink && <StatusBadge status="info" tone="info" label="Paid link" />}
            <a
              href={link.data.url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex max-w-full items-center gap-1 truncate text-info underline-offset-2 hover:underline"
            >
              {link.data.url}
              <ExternalLinkIcon className="size-3 shrink-0" aria-hidden />
            </a>
          </div>
        )}
        {cardId && (
          <Form {...form}>
            <form onSubmit={submit} className="grid items-start gap-3 sm:grid-cols-2" noValidate>
              <FormFieldText
                control={form.control}
                name="url"
                label="Booking URL (https)"
                placeholder="https://claystudio.example/book?ref=thirdwheel"
                className="sm:col-span-2"
              />
              <FormFieldText control={form.control} name="venue" label="Venue" placeholder="Clay Studio" />
              <FormFieldSwitch
                control={form.control}
                name="paid"
                label="Paid link"
                description="Affiliate link: the card shows “Paid link”."
              />
              <div className="flex gap-2 sm:col-span-2">
                <Button type="submit" disabled={set.isPending}>
                  Save link
                </Button>
                {link.data?.source === 'venue' && (
                  <Button type="button" variant="outline" onClick={() => setConfirm(true)}>
                    Remove link
                  </Button>
                )}
              </div>
            </form>
          </Form>
        )}
        <ConfirmDialog
          open={confirm}
          onOpenChange={setConfirm}
          title="Remove the booking link?"
          description="The card falls back to a web search for the venue."
          confirmLabel="Remove link"
          cancelLabel="Keep link"
          destructive
          onConfirm={async () => {
            await remove.mutateAsync(cardId!);
            toast.success('Booking link removed');
          }}
        />
      </CardContent>
    </Card>
  );
}
