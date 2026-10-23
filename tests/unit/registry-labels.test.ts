import { describe, expect, it } from 'vitest';

import { canonicalJson } from '@/lib/registry/canonical-json';
import { NOT_REPORTED, formatAcademicYear, formatMoney, formatRange, formatRate, linkHost, placeLabel } from '@/lib/registry/labels';

describe('registry labels', () => {
  it('formats rates with a decimal only below 10%', () => {
    expect(formatRate(0.0361)).toBe('3.6%');
    expect(formatRate(0.5795)).toBe('58%');
    expect(formatRate(1)).toBe('100%');
  });

  it('shows missing figures as Not reported, never zero', () => {
    expect(formatRate(null)).toBe(NOT_REPORTED);
    expect(formatMoney(undefined)).toBe(NOT_REPORTED);
    expect(formatRange(420, null)).toBe(NOT_REPORTED);
    expect(formatAcademicYear(null)).toBe(NOT_REPORTED);
  });

  it('formats money, ranges and years', () => {
    expect(formatMoney(92892)).toBe('$92,892');
    expect(formatMoney(0)).toBe('$0');
    expect(formatRange(740, 780)).toBe('740–780');
    expect(formatAcademicYear('2025-26')).toBe('2025–26');
    expect(placeLabel('Stanford', 'CA')).toBe('Stanford, CA');
    expect(placeLabel(null, null)).toBe('Location not reported');
  });

  it('shows the real host of a link', () => {
    expect(linkHost('https://hopkinssports.com/sports/baseball')).toBe('hopkinssports.com');
    expect(linkHost('not a url')).toBeNull();
  });
});

describe('canonical JSON', () => {
  it('matches the pipeline’s Python serialization', () => {
    // Same vector as data/pipeline/tests: sorted keys, compact, ASCII-only.
    expect(canonicalJson([{ unitid: 1, name: 'Café', admissions: { x: 0.5, admission_rate: 1 } }])).toBe(
      '[{"admissions":{"admission_rate":1,"x":0.5},"name":"Caf\\u00e9","unitid":1}]',
    );
  });
});
