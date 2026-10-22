/**
 * Error codes raised by Base Recruits database functions (see the foundation
 * migration) and the plain-language messages the app shows for them.
 * PostgREST returns the SQLSTATE in the `code` field of its error body.
 */

export const DATABASE_ERROR_CODES = {
  BR001: 'not_signed_in',
  BR002: 'not_allowed',
  BR003: 'invalid_input',
  BR004: 'invalid_state',
  BR005: 'rate_limited',
  BR013: 'under_minimum_age',
  BR020: 'free_access_invariant',
  '42501': 'permission_denied',
} as const;

export type DatabaseErrorCode = keyof typeof DATABASE_ERROR_CODES;
export type AppErrorKind = (typeof DATABASE_ERROR_CODES)[DatabaseErrorCode] | 'unexpected';

export function classifyDatabaseError(code: string | null | undefined): AppErrorKind {
  if (code && Object.prototype.hasOwnProperty.call(DATABASE_ERROR_CODES, code)) {
    return DATABASE_ERROR_CODES[code as DatabaseErrorCode];
  }
  return 'unexpected';
}

const GENERIC_MESSAGES: Readonly<Record<AppErrorKind, string>> = {
  not_signed_in: 'Please sign in to continue.',
  not_allowed: "Your account can't do that.",
  invalid_input: 'Please check the information you entered.',
  invalid_state: "That change isn't available right now.",
  rate_limited: 'Too many attempts. Please wait a while and try again.',
  under_minimum_age: 'Base Recruits accounts are for people 13 and older.',
  free_access_invariant: 'That change would put a free feature behind a paywall, which Base Recruits never does.',
  permission_denied: "Your account can't do that.",
  unexpected: 'Something went wrong. Please try again.',
};

/**
 * Database messages for BR003/BR004 are written for end users and are safe to
 * show. Anything else gets a generic message so internals never leak.
 */
export function userMessageForDatabaseError(error: { code?: string | null; message?: string | null }): string {
  const kind = classifyDatabaseError(error.code);
  if ((kind === 'invalid_input' || kind === 'invalid_state') && error.message) {
    const message = error.message.trim();
    return message.charAt(0).toUpperCase() + message.slice(1) + (/[.!?]$/.test(message) ? '' : '.');
  }
  return GENERIC_MESSAGES[kind];
}
