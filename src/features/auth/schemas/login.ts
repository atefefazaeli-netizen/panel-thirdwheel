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
