import type { Metadata } from 'next';

import { ContentSection, PageIntro } from '@/components/site/page-intro';

export const metadata: Metadata = { title: 'Recruiting resources' };

export default function ResourcesPage() {
  return (
    <>
      <PageIntro title="Recruiting and college readiness">
        Plain guidance on the questions families ask most, with links to the official sources.
      </PageIntro>
      <ContentSection title="Official places to start">
        <ul>
          <li>
            <a href="https://www.ncaa.org/eligibility-center/" rel="noopener noreferrer">
              NCAA Eligibility Center
            </a>{' '}
            for NCAA academic eligibility and registration
          </li>
          <li>
            <a href="https://www.playnaia.org/" rel="noopener noreferrer">
              PlayNAIA
            </a>{' '}
            for NAIA eligibility
          </li>
          <li>
            <a href="https://www.njcaa.org/" rel="noopener noreferrer">
              NJCAA
            </a>{' '}
            for junior college athletics
          </li>
          <li>
            <a href="https://collegescorecard.ed.gov/" rel="noopener noreferrer">
              College Scorecard
            </a>{' '}
            for cost, graduation and earnings data from the U.S. Department of Education
          </li>
        </ul>
      </ContentSection>
      <ContentSection title="Good habits" tone="ice">
        <ul>
          <li>Keep academics first: grades and course choices open more doors than any single showcase.</li>
          <li>Use each school&apos;s official recruiting questionnaire and staff contacts.</li>
          <li>Be wary of anyone who promises a scholarship, roster spot or admission for a fee.</li>
        </ul>
      </ContentSection>
    </>
  );
}
