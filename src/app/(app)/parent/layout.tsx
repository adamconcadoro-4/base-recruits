import type { ReactNode } from 'react';

import { requireAccess } from '@/lib/auth/guard';

export default async function ParentLayout({ children }: { readonly children: ReactNode }) {
  await requireAccess('/parent');
  return children;
}
