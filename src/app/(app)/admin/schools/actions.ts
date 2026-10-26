'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { userMessageForDatabaseError } from '@/lib/db/errors';
import { failure, field, success, withDiagnostics, type ActionState } from '@/lib/forms/action-state';
import { parseAddSchool } from '@/lib/registry/add-school';
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

/** Adds a school the federal athletics report leaves out, then opens its admin page. */
export async function addSchoolAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = parseAddSchool((name) => field(formData, name));
  if (!parsed.ok) return failure('Please fix the highlighted fields.', { ...parsed.errors });
  const v = parsed.value;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('admin_add_baseball_program', {
    p_unitid: v.unitid,
    p_name: v.name,
    p_city: v.city,
    p_state: v.state,
    p_website_url: v.websiteUrl,
    p_control: v.control,
    p_level: v.level,
    p_season: v.season,
    p_association_code: v.association,
    p_division_code: v.division,
    p_conference: v.conference,
    p_athletics_url: v.athleticsUrl,
    p_verification: v.verification,
    p_verification_source_url: v.evidenceUrl,
    p_note: v.note,
  });
  if (error) return failure(withDiagnostics(userMessageForDatabaseError(error), error));
  if (typeof data !== 'string') return failure('The school was not added. Try again.');
  revalidatePath('/schools');
  redirect(`/admin/schools/${data}?added=1`);
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

const TEST_POLICY_VALUES = ['required', 'considered_not_required', 'not_considered'] as const;
const APPLICANT_VALUES = ['first_year', 'transfer'] as const;

/** Records a testing policy checked against the school's official admissions page. */
export async function setAdmissionsPolicyAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const institutionId = field(formData, 'institutionId');
  const slug = field(formData, 'slug');
  const applicantType = field(formData, 'applicantType');
  const entryYear = Number(field(formData, 'entryYear'));
  const testPolicy = field(formData, 'testPolicy');
  const exceptions = field(formData, 'exceptions');
  const sourceUrl = field(formData, 'sourceUrl');
  const sourceTitle = field(formData, 'sourceTitle');
  const note = field(formData, 'note');
  const thisYear = new Date().getUTCFullYear();
  const errors: Record<string, string> = {};
  if (!UUID.test(institutionId)) return failure('That school was not found.');
  if (!(APPLICANT_VALUES as readonly string[]).includes(applicantType)) errors.applicantType = 'Choose first-year or transfer.';
  if (!Number.isInteger(entryYear) || entryYear < thisYear - 1 || entryYear > thisYear + 3) {
    errors.entryYear = `Choose an entry year from ${thisYear - 1} to ${thisYear + 3}.`;
  }
  if (!(TEST_POLICY_VALUES as readonly string[]).includes(testPolicy)) errors.testPolicy = 'Choose the policy.';
  if (!sourceUrl || !httpsOrEmpty(sourceUrl)) errors.sourceUrl = 'Link the official admissions page (https://).';
  if (exceptions && exceptions.length < 3) errors.exceptions = 'Describe the exceptions or leave this empty.';
  if (note.length < 5) errors.note = 'Say what you checked (at least 5 characters).';
  if (Object.keys(errors).length) return failure('Please fix the highlighted fields.', errors);

  const supabase = await createClient();
  const { error } = await supabase.rpc('admin_set_admissions_policy', {
    p_institution_id: institutionId,
    p_applicant_type: applicantType,
    p_entry_year: entryYear,
    p_test_policy: testPolicy,
    p_exceptions: exceptions || null,
    p_source_url: sourceUrl,
    p_source_title: sourceTitle || null,
    p_note: note,
  });
  if (error) return failure(withDiagnostics(userMessageForDatabaseError(error), error));
  revalidatePath(`/admin/schools/${slug}`);
  revalidatePath(`/schools/${slug}`);
  revalidatePath('/schools');
  return success('Policy recorded. Any earlier policy for the same applicants and year is kept in the history.');
}

/** Closes a correction report (resolved after checking an official source, or dismissed). */
export async function resolveCorrectionAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const reportId = field(formData, 'reportId');
  const status = field(formData, 'status');
  const note = field(formData, 'note');
  if (!UUID.test(reportId)) return failure('That report was not found.');
  if (status !== 'resolved' && status !== 'dismissed') return failure('Choose resolved or dismissed.');
  if (note.length < 3) return failure('Add a short note on what you did.', { note: 'At least 3 characters.' });
  const supabase = await createClient();
  const { error } = await supabase.rpc('admin_resolve_correction_report', {
    p_report_id: reportId,
    p_status: status,
    p_note: note,
  });
  if (error) return failure(withDiagnostics(userMessageForDatabaseError(error), error));
  revalidatePath('/admin/corrections');
  return success(status === 'resolved' ? 'Marked resolved.' : 'Dismissed.');
}
