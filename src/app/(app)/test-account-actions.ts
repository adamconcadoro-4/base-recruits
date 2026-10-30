'use server';

import { redirect } from 'next/navigation';

import { returnToAdminAccount } from '@/lib/test-accounts/server';

/** "Back to my admin account" on the test-account banner. */
export async function returnToAdminAction(): Promise<void> {
  const restored = await returnToAdminAccount();
  redirect(restored ? '/admin/test-accounts' : '/login?next=%2Fadmin%2Ftest-accounts');
}
