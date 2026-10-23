import type { Metadata } from 'next';

import { ContentSection, PageIntro } from '@/components/site/page-intro';
import { ButtonLink } from '@/components/ui/button';

export const metadata: Metadata = {
  title: 'For college coaches',
  description:
    'College baseball coaches can apply for free verification now. Athlete search, private boards and messaging open later and stay free.',
  alternates: { canonical: '/coaches' },
};

export default function CoachesPage() {
  return (
    <>
      <PageIntro title="Free for verified college coaches">
        Apply for verification now. Searching athletes who choose to be found, private recruiting boards and messaging
        open later. No subscription, now or later.
      </PageIntro>
      <ContentSection title="How verification works">
        <ol className="list-decimal space-y-2 pl-5">
          <li>Create a coach account with your institutional email and confirm it.</li>
          <li>Send us your program&apos;s official staff directory page that lists you in a baseball role.</li>
          <li>A Base Recruits reviewer checks it. Once approved, you&apos;re verified for a year.</li>
        </ol>
        <p>
          A <span className="font-semibold">.edu</span> email on its own never unlocks coach tools. Access ends if your
          email changes or your verification expires, until you&apos;re re-verified.
        </p>
        <div className="pt-2">
          <ButtonLink href="/signup">Create a coach account</ButtonLink>
        </div>
      </ContentSection>
      <ContentSection title="What verified coaches will be able to do" tone="ice">
        <ul>
          <li>Search athletes who turned on coach visibility</li>
          <li>Review the academic and athletic information they shared, labelled self-reported or verified</li>
          <li>Save athletes to private recruiting boards</li>
          <li>Message athletes who allow it, within recruiting-contact rules</li>
        </ul>
        <p>
          None of these are open yet. They open with recruiting profiles, and the core tools will stay free for verified
          coaches.
        </p>
      </ContentSection>
    </>
  );
}
