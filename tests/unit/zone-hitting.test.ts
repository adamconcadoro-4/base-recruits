import { describe, expect, it } from 'vitest';

import { ZONE_CONTENT, drillsForZone, zoneDefinition } from '@/lib/assessment/zones/content';
import { allZonesDrawn, laneField, laneLabel, outsideSide, screenColumn, zoneAt, zoneGrid, zonePosition } from '@/lib/assessment/zones/geometry';
import { metricText, pitchOutcomes, summarizeZoneEvents } from '@/lib/assessment/zones/metrics';
import { MIN_ZONE_SAMPLE, zonePrompts } from '@/lib/assessment/zones/suggestions';
import { classOf, type ZoneAssignment, type ZoneEvent } from '@/lib/assessment/zones/types';

const FREE: ZoneAssignment = { kind: 'free', swingZones: [], recognitionRequired: false };
let seq = 0;

function ev(overrides: Partial<ZoneEvent> = {}): ZoneEvent {
  seq += 1;
  return {
    id: `e${seq}`,
    seq,
    kind: 'pitch',
    assignment: FREE,
    battingSide: 'right',
    intendedZone: null,
    location: 'z5',
    pitchClass: null,
    response: 'take',
    contact: null,
    hardTargeted: null,
    depthCorrect: null,
    laneCorrect: null,
    postureError: null,
    recognitionCall: null,
    offPlan: false,
    forcedTake: false,
    voided: false,
    ...overrides,
  };
}

describe('workbook content', () => {
  it('holds the verified counts and keeps every source row', () => {
    expect(ZONE_CONTENT.source.sheets).toHaveLength(15);
    expect(ZONE_CONTENT.zones).toHaveLength(9);
    expect(ZONE_CONTENT.drills).toHaveLength(39);
    expect(ZONE_CONTENT.stages).toHaveLength(9);
    expect(ZONE_CONTENT.pairings).toHaveLength(5);
    expect(ZONE_CONTENT.constraints).toHaveLength(49);
    for (const drill of ZONE_CONTENT.drills) {
      expect(drill.sourceSheet).toBe('Zone Drill Library');
      expect(drill.sourceRow).toBeGreaterThan(1);
      expect(drill.key).toBe(drill.sourceId.toLowerCase());
    }
    expect(new Set(ZONE_CONTENT.drills.map((drill) => drill.key)).size).toBe(39);
    expect(new Set(ZONE_CONTENT.constraints.map((item) => item.key)).size).toBe(49);
  });

  it('gives every zone its own drills and keeps the stage order', () => {
    for (const zone of [1, 2, 3, 4, 5, 6, 7, 8, 9] as const) expect(drillsForZone(zone).length).toBeGreaterThanOrEqual(3);
    expect(ZONE_CONTENT.stages.map((stage) => stage.name)).toEqual([
      'Static tee map',
      'Announced moving ball',
      'Announced alternating locations',
      'Mixed strikes',
      'Decision rounds',
      'Variable timing',
      'Controlled BP',
      'Live BP with constraints',
      'Game-transfer BP',
    ]);
  });
});

describe('zones and handedness', () => {
  it('maps all nine hitter-relative zones', () => {
    const expected = [
      [1, 'high', 'inside'],
      [2, 'high', 'middle'],
      [3, 'high', 'outside'],
      [4, 'middle', 'inside'],
      [5, 'middle', 'middle'],
      [6, 'middle', 'outside'],
      [7, 'low', 'inside'],
      [8, 'low', 'middle'],
      [9, 'low', 'outside'],
    ] as const;
    for (const [zone, row, column] of expected) {
      expect(zonePosition(zone)).toEqual({ row, column });
      expect(zoneAt(row, column)).toBe(zone);
      expect(zoneDefinition(zone).location.toLowerCase()).toBe(`${row} ${column}`);
    }
  });

  it('mirrors the drawing for a left-handed hitter without changing zone ids', () => {
    expect(zoneGrid('right')).toEqual([
      [1, 2, 3],
      [4, 5, 6],
      [7, 8, 9],
    ]);
    expect(zoneGrid('left')).toEqual([
      [3, 2, 1],
      [6, 5, 4],
      [9, 8, 7],
    ]);
    expect(allZonesDrawn('right') && allZonesDrawn('left')).toBe(true);
    expect(screenColumn('inside', 'right')).toBe(0);
    expect(screenColumn('inside', 'left')).toBe(2);
    expect(outsideSide('out_in', 'right')).toBe('left');
    expect(outsideSide('out_in', 'left')).toBe('right');
    expect(outsideSide('out_away', 'left')).toBe('left');
  });

  it('points pull and opposite-field lanes to the right field for each side', () => {
    expect(laneField('Pull-side gap', 'right')).toBe('left-center');
    expect(laneField('Pull-side gap', 'left')).toBe('right-center');
    expect(laneField('Low opposite-field gap', 'right')).toBe('right-center');
    expect(laneField('Low opposite-field gap', 'left')).toBe('left-center');
    expect(laneLabel('Center field', 'left')).toBe('Center field');
    expect(laneLabel('Opposite-field gap', 'left')).toBe('Opposite-field gap (left-center)');
  });

  it('counts a switch hitter by hitter-relative zone whichever side they bat from', () => {
    const summary = summarizeZoneEvents([
      ev({ location: 'z4', response: 'swing', contact: 'fair', battingSide: 'right' }),
      ev({ location: 'z4', response: 'swing', contact: 'miss', battingSide: 'left' }),
    ]);
    const zone4 = summary.byZone.find((item) => item.zone === 4);
    expect(zone4?.pitch.strike_contact.denominator).toBe(2);
    expect(zone4?.pitch.strike_contact.numerator).toBe(1);
  });

  it('classifies balls and strikes from the actual location, keeping an explicit call only when the location is unknown', () => {
    expect(classOf('z9', null)).toBe('strike');
    expect(classOf('out_low', null)).toBe('ball');
    expect(classOf('unknown', null)).toBeNull();
    expect(classOf('unknown', 'ball')).toBe('ball');
  });
});

describe('calculator', () => {
  it('returns N/A, not 0%, when nothing is eligible', () => {
    const summary = summarizeZoneEvents([]);
    for (const result of Object.values(summary.pitch)) {
      expect(result.value).toBeNull();
      expect(result.denominator).toBe(0);
    }
    expect(metricText(summary.pitch.chase)).toBe('N/A (0 eligible)');
    // Only strikes seen: chase has no balls to judge.
    expect(summarizeZoneEvents([ev({ location: 'z5', response: 'swing', contact: 'fair' })]).pitch.chase.value).toBeNull();
  });

  it('keeps a missing observation apart from a real zero', () => {
    const missing = summarizeZoneEvents([ev({ response: 'swing', contact: 'fair', depthCorrect: null })]);
    expect(missing.pitch.depth.value).toBeNull();
    expect(missing.pitch.depth.missing).toBe(1);
    const zero = summarizeZoneEvents([ev({ response: 'swing', contact: 'fair', depthCorrect: false })]);
    expect(zero.pitch.depth.value).toBe(0);
    expect(zero.pitch.depth.missing).toBe(0);
  });

  it('counts a foul as contact but not as a fair ball in play', () => {
    const summary = summarizeZoneEvents([
      ev({ response: 'swing', contact: 'foul', laneCorrect: null }),
      ev({ response: 'swing', contact: 'fair', laneCorrect: true }),
      ev({ response: 'swing', contact: 'miss' }),
    ]);
    expect(summary.pitch.strike_contact).toMatchObject({ numerator: 2, denominator: 3 });
    expect(summary.pitch.lane).toMatchObject({ numerator: 1, denominator: 1, missing: 0 });
    expect(summary.pitch.hard_targeted).toMatchObject({ numerator: 0, denominator: 2, missing: 1 });
  });

  it('separates an assignment error on a strike from a chase', () => {
    const selective: ZoneAssignment = { kind: 'selective', swingZones: [4, 5, 6], recognitionRequired: false };
    const summary = summarizeZoneEvents([
      ev({ assignment: selective, location: 'z1', response: 'swing', contact: 'foul' }), // unassigned strike swung at
      ev({ assignment: selective, location: 'out_high', response: 'swing', contact: 'miss' }), // chase
      ev({ assignment: selective, location: 'z5', response: 'swing', contact: 'fair' }), // correct
    ]);
    expect(summary.pitch.decision).toMatchObject({ numerator: 1, denominator: 3 });
    expect(summary.pitch.chase).toMatchObject({ numerator: 1, denominator: 1 });
  });

  it('scores a take on an unassigned strike as correct under a selective assignment', () => {
    const selective: ZoneAssignment = { kind: 'selective', swingZones: [4, 5, 6], recognitionRequired: false };
    const outcomes = pitchOutcomes(ev({ assignment: selective, location: 'z2', response: 'take' }));
    expect(outcomes.decision).toEqual({ kind: 'scored', hit: true });
    // Under a free assignment the same take is a missed strike.
    expect(pitchOutcomes(ev({ location: 'z2', response: 'take' })).decision).toEqual({ kind: 'scored', hit: false });
  });

  it('leaves forced rounds and forced takes out of decisions and chase, so they cannot flatter free-decision results', () => {
    const forced: ZoneAssignment = { kind: 'forced_take', swingZones: [], recognitionRequired: false };
    const mandatory: ZoneAssignment = { kind: 'mandatory_swing', swingZones: [], recognitionRequired: false };
    const summary = summarizeZoneEvents([
      ev({ assignment: forced, location: 'out_low', response: 'take' }),
      ev({ assignment: forced, location: 'out_away', response: 'take' }),
      ev({ assignment: mandatory, location: 'z5', response: 'swing', contact: 'fair' }),
      ev({ location: 'out_low', response: 'take', forcedTake: true }),
      ev({ location: 'out_low', response: 'swing', contact: 'miss' }),
    ]);
    expect(summary.pitch.decision).toMatchObject({ numerator: 0, denominator: 1 });
    expect(summary.pitch.chase).toMatchObject({ numerator: 1, denominator: 1, value: 100 });
    const reasons = summary.pitch.chase.excluded.map((item) => item.reason);
    expect(reasons).toContain('Forced-take round (no decision)');
    expect(reasons).toContain('Forced take');
  });

  it('never infers recognition from swinging or taking', () => {
    const optional = summarizeZoneEvents([ev({ location: 'out_low', response: 'take' })]);
    expect(optional.pitch.recognition).toMatchObject({ value: null, denominator: 0, missing: 0 });
    const required: ZoneAssignment = { kind: 'free', swingZones: [], recognitionRequired: true };
    const summary = summarizeZoneEvents([
      ev({ assignment: required, location: 'out_low', response: 'take' }),
      ev({ assignment: required, location: 'z5', response: 'take', recognitionCall: 'strike' }),
    ]);
    expect(summary.pitch.recognition).toMatchObject({ numerator: 1, denominator: 1, missing: 1 });
  });

  it('keeps off-plan pitches visible and judges decisions on the actual pitch', () => {
    const summary = summarizeZoneEvents([
      ev({ intendedZone: 9, location: 'z1', offPlan: true, response: 'swing', contact: 'fair', depthCorrect: false, laneCorrect: false }),
      ev({ intendedZone: 9, location: 'z9', response: 'swing', contact: 'fair', depthCorrect: true, laneCorrect: true, hardTargeted: true }),
    ]);
    expect(summary.pitch.decision).toMatchObject({ numerator: 2, denominator: 2 });
    expect(summary.pitch.strike_contact).toMatchObject({ numerator: 2, denominator: 2 });
    expect(summary.pitch.depth).toMatchObject({ numerator: 1, denominator: 1 });
    expect(summary.pitch.depth.excluded).toEqual([{ reason: 'Off-plan delivery', count: 1 }]);
    expect(summary.pitch.off_plan).toMatchObject({ numerator: 1, denominator: 2 });
    expect(summary.counts).toMatchObject({ planned: 2, onTarget: 1, offPlan: 1 });
  });

  it('divides posture errors by swings scored for posture and reports the rest as missing', () => {
    const summary = summarizeZoneEvents([
      ev({ response: 'swing', contact: 'fair', postureError: true }),
      ev({ response: 'swing', contact: 'fair', postureError: false }),
      ev({ response: 'swing', contact: 'fair', postureError: null }),
      ev({ response: 'swing', contact: 'fair', postureError: null }),
    ]);
    expect(summary.pitch.posture_per10).toMatchObject({ numerator: 1, denominator: 2, missing: 2, value: 5 });
  });

  it('combines sessions from counts, not by averaging percentages', () => {
    const first = [ev({ response: 'swing', contact: 'fair' })];
    const second = [
      ev({ response: 'swing', contact: 'fair' }),
      ...Array.from({ length: 9 }, () => ev({ response: 'swing', contact: 'miss' })),
    ];
    expect(summarizeZoneEvents(first).pitch.strike_contact.value).toBe(100);
    expect(summarizeZoneEvents(second).pitch.strike_contact.value).toBe(10);
    expect(summarizeZoneEvents([...first, ...second]).pitch.strike_contact).toMatchObject({ numerator: 2, denominator: 11, value: 18.2 });
  });

  it('never counts tee swings or dry reps as pitches or decisions', () => {
    const summary = summarizeZoneEvents([
      ev({ kind: 'tee_swing', location: 'z9', response: 'swing', contact: 'fair', depthCorrect: true }),
      ev({ kind: 'tee_swing', location: 'z9', response: 'swing', contact: 'miss' }),
      ev({ kind: 'dry_rep', location: 'z9', response: null, postureError: false }),
    ]);
    expect(summary.counts).toMatchObject({ pitches: 0, teeSwings: 2, dryReps: 1, swings: 0 });
    expect(summary.pitch.decision.denominator).toBe(0);
    expect(summary.pitch.chase.denominator).toBe(0);
    expect(summary.reps.contact).toMatchObject({ numerator: 1, denominator: 2 });
    expect(summary.reps.depth).toMatchObject({ numerator: 1, denominator: 1 });
    expect(summary.reps.posture_per10).toMatchObject({ denominator: 1, missing: 2 });
    expect(summary.byZone.find((item) => item.zone === 9)?.tee.contact.denominator).toBe(2);
  });

  it('leaves voided events out of every measure but keeps them counted as voided', () => {
    const summary = summarizeZoneEvents([ev({ location: 'out_low', response: 'swing', voided: true })]);
    expect(summary.counts).toMatchObject({ pitches: 0, voided: 1 });
    expect(summary.pitch.chase.excluded).toEqual([{ reason: 'Voided', count: 1 }]);
  });
});

describe('review prompts', () => {
  it('names a zone only from repeated evidence and suggests one stage lower when far below', () => {
    const few = Array.from({ length: MIN_ZONE_SAMPLE - 1 }, () => ev({ location: 'z9', response: 'swing', contact: 'fair', depthCorrect: false }));
    expect(zonePrompts(summarizeZoneEvents(few), () => 4, 9)).toHaveLength(0);
    const enough = [...few, ev({ location: 'z9', response: 'swing', contact: 'fair', depthCorrect: false })];
    const prompts = zonePrompts(summarizeZoneEvents(enough), () => 4, 9);
    expect(prompts[0]).toMatchObject({ zone: 9, sample: MIN_ZONE_SAMPLE, suggestedStage: 3 });
    expect(prompts[0]?.drill?.zone).toBe(9);
    expect(prompts[0]?.finding).toContain('0 of 8');
  });
});
