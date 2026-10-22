'use server';

import { revalidatePath } from 'next/cache';

import { userMessageForDatabaseError } from '@/lib/db/errors';
import { failure, field, success, withDiagnostics, type ActionState } from '@/lib/forms/action-state';
import { DIVISION_CODES, PROGRAM_STATUSES, VERIFICATIONS } from '@/lib/registry/types';
import { createClient } from '@/lib/supabase/server';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function httpsOrEmpty(value: string): boolean {
  if (!value) return true;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password && value.length <= 500;
  } catch {
    return false;
  }
}

export async function updateProgramAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const institutionId = field(formData, 'institutionId');
  const slug = field(formData, 'slug');
  const status = field(formData, 'status');
  const [association, division] = field(formData, 'division').split('|');
  const verification = field(formData, 'verification');
  const values = {
    conference: field(formData, 'conference'),
    athletics: field(formData, 'athleticsUrl'),
    roster: field(formData, 'rosterUrl'),
    questionnaire: field(formData, 'questionnaireUrl'),
    evidence: field(formData, 'evidenceUrl'),
    note: field(formData, 'note'),
  };
  const errors: Record<string, string> = {};
  if (!UUID.test(institutionId)) return failure('That school was not found.');
  if (!(PROGRAM_STATUSES as readonly string[]).includes(status)) errors.status = 'Choose a status.';
  if (!association || !(DIVISION_CODES as readonly string[]).includes(division ?? '')) errors.division = 'Choose a division.';
  if (!(VERIFICATIONS as readonly string[]).includes(verification)) errors.verification = 'Choose how this was confirmed.';
  for (const [key, name] of [['athletics', 'athleticsUrl'], ['roster', 'rosterUrl'], ['questionnaire', 'questionnaireUrl'], ['evidence', 'evidenceUrl']] as const) {
    if (!httpsOrEmpty(values[key])) errors[name] = 'Use a full https:// link.';
  }
  if (values.note.length < 5) errors.note = 'Explain what you checked (at least 5 characters).';
  if (Object.keys(errors).length) return failure('Please fix the highlighted fields.', errors);

  const supabase = await createClient();
  const { error } = await supabase.rpc('admin_update_baseball_program', {
    p_institution_id: institutionId,
    p_status: status,
    p_association_code: association,
    p_division_code: division,
    p_conference: values.conference || null,
    p_athletics_url: values.athletics || null,
    p_roster_url: values.roster || null,
    p_questionnaire_url: values.questionnaire || null,
    p_verification: verification,
    p_verification_source_url: values.evidence || null,
    p_note: values.note,
  });
  if (error) return failure(withDiagnostics(userMessageForDatabaseError(error), error));
  revalidatePath(`/admin/schools/${slug}`);
  revalidatePath(`/schools/${slug}`);
  revalidatePath('/schools');
  return success('Program updated. The change and your note are in the revision log.');
}

export async function setListingAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const institutionId = field(formData, 'institutionId');
  const slug = field(formData, 'slug');
  const listed = field(formData, 'listed') === 'true';
  const reason = field(formData, 'reason');
  if (!UUID.test(institutionId)) return failure('That school was not found.');
  if (reason.length < 3) return failure('Give a reason.', { reason: 'At least 3 characters.' });
  const supabase = await createClient();
  const { error } = await supabase.rpc('admin_set_institution_listing', {
    p_institution_id: institutionId,
    p_listed: listed,
    p_reason: reason,
  });
  if (error) return failure(withDiagnostics(userMessageForDatabaseError(error), error));
  revalidatePath(`/admin/schools/${slug}`);
  revalidatePath(`/schools/${slug}`);
  revalidatePath('/schools');
  return success(listed ? 'Listed again on public pages.' : 'Hidden from public pages.');
}
