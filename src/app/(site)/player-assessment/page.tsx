import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { BasePath } from '@/components/site/base-path';
import { ContentSection, PageIntro } from '@/components/site/page-intro';
import { ButtonLink } from '@/components/ui/button';
import { assessmentSiteEnabled } from '@/config/assessment';
import { PILLARS } from '@/lib/assessment/catalog/pillars';
import { HITTING_PILLARS, PITCHING_PILLARS } from '@/lib/assessment/types';

export const metadata: Metadata = {
  title: 'Player assessment',
  description:
    'Base Recruits Assessment: hitting and pitching assessments with video review, transparent scoring and training plans. Understand your game, see the evidence, and know what to work on next.',
  alternates: { canonical: '/player-assessment' },
};

export default function PlayerAssessmentPage() {
  if (!assessmentSiteEnabled()) notFound();
  return (
    <>
      <PageIntro title="Base Recruits Assessment">
        Understand your game, see the evidence, and know what to work on next.
        <div className="mt-6 flex flex-wrap gap-3">
          <ButtonLink href="/signup">Create a free account</ButtonLink>
          <ButtonLink href="/player-assessment/sample" variant="secondary">
            See a sample report
          </ButtonLink>
        </div>
        <p className="mt-3 text-base">
          Already have an account? <a href="/login?next=%2Fassessment" className="font-semibold text-royal-ink underline">Sign in</a>.
        </p>
      </PageIntro>
      <section className="bg-white">
        <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
          <BasePath
            steps={[
              {
                title: 'Film and measure',
                body: 'Record a set of swings or pitches. Add what you can measure — a radar, a tracking export, or charted outcomes like strikes and solid contact.',
              },
              {
                title: 'Rate against written anchors',
                body: 'You, or a development coach you connect, rate each skill from 1 to 5 using plain descriptions of what each number looks like.',
              },
              {
                title: 'See the evidence',
                body: 'Every result shows where it came from — sensor, video estimate or observation — how many repetitions it used, and how it was scored.',
              },
              {
                title: 'Work on what matters',
                body: 'Get up to three focus areas and drills chosen by fixed rules from your results, then reassess and compare like with like.',
              },
            ]}
          />
        </div>
      </section>
      <ContentSection title="Eight pillars, four for each side of the game" tone="ice">
        <div className="grid gap-8 md:grid-cols-2">
          <div>
            <h3 className="text-2xl text-navy">Hitting</h3>
            <ul>
              {HITTING_PILLARS.map((key) => (
                <li key={key}>
                  <span className="font-semibold">{PILLARS[key].name}:</span> {PILLARS[key].summary}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h3 className="text-2xl text-navy">Pitching</h3>
            <ul>
              {PITCHING_PILLARS.map((key) => (
                <li key={key}>
                  <span className="font-semibold">{PILLARS[key].name}:</span> {PILLARS[key].summary}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </ContentSection>
      <ContentSection title="How scoring works">
        <ul>
          <li>Ratings become a 0–100 score: 25 × (rating − 1). A rating of 3 is 50. It is not a percentile.</li>
          <li>Measured values are scored only against a target your development coach sets for you. Without one they are shown, not scored.</li>
          <li>A pillar shows a score only when every required metric has enough valid evidence. Missing evidence is never counted as zero.</li>
          <li>There is no single overall grade, and no comparison with other players unless an approved reference dataset matches exactly.</li>
          <li>Published reports are frozen. Corrections appear as new revisions with the history kept.</li>
        </ul>
      </ContentSection>
      <ContentSection title="What it is not" tone="ice">
        <ul>
          <li>It does not predict recruiting, admission, scholarships or the level you will play at.</li>
          <li>It does not assess injury risk and is not a medical evaluation.</li>
          <li>Video estimates are limited by the camera, the angle and the frame rate, and every result says so.</li>
          <li>Video uploads are for athletes 18 and older for now.</li>
          <li>
            Video is stored privately, and you can delete a clip at any time. Nothing is sent to an outside analysis service unless you ask for a SeamState swing analysis. Then our own video service reads that clip, and only still frames, cropped to the hitter and without a name, go to our AI provider.
          </li>
        </ul>
      </ContentSection>
    </>
  );
}
