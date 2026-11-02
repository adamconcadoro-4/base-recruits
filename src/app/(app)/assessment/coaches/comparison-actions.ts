'use server';

import { rpcAction, switchedOff } from '@/lib/assessment/server/actions';
import { field, type ActionState } from '@/lib/forms/action-state';

const PATHS = ['/assessment/coaches'];

export async function joinComparisonGroupsAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const off = switchedOff();
  if (off) return off;
  return rpcAction('join_comparison_groups', { p_consent_text_version: field(formData, 'version') }, 'You’ve opted in.', PATHS);
}

export async function approveComparisonGroupsAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  return rpcAction('approve_comparison_groups', { p_athlete_id: field(formData, 'athleteId') }, 'Thanks. Your agreement is recorded.', PATHS);
}

export async function leaveComparisonGroupsAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  return rpcAction('leave_comparison_groups', { p_athlete_id: field(formData, 'athleteId') }, 'Removed from comparison groups.', PATHS);
}
