import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense, type ReactNode } from 'react';

import { ZoneNav } from '@/components/assessment/zones/zone-nav';

export const metadata: Metadata = { title: { template: '%s · 9-Zone Hitting · Assessment | Base Recruits', default: '9-Zone Hitting' } };

/** 9-Zone Hitting lives inside Assessment → Hitting and shares its athletes, permissions and switches. */
export default function ZoneLayout({ children }: { readonly children: ReactNode }) {
  return (
    <div className="space-y-8">
      <div className="space-y-3 print:hidden">
        <p className="text-sm text-slate">
          <Link href="/assessment/hitting" className="font-semibold text-royal-ink underline">
            Hitting
          </Link>{' '}
          › 9-Zone Hitting
        </p>
        <Suspense fallback={null}>
          <ZoneNav />
        </Suspense>
      </div>
      {children}
    </div>
  );
}
