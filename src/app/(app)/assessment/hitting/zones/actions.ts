'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { callRpc, numberField, rpcAction, switchedOff, textOrNull } from '@/lib/assessment/server/actions';
import { entryProblem, tidyEntry, type ZoneEntryInput } from '@/lib/assessment/zones/entry';
import { field, failure, type ActionState } from '@/lib/forms/action-state';

/**
 * Server actions for 9-Zone Hitting. Each one calls a checked database
 * function as the signed-in person; the database decides who may do what and
 * refuses everything while Assessment is switched off.
 */

const ROOT = '/assessment/hitting/zones';

function refresh(): void {
  revalidatePath(ROOT, 'layout');
}

function zonesFrom(formData: FormData, name: string): number[] {
  return [
    ...new Set(
      formData
        .getAll(name)
        .map((value) => Number(value))
        .filter((value) => Number.isInteger(value) && value >= 1 && value <= 9),
    ),
  ].sort((a, b) => a - b);
}

function athleteSuffix(formData: FormData): string {
  const athlete = field(formData, 'athleteQuery');
  return athlete ? `?athlete=${encodeURIComponent(athlete)}` : '';
}

function roundFields(formData: FormData): Record<string, unknown> {
  return {
    batting_side: field(formData, 'batting_side'),
    stage: numberField(formData, 'stage'),
    delivery_source: field(formData, 'delivery_source'),
    drill_key: textOrNull(formData, 'drill_key'),
    constraint_key: textOrNull(formData, 'constraint_key'),
    primary_cue: textOrNull(formData, 'primary_cue'),
    target_lane: textOrNull(formData, 'target_lane'),
    planned_reps: numberField(formData, 'planned_reps'),
    intended_zones: zonesFrom(formData, 'intended_zones'),
    assignment: {
      kind: field(formData, 'assignment_kind'),
      swing_zones: zonesFrom(formData, 'swing_zones'),
      recognition_required: formData.get('recognition_required') === 'on',
    },
  };
}

function badNumber(values: Record<string, unknown>): string | null {
  if (Number.isNaN(values.stage)) return 'Choose a stage from 1 to 9.';
  if (Number.isNaN(values.planned_reps)) return 'Planned repetitions must be a whole number.';
  return null;
}

export async function createZoneSessionAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const off = switchedOff();
  if (off) return off;
  const focus = zonesFrom(formData, 'focus_zones');
  if (focus.length === 0) return failure('Choose one or two focus zones.');
  if (focus.length > 2) return failure('Choose at most two focus zones so the session stays focused.');
  const round = roundFields(formData);
  const problem = badNumber(round);
  if (problem) return failure(problem);
  const { data, error } = await callRpc<string>('create_zone_session', {
    p_athlete_id: field(formData, 'athleteId'),
    p_session: {
      ...round,
      session_date: field(formData, 'session_date'),
      focus_zones: focus,
      pairing_key: textOrNull(formData, 'pairing_key'),
      assessment_id: textOrNull(formData, 'assessment_id'),
      plan_id: textOrNull(formData, 'plan_id'),
      contact_quality_definition: textOrNull(formData, 'contact_quality_definition'),
      equipment: textOrNull(formData, 'equipment'),
      capture_conditions: textOrNull(formData, 'capture_conditions'),
      notes: textOrNull(formData, 'notes'),
    },
  });
  if (error || !data) return failure(error ?? 'We couldn’t start the session.');
  refresh();
  redirect(`${ROOT}/sessions/${data}${athleteSuffix(formData)}`);
}

export async function addZoneRoundAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const off = switchedOff();
  if (off) return off;
  const round = roundFields(formData);
  const problem = badNumber(round);
  if (problem) return failure(problem);
  const sessionId = field(formData, 'sessionId');
  const { error } = await callRpc<string>('add_zone_round', { p_session_id: sessionId, p_round: round });
  if (error) return failure(error);
  refresh();
  redirect(`${ROOT}/sessions/${sessionId}${athleteSuffix(formData)}#tracker`);
}

export async function setZoneAssignmentAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  return rpcAction(
    'set_zone_assignment',
    {
      p_round_id: field(formData, 'roundId'),
      p_assignment: {
        kind: field(formData, 'assignment_kind'),
        swing_zones: zonesFrom(formData, 'swing_zones'),
        recognition_required: formData.get('recognition_required') === 'on',
      },
    },
    'Assignment changed. Entries already logged keep the assignment they were judged against.',
    [ROOT],
  );
}

export async function reviewZoneRoundAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  return rpcAction(
    'review_zone_round',
    {
      p_round_id: field(formData, 'roundId'),
      p_review: {
        hitter_feedback: textOrNull(formData, 'hitter_feedback'),
        coach_notes: textOrNull(formData, 'coach_notes'),
        response: textOrNull(formData, 'response'),
      },
    },
    'Round review saved.',
    [ROOT],
  );
}

export async function reviewZoneSessionAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  return rpcAction(
    'review_zone_session',
    {
      p_session_id: field(formData, 'sessionId'),
      p_review: {
        hitter_self_assessment: textOrNull(formData, 'hitter_self_assessment'),
        coach_assessment: textOrNull(formData, 'coach_assessment'),
        best_process_win: textOrNull(formData, 'best_process_win'),
        repeated_breakdown: textOrNull(formData, 'repeated_breakdown'),
        decision: textOrNull(formData, 'decision'),
        next_zones: zonesFrom(formData, 'next_zones'),
        next_cue: textOrNull(formData, 'next_cue'),
        next_constraint_key: textOrNull(formData, 'next_constraint_key'),
        next_volume: textOrNull(formData, 'next_volume'),
        success_criterion: textOrNull(formData, 'success_criterion'),
      },
    },
    'Session review saved.',
    [ROOT],
  );
}

export async function approveZoneNextPlanAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  return rpcAction('approve_zone_next_plan', { p_session_id: field(formData, 'sessionId') }, 'Next-session plan approved.', [ROOT]);
}

export async function setZoneStageAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const zone = numberField(formData, 'zone');
  const chosen = numberField(formData, 'stage');
  const current = numberField(formData, 'current');
  const decision = field(formData, 'decision');
  // Advance is always one stage up and hold keeps the stage; the database checks both against the real current stage.
  const stage =
    current !== null && !Number.isNaN(current) && decision === 'advance' ? current + 1 : current !== null && !Number.isNaN(current) && decision === 'hold' ? current : chosen;
  if (zone === null || Number.isNaN(zone) || stage === null || Number.isNaN(stage)) return failure('Choose a zone and a stage.');
  return rpcAction(
    'set_zone_stage',
    {
      p_athlete_id: field(formData, 'athleteId'),
      p_zone: zone,
      p_stage: stage,
      p_decision: decision,
      p_reason: field(formData, 'reason'),
      p_evidence: field(formData, 'evidence'),
      p_session_id: textOrNull(formData, 'sessionId'),
    },
    'Stage saved.',
    [ROOT],
  );
}

export async function deleteZoneSessionAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const off = switchedOff();
  if (off) return off;
  const { error } = await callRpc('delete_zone_session', { p_session_id: field(formData, 'sessionId') });
  if (error) return failure(error);
  refresh();
  redirect(`${ROOT}/sessions${athleteSuffix(formData)}`);
}

// ----------------------------------------------------------------------------- live tracker (called directly)

export type EntryResult = { readonly ok: true; readonly id: string; readonly seq: number } | { readonly ok: false; readonly message: string };

function payload(entry: ZoneEntryInput): Record<string, unknown> {
  const tidy = tidyEntry(entry);
  return { ...tidy };
}

export async function logZoneEntryAction(input: { readonly roundId: string; readonly entry: ZoneEntryInput }): Promise<EntryResult> {
  const problem = entryProblem(tidyEntry(input.entry));
  if (problem) return { ok: false, message: problem };
  const { data, error } = await callRpc<Array<{ event_id: string; seq: number }> | { event_id: string; seq: number }>('log_zone_event', {
    p_round_id: input.roundId,
    p_event: payload(input.entry),
  });
  const row = Array.isArray(data) ? data[0] : data;
  if (error || !row) return { ok: false, message: error ?? 'We couldn’t save that entry.' };
  return { ok: true, id: row.event_id, seq: row.seq };
}

export async function updateZoneEntryAction(input: { readonly eventId: string; readonly entry: ZoneEntryInput }): Promise<{ readonly ok: boolean; readonly message: string }> {
  const problem = entryProblem(tidyEntry(input.entry));
  if (problem) return { ok: false, message: problem };
  const { error } = await callRpc('update_zone_event', { p_event_id: input.eventId, p_event: payload(input.entry) });
  if (error) return { ok: false, message: error };
  refresh();
  return { ok: true, message: 'Correction saved.' };
}

export async function deleteZoneEntryAction(input: { readonly eventId: string }): Promise<{ readonly ok: boolean; readonly message: string }> {
  const { error } = await callRpc('delete_zone_event', { p_event_id: input.eventId });
  if (error) return { ok: false, message: error };
  return { ok: true, message: 'Entry removed.' };
}
