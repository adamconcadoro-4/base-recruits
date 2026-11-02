import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { POWER4_CONFERENCES, POWER4_CONFERENCE_NAMES, POWER4_MEMBERS, POWER4_SOURCES, isPower4, power4Conference } from '@/lib/matching/power4';
import { power4Note } from '@/lib/matching/suggestions-explain';

/**
 * Power 4 membership (F50), as each conference's site listed its baseball
 * teams when checked (docs/benchmark-sources.md section D).
 */

describe('Power 4 membership', () => {
  it('lists each conference’s baseball teams as published', () => {
    const count = (c: string) => POWER4_MEMBERS.filter((m) => m.conference === c).length;
    expect(POWER4_CONFERENCES.map(count)).toEqual([16, 17, 14, 16]);
    expect(new Set(POWER4_MEMBERS.map((m) => m.unitid)).size).toBe(POWER4_MEMBERS.length);
  });

  it('names a source page for every conference', () => {
    for (const c of POWER4_CONFERENCES) {
      expect(POWER4_SOURCES[c].url).toMatch(/^https:\/\//);
      expect(POWER4_CONFERENCE_NAMES[c]).toBeTruthy();
    }
  });

  it('matches by federal unit ID', () => {
    expect(power4Conference(243744)).toBe('acc'); // Stanford University
    expect(power4Conference(228723)).toBe('sec'); // Texas A&M University-College Station
    expect(isPower4(228705)).toBe(false); // Texas A&M University-Kingsville
    expect(power4Conference(0)).toBeNull();
  });

  it('every member is a Division I baseball program in the bundled school data', async () => {
    const file = JSON.parse(await readFile(path.join(process.cwd(), 'data', 'snapshots', 'registry-2024-25.json'), 'utf8')) as {
      records: { unitid: number; facts: { name: string }; baseball: { division: string } | null }[];
    };
    const byId = new Map(file.records.map((r) => [r.unitid, r]));
    for (const member of POWER4_MEMBERS) {
      const record = byId.get(member.unitid);
      expect(record?.facts.name).toBe(member.name);
      expect(record?.baseball?.division).toBe('ncaa_d1');
    }
  });

  it('explains the comparison without promising anything', () => {
    const note = power4Note('SEC');
    expect(note).toContain('SEC');
    expect(note).not.toMatch(/\b(guarantee[sd]?|will get in|scholarship offer|will be recruited)\b/i);
  });
});
