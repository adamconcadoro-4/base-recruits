'use server';

import { revalidatePath } from 'next/cache';

import { COACH_REVIEW_DECISIONS, DECISIONS_REQUIRING_NOTE, type CoachReviewDecision } from '@/lib/auth/coach-verification';
import { userMessageForDatabaseError } from '@/lib/db/errors';
import { failure, field, success, type ActionState } from '@/lib/forms/action-state';
import { createClient } from '@/lib/supabase/server';

function isDecision(value: string): value is CoachReviewDecision {
  return (COACH_REVIEW_DECISIONS as readonly string[]).includes(value);
}

export async function reviewCoachAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const coachId = field(formData, 'coachId');
  const decision = field(formData, 'decision');
  const note = field(formData, 'note');
  if (!isDecision(decision)) return failure('Choose a decision.', { decision: 'Choose a decision.' });
  if (DECISIONS_REQUIRING_NOTE.has(decision) && !note) {
    return failure('Add a note for the coach explaining this decision.', { note: 'A note is required for this decision.' });
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc('admin_review_coach', {
    p_coach_id: coachId,
    p_decision: decision,
    p_note: note || null,
  });
  if (error) return failure(userMessageForDatabaseError(error));
  revalidatePath('/admin');
  return success('Decision saved.');
}

/**
 * The database switches for Assessment. The site switch
 * (NEXT_PUBLIC_ASSESSMENT_ENABLED) must also be on for anyone to see it;
 * video uploads stay off until the legal review of minors' video is done.
 */
export async function setAssessmentSwitchesAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const supabase = await createClient();
  const enabled = field(formData, 'enabled') === 'on';
  const videoEnabled = enabled && field(formData, 'video_enabled') === 'on';
  const { error } = await supabase.rpc('admin_set_assessment_switches', { p_enabled: enabled, p_video_enabled: videoEnabled });
  if (error) return failure(userMessageForDatabaseError(error));
  revalidatePath('/admin');
  revalidatePath('/assessment', 'layout');
  return success(
    enabled ? `Assessment is on. Video uploads are ${videoEnabled ? 'on' : 'off'}.` : 'Assessment is off. Nothing can be recorded.',
  );
}
