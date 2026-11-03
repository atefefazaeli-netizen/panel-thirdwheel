// DTOs for ADMIN_API.md › Users & couples (shapes from libs/common admin.contracts.ts).

export type SubscriptionState = 'free' | 'plus' | 'paid_by_partner' | 'cancelled' | 'payment_problem';
export const PLANS: readonly SubscriptionState[] = ['free', 'plus', 'paid_by_partner', 'cancelled', 'payment_problem'];

export interface AdminUserRow {
  userId: string;
  email: string | null;
  name: string | null;
  createdAt: string;
  plan: SubscriptionState;
  plus: boolean;
  linked: boolean;
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

export interface AdminSubscriptionView {
  userId: string;
  state: SubscriptionState;
  plus: boolean;
  renewsAt: string | null;
  grant: { until: string; by: string; note: string | null } | null;
  experiencesUsed: number | null;
}

export interface AdminUserDetail {
  account: AdminAccountRow;
  profile: AdminProfileView | null;
  couple: {
    coupleId: string;
    linkedAt: string;
    partner: { userId: string; name: string | null; email: string | null };
  } | null;
  subscription: AdminSubscriptionView | null;
  safety: { open: number; total: number; lastAt: string | null };
  support: { total: number; open: number };
}

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
