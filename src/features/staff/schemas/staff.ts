import { z } from 'zod';
import { optionalString, pageSearch } from '@/lib/search';
import { customRoleProblems, ROLE_KEY_RE, USERNAME_RE } from '@/lib/permissions';

export const staffSearchSchema = z.object({
  q: optionalString,
  /** The open account (drawer). */
  id: optionalString,
  ...pageSearch,
});
export type StaffSearch = z.infer<typeof staffSearchSchema>;

export const createStaffSchema = z.object({
  username: z
    .string()
    .trim()
    .toLowerCase()
    .regex(USERNAME_RE, '3 to 40 characters: a to z, 0 to 9, dot, dash or underscore.'),
  displayName: z.string().trim().min(1, 'Enter a name.').max(80, 'At most 80 characters.'),
  roles: z.array(z.string()).min(1, 'Choose at least one role.'),
});
export type CreateStaffValues = z.infer<typeof createStaffSchema>;

export const editStaffSchema = z.object({
  displayName: z.string().trim().min(1, 'Enter a name.').max(80, 'At most 80 characters.'),
  roles: z.array(z.string()).min(1, 'Choose at least one role.'),
});
export type EditStaffValues = z.infer<typeof editStaffSchema>;

/** A custom role (STAFF_API.md §3): key rule, and only catalog permissions that are not owner-only. */
export const roleSchema = z
  .object({
    key: z.string().trim().regex(ROLE_KEY_RE, 'Start with a letter; 3 to 40 of a to z, 0 to 9 and underscore.'),
    name: z.string().trim().min(1, 'Enter a name.').max(60, 'At most 60 characters.'),
    description: z.string().trim().max(300, 'At most 300 characters.'),
    permissions: z.array(z.string()),
  })
  .superRefine((v, ctx) => {
    for (const p of customRoleProblems(v.permissions))
      ctx.addIssue({ code: 'custom', path: ['permissions'], message: p });
  });
export type RoleValues = z.infer<typeof roleSchema>;
