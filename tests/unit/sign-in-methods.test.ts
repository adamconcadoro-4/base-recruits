import { describe, expect, it } from 'vitest';

import {
  ADMIN_CHECK_MAX_AGE_SECONDS,
  PASSKEY_SETUP_MAX_AGE_SECONDS,
  adminCheckSatisfied,
  lastPasskeyCheckAt,
  lastSignInAt,
  recentEnoughToAddPasskey,
} from '@/lib/auth/sign-in-methods';

const NOW = 1_793_000_000;

describe('admin passkey check', () => {
  it('uses the same 12 hours as the database (migration 20261102000500)', () => {
    expect(ADMIN_CHECK_MAX_AGE_SECONDS).toBe(12 * 60 * 60);
  });

  it('accepts a passkey check within 12 hours', () => {
    expect(adminCheckSatisfied([{ method: 'passkey', timestamp: NOW }], NOW)).toBe(true);
    expect(adminCheckSatisfied([{ method: 'passkey', timestamp: NOW - ADMIN_CHECK_MAX_AGE_SECONDS }], NOW)).toBe(true);
  });

  it('refuses an expired check, other sign-in methods and malformed records', () => {
    expect(adminCheckSatisfied([{ method: 'passkey', timestamp: NOW - ADMIN_CHECK_MAX_AGE_SECONDS - 1 }], NOW)).toBe(false);
    expect(adminCheckSatisfied([{ method: 'otp', timestamp: NOW }], NOW)).toBe(false);
    expect(adminCheckSatisfied([{ method: 'password', timestamp: NOW }], NOW)).toBe(false);
    expect(adminCheckSatisfied([{ method: 'passkey', timestamp: String(NOW) }], NOW)).toBe(false);
    expect(adminCheckSatisfied(['passkey'], NOW)).toBe(false);
    expect(adminCheckSatisfied({ method: 'passkey', timestamp: NOW }, NOW)).toBe(false);
    expect(adminCheckSatisfied(undefined, NOW)).toBe(false);
  });

  it('refuses a time more than a minute in the future', () => {
    expect(adminCheckSatisfied([{ method: 'passkey', timestamp: NOW + 30 }], NOW)).toBe(true);
    expect(adminCheckSatisfied([{ method: 'passkey', timestamp: NOW + 3600 }], NOW)).toBe(false);
  });

  it('uses the newest passkey entry', () => {
    const amr = [
      { method: 'otp', timestamp: NOW - 86_400 },
      { method: 'passkey', timestamp: NOW - 100_000 },
      { method: 'passkey', timestamp: NOW - 60 },
    ];
    expect(lastPasskeyCheckAt(amr)).toBe(NOW - 60);
    expect(adminCheckSatisfied(amr, NOW)).toBe(true);
  });
});

describe('adding a passkey', () => {
  it('needs a sign-in by any method within 15 minutes', () => {
    expect(PASSKEY_SETUP_MAX_AGE_SECONDS).toBe(15 * 60);
    expect(recentEnoughToAddPasskey([{ method: 'otp', timestamp: NOW - 60 }], NOW)).toBe(true);
    expect(recentEnoughToAddPasskey([{ method: 'password', timestamp: NOW - 16 * 60 }], NOW)).toBe(false);
    expect(recentEnoughToAddPasskey([], NOW)).toBe(false);
    expect(lastSignInAt([{ method: 'password', timestamp: NOW - 900 }, { method: 'passkey', timestamp: NOW - 10 }])).toBe(NOW - 10);
  });
});
