import { z } from 'zod';

export const emailSchema = z.object({
  email: z.string().trim().toLowerCase().min(1, 'Enter your email.').max(254).pipe(z.email('Enter a valid email.')),
});
export type EmailValues = z.input<typeof emailSchema>;

export const codeSchema = z.object({
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/, 'The code is 6 digits.'),
});
export type CodeValues = z.infer<typeof codeSchema>;

/** Copy for the verify failures (backend VerifyResultDto). */
export function codeFailureMessage(code: string, attempts = 0): string {
  switch (code) {
    case 'CODE_INCORRECT': {
      const left = Math.max(0, 3 - attempts);
      return left > 0
        ? `That code is not right. ${left} ${left === 1 ? 'try' : 'tries'} left.`
        : 'That code is not right.';
    }
    case 'CODE_LOCKED':
      return 'Three wrong codes. Get a new code below.';
    case 'CODE_EXPIRED':
      return 'This code expired. Get a new one below.';
    case 'SESSION_NOT_FOUND':
      return 'This sign-in expired. Start again with your email.';
    default:
      return 'Could not check the code.';
  }
}

/** First sign-in (API v1.6.0+): the birthday step. The API decides 18+; this only checks the shape. */
export const birthdaySchema = z.object({
  birthday: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Enter your birthday.')
    .refine((v) => !Number.isNaN(Date.parse(`${v}T00:00:00Z`)), 'Enter a real date.'),
});
export type BirthdayValues = z.infer<typeof birthdaySchema>;

/** Copy for the signup/complete refusals. */
export function birthdayFailureMessage(code: string | null): string {
  switch (code) {
    case 'UNDER_18':
      return 'Thirdwheel accounts are for adults 18 and over. Nothing was saved.';
    case 'BIRTHDAY_IN_FUTURE':
      return 'That date is in the future.';
    case 'BIRTHDAY_INVALID':
      return 'Enter a real date.';
    case 'SIGNUP_TICKET_INVALID':
      return 'This sign-in timed out. Start again with your email.';
    default:
      return 'Could not finish signing in.';
  }
}
