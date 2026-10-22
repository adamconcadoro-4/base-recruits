'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { userMessageForDatabaseError } from '@/lib/db/errors';
import { failure, field, success, type ActionState } from '@/lib/forms/action-state';
import { createClient } from '@/lib/supabase/server';

const affiliationSchema = z.object({
  institutionName: z.string().min(2, 'Enter your school’s name.').max(200, 'Use 200 characters or fewer.'),
  coachingTitle: z.string().min(2, 'Enter your title, for example Assistant Baseball Coach.').max(120),
  staffDirectoryUrl: z
    .string()
    .max(500, 'Use a shorter link.')
    .regex(/^https:\/\/\S+$/i, 'Enter the full https:// link to the official staff page.'),
  note: z.string().max(2000, 'Use 2,000 characters or fewer.'),
});

export async function submitAffiliationAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = affiliationSchema.safeParse({
    institutionName: field(formData, 'institutionName'),
    coachingTitle: field(formData, 'coachingTitle'),
    staffDirectoryUrl: field(formData, 'staffDirectoryUrl'),
    note: field(formData, 'note'),
  });
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? 'form');
      fieldErrors[key] ??= issue.message;
    }
    return failure('Check the highlighted fields.', fieldErrors);
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc('submit_coach_affiliation', {
    p_institution_name: parsed.data.institutionName,
    p_coaching_title: parsed.data.coachingTitle,
    p_staff_directory_url: parsed.data.staffDirectoryUrl,
    p_note: parsed.data.note || null,
  });
  if (error) return failure(userMessageForDatabaseError(error));
  revalidatePath('/coach');
  revalidatePath('/coach/verification');
  return success('Sent for review. We’ll update your status here.');
}
