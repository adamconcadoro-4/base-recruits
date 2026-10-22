import type { Metadata } from 'next';

import { ContentSection, DraftNotice, PageIntro } from '@/components/site/page-intro';

export const metadata: Metadata = { title: 'Data methodology' };

export default function DataMethodologyPage() {
  return (
    <>
      <PageIntro title="Data methodology">Where school information comes from and how we keep it honest.</PageIntro>
      <DraftNotice />
      <ContentSection title="Sources">
        <ul>
          <li>U.S. Department of Education: College Scorecard and IPEDS</li>
          <li>Schools&apos; own Common Data Set reports</li>
          <li>NCAA, NAIA and NJCAA directories, used within each provider&apos;s terms</li>
          <li>Official school athletics and admissions pages</li>
        </ul>
      </ContentSection>
      <ContentSection title="Rules we follow" tone="ice">
        <ul>
          <li>Every figure records its provider, source link, the year it describes and when we retrieved it.</li>
          <li>Missing figures stay missing and are shown as “Not publicly reported”.</li>
          <li>A baseball program is listed as active only after it is confirmed from an official source.</li>
          <li>Different scales are never mixed, such as weighted and unweighted GPAs or old and new SAT scores.</li>
          <li>Past versions are kept, so any earlier match explanation can be checked against the data it used.</li>
        </ul>
      </ContentSection>
      <ContentSection title="Admissions history">
        <p>
          We don&apos;t publish admissions scattergrams or acceptance predictions. They will appear only if real,
          permissioned applicant outcomes exist in large enough numbers to protect privacy, with their sample size and
          source shown. A school&apos;s overall acceptance rate is never presented as your personal chance.
        </p>
      </ContentSection>
    </>
  );
}
