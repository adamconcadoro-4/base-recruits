import type { ReactNode } from 'react';

import { requireAccess } from '@/lib/auth/guard';

/** Verified coaches only. Unverified coaches are sent to /coach/verification. */
export default async function CoachAthletesLayout({ children }: { readonly children: ReactNode }) {
  await requireAccess('/coach/athletes');
  return children;
}
