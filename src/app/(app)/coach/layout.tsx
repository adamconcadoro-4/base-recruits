import type { ReactNode } from 'react';

import { requireAccess } from '@/lib/auth/guard';

export default async function CoachLayout({ children }: { readonly children: ReactNode }) {
  await requireAccess('/coach');
  return children;
}
