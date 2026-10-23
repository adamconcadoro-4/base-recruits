import type { Metadata } from 'next';

import { ContentSection, DraftNotice, PageIntro } from '@/components/site/page-intro';

export const metadata: Metadata = {
  title: 'Accessibility',
  description: 'The accessibility target Base Recruits designs and tests against, and how to report a problem.',
  alternates: { canonical: '/accessibility' },
};

export default function AccessibilityPage() {
  return (
    <>
      <PageIntro title="Accessibility">Base Recruits should work for everyone, on any device.</PageIntro>
      <DraftNotice />
      <ContentSection title="Our target">
        <p>
          We design and test against the Web Content Accessibility Guidelines (WCAG) 2.2 at level AA. Automated checks
          (axe) run on key pages at desktop and phone sizes on every proposed code change, alongside keyboard tests.
          Automated checks catch only some problems, so this is a target we test toward, not a claim of full
          conformance.
        </p>
      </ContentSection>
      <ContentSection title="What that means in practice" tone="ice">
        <ul>
          <li>Every page works with a keyboard, with a visible focus outline.</li>
          <li>Text and controls meet colour-contrast requirements.</li>
          <li>Forms have labels and explain errors in words.</li>
          <li>Motion is kept to a minimum and respects reduced-motion settings.</li>
        </ul>
      </ContentSection>
      <ContentSection title="Report a problem">
        <p>
          A support email address will be published before launch. Until then, see{' '}
          <a href="/support">help and corrections</a>.
        </p>
      </ContentSection>
    </>
  );
}
