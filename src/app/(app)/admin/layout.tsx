import type { ReactNode } from 'react';

import { AdminCheck } from '@/components/auth/admin-check';
import { requireAccess } from '@/lib/auth/guard';
import { listPasskeys } from '@/lib/auth/passkeys';
import { adminCheckSatisfied, nowInSeconds } from '@/lib/auth/sign-in-methods';
import { createClient } from '@/lib/supabase/server';

export default async function AdminLayout({ children }: { readonly children: ReactNode }) {
  await requireAccess('/admin');
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (adminCheckSatisfied(data?.claims?.amr, nowInSeconds())) return children;

  const listing = await listPasskeys(supabase);
  return <AdminCheck hasPasskey={listing.passkeys.length > 0} passkeysAvailable={listing.available} />;
}
