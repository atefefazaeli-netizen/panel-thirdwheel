import type { AdminSubscriptionView, SubscriptionState } from '../api/types';

export const PLAN_LABEL: Record<SubscriptionState, string> = {
  free: 'Free',
  plus: 'Plus',
  paid_by_partner: 'Paid by partner',
  cancelled: 'Cancelled',
  payment_problem: 'Payment problem',
};

export const DUR_LABEL: Record<string, string> = {
  crush: 'A crush',
  u6: 'Under 6 months',
  '6to12': '6 to 12 months',
  '1to3': '1 to 3 years',
  '3to7': '3 to 7 years',
  '7plus': '7+ years',
};
export const KIDS_LABEL: Record<string, string> = { none: 'No kids', home: 'Kids at home', some: 'Kids, not at home' };
export const LIVING_LABEL: Record<string, string> = {
  together: 'Live together',
  same: 'Same city',
  long: 'Long distance',
};

const SOURCE_BASE: Record<NonNullable<AdminSubscriptionView['source']>, string> = {
  store: 'Store purchase',
  admin_grant: 'Admin grant',
  partner: 'Partner’s plan',
  none: 'None',
};

/**
 * Where Plus comes from, saying plainly when the store purchase behind it was never checked with
 * Apple or Google (the API's receipt verifier is a mock in this build).
 */
export function plusSourceLabel(s: Pick<AdminSubscriptionView, 'source' | 'verification'>): string {
  if (!s.source) return 'Not reported by this API version';
  const base = s.source === 'partner' && s.verification ? 'Partner’s store purchase' : SOURCE_BASE[s.source];
  if (s.verification === 'mock') return `${base} (receipt verification is mocked in this build)`;
  if (s.verification === 'store') return `${base} (receipt verified by the store)`;
  return base;
}
