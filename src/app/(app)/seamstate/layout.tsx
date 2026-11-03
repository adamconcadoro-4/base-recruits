import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';

import { assessmentSiteEnabled } from '@/config/assessment';
import { requireAccess } from '@/lib/auth/guard';

export const metadata: Metadata = { title: { template: '%s · SeamState | Base Recruits', default: 'SeamState' } };

/**
 * SeamState: AI swing reports from one uploaded clip. Separate from Assessment
 * (founder, 2026-11-03), though it runs on the same video uploads and switches.
 */
export default async function SeamstateLayout({ children }: { readonly children: ReactNode }) {
  if (!assessmentSiteEnabled()) notFound();
  await requireAccess('/seamstate');
  return <div className="space-y-8">{children}</div>;
}
