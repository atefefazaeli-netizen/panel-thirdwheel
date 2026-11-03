// Mock support tickets (Contact support and Report a problem), some with screenshots.
import type { SupportTicket } from '@/features/support/api/types';
import { daysAgo, oid } from '../utils';
import { uid } from './users';

export interface SupportState {
  tickets: SupportTicket[];
}

const ref = (id: string) => `TW-SUP-${id.slice(-6).toUpperCase()}`;

export function seedSupport(): SupportState {
  const rows: [
    string,
    SupportTicket['kind'],
    SupportTicket['topic'],
    string,
    boolean,
    SupportTicket['status'],
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
  return {
    tickets: rows.map(([name, kind, topic, text, device, status, days, shot], i) => {
      const id = oid(`ticket:${i}`);
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
        status,
        createdAt: daysAgo(days),
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
