import type { ReactNode } from 'react';

import { requireAccess } from '@/lib/auth/guard';

export default async function AdminLayout({ children }: { readonly children: ReactNode }) {
  await requireAccess('/admin');
  return children;
}
