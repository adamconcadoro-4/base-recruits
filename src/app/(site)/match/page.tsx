import type { Metadata } from 'next';

import { ContentSection, PageIntro } from '@/components/site/page-intro';
import { Notice } from '@/components/ui/notice';

export const metadata: Metadata = { title: 'Academic matches' };

export default function MatchPage() {
  return (
    <>
      <PageIntro title="Find your academic matches">
        Enter your grades and test scores and see how you compare with each baseball school&apos;s published academic
        ranges. Free, unlimited, and no account needed.
      </PageIntro>
      <div className="mx-auto max-w-6xl px-4 pt-10 sm:px-6">
        <Notice tone="info" title="Matching opens with the school registry">
          Matches are only useful against real, sourced school data. The matcher goes live as soon as the national
          program registry is published.
        </Notice>
      </div>
      <ContentSection title="How matches will work">
        <ul>
          <li>Your GPA is compared only with data on the same scale. Weighted and unweighted GPAs are never mixed.</li>
          <li>Test-optional schools don&apos;t count a missing SAT or ACT against you, and test-blind schools never use one.</li>
          <li>Scoring below a school&apos;s middle 50% range is shown as a reach, not as a requirement you fail.</li>
          <li>Only a published, verified minimum counts as a requirement, and we cite it with its academic year.</li>
          <li>If a school doesn&apos;t report a number, the result says “Not publicly reported”.</li>
        </ul>
      </ContentSection>
      <ContentSection title="What a match is not" tone="ice">
        <p>
          A match is an estimate from public information. It is not an admission decision, a prediction of your chances,
          or a promise of a roster spot or scholarship.
        </p>
      </ContentSection>
    </>
  );
}
