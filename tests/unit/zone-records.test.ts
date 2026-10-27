import { describe, expect, it } from 'vitest';

import { emptyEntry, entryProblem, entrySummary, entryToEvent, eventToEntry, tidyEntry } from '@/lib/assessment/zones/entry';
import { csvCell, EXPORT_COLUMNS, sessionCsv } from '@/lib/assessment/zones/export';
import { mapTile, zoneAttempts, zoneResult } from '@/lib/assessment/zones/map';
import { summarizeZoneEvents } from '@/lib/assessment/zones/metrics';
import {
  assignmentText,
  comparableGroups,
  contextEvents,
  currentStages,
  dailyLog,
  proposedStage,
  type ZoneAssignmentRow,
  type ZoneEventRow,
  type ZoneProgressRow,
  type ZoneRoundRow,
  type ZoneSessionRow,
} from '@/lib/assessment/zones/records';
import { MIN_ZONE_SAMPLE } from '@/lib/assessment/zones/suggestions';
import type { ZoneAssignment } from '@/lib/assessment/zones/types';

const FREE: ZoneAssignment = { kind: 'free', swingZones: [], recognitionRequired: false };

let counter = 0;
function row(overrides: Partial<ZoneEventRow> = {}): ZoneEventRow {
  counter += 1;
  return {
    id: `ev-${counter}`,
    round_id: 'r1',
    session_id: 's1',
    seq: counter,
    kind: 'pitch',
    assignment_id: 'a1',
    batting_side: 'right',
    intended_zone: null,
    location: 'z5',
    pitch_class: null,
    pitch_type: null,
    response: 'swing',
    contact: 'fair',
    hard_targeted: null,
    depth_correct: true,
    lane_correct: null,
    posture_error: null,
    recognition_call: null,
    off_plan: false,
    off_plan_reason: null,
    forced_take: false,
    voided: false,
    void_reason: null,
    media_id: null,
    clip_time_ms: null,
    note: null,
    evidence_method: 'live',
    source_kind: 'self',
    created_at: '2026-10-01T15:00:00Z',
    updated_at: '2026-10-01T15:00:00Z',
    ...overrides,
  };
}

const ROUNDS: Pick<ZoneRoundRow, 'id' | 'seq' | 'stage' | 'delivery_source'>[] = [
  { id: 'r1', seq: 1, stage: 2, delivery_source: 'toss' },
  { id: 'r2', seq: 2, stage: 2, delivery_source: 'toss' },
  { id: 'r3', seq: 1, stage: 1, delivery_source: 'tee' },
];
const ASSIGNMENTS: Pick<ZoneAssignmentRow, 'id' | 'version' | 'kind' | 'swing_zones' | 'recognition_required'>[] = [
  { id: 'a1', version: 1, kind: 'free', swing_zones: [], recognition_required: false },
  { id: 'a2', version: 1, kind: 'forced_take', swing_zones: [], recognition_required: false },
  { id: 'a3', version: 1, kind: 'mandatory_swing', swing_zones: [], recognition_required: false },
];

function session(id: string, date: string, overrides: Partial<ZoneSessionRow> = {}): ZoneSessionRow {
  return {
    id,
    athlete_id: 'ath',
    session_date: date,
    batting_side: 'right',
    assessment_id: null,
    plan_id: null,
    focus_zones: [4, 5],
    drill_key: null,
    drill_version: null,
    pairing_key: null,
    stage: 2,
    delivery_source: 'toss',
    primary_cue: 'Catch it deep',
    target_lane: null,
    constraint_key: null,
    planned_reps: 10,
    contact_quality_definition: null,
    equipment: null,
    capture_conditions: null,
    notes: null,
    status: 'active',
    hitter_self_assessment: null,
    coach_assessment: null,
    best_process_win: null,
    repeated_breakdown: null,
    decision: null,
    next_zones: [],
    next_cue: null,
    next_constraint_key: null,
    next_volume: null,
    success_criterion: null,
    reviewed_by: null,
    reviewed_at: null,
    next_plan_approved_by: null,
    next_plan_approved_at: null,
    source_kind: 'self',
    created_by: null,
    created_at: `${date}T15:00:00Z`,
    updated_at: `${date}T15:00:00Z`,
    ...overrides,
  };
}

describe('entries from the tracker', () => {
  it('drops observations that do not apply and keeps unrecorded ones empty', () => {
    const take = tidyEntry({ ...emptyEntry('pitch', 'right'), location: 'z4', response: 'take', contact: 'fair', depth_correct: true, lane_correct: true });
    expect(take.contact).toBeNull();
    expect(take.depth_correct).toBeNull();
    expect(take.lane_correct).toBeNull();
    const foul = tidyEntry({ ...emptyEntry('pitch', 'right'), location: 'z4', response: 'swing', contact: 'foul', lane_correct: true });
    expect(foul.lane_correct).toBeNull();
    expect(foul.hard_targeted).toBeNull();
    const tee = tidyEntry({ ...emptyEntry('tee_swing', 'left'), location: 'out_away', recognition_call: 'ball', off_plan: true });
    expect(tee.location).toBeNull();
    expect(tee.response).toBe('swing');
    expect(tee.recognition_call).toBeNull();
    expect(tee.off_plan).toBe(false);
    const known = tidyEntry({ ...emptyEntry('pitch', 'right'), location: 'z2', response: 'take', pitch_class: 'ball' });
    expect(known.pitch_class).toBeNull();
  });

  it('explains what is missing before saving', () => {
    expect(entryProblem(emptyEntry('pitch', 'right'))).toMatch(/where the pitch arrived/);
    expect(entryProblem({ ...emptyEntry('pitch', 'right'), location: 'z4' })).toMatch(/swing or take/);
    expect(entryProblem({ ...emptyEntry('pitch', 'right'), location: 'z4', response: 'take', voided: true, void_reason: 'x' })).toMatch(/left out/);
    expect(entryProblem({ ...emptyEntry('tee_swing', 'right'), location: 'z7' })).toBeNull();
    expect(entrySummary({ kind: 'pitch', location: 'out_in', response: 'take', contact: null, voided: false }, 3)).toBe('Pitch 3 · ball inside · take');
    expect(entrySummary({ kind: 'tee_swing', location: 'z8', response: 'swing', contact: 'fair', voided: false }, null)).toBe('Tee swing · Zone 8 · fair ball');
  });

  it('round-trips between an entry and the calculator input', () => {
    const entry = { ...emptyEntry('pitch', 'right'), location: 'z6' as const, response: 'swing' as const, contact: 'miss' as const, intended_zone: 6 };
    const event = entryToEvent(entry, FREE, 'x', 1);
    expect(event.intendedZone).toBe(6);
    expect(summarizeZoneEvents([event]).pitch.strike_contact).toMatchObject({ numerator: 0, denominator: 1 });
    const back = eventToEntry(event, { pitch_type: null, off_plan_reason: null, void_reason: null, media_id: null, clip_time_ms: null, note: null, evidence_method: 'live' });
    expect(back.location).toBe('z6');
    expect(back.contact).toBe('miss');
  });
});

describe('stored records', () => {
  it('judges each event against the assignment version it was logged under', () => {
    const items = contextEvents(
      [row({ location: 'z2', response: 'take', contact: null, depth_correct: null, assignment_id: 'a1' }), row({ location: 'z2', response: 'take', contact: null, depth_correct: null, assignment_id: 'a2' })],
      ROUNDS,
      ASSIGNMENTS,
      [session('s1', '2026-10-01')],
    );
    const summary = summarizeZoneEvents(items.map((item) => item.event));
    // The free-decision take of a strike is a wrong decision; the forced-take round is left out.
    expect(summary.pitch.decision).toMatchObject({ numerator: 0, denominator: 1 });
    expect(summary.pitch.decision.excluded).toEqual([{ reason: 'Forced-take round (no decision)', count: 1 }]);
  });

  it('describes assignments in plain words', () => {
    expect(assignmentText({ kind: 'selective', swing_zones: [5, 4], recognition_required: true })).toBe(
      'Selective: swing at Zones 4 and 5, take everything else · hitter calls ball or strike each pitch',
    );
  });

  it('finds the current stage per zone and proposes one change at a time', () => {
    const progress: ZoneProgressRow[] = [
      { id: '1', zone: 4, stage: 2, decision: 'set', reason: 'x', evidence: null, session_id: null, source_kind: 'self', created_at: '2026-10-01T10:00:00Z' },
      { id: '2', zone: 4, stage: 3, decision: 'advance', reason: 'y', evidence: null, session_id: null, source_kind: 'self', created_at: '2026-10-05T10:00:00Z' },
      { id: '3', zone: 9, stage: 1, decision: 'set', reason: 'z', evidence: null, session_id: null, source_kind: 'self', created_at: '2026-10-02T10:00:00Z' },
    ];
    const stages = currentStages(progress);
    expect(stages.get(4)?.stage).toBe(3);
    expect(stages.get(9)?.stage).toBe(1);
    expect(stages.has(5)).toBe(false);
    expect(proposedStage(3, 'advance')).toBe(4);
    expect(proposedStage(1, 'simplify')).toBe(1);
    expect(proposedStage(9, 'advance')).toBe(9);
    expect(proposedStage(4, 'hold')).toBe(4);
  });

  it('compares only compatible sessions and adds counts instead of averaging', () => {
    const sessions = [session('s1', '2026-10-01'), session('s2', '2026-10-03')];
    const events = [
      row({ session_id: 's1', round_id: 'r1', contact: 'fair' }),
      row({ session_id: 's1', round_id: 'r1', contact: 'miss' }),
      row({ session_id: 's2', round_id: 'r2', contact: 'fair' }),
      row({ session_id: 's2', round_id: 'r2', contact: 'fair' }),
      row({ session_id: 's2', round_id: 'r2', contact: 'fair' }),
      row({ session_id: 's2', round_id: 'r2', contact: 'miss' }),
      // Tee swings and a mandatory-swing round never join the toss/free-decision group.
      row({ session_id: 's2', round_id: 'r3', kind: 'tee_swing', contact: 'fair' }),
      row({ session_id: 's2', round_id: 'r2', assignment_id: 'a3', contact: 'fair' }),
      // A left-handed swing is compared with left-handed swings only.
      row({ session_id: 's2', round_id: 'r2', batting_side: 'left', contact: 'fair' }),
    ];
    const groups = comparableGroups(contextEvents(events, ROUNDS, ASSIGNMENTS, sessions));
    expect(groups).toHaveLength(4);
    const main = groups[0];
    expect(main?.key).toMatchObject({ kind: 'pitch', stage: 2, deliverySource: 'toss', assignmentKind: 'free', battingSide: 'right' });
    expect(main?.sessions.map((item) => item.date)).toEqual(['2026-10-01', '2026-10-03']);
    // 4 of 6 (66.7%), not the mean of 50% and 75%.
    expect(main?.total.pitch.strike_contact).toMatchObject({ numerator: 4, denominator: 6, value: 66.7 });
  });

  it('generates the daily log from sessions without mixing tee swings into pitch rates', () => {
    const sessions = [session('s1', '2026-10-01', { decision: 'advance', next_cue: 'Stay tall' }), session('s2', '2026-10-01', { focus_zones: [9], stage: 3 })];
    const events = [
      row({ session_id: 's1', contact: 'fair', hard_targeted: true }),
      row({ session_id: 's2', contact: 'fair', hard_targeted: false }),
      row({ session_id: 's2', round_id: 'r3', kind: 'tee_swing', contact: 'fair', hard_targeted: true }),
    ];
    const [day] = dailyLog(sessions, contextEvents(events, ROUNDS, ASSIGNMENTS, sessions));
    expect(day?.pitches).toBe(2);
    expect(day?.teeSwings).toBe(1);
    expect(day?.hardTargeted).toMatchObject({ numerator: 1, denominator: 2 });
    expect(day?.focusZones).toEqual([4, 5, 9]);
    expect(day?.stages).toEqual([2, 3]);
    expect(day?.nextAdjustments).toEqual(['Advance: Stay tall']);
  });
});

describe('zone map tiles', () => {
  const summary = (events: ZoneEventRow[]) => summarizeZoneEvents(contextEvents(events, ROUNDS, ASSIGNMENTS, [session('s1', '2026-10-01')]).map((item) => item.event));

  it('says "Not assessed" with no attempts and "Not recorded" when the observation is missing — never zero', () => {
    const empty = summary([]).byZone[0];
    if (!empty) throw new Error('missing zone');
    expect(mapTile(zoneResult(empty, 'pitch', 'strike_contact'), zoneAttempts(empty, 'pitch'))).toMatchObject({ status: 'not_assessed', primary: 'Not assessed', shade: 'none' });
    const unscored = summary([row({ location: 'z1', depth_correct: null })]).byZone[0];
    if (!unscored) throw new Error('missing zone');
    expect(mapTile(zoneResult(unscored, 'pitch', 'depth'), zoneAttempts(unscored, 'pitch'))).toMatchObject({ status: 'not_recorded', shade: 'none' });
  });

  it('shows counts without shading until there are enough scored attempts', () => {
    const few = summary(Array.from({ length: MIN_ZONE_SAMPLE - 1 }, () => row({ location: 'z3' }))).byZone[2];
    if (!few) throw new Error('missing zone');
    const fewTile = mapTile(zoneResult(few, 'pitch', 'strike_contact'), zoneAttempts(few, 'pitch'));
    expect(fewTile).toMatchObject({ status: 'too_few', shade: 'none', primary: `${MIN_ZONE_SAMPLE - 1} of ${MIN_ZONE_SAMPLE - 1}` });
    const enough = summary(Array.from({ length: MIN_ZONE_SAMPLE }, (_, index) => row({ location: 'z3', contact: index < 2 ? 'miss' : 'fair' }))).byZone[2];
    if (!enough) throw new Error('missing zone');
    expect(mapTile(zoneResult(enough, 'pitch', 'strike_contact'), zoneAttempts(enough, 'pitch'))).toMatchObject({ status: 'enough', primary: '75%', shade: 'high' });
  });

  it('keeps tee swings and pitches on separate maps', () => {
    const mixed = summary([row({ location: 'z5', kind: 'tee_swing', round_id: 'r3' }), row({ location: 'z5', contact: 'miss' })]).byZone[4];
    if (!mixed) throw new Error('missing zone');
    expect(zoneResult(mixed, 'pitch', 'strike_contact')).toMatchObject({ numerator: 0, denominator: 1 });
    expect(zoneResult(mixed, 'tee', 'contact')).toMatchObject({ numerator: 1, denominator: 1 });
  });
});

describe('CSV export', () => {
  it('keeps text as text and quotes what needs quoting', () => {
    expect(csvCell('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`);
    expect(csvCell('+1')).toBe("'+1");
    expect(csvCell('late, then early')).toBe('"late, then early"');
    expect(csvCell(null)).toBe('');
  });

  it('writes derived flags only where they were scored', () => {
    const items = contextEvents(
      [row({ seq: 1, location: 'z2', response: 'take', contact: null, depth_correct: null }), row({ seq: 2, location: 'z2', response: 'take', contact: null, depth_correct: null, assignment_id: 'a2', note: '=SUM(1)' })],
      ROUNDS,
      ASSIGNMENTS,
      [session('s1', '2026-10-01')],
    );
    const lines = sessionCsv(items, ROUNDS, ASSIGNMENTS).trim().split('\r\n');
    expect(lines[0]).toBe(EXPORT_COLUMNS.join(','));
    const header = EXPORT_COLUMNS as readonly string[];
    const first = lines[1]?.split(',') ?? [];
    const second = lines[2]?.split(',') ?? [];
    expect(first[header.indexOf('decision_correct')]).toBe('0');
    expect(second[header.indexOf('decision_correct')]).toBe('');
    expect(second[header.indexOf('note')]).toBe("'=SUM(1)");
    expect(first[header.indexOf('strike_ball')]).toBe('strike');
  });
});
