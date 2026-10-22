import { redirect } from 'next/navigation';

import { requireAccess } from '@/lib/auth/guard';
import { homePathFor } from '@/lib/auth/roles';

/** Sends each account to its home: onboarding first, then its role's dashboard. */
export default async function DashboardPage() {
  const account = await requireAccess('/dashboard');
  redirect(homePathFor(account.roles, account.profile?.primary_role ?? null));
}
