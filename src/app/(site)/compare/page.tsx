import type { Metadata } from 'next';

import { ContentSection, PageIntro } from '@/components/site/page-intro';
import { Notice } from '@/components/ui/notice';

export const metadata: Metadata = { title: 'Compare schools' };

export default function ComparePage() {
  return (
    <>
      <PageIntro title="Compare schools side by side">
        Put up to five schools next to each other: division, location, academic ranges, testing policy and published
        cost. Free, with no account.
      </PageIntro>
      <div className="mx-auto max-w-6xl px-4 pt-10 sm:px-6">
        <Notice tone="info" title="Nothing to compare yet">
          Comparisons open with the national program registry. You&apos;ll be able to add schools from search results or
          your shortlist.
        </Notice>
      </div>
      <ContentSection title="Your shortlist stays yours">
        <p>
          Save as many schools as you like. Without an account, your shortlist stays on this device. With a free
          account, it&apos;s saved for good and never removed if you later stop a paid plan.
        </p>
      </ContentSection>
    </>
  );
}
