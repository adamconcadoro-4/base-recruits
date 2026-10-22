import { describe, expect, it } from 'vitest';

import { CONSENT_SCOPES, CONSENT_SCOPE_KEYS, CONSENT_TEXT_VERSION_PATTERN } from '@/lib/consent/scopes';
import { classifyDatabaseError, userMessageForDatabaseError } from '@/lib/db/errors';

describe('consent scopes', () => {
  it('have a wording version the database accepts', () => {
    for (const scope of CONSENT_SCOPE_KEYS) {
      expect(CONSENT_SCOPES[scope].textVersion).toMatch(CONSENT_TEXT_VERSION_PATTERN);
    }
  });

  it('name a grantee kind exactly when the audience is a specific person', () => {
    for (const scope of CONSENT_SCOPE_KEYS) {
      const rule = CONSENT_SCOPES[scope];
      expect(rule.audience === 'specific_user').toBe(rule.granteeKind !== null);
    }
  });

  it('require guardian approval for every coach-facing permission a minor grants', () => {
    for (const scope of CONSENT_SCOPE_KEYS) {
      if (scope.startsWith('coach_') || scope === 'document_access') {
        expect(CONSENT_SCOPES[scope].requiresGuardianApprovalForMinor).toBe(true);
      }
    }
  });
});

describe('database errors', () => {
  it('maps Base Recruits error codes', () => {
    expect(classifyDatabaseError('BR013')).toBe('under_minimum_age');
    expect(classifyDatabaseError('BR020')).toBe('free_access_invariant');
    expect(classifyDatabaseError('XX000')).toBe('unexpected');
    expect(classifyDatabaseError(undefined)).toBe('unexpected');
  });

  it('shows user-safe database wording only for input and state errors', () => {
    expect(userMessageForDatabaseError({ code: 'BR003', message: 'institution name is required (2–200 characters)' })).toBe(
      'Institution name is required (2–200 characters).',
    );
    expect(userMessageForDatabaseError({ code: 'XX000', message: 'relation "secret_table" does not exist' })).toBe(
      'Something went wrong. Please try again.',
    );
    expect(userMessageForDatabaseError({ code: '42501', message: 'permission denied for table profiles' })).toBe(
      "Your account can't do that.",
    );
  });
});
