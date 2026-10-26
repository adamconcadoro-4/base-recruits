import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Suspense, type ReactNode } from 'react';

import { AssessmentNav } from '@/components/assessment/assessment-nav';
import { Notice } from '@/components/ui/notice';
import { assessmentSiteEnabled } from '@/config/assessment';
import { getSwitches } from '@/lib/assessment/server/queries';
import { requireAccess } from '@/lib/auth/guard';

export const metadata: Metadata = { title: { template: '%s · Assessment | Base Recruits', default: 'Assessment' } };

export default async function AssessmentLayout({ children }: { readonly children: ReactNode }) {
  if (!assessmentSiteEnabled()) notFound();
  const account = await requireAccess('/assessment');
  const switches = await getSwitches();
  const isAdmin = account.roles.includes('admin');

  return (
    <div className="space-y-8">
      <div className="space-y-4 print:hidden">
        <p className="text-sm font-semibold tracking-wide text-royal-ink uppercase">Base Recruits Assessment</p>
        <Suspense fallback={null}>
          <AssessmentNav />
        </Suspense>
      </div>
      {switches === null ? (
        <Notice tone="error" title="Assessment didn’t load">
          Refresh the page to try again.
        </Notice>
      ) : !switches.enabled ? (
        <Notice tone="attention" title="Assessment isn’t open yet">
          {isAdmin ? (
            <>
              It is switched off in the database. An administrator can switch it on from the{' '}
              <a href="/admin#assessment" className="font-semibold text-royal-ink underline">
                admin page
              </a>
              .
            </>
          ) : (
            'We’re finishing it. Nothing can be recorded until it opens.'
          )}
        </Notice>
      ) : (
        children
      )}
    </div>
  );
}
