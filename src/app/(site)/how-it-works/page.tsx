import type { Metadata } from 'next';

import { BasePath } from '@/components/site/base-path';
import { ContentSection, PageIntro } from '@/components/site/page-intro';
import { FEATURES, availabilityLabel } from '@/config/availability';

export const metadata: Metadata = {
  title: 'How it works',
  description: 'How Base Recruits sources school data, compares scores with published ranges, and keeps your information private.',
  alternates: { canonical: '/how-it-works' },
};

export default function HowItWorksPage() {
  return (
    <>
      <PageIntro title="How Base Recruits works">
        Real school data with its sources, an honest score comparison, and a shortlist you control.
      </PageIntro>
      <section className="bg-white">
        <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
          <BasePath
            steps={[
              {
                title: 'Search schools',
                body: 'Programs come from the federal athletics report, with each fact’s source and year. Divisions we have checked against an official page say so.',
              },
              {
                title: 'Compare your scores',
                body: 'Your SAT or ACT is compared with the ranges a school reported for a past entering class. A current testing policy is used only once it has been checked.',
                note: availabilityLabel(FEATURES.academic_comparison.status),
              },
              {
                title: 'Build your shortlist',
                body: 'Compare up to five schools and save as many as you want, in this browser or in a free account.',
              },
              {
                title: 'Create your recruiting profile',
                body: 'Choose what verified college coaches can see. Turn it off whenever you like.',
                note: availabilityLabel(FEATURES.athlete_profile.status),
              },
            ]}
          />
        </div>
      </section>
      <ContentSection title="Who can see what" tone="ice">
        <ul>
          <li>Schools saved in this browser stay in this browser. Schools saved to an account are visible only to you.</li>
          <li>The scores you type into the score comparison stay in your browser; they are not sent to us or saved.</li>
          <li>When recruiting profiles open, they will be private until you choose to share them.</li>
          <li>Only coaches whose role we&apos;ve confirmed against their program&apos;s official staff page will be able to search athletes.</li>
          <li>Athletes under 18 will need a linked parent or guardian to approve coach visibility.</li>
        </ul>
      </ContentSection>
      <ContentSection title="What it costs">
        <p>
          Searching, school pages, comparing and saving schools, and the score comparison are free and stay free. When
          recruiting profiles and coach visibility open, their basic versions will be free too. See{' '}
          <a href="/pricing">free and planned plans</a>.
        </p>
      </ContentSection>
    </>
  );
}
