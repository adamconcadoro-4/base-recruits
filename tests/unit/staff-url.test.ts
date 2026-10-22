import { describe, expect, it } from 'vitest';

import { reviewFlags, staffUrlHost, staffUrlProblem } from '@/lib/auth/staff-url';

describe('staff directory links', () => {
  it('accepts ordinary https staff pages', () => {
    expect(staffUrlProblem('https://gostate.edu/sports/baseball/coaches')).toBeNull();
    expect(staffUrlProblem('https://athletics.state.edu/staff?sport=baseball#coaches')).toBeNull();
  });

  it('rejects links that hide the real site or are not https', () => {
    expect(staffUrlProblem('https://gostate.edu@evil.example/staff')).toBe('has_credentials');
    expect(staffUrlProblem('https://user:pass@evil.example/staff')).toBe('has_credentials');
    expect(staffUrlProblem('http://gostate.edu/staff')).toBe('not_https');
    expect(staffUrlProblem('javascript:alert(1)')).toBe('not_https');
    expect(staffUrlProblem('gostate.edu/staff')).toBe('invalid');
    expect(staffUrlProblem('https://localhost/staff')).toBe('no_domain');
  });

  it('shows reviewers the site a link really opens', () => {
    expect(staffUrlHost('https://gostate.edu@evil.example/staff')).toBe('evil.example');
    expect(staffUrlHost('https://státe.edu/staff')).toBe('xn--stte-6na.edu');
  });

  it('flags look-alike hosts and staff pages on a different site from the work email', () => {
    expect(reviewFlags('https://xn--stte-6na.edu/staff', 'state.edu')).toMatchObject({ internationalized: true, domainMismatch: true });
    expect(reviewFlags('https://athletics.state.edu/staff', 'state.edu')).toMatchObject({ internationalized: false, domainMismatch: false });
    expect(reviewFlags('https://gostate.com/staff', 'state.edu').domainMismatch).toBe(true);
  });
});
