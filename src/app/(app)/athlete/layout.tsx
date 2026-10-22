import type { ReactNode } from 'react';

import { requireAccess } from '@/lib/auth/guard';

export default async function AthleteLayout({ children }: { readonly children: ReactNode }) {
  await requireAccess('/athlete');
  return children;
}
