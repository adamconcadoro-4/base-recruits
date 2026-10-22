import type { Metadata } from 'next';

import { ContentSection, DraftNotice, PageIntro } from '@/components/site/page-intro';

export const metadata: Metadata = { title: 'Accessibility' };

export default function AccessibilityPage() {
  return (
    <>
      <PageIntro title="Accessibility">Base Recruits should work for everyone, on any device.</PageIntro>
      <DraftNotice />
      <ContentSection title="Our target">
        <p>
          We design and test against the Web Content Accessibility Guidelines (WCAG) 2.2 at level AA. Automated
          accessibility checks run on key pages at desktop and phone sizes every time the code changes.
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
          A dedicated support address will be published before launch. Until then, please tell the Base Recruits team
          through the contact you were given.
        </p>
      </ContentSection>
    </>
  );
}
