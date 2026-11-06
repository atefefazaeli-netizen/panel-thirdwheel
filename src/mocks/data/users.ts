// Mock accounts: Sara and Alex (the app's personas, linked, Plus paid by Sara), the two staff
// accounts and a spread of other couples and singles in every plan and state.
import type {
  AdminAccountRow,
  AdminProfileView,
  AdminSubscriptionView,
  SubscriptionState,
} from '@/features/users/api/types';
import { daysAgo, oid } from '../utils';

/** The mock's user ids: ObjectId-shaped, derived from the persona name (uid('sara')). */
export const uid = (name: string) => oid(`user:${name}`);

export interface MockUser {
  account: AdminAccountRow;
  name: string | null;
  profile: AdminProfileView | null;
  couple: { coupleId: string; partnerId: string; linkedAt: string } | null;
  subscription: AdminSubscriptionView;
  /** Bumped by Sign out everywhere (token version). */
  tokenVersion: number;
}

const FIRST = [
  'Maya',
  'Omar',
  'Lena',
  'Jonas',
  'Priya',
  'Dev',
  'Noor',
  'Karim',
  'Ella',
  'Theo',
  'Aisha',
  'Ben',
  'Sofia',
  'Luca',
  'Hana',
  'Yusuf',
  'Clara',
  'Max',
  'Rania',
  'Sam',
  'Zara',
  'Leo',
  'Ines',
  'Adam',
  'Mira',
  'Felix',
  'Dana',
  'Rami',
  'Nadia',
  'Eli',
];
const CITIES = ['Chicago', 'Dubai', 'London', 'Berlin', 'Toronto', 'Sydney', 'Abu Dhabi', 'Amsterdam'];
const DURS = ['crush', 'u6', '6to12', '1to3', '3to7', '7plus'];
const INTERESTS = ['Cooking', 'Hiking', 'Board games', 'Live music', 'Travel', 'Yoga', 'Films', 'Reading'];

function profile(userId: string, name: string, i: number, extra: Partial<AdminProfileView> = {}): AdminProfileView {
  return {
    userId,
    name,
    photo: i % 3 !== 0,
    gender: i % 2 ? 'woman' : 'man',
    birthday: `199${i % 10}-0${(i % 9) + 1}-1${i % 9}`,
    from: i % 4 === 0 ? 'Beirut, Lebanon' : null,
    job: i % 3 === 0 ? 'Designer' : i % 3 === 1 ? 'Nurse' : null,
    city: CITIES[i % CITIES.length]!,
    interests: INTERESTS.slice(i % 5, (i % 5) + 3),
    goals: i % 2 ? ['dates', 'talk'] : ['play'],
    togetherSince: `202${i % 5}-0${(i % 8) + 1}-01`,
    sit: {
      dur: DURS[i % DURS.length]!,
      kids: i % 4 === 0 ? 'home' : 'none',
      living: i % 3 === 0 ? 'long' : 'together',
    },
    spicy: i % 5 !== 0,
    onboarded: i % 7 !== 0,
    ...extra,
  };
}

function sub(
  userId: string,
  state: SubscriptionState,
  renewsDays: number | null = null,
  used: number | null = 0,
): AdminSubscriptionView {
  return {
    userId,
    state,
    plus: state === 'plus' || state === 'paid_by_partner' || state === 'payment_problem',
    renewsAt: renewsDays == null ? null : new Date(Date.now() + renewsDays * 86_400_000).toISOString(),
    grant: null,
    experiencesUsed: used,
  };
}

function account(
  userId: string,
  email: string,
  createdDaysAgo: number,
  extra: Partial<AdminAccountRow> = {},
): AdminAccountRow {
  return {
    userId,
    email,
    roles: [],
    createdAt: daysAgo(createdDaysAgo),
    suspended: false,
    suspendedReason: null,
    tags: [],
    providers: [],
    ...extra,
  };
}

export function seedUsers(): Map<string, MockUser> {
  const users = new Map<string, MockUser>();
  const add = (u: MockUser) => users.set(u.account.userId, u);

  add({
    account: account(uid('sara'), 'sara@example.com', 40, { tags: ['beta', 'design-partner'], providers: ['apple'] }),
    name: 'Sara',
    profile: profile(uid('sara'), 'Sara', 1, {
      city: 'Chicago',
      job: 'UX designer',
      gender: 'woman',
      sit: { dur: '1to3', kids: 'none', living: 'together' },
      togetherSince: '2024-05-01',
    }),
    couple: { coupleId: 'cpl_sara_alex', partnerId: uid('alex'), linkedAt: daysAgo(38) },
    subscription: sub(uid('sara'), 'plus', 21, null),
    tokenVersion: 0,
  });
  add({
    account: account(uid('alex'), 'alex@example.com', 38, { tags: ['beta'], providers: ['google'] }),
    name: 'Alex',
    profile: profile(uid('alex'), 'Alex', 2, {
      city: 'Chicago',
      job: 'Chef',
      gender: 'man',
      sit: { dur: '1to3', kids: 'none', living: 'together' },
      togetherSince: '2024-05-01',
    }),
    couple: { coupleId: 'cpl_sara_alex', partnerId: uid('sara'), linkedAt: daysAgo(38) },
    subscription: sub(uid('alex'), 'paid_by_partner', 21, null),
    tokenVersion: 0,
  });
  add({
    account: account(uid('lead'), 'lead@thirdwheel.app', 60, { tags: ['staff'] }),
    name: 'Lead',
    profile: null,
    couple: null,
    subscription: sub(uid('lead'), 'free', null, 0),
    tokenVersion: 0,
  });
  add({
    account: account(uid('doctor'), 'dr.noor@thirdwheel.app', 55, { tags: ['staff'] }),
    name: 'Dr. Noor',
    profile: null,
    couple: null,
    subscription: sub(uid('doctor'), 'free', null, 0),
    tokenVersion: 0,
  });

  const plans: SubscriptionState[] = ['free', 'free', 'free', 'plus', 'cancelled', 'payment_problem', 'free', 'plus'];
  const tagPool = [[], [], ['press'], ['vip'], ['beta'], [], ['n8n-flagged'], ['churn-risk']];
  for (let i = 0; i < FIRST.length; i++) {
    const name = FIRST[i]!;
    const id = uid(name.toLowerCase());
    const plan = plans[i % plans.length]!;
    add({
      account: account(id, `${name.toLowerCase()}${i % 3 === 0 ? '.k' : ''}@example.com`, 2 + i * 3, {
        tags: tagPool[i % tagPool.length]!,
        providers: i % 4 === 0 ? ['google'] : [],
      }),
      name,
      profile: i % 9 === 8 ? null : profile(id, name, i + 3),
      couple: null,
      subscription: sub(
        id,
        plan,
        plan === 'plus' ? 10 + i : plan === 'cancelled' ? -5 : null,
        plan === 'free' ? i % 4 : null,
      ),
      tokenVersion: 0,
    });
  }
  // Link pairs of the generated accounts into couples.
  const ids = FIRST.map((n) => uid(n.toLowerCase()));
  for (let i = 0; i + 1 < 16; i += 2) {
    const a = users.get(ids[i]!)!;
    const b = users.get(ids[i + 1]!)!;
    const coupleId = `cpl_${i}`;
    a.couple = { coupleId, partnerId: b.account.userId, linkedAt: daysAgo(20 - i) };
    b.couple = { coupleId, partnerId: a.account.userId, linkedAt: daysAgo(20 - i) };
    if (a.subscription.state === 'plus')
      b.subscription = { ...b.subscription, state: 'paid_by_partner', plus: true, renewsAt: a.subscription.renewsAt };
  }
  // A suspended spam account and an admin grant.
  const spam = users.get(uid('sam'))!;
  spam.account = { ...spam.account, suspended: true, suspendedReason: 'Spam sign-ups from one device', tags: ['spam'] };
  const zara = users.get(uid('zara'))!;
  zara.subscription = {
    ...zara.subscription,
    state: 'plus',
    plus: true,
    grant: { until: new Date(Date.now() + 25 * 86_400_000).toISOString(), by: uid('lead'), note: 'Podcast giveaway' },
  };
  return users;
}
