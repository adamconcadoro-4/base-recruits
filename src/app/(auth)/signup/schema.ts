import { z } from 'zod';

import { SELF_SELECTABLE_ROLES } from '@/lib/auth/roles';
import type { ActionState } from '@/lib/forms/action-state';

export const MINIMUM_PASSWORD_LENGTH = 10;

export const dateOfBirthSchema = z.object({
  month: z.string().regex(/^(0?[1-9]|1[0-2])$/, 'Choose a month.'),
  day: z.string().regex(/^(0?[1-9]|[12][0-9]|3[01])$/, 'Enter a day between 1 and 31.'),
  year: z.string().regex(/^\d{4}$/, 'Enter a four-digit year.'),
});

export const accountSchema = z.object({
  accountType: z.enum(SELF_SELECTABLE_ROLES, { error: 'Choose who this account is for.' }),
  displayName: z.string().trim().min(1, 'Enter your name.').max(80, 'Use 80 characters or fewer.'),
  email: z.string().trim().max(254, 'Use 254 characters or fewer.').email('Enter a valid email address.'),
});

export const emailSchema = z.string().trim().max(254, 'Use 254 characters or fewer.').email('Enter a valid email address.');

/** Supabase Auth limits passwords to 72 bytes (bcrypt); accented letters and emoji use more than one. */
export const MAXIMUM_PASSWORD_BYTES = 72;

/** A sign-in code on its own (logging in with a code). */
export const codeOnlySchema = z.object({
  code: z.string().regex(/^\d{6}$/, 'Enter the 6-digit code from the email.'),
});

export const verificationSchema = z.object({
  code: z.string().regex(/^\d{6}$/, 'Enter the 6-digit code from the email.'),
  password: z
    .string()
    .min(MINIMUM_PASSWORD_LENGTH, `Use at least ${MINIMUM_PASSWORD_LENGTH} characters.`)
    .refine((value) => new TextEncoder().encode(value).length <= MAXIMUM_PASSWORD_BYTES, 'Use a shorter password.'),
});

/** "2008-03-07" from month/day/year fields. */
export function isoDate(month: string, day: string, year: string): string {
  return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
}

export interface AgeStepState extends ActionState {
  /** Set when the date passed the age screen; the account step may begin. */
  readonly passed?: boolean;
  readonly blocked?: boolean;
  /** Minors cannot create parent or coach accounts. */
  readonly adult?: boolean;
}
