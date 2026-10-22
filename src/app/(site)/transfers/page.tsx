import type { Metadata } from 'next';

import { ContentSection, PageIntro } from '@/components/site/page-intro';

export const metadata: Metadata = { title: 'For transfer athletes' };

export default function TransfersPage() {
  return (
    <>
      <PageIntro title="For transfer athletes">
        Explore two-year and four-year options using transfer admission rules, not first-year requirements.
      </PageIntro>
      <ContentSection title="Three separate questions">
        <p>Transferring means answering three questions, and we keep them apart:</p>
        <ul>
          <li>Will the school admit you as a transfer student?</li>
          <li>Which of your credits will it accept?</li>
          <li>Are you athletically eligible to play?</li>
        </ul>
        <p>
          We show each school&apos;s published transfer policies with their source. Credit and eligibility decisions
          belong to the school and your athletic association.
        </p>
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
