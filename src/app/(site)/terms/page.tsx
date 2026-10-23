import type { Metadata } from 'next';

import { ContentSection, DraftNotice, PageIntro } from '@/components/site/page-intro';

export const metadata: Metadata = {
  title: 'Terms of use',
  description: 'The basic rules for using Base Recruits.',
  alternates: { canonical: '/terms' },
};

export default function TermsPage() {
  return (
    <>
      <PageIntro title="Terms of use">The basic rules for using Base Recruits.</PageIntro>
      <DraftNotice />
      <ContentSection title="What Base Recruits is">
        <p>
          A free tool for exploring college baseball programs and academic fit, and for sharing a recruiting profile with
          verified college coaches when you choose to. Matches are estimates from public information.
        </p>
      </ContentSection>
      <ContentSection title="What Base Recruits is not" tone="ice">
        <ul>
          <li>It does not guarantee admission, transfer eligibility, scholarships, roster spots or coach offers.</li>
          <li>It is not affiliated with the NCAA, NAIA, NJCAA or any college.</li>
          <li>It does not have access to the NCAA Transfer Portal.</li>
        </ul>
      </ContentSection>
      <ContentSection title="Your responsibilities">
        <ul>
          <li>Give accurate information. Self-reported details are always labelled as self-reported.</li>
          <li>Use one account per person and keep your password private.</li>
          <li>Coaches must follow their association&apos;s recruiting-contact rules.</li>
        </ul>
      </ContentSection>
    </>
  );
}
