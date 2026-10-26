import { describe, expect, it } from 'vitest';

import { formatRetrieved } from '@/lib/registry/labels';
import { formatDate } from '@/lib/family/family';
import { displayTimeZone, parseStoredDate } from '@/lib/time';

describe('dates shown in Eastern time', () => {
  it('shows a late-evening check on the Eastern calendar day, not the next UTC day', () => {
    // 11:07 PM EDT on Oct 25 is 03:07 UTC on Oct 26.
    expect(formatRetrieved('2026-10-26T03:07:45.856015+00:00')).toBe('Oct 25, 2026');
    expect(formatDate('2026-10-26T03:07:45Z')).toBe('Oct 25, 2026');
  });

  it('handles standard time after the November clock change', () => {
    // 11:30 PM EST on Dec 1 is 04:30 UTC on Dec 2.
    expect(formatRetrieved('2026-12-02T04:30:00Z')).toBe('Dec 1, 2026');
  });

  it('keeps plain calendar dates on the day written', () => {
    expect(displayTimeZone('2026-10-25')).toBe('UTC');
    expect(parseStoredDate('2026-10-25').toISOString()).toBe('2026-10-25T00:00:00.000Z');
    expect(formatRetrieved('2026-10-25')).toBe('Oct 25, 2026');
    expect(formatDate('2027-01-01')).toBe('Jan 1, 2027');
  });

  it('still reports missing or unreadable dates plainly', () => {
    expect(formatRetrieved(null)).toBe('unknown date');
    expect(formatRetrieved('not a date')).toBe('unknown date');
  });
});
