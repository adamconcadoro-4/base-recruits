import 'server-only';

import type { Loaded } from '@/lib/assessment/server/queries';
import {
  EVENT_COLUMNS,
  contextEvents,
  type ContextEvent,
  type ZoneAssignmentRow,
  type ZoneEventRow,
  type ZoneProgressRow,
  type ZoneRoundRow,
  type ZoneSessionRow,
} from '@/lib/assessment/zones/records';
import { createClient } from '@/lib/supabase/server';

/**
 * Reads for the 9-Zone Hitting pages. Every query runs as the signed-in
 * person, so row-level security decides what comes back.
 */

const SESSION_COLUMNS =
  'id, athlete_id, session_date, batting_side, assessment_id, plan_id, focus_zones, drill_key, drill_version, pairing_key, stage, delivery_source, primary_cue, target_lane, constraint_key, planned_reps, contact_quality_definition, equipment, capture_conditions, notes, status, hitter_self_assessment, coach_assessment, best_process_win, repeated_breakdown, decision, next_zones, next_cue, next_constraint_key, next_volume, success_criterion, reviewed_by, reviewed_at, next_plan_approved_by, next_plan_approved_at, source_kind, created_by, created_at, updated_at';
const ROUND_COLUMNS =
  'id, session_id, seq, batting_side, stage, delivery_source, drill_key, drill_version, constraint_key, primary_cue, target_lane, planned_reps, intended_zones, hitter_feedback, coach_notes, response, reviewed_at, created_at';
const ASSIGNMENT_COLUMNS = 'id, round_id, version, kind, swing_zones, recognition_required, created_at';

/** The most entries read for an athlete's map and history; the page says so when it is reached. */
export const ATHLETE_EVENT_LIMIT = 5000;

export async function listZoneSessions(athleteId: string): Promise<Loaded<ZoneSessionRow[]>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('zone_sessions')
    .select(SESSION_COLUMNS)
    .eq('athlete_id', athleteId)
    .order('session_date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(500);
  return { data: (data ?? []) as ZoneSessionRow[], failed: Boolean(error) };
}

export interface ZoneSessionDetail {
  readonly session: ZoneSessionRow;
  readonly rounds: readonly ZoneRoundRow[];
  readonly assignments: readonly ZoneAssignmentRow[];
  readonly events: readonly ZoneEventRow[];
  readonly items: readonly ContextEvent[];
}

export async function getZoneSession(sessionId: string): Promise<ZoneSessionDetail | null> {
  const supabase = await createClient();
  const { data: session } = await supabase.from('zone_sessions').select(SESSION_COLUMNS).eq('id', sessionId).maybeSingle();
  if (!session) return null;
  const rounds = await supabase.from('zone_rounds').select(ROUND_COLUMNS).eq('session_id', sessionId).order('seq');
  if (rounds.error) return null;
  const roundRows = (rounds.data ?? []) as ZoneRoundRow[];
  const [assignments, events] = await Promise.all([
    supabase
      .from('zone_assignments')
      .select(ASSIGNMENT_COLUMNS)
      .in(
        'round_id',
        roundRows.map((round) => round.id),
      )
      .order('version'),
    supabase.from('zone_events').select(EVENT_COLUMNS).eq('session_id', sessionId).order('seq').limit(50000),
  ]);
  if (assignments.error || events.error) return null;
  const assignmentRows = (assignments.data ?? []) as ZoneAssignmentRow[];
  const eventRows = (events.data ?? []) as ZoneEventRow[];
  const sessionRow = session as ZoneSessionRow;
  return {
    session: sessionRow,
    rounds: roundRows,
    assignments: assignmentRows,
    events: eventRows,
    items: contextEvents(eventRows, roundRows, assignmentRows, [sessionRow]),
  };
}

export interface AthleteZoneData {
  readonly sessions: readonly ZoneSessionRow[];
  readonly items: readonly ContextEvent[];
  readonly progress: readonly ZoneProgressRow[];
  /** True when the entry limit was reached, so older entries are not included. */
  readonly truncated: boolean;
  readonly failed: boolean;
}

/** Everything the map, history and development path need for one athlete. */
export async function getAthleteZoneData(athleteId: string): Promise<AthleteZoneData> {
  const supabase = await createClient();
  const [sessions, rounds, assignments, events, progress] = await Promise.all([
    listZoneSessions(athleteId),
    supabase.from('zone_rounds').select('id, session_id, stage, delivery_source').eq('athlete_id', athleteId).limit(10000),
    supabase.from('zone_assignments').select('id, kind, swing_zones, recognition_required').eq('athlete_id', athleteId).limit(20000),
    supabase
      .from('zone_events')
      .select(EVENT_COLUMNS)
      .eq('athlete_id', athleteId)
      .order('created_at', { ascending: false })
      .limit(ATHLETE_EVENT_LIMIT),
    supabase
      .from('zone_progress')
      .select('id, zone, stage, decision, reason, evidence, session_id, source_kind, created_at')
      .eq('athlete_id', athleteId)
      .order('created_at', { ascending: false })
      .limit(2000),
  ]);
  const failed = sessions.failed || Boolean(rounds.error || assignments.error || events.error || progress.error);
  const eventRows = (events.data ?? []) as ZoneEventRow[];
  return {
    sessions: sessions.data,
    items: contextEvents(
      eventRows,
      (rounds.data ?? []) as Pick<ZoneRoundRow, 'id' | 'stage' | 'delivery_source'>[],
      (assignments.data ?? []) as Pick<ZoneAssignmentRow, 'id' | 'kind' | 'swing_zones' | 'recognition_required'>[],
      sessions.data,
    ),
    progress: (progress.data ?? []) as ZoneProgressRow[],
    truncated: eventRows.length >= ATHLETE_EVENT_LIMIT,
    failed,
  };
}

export async function getZoneProgress(athleteId: string): Promise<Loaded<ZoneProgressRow[]>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('zone_progress')
    .select('id, zone, stage, decision, reason, evidence, session_id, source_kind, created_at')
    .eq('athlete_id', athleteId)
    .order('created_at', { ascending: false })
    .limit(2000);
  return { data: (data ?? []) as ZoneProgressRow[], failed: Boolean(error) };
}
