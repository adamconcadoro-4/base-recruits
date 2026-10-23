import type { Metadata } from 'next';

import { MatchTool } from '@/components/matching/match-tool';
import { ContentSection, PageIntro } from '@/components/site/page-intro';
import { Notice } from '@/components/ui/notice';
import { isSignedIn } from '@/lib/auth/session';

export const metadata: Metadata = {
  title: 'Compare your scores',
  description:
    'See how your SAT or ACT scores sit against the ranges colleges with baseball programs reported for a past entering class, and which current testing policies have been checked.',
  alternates: { canonical: '/match' },
};

export default async function MatchPage() {
  const signedIn = await isSignedIn();
  const thisYear = new Date().getUTCFullYear();

  return (
    <>
      <PageIntro title="Compare your scores">
        See how your test scores sit against the ranges schools reported for a past entering class, and whether a
        school&apos;s current testing policy has been checked. Free, and no account needed.
      </PageIntro>
      <div className="mx-auto max-w-6xl space-y-8 px-4 py-10 sm:px-6">
        <noscript>
          <Notice tone="attention" title="This tool needs JavaScript">
            The score comparison runs in your browser so your scores never leave your device. Turn on JavaScript to use
            it, or browse school pages, which show each school&apos;s reported ranges.
          </Notice>
        </noscript>
        <MatchTool signedIn={signedIn} thisYear={thisYear} />
      </div>
      <ContentSection title="How the comparison works">
        <ul>
          <li>
            A testing requirement only counts when we have checked the school&apos;s current policy for your applicant
            type and entry year, and we link the page we checked. Otherwise it says <strong>Unknown</strong>.
          </li>
          <li>
            Score ranges are the middle 50% of a past entering class, as reported to the U.S. Department of Education.
            They are not minimums, and they describe the whole class, not baseball players.
          </li>
          <li>Test-optional schools don&apos;t count a missing score against you, and test-blind schools never use one.</li>
          <li>
            Schools don&apos;t report GPA in the federal data we use, so there is no GPA comparison and no minimum GPA unless
            one has been checked.
          </li>
          <li>Transfer students see policies only: past first-year score ranges don&apos;t apply to transfers.</li>
          <li>Your scores are compared in your browser. They are not sent to Base Recruits, saved, or put in links.</li>
        </ul>
      </ContentSection>
      <ContentSection title="What a comparison is not" tone="ice">
        <p>
          It is not an admission decision, a prediction of your chances, or a promise of a roster spot or scholarship.
          We don&apos;t label schools as safeties or reaches.
        </p>
      </ContentSection>
    </>
  );
}
