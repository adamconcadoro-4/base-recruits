import type { Metadata } from 'next';

import { ContentSection, PageIntro } from '@/components/site/page-intro';
import { ButtonLink } from '@/components/ui/button';
import { Notice } from '@/components/ui/notice';
import { FEATURES } from '@/config/availability';

export const metadata: Metadata = {
  title: 'For transfer players',
  description:
    'Transfer players can browse college baseball programs now. Transfer admission, credit and eligibility are separate questions answered by each school and association.',
  alternates: { canonical: '/transfers' },
};

export default function TransfersPage() {
  return (
    <>
      <PageIntro title="For transfer players">
        Browse two-year and four-year baseball programs now. Transfer-specific comparisons come later.
      </PageIntro>
      <div className="mx-auto max-w-6xl px-4 pt-10 sm:px-6">
        <Notice tone="info" title="What works for transfers today">
          {FEATURES.transfer_comparison.now} The admissions figures on school pages describe first-year students, not
          transfer applicants, so don&apos;t use them to judge a transfer application.
        </Notice>
      </div>
      <ContentSection title="Three separate questions">
        <p>Transferring means answering three questions, and we keep them apart:</p>
        <ul>
          <li>Will the school admit you as a transfer student?</li>
          <li>Which of your credits will it accept?</li>
          <li>Are you athletically eligible to play?</li>
        </ul>
        <p>
          Each school and your athletic association decide these. Ask the school&apos;s transfer admissions office about
          admission and credit, and your association and compliance office about eligibility.
        </p>
        <div className="pt-2">
          <ButtonLink href="/schools">Browse programs</ButtonLink>
        </div>
      </ContentSection>
      <ContentSection title="About the transfer portal" tone="ice">
        <p>
          Base Recruits does not have access to the NCAA Transfer Portal and never claims to. Apply and enter the portal
          through your school&apos;s official process.
        </p>
      </ContentSection>
    </>
  );
}
