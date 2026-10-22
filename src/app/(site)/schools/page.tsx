import type { Metadata } from 'next';

import { ContentSection, PageIntro } from '@/components/site/page-intro';
import { Notice } from '@/components/ui/notice';

export const metadata: Metadata = { title: 'Search college baseball schools' };

export default function SchoolsPage() {
  return (
    <>
      <PageIntro title="National baseball school explorer">
        Search every college that fields a baseball team, across NCAA Division I, II and III, NAIA and junior colleges.
        Free, with no account.
      </PageIntro>
      <div className="mx-auto max-w-6xl px-4 pt-10 sm:px-6">
        <Notice tone="info" title="The registry isn’t published yet">
          We&apos;re building it from official sources and reviewing each baseball program before it appears. Until then
          there are no school records to search, and we won&apos;t show made-up ones.
        </Notice>
      </div>
      <ContentSection title="What you’ll be able to filter by">
        <ul>
          <li>Division and association: NCAA Division I, II and III, NAIA, and junior colleges</li>
          <li>State and region</li>
          <li>Academic ranges, test policy and majors offered</li>
          <li>Published cost of attendance</li>
          <li>Two-year and four-year schools, for transfer athletes</li>
        </ul>
      </ContentSection>
      <ContentSection title="Where the data comes from" tone="ice">
        <p>
          Institution facts come from the U.S. Department of Education&apos;s College Scorecard and IPEDS, schools&apos;
          own Common Data Set reports, and athletic association directories. Each figure carries its source, the year it
          describes and when we last checked it. See the <a href="/data-methodology">data methodology</a>.
        </p>
      </ContentSection>
    </>
  );
}
