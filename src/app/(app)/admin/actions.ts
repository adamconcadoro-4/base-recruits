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

/**
 * SeamState swing analysis: the switch, the per-person daily and monthly limits
 * and the site-wide monthly limit (each analysis is a paid AI request).
 */
export async function setSeamstateSettingsAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const enabled = field(formData, 'seamstate_enabled') === 'on';
  const minors = field(formData, 'minors_enabled') === 'on';
  const daily = Number(field(formData, 'daily_limit'));
  const personMonthly = Number(field(formData, 'person_monthly_limit'));
  const monthly = Number(field(formData, 'monthly_limit'));
  if (!Number.isInteger(daily) || daily < 0 || daily > 100) return failure('The daily limit per person is a whole number from 0 to 100.', { daily_limit: 'Enter 0 to 100.' });
  if (!Number.isInteger(personMonthly) || personMonthly < 0 || personMonthly > 100) {
    return failure('The monthly limit per person is a whole number from 0 to 100.', { person_monthly_limit: 'Enter 0 to 100.' });
  }
  if (!Number.isInteger(monthly) || monthly < 0 || monthly > 100000) {
    return failure('The monthly limit is a whole number from 0 to 100,000.', { monthly_limit: 'Enter 0 to 100,000.' });
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc('admin_set_seamstate_settings', {
    p_enabled: enabled,
    p_daily_limit: daily,
    p_monthly_limit: monthly,
    p_minors_enabled: minors,
    p_person_monthly_limit: personMonthly,
  });
  if (error) return failure(userMessageForDatabaseError(error));
  revalidatePath('/admin');
  revalidatePath('/assessment', 'layout');
  return success(
    enabled
      ? `SeamState is on: up to ${daily} a day and ${personMonthly} a month per person and ${monthly} a month in total, ${minors ? 'including' : 'not including'} athletes under 18.`
      : 'SeamState is off. No new analyses can be requested.',
  );
}
