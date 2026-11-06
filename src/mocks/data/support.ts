// Mock support tickets (Contact support and Report a problem), some with screenshots, with the
// workflow of STAFF_API.md §5: status, priority, assignee, version and a timeline of events.
import type { SupportTicket, TimelineEvent } from '@/features/support/api/types';
import { daysAgo, oid } from '../utils';
import { staffId } from './staff';
import { uid } from './users';

export interface StoredTicket extends SupportTicket {
  timeline: TimelineEvent[];
}

export interface SupportState {
  tickets: StoredTicket[];
  /**
   * The server's email provider for replies. `none` = EMAIL_DRIVER=log (today's only driver): replies
   * stay pending with NO_EMAIL_PROVIDER. Tests switch it to `mock-smtp` (accepts) or `failing`.
   */
  provider: 'none' | 'mock-smtp' | 'failing';
}

const ref = (id: string) => `TW-SUP-${id.slice(-6).toUpperCase()}`;

export function seedSupport(): SupportState {
  const rows: [
    string,
    SupportTicket['kind'],
    SupportTicket['topic'],
    string,
    boolean,
    'open' | 'closed',
    number,
    boolean,
  ][] = [
    ['sara', 'problem', null, 'The Plans tab spins forever after I add a memory.', true, 'open', 0.1, true],
    [
      'alex',
      'message',
      'Subscription',
      'Sara pays for Plus but my app still shows the free counter.',
      false,
      'open',
      0.6,
      false,
    ],
    [
      'maya',
      'message',
      'Account',
      'I changed my email and now I cannot sign in with the old one. Is that expected?',
      false,
      'open',
      1.2,
      false,
    ],
    ['jonas', 'message', 'Bookings', 'I was charged twice for the pottery class.', true, 'open', 2, false],
    [
      'priya',
      'problem',
      null,
      'The timer in Lip-sync battle does not buzz when the screen is locked.',
      true,
      'open',
      3,
      true,
    ],
    [
      'karim',
      'message',
      'Something else',
      'Love the new Explore. Could you add more long-distance ideas?',
      false,
      'closed',
      5,
      false,
    ],
    ['lena', 'problem', null, 'Third Ear answered twice to one message.', true, 'closed', 6, false],
    ['theo', 'message', 'Subscription', 'How do I cancel? I cannot find it in settings.', false, 'closed', 8, false],
    ['ella', 'message', 'Account', 'Please delete my partner link, we broke up.', false, 'open', 9, false],
    ['ben', 'problem', null, 'Spicy cards show for my partner even though I turned it off.', true, 'open', 10, true],
    ['aisha', 'message', 'Bookings', 'The venue says they never got our booking.', false, 'closed', 12, false],
    ['noor', 'problem', null, 'Photos in Memories are blurry after upload.', true, 'closed', 15, true],
  ];
  const support = staffId('support');
  const lead = staffId('support.lead');
  return {
    provider: 'none',
    tickets: rows.map(([name, kind, topic, text, device, status, days, shot], i): StoredTicket => {
      const id = oid(`ticket:${i}`);
      const createdAt = daysAgo(days);
      const timeline: TimelineEvent[] = [{ id: oid(`ev:${i}:0`), type: 'created', at: createdAt, by: null }];
      // A few tickets already worked on: assigned, prioritised, a note and a pending reply.
      const assigneeId = i === 1 ? support : i === 3 ? lead : i === 5 ? support : null;
      const priority = i === 3 ? 'urgent' : i === 1 ? 'high' : i === 8 ? 'low' : 'normal';
      const st: SupportTicket['status'] =
        status === 'closed' ? 'closed' : i === 1 ? 'in_progress' : i === 3 ? 'waiting_for_user' : 'open';
      if (assigneeId)
        timeline.push({
          id: oid(`ev:${i}:1`),
          type: 'assignee',
          at: daysAgo(days * 0.8),
          by: `staff:${lead}`,
          byName: 'Mira Nasser',
          from: null,
          to: assigneeId,
          toName: assigneeId === support ? 'Yousef Ali' : 'Mira Nasser',
        });
      if (priority !== 'normal')
        timeline.push({
          id: oid(`ev:${i}:2`),
          type: 'priority',
          at: daysAgo(days * 0.7),
          by: `staff:${lead}`,
          byName: 'Mira Nasser',
          from: 'normal',
          to: priority,
        });
      if (i === 1 || i === 3) {
        timeline.push({
          id: oid(`ev:${i}:3`),
          type: 'note',
          at: daysAgo(days * 0.6),
          by: `staff:${support}`,
          byName: 'Yousef Ali',
          text:
            i === 1
              ? 'Checked the plan: Sara is on Plus, Alex should inherit it. Looks like a cache issue.'
              : 'Asked the venue for their booking log.',
        });
        timeline.push({
          id: oid(`ev:${i}:4`),
          type: 'reply',
          at: daysAgo(days * 0.5),
          by: `staff:${support}`,
          byName: 'Yousef Ali',
          text:
            i === 1
              ? 'Thanks for writing. Could you sign out and in again? That refreshes the plan on your phone.'
              : 'Sorry about that. We are checking with the venue and will get back to you.',
          delivery: { status: 'pending', provider: null, attempts: 1, lastError: 'NO_EMAIL_PROVIDER', sentAt: null },
        });
      }
      if (st !== 'open')
        timeline.push({
          id: oid(`ev:${i}:5`),
          type: 'status',
          at: daysAgo(days * 0.4),
          by: `staff:${support}`,
          byName: 'Yousef Ali',
          from: 'open',
          to: st,
        });
      return {
        id,
        ref: ref(id),
        userId: uid(name),
        kind,
        topic,
        text,
        device: device
          ? { app: '1.3.0', os: i % 2 ? 'android 16' : 'ios 19.1', model: i % 2 ? 'Pixel 10' : 'iPhone 17' }
          : null,
        hasScreenshot: shot,
        status: st,
        priority,
        assigneeId,
        version: timeline.length,
        createdAt,
        updatedAt: timeline[timeline.length - 1]!.at,
        timeline,
      };
    }),
  };
}

/** A phone-shaped placeholder image for tickets with a screenshot. */
export function screenshotSvg(ticket: SupportTicket): string {
  const lines = ticket.text.match(/.{1,26}(\s|$)/g) ?? [ticket.text];
  const text = lines
    .slice(0, 6)
    .map(
      (l, i) =>
        `<text x="24" y="${190 + i * 22}" font-family="sans-serif" font-size="15" fill="#1A2B4C">${l.trim().replace(/&/g, '&amp;').replace(/</g, '&lt;')}</text>`,
    )
    .join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="280" height="560" viewBox="0 0 280 560"><rect width="280" height="560" rx="32" fill="#EAEFF6"/><rect x="16" y="60" width="248" height="70" rx="16" fill="#fff"/><text x="32" y="102" font-family="sans-serif" font-weight="700" font-size="18" fill="#1A2B4C">Thirdwheel</text><rect x="16" y="150" width="248" height="170" rx="16" fill="#fff"/>${text}<rect x="16" y="480" width="248" height="48" rx="24" fill="#EC0137"/><text x="140" y="510" text-anchor="middle" font-family="sans-serif" font-weight="700" font-size="16" fill="#fff">${ticket.ref}</text></svg>`;
}
