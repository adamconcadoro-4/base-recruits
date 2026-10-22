import { describe, expect, it } from 'vitest';

import {
  COACH_REVIEW_DECISIONS,
  COACH_STATUS_TRANSITIONS,
  COACH_VERIFICATION_STATUSES,
  DECISIONS_REQUIRING_NOTE,
  canTransition,
  describeCoachStatus,
  isVerifiedCoach,
  type CoachAccessFacts,
} from '@/lib/auth/coach-verification';

const now = new Date('2026-10-21T12:00:00Z');
const verified: CoachAccessFacts = {
  hasCoachRole: true,
  status: 'verified',
  verifiedUntil: new Date('2027-10-21T12:00:00Z'),
  accountEmailConfirmed: true,
  accountEmailMatchesVerifiedEmail: true,
};

describe('isVerifiedCoach', () => {
  it('requires every condition, not just a confirmed institutional email', () => {
    expect(isVerifiedCoach(verified, now)).toBe(true);
    expect(isVerifiedCoach({ ...verified, status: 'email_verified' }, now)).toBe(false);
    expect(isVerifiedCoach({ ...verified, hasCoachRole: false }, now)).toBe(false);
    expect(isVerifiedCoach({ ...verified, accountEmailConfirmed: false }, now)).toBe(false);
    expect(isVerifiedCoach({ ...verified, accountEmailMatchesVerifiedEmail: false }, now)).toBe(false);
  });

  it('ends exactly at expiry', () => {
    expect(isVerifiedCoach({ ...verified, verifiedUntil: new Date('2026-10-21T12:00:00Z') }, now)).toBe(false);
    expect(isVerifiedCoach({ ...verified, verifiedUntil: null }, now)).toBe(false);
  });

  it('has no input for payment or email domain', () => {
    expect(Object.keys(verified).sort()).toEqual(
      ['accountEmailConfirmed', 'accountEmailMatchesVerifiedEmail', 'hasCoachRole', 'status', 'verifiedUntil'],
    );
  });
});

describe('coach status transitions', () => {
  it('never let a coach or the system grant verified status', () => {
    for (const t of COACH_STATUS_TRANSITIONS) {
      if (t.to === 'verified') expect(t.actor).toBe('admin');
    }
  });

  it('give every non-verified status a path forward or an appeal', () => {
    for (const status of COACH_VERIFICATION_STATUSES) {
      if (status === 'verified' || status === 'affiliation_under_review') continue;
      expect(COACH_STATUS_TRANSITIONS.some((t) => t.from === status)).toBe(true);
    }
  });

  it('only lift a suspension back to a status the coach could hold before it', () => {
    const fromSuspended = COACH_STATUS_TRANSITIONS.filter((t) => t.from === 'suspended' && t.to !== 'revoked').map((t) => t.to);
    const intoSuspended = COACH_STATUS_TRANSITIONS.filter((t) => t.to === 'suspended').map((t) => t.from);
    expect([...fromSuspended].sort()).toEqual([...intoSuspended].sort());
  });

  it('allow only listed changes', () => {
    expect(canTransition('email_verified', 'affiliation_under_review', 'coach')).toBe(true);
    expect(canTransition('email_verified', 'verified', 'admin')).toBe(false);
    expect(canTransition('affiliation_under_review', 'verified', 'coach')).toBe(false);
  });

  it('have no duplicates', () => {
    const keys = COACH_STATUS_TRANSITIONS.map((t) => `${t.from}>${t.to}>${t.actor}`);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe('review decisions', () => {
  it('require a note whenever a coach loses access or must act', () => {
    expect([...DECISIONS_REQUIRING_NOTE].sort()).toEqual(['reject', 'request_info', 'revoke', 'suspend']);
    for (const decision of DECISIONS_REQUIRING_NOTE) {
      expect(COACH_REVIEW_DECISIONS).toContain(decision);
    }
  });
});

describe('describeCoachStatus', () => {
  it('explains every status in plain language', () => {
    for (const status of COACH_VERIFICATION_STATUSES) {
      const description = describeCoachStatus(status);
      expect(description.label.length).toBeGreaterThan(3);
      expect(description.summary.length).toBeGreaterThan(10);
    }
    expect(describeCoachStatus('email_verified').summary).toContain('Email alone does not verify');
  });
});
