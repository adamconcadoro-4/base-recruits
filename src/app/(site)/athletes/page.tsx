import type { Metadata } from 'next';

import { ContentSection, PageIntro } from '@/components/site/page-intro';
import { ButtonLink } from '@/components/ui/button';
import { StatusChip } from '@/components/ui/status-chip';
import { FEATURES, availabilityLabel, type FeatureKey } from '@/config/availability';

export const metadata: Metadata = {
  title: 'For high school players',
  description:
    'Find colleges with baseball, compare your scores with their published ranges, see their published cost of attendance, and save a shortlist. Free, with no account needed to start.',
  alternates: { canonical: '/athletes' },
};

const TODAY: readonly FeatureKey[] = ['school_search', 'compare', 'saved_schools', 'academic_comparison'];
const LATER: readonly FeatureKey[] = ['athlete_profile', 'majors'];

export default function AthletesPage() {
  return (
    <>
      <PageIntro title="For high school players">
        Find colleges with baseball, see how your scores compare with their published ranges, check their published
        cost of attendance, and build a shortlist you understand.
      </PageIntro>
      <ContentSection title="What you can do today, free">
        <ul>
          {TODAY.map((key) => {
            const label = availabilityLabel(FEATURES[key].status);
            return (
              <li key={key}>
                {FEATURES[key].now} {label ? <StatusChip tone="neutral">{label}</StatusChip> : null}
              </li>
            );
          })}
        </ul>
        <div className="flex flex-wrap gap-3 pt-2">
          <ButtonLink href="/schools">Explore Baseball Programs</ButtonLink>
          <ButtonLink href="/signup" variant="secondary">
            Create a free account
          </ButtonLink>
        </div>
      </ContentSection>
      <ContentSection title="Coming later" tone="ice">
        <ul>
          {LATER.map((key) => (
            <li key={key}>{FEATURES[key].now}</li>
          ))}
        </ul>
        <p>
          When recruiting profiles open, nothing you enter will be shared until you turn sharing on, and you will be
          able to turn it off at any time. If you&apos;re under 18, a parent or guardian you link to your account will
          approve coach visibility with you.
        </p>
      </ContentSection>
    </>
  );
}
