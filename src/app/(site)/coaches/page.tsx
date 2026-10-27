import type { Metadata } from 'next';

import { ContentSection, PageIntro } from '@/components/site/page-intro';
import { ButtonLink } from '@/components/ui/button';

export const metadata: Metadata = {
  title: 'For college coaches',
  description:
    'How Base Recruits verifies college baseball coaches, and what verified coaches will be able to do. Verification is open now and free.',
  alternates: { canonical: '/coaches' },
};

export default function CoachesPage() {
  return (
    <>
      <PageIntro title="For college coaches">
        A verified coach is a college baseball coach whose current role a Base Recruits reviewer has confirmed on the
        school&apos;s official athletics staff page. Verification is tied to the work email we approved and lasts one
        year. You can apply now.
      </PageIntro>
      <ContentSection title="How verification works">
        <ol className="list-decimal space-y-2 pl-5">
          <li>
            Create a College coach account with the email address your school gave you, and confirm it with the 6-digit
            code we send.
          </li>
          <li>Send us the link to the staff page on your athletics website that lists you in a baseball role.</li>
          <li>
            A Base Recruits reviewer checks that page by hand. If it confirms your role, you&apos;re verified for one year.
            If we need more, we&apos;ll tell you what in your account.
          </li>
        </ol>
        <p>
          A <span className="font-semibold">.edu</span> email address alone doesn&apos;t verify you. Verification ends if
          your account email changes or the year runs out. You can then reapply with your current staff page.
        </p>
        <div className="pt-2">
          <ButtonLink href="/signup">Create a coach account</ButtonLink>
        </div>
      </ContentSection>
      <ContentSection title="What verified coaches will be able to do" tone="ice">
        <ul>
          <li>Search players who chose to be visible to verified coaches</li>
          <li>Review the academic and athletic information players shared, each item labeled as self-reported or checked</li>
          <li>Save players to private recruiting boards</li>
          <li>Message athletes who allow it, within recruiting-contact rules</li>
        </ul>
        <p>
          None of these are open yet. They&apos;ll open when player recruiting profiles do.
        </p>
      </ContentSection>
    </>
  );
}
