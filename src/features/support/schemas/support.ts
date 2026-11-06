import { z } from 'zod';
import { optionalString, pageSearch } from '@/lib/search';
import { TICKET_PRIORITIES, TICKET_STATUSES } from '../api/types';

export const supportSearchSchema = z.object({
  /** Default (absent) = open. */
  status: z
    .enum([...TICKET_STATUSES, 'all'])
    .optional()
    .catch(undefined),
  priority: z.enum(TICKET_PRIORITIES).optional().catch(undefined),
  /** `me`, `unassigned` or a staff id. */
  assignee: optionalString,
  userId: optionalString,
  q: optionalString,
  ...pageSearch,
});
export type SupportSearch = z.infer<typeof supportSearchSchema>;

export const NOTE_MAX = 4000;
export const REPLY_MAX = 8000;

export const composerSchema = (max: number) =>
  z.object({
    text: z.string().trim().min(1, 'Write something first.').max(max, `At most ${max} characters.`),
  });
export type ComposerValues = { text: string };
