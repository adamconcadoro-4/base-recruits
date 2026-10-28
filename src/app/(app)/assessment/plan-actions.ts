'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { drill as findDrill } from '@/lib/assessment/catalog/drills';
import { isSessionTemplateId } from '@/lib/assessment/catalog/session-templates';
import { PRACTICE_COUNT_FIELDS, practiceCountsProblem, type PracticeCountFields } from '@/lib/assessment/practice-counts';
import { callRpc, numberField, rpcAction, switchedOff, textOrNull } from '@/lib/assessment/server/actions';
import { field, failure, type ActionState } from '@/lib/forms/action-state';

const PATHS = ['/assessment/training', '/assessment'];

/**
 * Creates a training plan from a published report. Focus areas and drills
 * come from checkboxes; each chosen drill carries its reason and an editable
 * dosage. The database checks the drills, the focus metrics and the dates.
 */
export async function createPlanAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const off = switchedOff();
  if (off) return off;
  const athleteId = field(formData, 'athleteId');
  const focus = formData
    .getAll('focus')
    .filter((value): value is string => typeof value === 'string' && value !== '')
    .map((value) => {
      const [metricKey, pitchType] = value.split('|');
      return { metric_key: metricKey, pitch_type: pitchType || null, summary: field(formData, `summary:${value}`).slice(0, 300) };
    });
  if (focus.length > 3) return failure('Choose up to three focus areas so the block stays focused.');
  const assignments = formData
    .getAll('drill')
    .filter((value): value is string => typeof value === 'string' && value !== '')
    .map((value) => {
      const [key, version] = value.split('@');
      return {
        drill_key: key,
        drill_version: Number(version),
        focus_metric_key: field(formData, `focus:${value}`) || null,
        reason: field(formData, `reason:${value}`),
        dosage: field(formData, `dosage:${value}`),
      };
    });
  if (assignments.length === 0) return failure('Choose at least one drill.');
  const session = field(formData, 'session');
  if (session && !isSessionTemplateId(session)) return failure('Choose one of the hitting sessions.');
  const { data, error } = await callRpc<string>('create_training_plan', {
    p_athlete_id: athleteId,
    p_source_revision_id: field(formData, 'revisionId'),
    p_title: field(formData, 'title'),
    p_start_on: field(formData, 'start_on'),
    p_review_on: field(formData, 'review_on'),
    p_focus: focus,
    p_assignments: assignments,
    p_session_template: session || null,
  });
  if (error || !data) return failure(error ?? 'We couldn’t create the plan.');
  for (const path of PATHS) revalidatePath(path, 'layout');
  redirect(`/assessment/training?athlete=${encodeURIComponent(athleteId)}#plan-${data}`);
}

export async function approvePlanAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  return rpcAction('approve_training_plan', { p_plan_id: field(formData, 'planId') }, 'Plan approved.', PATHS);
}

export async function updateAssignmentAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  return rpcAction(
    'update_training_assignment',
    { p_assignment_id: field(formData, 'assignmentId'), p_dosage: field(formData, 'dosage'), p_note: textOrNull(formData, 'note') },
    'Saved.',
    PATHS,
  );
}

export async function replaceAssignmentAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const [key, version] = field(formData, 'drill').split('@');
  if (!key || !version || !findDrill(key, Number(version))) return failure('Choose a drill from the library.');
  return rpcAction(
    'replace_training_assignment',
    {
      p_assignment_id: field(formData, 'assignmentId'),
      p_drill_key: key,
      p_drill_version: Number(version),
      p_reason: field(formData, 'reason'),
    },
    'Drill replaced.',
    PATHS,
  );
}

export async function addAssignmentAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const [key, version] = field(formData, 'drill').split('@');
  const chosen = key && version ? findDrill(key, Number(version)) : undefined;
  if (!chosen) return failure('Choose a drill from the library.');
  return rpcAction(
    'add_training_assignment',
    {
      p_plan_id: field(formData, 'planId'),
      p_drill_key: chosen.key,
      p_drill_version: chosen.version,
      p_focus_metric_key: textOrNull(formData, 'focus_metric_key'),
      p_reason: field(formData, 'reason'),
      p_dosage: field(formData, 'dosage') || chosen.dosage,
    },
    'Drill added.',
    PATHS,
  );
}

export async function removeAssignmentAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  return rpcAction(
    'remove_training_assignment',
    { p_assignment_id: field(formData, 'assignmentId'), p_reason: field(formData, 'reason') },
    'Drill removed.',
    PATHS,
  );
}

export async function setPlanNotesAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  return rpcAction('set_training_plan_notes', { p_plan_id: field(formData, 'planId'), p_notes: textOrNull(formData, 'notes') }, 'Notes saved.', PATHS);
}

export async function completePlanAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  return rpcAction('complete_training_plan', { p_plan_id: field(formData, 'planId') }, 'Plan marked complete.', PATHS);
}

export async function logTrainingAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const sets = numberField(formData, 'sets');
  const effort = numberField(formData, 'effort');
  if ((sets !== null && Number.isNaN(sets)) || (effort !== null && Number.isNaN(effort))) {
    return failure('Sets and effort must be numbers.');
  }
  const counts = Object.fromEntries(PRACTICE_COUNT_FIELDS.map((name) => [name, numberField(formData, name)])) as unknown as PracticeCountFields;
  const problem = practiceCountsProblem(counts);
  if (problem) return failure(problem);
  return rpcAction(
    'log_training',
    {
      p_assignment_id: field(formData, 'assignmentId'),
      p_completed_on: field(formData, 'completed_on'),
      p_sets_completed: sets,
      p_effort: effort,
      p_feedback: textOrNull(formData, 'feedback'),
      p_media_id: null,
      p_swings: counts.swings,
      p_solid_contacts: counts.solid_contacts,
      p_decisions_assessed: counts.decisions_assessed,
      p_decisions_correct: counts.decisions_correct,
      p_landings_assessed: counts.landings_assessed,
      p_landings_intended: counts.landings_intended,
    },
    'Logged.',
    PATHS,
  );
}

export async function deleteLogAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  return rpcAction('delete_training_log', { p_log_id: field(formData, 'logId') }, 'Log entry deleted.', PATHS);
}
