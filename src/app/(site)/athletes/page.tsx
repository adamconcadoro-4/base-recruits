import type { Metadata } from 'next';

import { ContentSection, PageIntro } from '@/components/site/page-intro';
import { ButtonLink } from '@/components/ui/button';

export const metadata: Metadata = { title: 'For high school athletes' };

export default function AthletesPage() {
  return (
    <>
      <PageIntro title="For high school athletes">
        Find colleges with baseball, see where you stand academically, and build a list you can act on.
      </PageIntro>
      <ContentSection title="Free for good">
        <ul>
          <li>Search every college baseball program and see its sources.</li>
          <li>Run as many academic matches as you want.</li>
          <li>Compare schools and save an unlimited shortlist.</li>
          <li>Create a basic recruiting profile and choose whether verified coaches can find you.</li>
        </ul>
        <div className="pt-2">
          <ButtonLink href="/signup">Create a free account</ButtonLink>
        </div>
      </ContentSection>
      <ContentSection title="Your profile, your call" tone="ice">
        <p>
          Nothing you enter is shared until you turn sharing on, and you can turn it off at any time. If you&apos;re under
          18, a parent or guardian you link to your account approves coach visibility with you.
        </p>
      </ContentSection>
    </>
  );
}
