import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { ReportView } from '@/components/assessment/report-view';
import { PageIntro } from '@/components/site/page-intro';
import { ButtonLink } from '@/components/ui/button';
import { assessmentSiteEnabled } from '@/config/assessment';
import { SAMPLE_REPORT } from '@/lib/assessment/sample';

export const metadata: Metadata = {
  title: 'Sample assessment report',
  description: 'A fictional Base Recruits hitting assessment report showing how evidence, scoring and limitations are presented.',
  alternates: { canonical: '/player-assessment/sample' },
};

export default function SampleReportPage() {
  if (!assessmentSiteEnabled()) notFound();
  return (
    <>
      <PageIntro title="Sample report">
        A fictional athlete, made up to show how a report is laid out. None of these numbers are real or a benchmark.
        <div className="mt-6">
          <ButtonLink href="/player-assessment" variant="secondary">
            Back to Player assessment
          </ButtonLink>
        </div>
      </PageIntro>
      <section className="bg-white">
        <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
          <ReportView snapshot={SAMPLE_REPORT} />
        </div>
      </section>
    </>
  );
}
