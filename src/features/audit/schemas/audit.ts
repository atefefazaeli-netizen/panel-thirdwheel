import { z } from 'zod';
import { optionalString, pageSearch } from '@/lib/search';

export const auditSearchSchema = z.object({
  actor: optionalString,
  action: optionalString,
  target: optionalString,
  entry: optionalString,
  ...pageSearch,
});
export type AuditSearch = z.infer<typeof auditSearchSchema>;
