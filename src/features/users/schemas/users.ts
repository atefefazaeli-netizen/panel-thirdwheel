import { z } from 'zod';
import { optionalBool, optionalEnum, optionalString, pageSearch } from '@/lib/search';

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .optional()
  .catch(undefined);

export const usersSearchSchema = z.object({
  q: optionalString,
  plan: optionalEnum(['free', 'plus', 'paid_by_partner', 'cancelled', 'payment_problem']),
  linked: optionalBool,
  suspended: optionalBool,
  tag: optionalString,
  from: isoDate,
  to: isoDate,
  ...pageSearch,
});
export type UsersSearch = z.infer<typeof usersSearchSchema>;

export const TAG_RE = /^[a-z0-9-]{1,32}$/;

export const suspendSchema = z.object({
  reason: z.string().trim().min(1, 'Give a reason.').max(300, 'At most 300 characters.'),
});

export const tagsSchema = z.object({
  tags: z
    .array(z.string().regex(TAG_RE, 'Tags use a to z, 0 to 9 and dashes, up to 32 characters.'))
    .max(20, 'At most 20 tags.')
    .refine((t) => new Set(t).size === t.length, 'Each tag once.'),
});

export const addTagSchema = z.object({
  tag: z.string().trim().toLowerCase().regex(TAG_RE, 'Tags use a to z, 0 to 9 and dashes, up to 32 characters.'),
});

export const grantSchema = z.object({
  days: z
    .number({ error: 'Enter a number of days.' })
    .int('Whole days.')
    .min(1, 'At least 1 day.')
    .max(365, 'At most 365 days.'),
  note: z.string().trim().max(200, 'At most 200 characters.'),
});

/** Lower-case, trim and swap spaces for dashes: "Beta Tester" → "beta-tester". */
export const normalizeTag = (s: string) => s.trim().toLowerCase().replace(/\s+/g, '-');
