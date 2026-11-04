import { z } from 'zod';
import { optionalEnum, optionalString, pageSearch } from '@/lib/search';

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .optional()
  .catch(undefined);

export const safetySearchSchema = z.object({
  status: optionalEnum(['open', 'reviewed', 'escalated']),
  level: optionalEnum(['high', 'medium', 'low']),
  kind: optionalEnum(['crisis', 'safety', 'heat']),
  /** Sent to the API (GET admin/safety/flags?surface=), so it filters every page. */
  surface: optionalEnum(['third-ear', 'third-ear-server', 'quiz', 'answer', 'other']),
  userId: optionalString,
  from: isoDate,
  to: isoDate,
  flag: optionalString,
  ...pageSearch,
});
export type SafetySearch = z.infer<typeof safetySearchSchema>;

export const noteSchema = z.object({
  text: z.string().trim().min(1, 'Write a note.').max(2000, 'At most 2000 characters.'),
});
export const reviewSchema = z.object({ note: z.string().trim().max(2000, 'At most 2000 characters.') });
export const escalateSchema = z.object({ note: z.string().trim().max(500, 'At most 500 characters.') });
