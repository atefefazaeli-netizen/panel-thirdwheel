import type { NavBadges } from '@/components/shared';
import { useAdminStats } from '@/features/dashboard/api/queries';

/** Counts next to sidebar items, from admin/stats (refreshed every minute). */
export function useNavBadges(): NavBadges {
  const s = useAdminStats().data;
  return { review: s?.content?.inReview, safety: s?.safety?.openHigh, support: s?.support?.open };
}
