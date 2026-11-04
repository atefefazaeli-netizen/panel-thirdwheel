// DTOs for ADMIN_API.md › Users & couples (shapes from libs/common admin.contracts.ts).

export type SubscriptionState = 'free' | 'plus' | 'paid_by_partner' | 'cancelled' | 'payment_problem';
export const PLANS: readonly SubscriptionState[] = ['free', 'plus', 'paid_by_partner', 'cancelled', 'payment_problem'];

/** `name`, `plan`, `plus` and `linked` read null when their owner module did not answer. */
export interface AdminUserRow {
  userId: string;
  email: string | null;
  name: string | null;
  createdAt: string;
  plan: SubscriptionState | null;
  plus: boolean | null;
  linked: boolean | null;
  partner: { userId: string; name: string | null } | null;
  suspended: boolean;
  tags: string[];
}

export interface AdminAccountRow {
  userId: string;
  email: string | null;
  roles: string[];
  createdAt: string;
  suspended: boolean;
  suspendedReason: string | null;
  tags: string[];
  providers: string[];
}

/** What staff may see of a profile. No cycle data, no things to avoid, no answers, no chats. */
export interface AdminProfileView {
  userId: string;
  name: string;
  photo: boolean;
  gender: string | null;
  birthday: string | null;
  from: string | null;
  job: string | null;
  city: string | null;
  interests: string[];
  goals: string[];
  togetherSince: string | null;
  sit: { dur: string; kids: string; living: string };
  spicy: boolean;
  onboarded: boolean;
}

/** Where the current Plus comes from (server: same precedence as the app's Plus state). */
export type PlusSource = 'store' | 'admin_grant' | 'partner' | 'none';
/**
 * How the store purchase behind the Plus was checked: `mock` while the API runs the development
 * receipt verifier (no App Store or Play check), `store` with a real adapter, null when no store
 * purchase is involved.
 */
export type ReceiptVerification = 'mock' | 'store';

export interface AdminSubscriptionView {
  userId: string;
  state: SubscriptionState;
  plus: boolean;
  renewsAt: string | null;
  grant: { until: string; by: string; note: string | null } | null;
  experiencesUsed: number | null;
  /** Missing from an API older than the accounts audit (read as unknown). */
  source?: PlusSource;
  verification?: ReceiptVerification | null;
}

/** Each part other than `account` reads null when its owner fails or has no handler yet. */
export interface AdminUserDetail {
  account: AdminAccountRow;
  profile: AdminProfileView | null;
  couple: {
    coupleId: string;
    linkedAt: string;
    partner: { userId: string; name: string | null; email: string | null };
  } | null;
  subscription: AdminSubscriptionView | null;
  safety: { open: number; total: number; lastAt: string | null } | null;
  support: { total: number; open: number } | null;
  /** Parts that are null because their owner failed (not because there is nothing). */
  unavailable?: AdminUserPart[];
}

export type AdminUserPart = 'profile' | 'couple' | 'subscription' | 'safety' | 'support';

export interface UserListQuery {
  q?: string;
  plan?: SubscriptionState;
  linked?: boolean;
  suspended?: boolean;
  tag?: string;
  from?: string;
  to?: string;
  page?: number;
  limit?: number;
}
