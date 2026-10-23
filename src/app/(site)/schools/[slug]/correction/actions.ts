'use server';

import { failure, field, success, withDiagnostics, type ActionState } from '@/lib/forms/action-state';
import { SLUG_PATTERN } from '@/lib/registry/search-params';
import { createClient } from '@/lib/supabase/server';

import { CORRECTION_TOPICS } from './topics';

export async function submitCorrectionAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const slug = field(formData, 'school').toLowerCase();
  const topic = field(formData, 'topic');
  const details = field(formData, 'details');
  const evidence = field(formData, 'evidence');
  const errors: Record<string, string> = {};
  if (!(topic in CORRECTION_TOPICS)) errors.topic = 'Choose what the report is about.';
  if (details.length < 10) errors.details = 'Describe the problem in at least 10 characters.';
  if (details.length > 2000) errors.details = 'Use 2,000 characters or fewer.';
  if (evidence && !/^https?:\/\/\S+$/i.test(evidence)) errors.evidence = 'Enter a full web address starting with https://, or leave this empty.';
  if (Object.keys(errors).length > 0) return failure('Check the highlighted fields.', errors);
  if (!SLUG_PATTERN.test(slug)) return failure('That school could not be found.');

  const supabase = await createClient();
  const { error } = await supabase.rpc('submit_correction_report', {
    p_slug: slug,
    p_topic: topic,
    p_details: details,
    p_evidence_url: evidence || null,
  });
  if (error) {
    if (error.code === 'BR001') return failure('Please sign in again to send a report.');
    if (error.code === 'BR005') return failure('You’ve sent the most reports allowed for today. Try again tomorrow.');
    if (error.code === 'BR003') return failure(withDiagnostics('Check the details and try again.', error));
    return failure(withDiagnostics('We couldn’t send your report. Please try again.', error));
  }
  return success('Thanks. Your report is in the review queue. Nothing on the page changes until a reviewer checks an official source.');
}
