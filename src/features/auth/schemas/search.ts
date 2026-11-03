import { z } from 'zod';

export const loginSearchSchema = z.object({
  /** Where to go after sign-in (a path inside the panel). */
  redirect: z
    .string()
    .regex(/^\/(?!\/)/)
    .optional()
    .catch(undefined),
});
