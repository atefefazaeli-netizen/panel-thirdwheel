/** ADMIN_API.md › Dashboard. Each part comes from its owner; a part that failed reads null. */
export interface AdminStats {
  accounts: number | null;
  signups7d: number | null;
  suspended: number | null;
  couples: number | null;
  plus: number | null;
  grants: number | null;
  content: { live: number; inReview: number; changesRequested: number; retired: number } | null;
  safety: { open: number; openHigh: number; last24h: number } | null;
  support: { open: number } | null;
  webhooks: { failed24h: number } | null;
}
