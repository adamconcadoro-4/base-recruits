/**
 * 9-Zone Hitting records as the pages read them, and the pure helpers that
 * turn them into calculator input, labels, current stages, comparable groups
 * and the daily history. No database access here.
 */

import { zoneConstraint, zoneDrill, zonePairing } from '@/lib/assessment/zones/content';
import { OUTSIDE_LABELS, SIDE_LABELS } from '@/lib/assessment/zones/geometry';
import { summarizeZoneEvents, type MetricResult, type ZoneSummary } from '@/lib/assessment/zones/metrics';
import {
  ZONE_CALC_VERSION,
  isZoneId,
  type AssignmentKind,
  type ContactOutcome,
  type DeliverySource,
  type EventKind,
  type PitchClass,
  type PitchLocation,
  type RoundResponse,
  type StageDecision,
  type SwingResponse,
  type ZoneEvent,
  type ZoneId,
  type ZoneSide,
} from '@/lib/assessment/zones/types';

export interface ZoneSessionRow {
  readonly id: string;
  readonly athlete_id: string;
  readonly session_date: string;
  readonly batting_side: ZoneSide;
  readonly assessment_id: string | null;
  readonly plan_id: string | null;
  readonly focus_zones: readonly number[];
  readonly drill_key: string | null;
  readonly drill_version: number | null;
  readonly pairing_key: string | null;
  readonly stage: number;
  readonly delivery_source: DeliverySource;
  readonly primary_cue: string | null;
  readonly target_lane: string | null;
  readonly constraint_key: string | null;
  readonly planned_reps: number | null;
  readonly contact_quality_definition: string | null;
  readonly equipment: string | null;
  readonly capture_conditions: string | null;
  readonly notes: string | null;
  readonly status: 'active' | 'reviewed';
  readonly hitter_self_assessment: string | null;
  readonly coach_assessment: string | null;
  readonly best_process_win: string | null;
  readonly repeated_breakdown: string | null;
  readonly decision: Exclude<StageDecision, 'set'> | null;
  readonly next_zones: readonly number[];
  readonly next_cue: string | null;
  readonly next_constraint_key: string | null;
  readonly next_volume: string | null;
  readonly success_criterion: string | null;
  readonly reviewed_by: string | null;
  readonly reviewed_at: string | null;
  readonly next_plan_approved_by: string | null;
  readonly next_plan_approved_at: string | null;
  readonly source_kind: 'self' | 'development_coach';
  readonly created_by: string | null;
  readonly created_at: string;
  readonly updated_at: string;
}

export interface ZoneRoundRow {
  readonly id: string;
  readonly session_id: string;
  readonly seq: number;
  readonly batting_side: ZoneSide;
  readonly stage: number;
  readonly delivery_source: DeliverySource;
  readonly drill_key: string | null;
  readonly drill_version: number | null;
  readonly constraint_key: string | null;
  readonly primary_cue: string | null;
  readonly target_lane: string | null;
  readonly planned_reps: number | null;
  readonly intended_zones: readonly number[];
  readonly hitter_feedback: string | null;
  readonly coach_notes: string | null;
  readonly response: RoundResponse | null;
  readonly reviewed_at: string | null;
  readonly created_at: string;
}

export interface ZoneAssignmentRow {
  readonly id: string;
  readonly round_id: string;
  readonly version: number;
  readonly kind: AssignmentKind;
  readonly swing_zones: readonly number[];
  readonly recognition_required: boolean;
  readonly created_at: string;
}

export interface ZoneEventRow {
  readonly id: string;
  readonly round_id: string;
  readonly session_id: string;
  readonly seq: number;
  readonly kind: EventKind;
  readonly assignment_id: string;
  readonly batting_side: ZoneSide;
  readonly intended_zone: number | null;
  readonly location: PitchLocation;
  readonly pitch_class: PitchClass | null;
  readonly pitch_type: string | null;
  readonly response: SwingResponse | null;
  readonly contact: ContactOutcome | null;
  readonly hard_targeted: boolean | null;
  readonly depth_correct: boolean | null;
  readonly lane_correct: boolean | null;
  readonly posture_error: boolean | null;
  readonly recognition_call: PitchClass | null;
  readonly off_plan: boolean;
  readonly off_plan_reason: string | null;
  readonly forced_take: boolean;
  readonly voided: boolean;
  readonly void_reason: string | null;
  readonly media_id: string | null;
  readonly clip_time_ms: number | null;
  readonly note: string | null;
  readonly evidence_method: 'live' | 'video';
  readonly source_kind: 'self' | 'development_coach';
  readonly created_at: string;
  readonly updated_at: string;
}

export interface ZoneProgressRow {
  readonly id: string;
  readonly zone: number;
  readonly stage: number;
  readonly decision: StageDecision;
  readonly reason: string;
  readonly evidence: string | null;
  readonly session_id: string | null;
  readonly source_kind: 'self' | 'development_coach';
  readonly created_at: string;
}

export const EVENT_COLUMNS =
  'id, round_id, session_id, seq, kind, assignment_id, batting_side, intended_zone, location, pitch_class, pitch_type, response, contact, hard_targeted, depth_correct, lane_correct, posture_error, recognition_call, off_plan, off_plan_reason, forced_take, voided, void_reason, media_id, clip_time_ms, note, evidence_method, source_kind, created_at, updated_at';

// ----------------------------------------------------------------------------- labels

export const EVENT_KIND_LABELS: Readonly<Record<EventKind, string>> = {
  pitch: 'Pitch',
  tee_swing: 'Tee swing',
  dry_rep: 'Dry rep',
};

export const DELIVERY_LABELS: Readonly<Record<DeliverySource, string>> = {
  tee: 'Tee',
  toss: 'Front or side toss',
  coach: 'Coach-pitched BP',
  machine: 'Machine',
  live: 'Live pitcher',
};

export const ASSIGNMENT_LABELS: Readonly<Record<AssignmentKind, string>> = {
  free: 'Free decisions: swing at strikes, take balls',
  selective: 'Selective: swing only at chosen zones',
  mandatory_swing: 'Mandatory swing: swing at every pitch',
  forced_take: 'Forced take: take every pitch',
};

export const CONTACT_LABELS: Readonly<Record<ContactOutcome, string>> = {
  miss: 'Miss',
  foul: 'Foul',
  fair: 'Fair ball in play',
  unknown: 'Contact not seen',
};

export const ROUND_RESPONSE_LABELS: Readonly<Record<RoundResponse, string>> = {
  advance: 'Advance',
  hold: 'Hold',
  simplify: 'Simplify',
  stop: 'Stop for today',
};

export const STAGE_DECISION_LABELS: Readonly<Record<StageDecision, string>> = {
  set: 'Starting stage set',
  advance: 'Advanced',
  hold: 'Held',
  simplify: 'Simplified',
};

export function locationLabel(location: PitchLocation): string {
  if (location === 'unknown') return 'Location unknown';
  if (location.startsWith('z')) return `Zone ${location.slice(1)}`;
  return OUTSIDE_LABELS[location as keyof typeof OUTSIDE_LABELS];
}

export function sideLabel(side: ZoneSide): string {
  return SIDE_LABELS[side];
}

export function zoneList(zones: readonly number[]): string {
  const sorted = [...zones].sort((a, b) => a - b);
  if (sorted.length === 0) return 'none';
  if (sorted.length === 1) return `Zone ${sorted[0]}`;
  return `Zones ${sorted.slice(0, -1).join(', ')} and ${sorted[sorted.length - 1]}`;
}

/** "Selective: swing at Zones 4 and 5, take everything else · ball/strike call each pitch". */
export function assignmentText(assignment: Pick<ZoneAssignmentRow, 'kind' | 'swing_zones' | 'recognition_required'>): string {
  const base =
    assignment.kind === 'selective'
      ? `Selective: swing at ${zoneList(assignment.swing_zones)}, take everything else`
      : ASSIGNMENT_LABELS[assignment.kind];
  return assignment.recognition_required ? `${base} · hitter calls ball or strike each pitch` : base;
}

export function drillLabel(key: string | null): string | null {
  if (!key) return null;
  const drill = zoneDrill(key);
  return drill ? `${drill.sourceId} ${drill.name}` : key;
}

export function constraintLabel(key: string | null): string | null {
  if (!key) return null;
  const constraint = zoneConstraint(key);
  return constraint ? `${constraint.category}: ${constraint.name}` : key;
}

export function pairingLabel(key: string | null): string | null {
  if (!key) return null;
  const pairing = zonePairing(key);
  return pairing ? `${pairing.name} (${zoneList(pairing.zones)})` : key;
}

// ----------------------------------------------------------------------------- calculator input

/** One event with the context it was recorded in (for grouping and links). */
export interface ContextEvent {
  readonly event: ZoneEvent;
  readonly row: ZoneEventRow;
  readonly stage: number;
  readonly deliverySource: DeliverySource;
  readonly assignmentKind: AssignmentKind;
  readonly sessionDate: string;
}

function zoneIds(values: readonly number[]): ZoneId[] {
  return values.filter(isZoneId);
}

/** Calculator input from a stored event and the assignment version it was judged against. */
export function toZoneEvent(row: ZoneEventRow, assignment: Pick<ZoneAssignmentRow, 'kind' | 'swing_zones' | 'recognition_required'>): ZoneEvent {
  return {
    id: row.id,
    seq: row.seq,
    kind: row.kind,
    assignment: { kind: assignment.kind, swingZones: zoneIds(assignment.swing_zones), recognitionRequired: assignment.recognition_required },
    battingSide: row.batting_side,
    intendedZone: row.intended_zone !== null && isZoneId(row.intended_zone) ? row.intended_zone : null,
    location: row.location,
    pitchClass: row.pitch_class,
    response: row.response,
    contact: row.contact,
    hardTargeted: row.hard_targeted,
    depthCorrect: row.depth_correct,
    laneCorrect: row.lane_correct,
    postureError: row.posture_error,
    recognitionCall: row.recognition_call,
    offPlan: row.off_plan,
    forcedTake: row.forced_take,
    voided: row.voided,
  };
}

/** Joins events to their rounds, assignments and sessions; events whose parents are missing are dropped. */
export function contextEvents(
  events: readonly ZoneEventRow[],
  rounds: readonly Pick<ZoneRoundRow, 'id' | 'stage' | 'delivery_source'>[],
  assignments: readonly Pick<ZoneAssignmentRow, 'id' | 'kind' | 'swing_zones' | 'recognition_required'>[],
  sessions: readonly Pick<ZoneSessionRow, 'id' | 'session_date'>[],
): ContextEvent[] {
  const roundMap = new Map(rounds.map((round) => [round.id, round]));
  const assignmentMap = new Map(assignments.map((assignment) => [assignment.id, assignment]));
  const sessionMap = new Map(sessions.map((session) => [session.id, session]));
  const result: ContextEvent[] = [];
  for (const row of events) {
    const round = roundMap.get(row.round_id);
    const assignment = assignmentMap.get(row.assignment_id);
    const session = sessionMap.get(row.session_id);
    if (!round || !assignment || !session) continue;
    result.push({
      event: toZoneEvent(row, assignment),
      row,
      stage: round.stage,
      deliverySource: round.delivery_source,
      assignmentKind: assignment.kind,
      sessionDate: session.session_date,
    });
  }
  return result;
}

// ----------------------------------------------------------------------------- stages

export interface CurrentStage {
  readonly zone: ZoneId;
  readonly stage: number;
  readonly decision: StageDecision;
  readonly reason: string;
  readonly decidedAt: string;
}

/** The newest stage decision per zone (rows in any order). */
export function currentStages(progress: readonly ZoneProgressRow[]): ReadonlyMap<ZoneId, CurrentStage> {
  const sorted = [...progress].sort((a, b) => (a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0));
  const result = new Map<ZoneId, CurrentStage>();
  for (const row of sorted) {
    if (!isZoneId(row.zone) || result.has(row.zone)) continue;
    result.set(row.zone, { zone: row.zone, stage: row.stage, decision: row.decision, reason: row.reason, decidedAt: row.created_at });
  }
  return result;
}

/** Stage to propose for a new round: one demand at a time. */
export function proposedStage(current: number, response: RoundResponse | null): number {
  if (response === 'advance') return Math.min(9, current + 1);
  if (response === 'simplify') return Math.max(1, current - 1);
  return current;
}

// ----------------------------------------------------------------------------- comparable groups

/**
 * Sessions are compared only within the same stage, delivery source,
 * assignment, batting side, kind of repetition and calculation version, so
 * tee contact never mixes with live-pitch contact and forced rounds never mix
 * with free decisions.
 */
export interface ComparableKey {
  readonly kind: EventKind;
  readonly stage: number;
  readonly deliverySource: DeliverySource;
  readonly assignmentKind: AssignmentKind;
  readonly battingSide: ZoneSide;
  readonly calcVersion: string;
}

export function comparableKey(item: ContextEvent): ComparableKey {
  return {
    kind: item.event.kind,
    stage: item.stage,
    deliverySource: item.deliverySource,
    assignmentKind: item.assignmentKind,
    battingSide: item.event.battingSide,
    calcVersion: ZONE_CALC_VERSION,
  };
}

export function comparableKeyId(key: ComparableKey): string {
  return [key.kind, key.stage, key.deliverySource, key.assignmentKind, key.battingSide, key.calcVersion].join('|');
}

export function comparableLabel(key: ComparableKey): string {
  const assignment = key.assignmentKind === 'free' ? 'free decisions' : key.assignmentKind.replace('_', ' ');
  const kinds: Readonly<Record<EventKind, string>> = { pitch: 'Pitches', tee_swing: 'Tee swings', dry_rep: 'Dry reps' };
  return `${kinds[key.kind]} · stage ${key.stage} · ${DELIVERY_LABELS[key.deliverySource].toLowerCase()} · ${assignment} · ${SIDE_LABELS[key.battingSide].toLowerCase()}`;
}

export interface ComparableGroup {
  readonly key: ComparableKey;
  readonly id: string;
  readonly label: string;
  /** Per session date, oldest first, then the combined total (counts added, never percentages averaged). */
  readonly sessions: ReadonlyArray<{ readonly date: string; readonly summary: ZoneSummary }>;
  readonly total: ZoneSummary;
}

export function comparableGroups(items: readonly ContextEvent[]): ComparableGroup[] {
  const groups = new Map<string, { key: ComparableKey; byDate: Map<string, ZoneEvent[]>; all: ZoneEvent[] }>();
  for (const item of items) {
    const key = comparableKey(item);
    const id = comparableKeyId(key);
    let group = groups.get(id);
    if (!group) {
      group = { key, byDate: new Map(), all: [] };
      groups.set(id, group);
    }
    const list = group.byDate.get(item.sessionDate) ?? [];
    list.push(item.event);
    group.byDate.set(item.sessionDate, list);
    group.all.push(item.event);
  }
  return [...groups.entries()]
    .map(([id, group]) => ({
      key: group.key,
      id,
      label: comparableLabel(group.key),
      sessions: [...group.byDate.entries()]
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([date, events]) => ({ date, summary: summarizeZoneEvents(events) })),
      total: summarizeZoneEvents(group.all),
    }))
    .sort((a, b) => entries(b.total) - entries(a.total));
}

function entries(summary: ZoneSummary): number {
  return summary.counts.pitches + summary.counts.teeSwings + summary.counts.dryReps;
}

// ----------------------------------------------------------------------------- daily history

function unique<T>(values: readonly T[]): T[] {
  return [...new Set(values)];
}

export interface DailyLogRow {
  readonly date: string;
  readonly focusZones: readonly number[];
  readonly stages: readonly number[];
  readonly pitches: number;
  readonly swings: number;
  readonly teeSwings: number;
  readonly hardTargeted: MetricResult;
  readonly depth: MetricResult;
  readonly decision: MetricResult;
  readonly chase: MetricResult;
  readonly posture: MetricResult;
  readonly cues: readonly string[];
  readonly nextAdjustments: readonly string[];
}

/**
 * The workbook's Daily Log, generated from saved sessions: one row per date,
 * live-pitch measures only (tee swings counted, never mixed into the rates).
 */
export function dailyLog(sessions: readonly ZoneSessionRow[], items: readonly ContextEvent[]): DailyLogRow[] {
  const dates = [...new Set(sessions.map((session) => session.session_date))].sort((a, b) => (a < b ? 1 : a > b ? -1 : 0));
  return dates.map((date) => {
    const daySessions = sessions.filter((session) => session.session_date === date);
    const ids = new Set(daySessions.map((session) => session.id));
    const events = items.filter((item) => ids.has(item.row.session_id)).map((item) => item.event);
    const summary = summarizeZoneEvents(events);
    return {
      date,
      focusZones: unique(daySessions.flatMap((session) => session.focus_zones)).sort((a, b) => a - b),
      stages: unique(daySessions.map((session) => session.stage)).sort((a, b) => a - b),
      pitches: summary.counts.pitches,
      swings: summary.counts.swings,
      teeSwings: summary.counts.teeSwings,
      hardTargeted: summary.pitch.hard_targeted,
      depth: summary.pitch.depth,
      decision: summary.pitch.decision,
      chase: summary.pitch.chase,
      posture: summary.pitch.posture_per10,
      cues: unique(daySessions.map((session) => session.primary_cue).filter((cue): cue is string => Boolean(cue))),
      nextAdjustments: unique(
        daySessions
          .map((session) => [session.decision ? ROUND_RESPONSE_LABELS[session.decision] : null, session.next_cue].filter(Boolean).join(': '))
          .filter((text) => text !== ''),
      ),
    };
  });
}
