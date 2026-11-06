import { z } from 'zod';
import { pageSearch } from '@/lib/search';

export const appConfigSearchSchema = z.object({ page: pageSearch.page });
export type AppConfigSearch = z.infer<typeof appConfigSearchSchema>;
