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
const PROGRESS_COLUMNS = 'id, zone, stage, decision, reason, evidence, session_id, source_kind, created_at';

/** The most entries read for an athlete's map and history; the page says so when it is reached. */
export const ATHLETE_EVENT_LIMIT = 5000;

/** The Data API returns at most this many rows per request (supabase/config.toml `max_rows`). */
const PAGE_SIZE = 1000;

type PageQuery = (from: number, to: number) => PromiseLike<{ data: unknown[] | null; error: unknown }>;

/**
 * Reads up to `cap` rows a page at a time, so the API's per-request row limit
 * never silently cuts a result short. The query must have a stable order.
 * `more` is true when rows beyond the cap exist.
 */
async function readAll<T>(query: PageQuery, cap: number): Promise<{ rows: T[]; failed: boolean; more: boolean }> {
  const rows: T[] = [];
  for (let from = 0; from < cap; from += PAGE_SIZE) {
    const to = Math.min(from + PAGE_SIZE, cap) - 1;
    const { data, error } = await query(from, to);
    if (error) return { rows, failed: true, more: false };
    const page = (data ?? []) as T[];
    rows.push(...page);
    if (page.length < to - from + 1) return { rows, failed: false, more: false };
  }
  const { data, error } = await query(cap, cap);
  return { rows, failed: Boolean(error), more: (data ?? []).length > 0 };
}

export async function listZoneSessions(athleteId: string): Promise<Loaded<ZoneSessionRow[]>> {
  const supabase = await createClient();
  const result = await readAll<ZoneSessionRow>(
    (from, to) =>
      supabase
        .from('zone_sessions')
        .select(SESSION_COLUMNS)
        .eq('athlete_id', athleteId)
        .order('session_date', { ascending: false })
        .order('created_at', { ascending: false })
        .order('id')
        .range(from, to),
    5000,
  );
  return { data: result.rows, failed: result.failed };
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
  const roundIds = roundRows.map((round) => round.id);
  // A session has at most 50 rounds, 100 assignment versions per round and 1,000 entries per round.
  const [assignments, events] = await Promise.all([
    readAll<ZoneAssignmentRow>(
      (from, to) =>
        supabase.from('zone_assignments').select(ASSIGNMENT_COLUMNS).in('round_id', roundIds).order('round_id').order('version').range(from, to),
      5000,
    ),
    readAll<ZoneEventRow>(
      (from, to) => supabase.from('zone_events').select(EVENT_COLUMNS).eq('session_id', sessionId).order('round_id').order('seq').range(from, to),
      50000,
    ),
  ]);
  if (assignments.failed || events.failed) return null;
  const sessionRow = session as ZoneSessionRow;
  return {
    session: sessionRow,
    rounds: roundRows,
    assignments: assignments.rows,
    events: events.rows,
    items: contextEvents(events.rows, roundRows, assignments.rows, [sessionRow]),
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
    readAll<Pick<ZoneRoundRow, 'id' | 'stage' | 'delivery_source'>>(
      (from, to) =>
        supabase.from('zone_rounds').select('id, stage, delivery_source').eq('athlete_id', athleteId).order('created_at').order('id').range(from, to),
      50000,
    ),
    readAll<Pick<ZoneAssignmentRow, 'id' | 'kind' | 'swing_zones' | 'recognition_required'>>(
      (from, to) =>
        supabase
          .from('zone_assignments')
          .select('id, kind, swing_zones, recognition_required')
          .eq('athlete_id', athleteId)
          .order('created_at')
          .order('id')
          .range(from, to),
      100000,
    ),
    readAll<ZoneEventRow>(
      (from, to) =>
        supabase
          .from('zone_events')
          .select(EVENT_COLUMNS)
          .eq('athlete_id', athleteId)
          .order('created_at', { ascending: false })
          .order('id')
          .range(from, to),
      ATHLETE_EVENT_LIMIT,
    ),
    getZoneProgress(athleteId),
  ]);
  return {
    sessions: sessions.data,
    items: contextEvents(events.rows, rounds.rows, assignments.rows, sessions.data),
    progress: progress.data,
    truncated: events.more,
    failed: sessions.failed || rounds.failed || assignments.failed || events.failed || progress.failed,
  };
}

/** Stage history, newest first. */
export async function getZoneProgress(athleteId: string): Promise<Loaded<ZoneProgressRow[]>> {
  const supabase = await createClient();
  const result = await readAll<ZoneProgressRow>(
    (from, to) =>
      supabase
        .from('zone_progress')
        .select(PROGRESS_COLUMNS)
        .eq('athlete_id', athleteId)
        .order('created_at', { ascending: false })
        .order('id')
        .range(from, to),
    10000,
  );
  return { data: result.rows, failed: result.failed };
}
