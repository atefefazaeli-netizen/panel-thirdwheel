import type { SubscriptionState } from '../api/types';

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
