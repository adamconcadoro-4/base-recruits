import { describe, expect, it } from 'vitest';

import { addableSeasons, currentSeason, parseAddSchool } from '@/lib/registry/add-school';

const OCT_2026 = new Date('2026-10-25T12:00:00Z');

const VALID: Record<string, string> = {
  unitid: '197036',
  name: 'United States Military Academy',
  city: 'West Point',
  state: 'NY',
  websiteUrl: 'https://www.westpoint.edu/',
  control: 'public',
  level: 'four_year',
  season: '2026-27',
  division: 'ncaa|ncaa_d1',
  conference: 'Patriot League',
  athleticsUrl: 'https://goarmywestpoint.com/sports/baseball',
  verification: 'official_athletics_site',
  evidenceUrl: 'https://goarmywestpoint.com/sports/baseball/schedule',
  note: '2027 schedule and Patriot League play on the official athletics site',
};

function parse(overrides: Record<string, string> = {}) {
  const values = { ...VALID, ...overrides };
  return parseAddSchool((name) => values[name] ?? '', OCT_2026);
}

describe('adding a school the federal report leaves out', () => {
  it('offers the season just finished, the one under way and the next one, turning over on July 1', () => {
    expect(addableSeasons(OCT_2026)).toEqual(['2025-26', '2026-27', '2027-28']);
    expect(currentSeason(OCT_2026)).toBe('2026-27');
    expect(addableSeasons(new Date('2027-03-01T00:00:00Z'))).toEqual(['2025-26', '2026-27', '2027-28']);
    expect(addableSeasons(new Date('2027-07-01T00:00:00Z'))).toEqual(['2026-27', '2027-28', '2028-29']);
    expect(addableSeasons(new Date('2099-08-01T00:00:00Z'))).toEqual(['2098-99', '2099-00', '2100-01']);
  });

  it('accepts the season just finished for a team whose next roster is not posted yet', () => {
    expect(parse({ season: '2025-26' }).ok).toBe(true);
  });

  it('accepts a complete, sourced addition', () => {
    const result = parse();
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toMatchObject({ unitid: 197036, state: 'NY', association: 'ncaa', division: 'ncaa_d1', season: '2026-27' });
    }
  });

  it('treats blank optional fields as empty', () => {
    const result = parse({ conference: '', athleticsUrl: '' });
    expect(result.ok && result.value.conference === null && result.value.athleticsUrl === null).toBe(true);
  });

  it.each([
    ['unitid', { unitid: '19703' }],
    ['unitid', { unitid: '1970361' }],
    ['unitid', { unitid: 'abc123' }],
    ['state', { state: 'New York' }],
    ['websiteUrl', { websiteUrl: 'http://www.westpoint.edu/' }],
    ['control', { control: 'military' }],
    ['season', { season: '2024-25' }],
    ['division', { division: 'ncaa|varsity' }],
    ['verification', { verification: 'federal_report' }],
    ['evidenceUrl', { evidenceUrl: '' }],
    ['evidenceUrl', { evidenceUrl: 'https://goarmywestpoint.com@evil.example/x' }],
    ['athleticsUrl', { athleticsUrl: 'javascript:alert(1)' }],
    ['conference', { conference: 'X' }],
    ['note', { note: 'ok' }],
  ])('refuses a bad %s', (fieldName, overrides) => {
    const result = parse(overrides);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(Object.keys(result.errors)).toContain(fieldName);
  });
});
