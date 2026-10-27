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
        Where our school information comes from, how the score comparison works, and who can see what.
      </PageIntro>
      <section className="bg-white">
        <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
          <BasePath
            steps={[
              {
                title: 'Explore programs',
                body: 'Programs come from the U.S. Department of Education’s athletics report, with each fact’s source and year. Divisions we’ve checked against an official page say so.',
              },
              {
                title: 'Compare your scores',
                body: 'Your SAT or ACT is compared with the middle 50% of scores a school reported for a past entering class. It’s information, not a prediction. A current testing policy is used only once we’ve checked it.',
                note: availabilityLabel(FEATURES.academic_comparison.status),
              },
              {
                title: 'Build your shortlist',
                body: 'Compare up to five schools and save as many as you want, in this browser or in a free account.',
              },
              {
                title: 'Create your recruiting profile',
                body: 'Choose what verified college coaches can see, and turn sharing off at any time.',
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
          <li>
            When coach search opens, only verified coaches will be able to search players. A verified coach is a college
            baseball coach whose current role we&apos;ve confirmed on the school&apos;s official athletics staff page.
          </li>
          <li>Athletes under 18 will need a linked parent or guardian to approve coach visibility.</li>
        </ul>
      </ContentSection>
      <ContentSection title="What it costs">
        <p>
          School search, school pages, comparing and saving schools, and the score comparison are free. Recruiting
          profiles and coach visibility aren&apos;t open yet. See <a href="/pricing">what&apos;s free</a>.
        </p>
      </ContentSection>
    </>
  );
}
