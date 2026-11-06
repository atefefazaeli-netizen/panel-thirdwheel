import { z } from 'zod';

export const credentialsSchema = z.object({
  username: z
    .string()
    .trim()
    .toLowerCase()
    .min(1, 'Enter your username.')
    .max(40, 'Usernames are at most 40 characters.'),
  password: z.string().min(1, 'Enter your password.').max(128, 'Passwords are at most 128 characters.'),
});
export type CredentialsValues = z.infer<typeof credentialsSchema>;

/** A TOTP code from an authenticator app (RFC 6238, 6 digits). Spaces are ignored. */
export const totpCode = z
  .string()
  .transform((v) => v.replace(/\s+/g, ''))
  .pipe(z.string().regex(/^\d{6}$/, 'The code is 6 digits from your authenticator app.'));

export const totpSchema = z.object({ code: totpCode });
export type TotpValues = z.input<typeof totpSchema>;

export const recoverySchema = z.object({
  recoveryCode: z.string().trim().min(1, 'Enter one of your recovery codes.').max(64, 'That is not a recovery code.'),
});
export type RecoveryValues = z.infer<typeof recoverySchema>;

export const PASSWORD_MIN = 12;
export const PASSWORD_MAX = 128;

/**
 * The server's password policy (STAFF_API.md §2): 12 to 128 characters, not containing the
 * username. The server also refuses common passwords (400 WEAK_PASSWORD with `details`).
 */
export function newPasswordSchema(username: string, needCurrent: boolean) {
  return z
    .object({
      currentPassword: needCurrent ? z.string().min(1, 'Enter your current password.') : z.string(),
      newPassword: z
        .string()
        .min(PASSWORD_MIN, `At least ${PASSWORD_MIN} characters.`)
        .max(PASSWORD_MAX, `At most ${PASSWORD_MAX} characters.`)
        .refine(
          (v) => !username || !v.toLowerCase().includes(username.toLowerCase()),
          'It cannot contain your username.',
        ),
      confirm: z.string(),
    })
    .refine((v) => v.newPassword === v.confirm, { path: ['confirm'], message: 'The two passwords do not match.' });
}
export type NewPasswordValues = { currentPassword: string; newPassword: string; confirm: string };

export const passwordOnlySchema = z.object({ password: z.string().min(1, 'Enter your password.') });
export type PasswordOnlyValues = z.infer<typeof passwordOnlySchema>;

export const disableMfaSchema = z.object({ password: z.string().min(1, 'Enter your password.'), code: totpCode });
export type DisableMfaValues = z.input<typeof disableMfaSchema>;

/** WEAK_PASSWORD `details` as lines. */
export function weakPasswordDetails(details: unknown): string[] {
  if (Array.isArray(details)) return details.filter((d): d is string => typeof d === 'string');
  if (typeof details === 'string') return [details];
  return [];
}
