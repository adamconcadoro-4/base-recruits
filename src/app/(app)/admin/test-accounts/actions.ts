'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { requireAccess } from '@/lib/auth/guard';
import { ROLE_HOME_PATHS } from '@/lib/auth/roles';
import { userMessageForDatabaseError } from '@/lib/db/errors';
import { failure, field, success, withDiagnostics, type ActionState } from '@/lib/forms/action-state';
import { createTestFamily, openTestAccount } from '@/lib/test-accounts/server';

const NOT_CONFIGURED = 'Test accounts need the server key (SUPABASE_SECRET_KEY) in the deployment settings.';

export async function createTestFamilyAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const account = await requireAccess('/admin/test-accounts');
  const age = field(formData, 'age');
  if (age !== 'adult' && age !== 'under_18') return failure('Choose the test player’s age.', { age: 'Choose an age.' });
  const result = await createTestFamily(account.userId ?? '', {
    under18: age === 'under_18',
    withParent: field(formData, 'with_parent') === 'on',
  });
  if (!result.ok) {
    if (result.reason === 'not_configured') return failure(NOT_CONFIGURED);
    if (result.reason === 'auth_failed') {
      return failure(withDiagnostics('The test account couldn’t be created. Please try again.', result.error ?? null));
    }
    return failure(userMessageForDatabaseError(result.error ?? {}));
  }
  revalidatePath('/admin/test-accounts');
  return success(`Test family ${result.familyNumber} is ready. Use the buttons below to open it.`);
}

export async function openTestAccountAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  await requireAccess('/admin/test-accounts');
  const kind = field(formData, 'kind');
  const result = await openTestAccount(field(formData, 'userId'));
  if (!result.ok) {
    if (result.reason === 'not_configured') return failure(NOT_CONFIGURED);
    if (result.reason === 'not_allowed') return failure(userMessageForDatabaseError(result.error ?? {}));
    return failure(withDiagnostics('Couldn’t sign in to the test account. Please try again.', result.error ?? null));
  }
  redirect(kind === 'parent' ? ROLE_HOME_PATHS.parent : ROLE_HOME_PATHS.athlete);
}
