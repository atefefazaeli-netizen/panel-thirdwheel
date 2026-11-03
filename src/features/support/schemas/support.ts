import { z } from 'zod';
import { optionalString, pageSearch } from '@/lib/search';

export const supportSearchSchema = z.object({
  status: z.enum(['open', 'closed', 'all']).optional().catch(undefined),
  ticket: optionalString,
  ...pageSearch,
});
export type SupportSearch = z.infer<typeof supportSearchSchema>;
