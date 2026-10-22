import type { Metadata } from 'next';

import { BasePath } from '@/components/site/base-path';
import { ContentSection, PageIntro } from '@/components/site/page-intro';

export const metadata: Metadata = { title: 'How it works' };

export default function HowItWorksPage() {
  return (
    <>
      <PageIntro title="How Base Recruits works">
        Real school data, plain-language academic fit, and a recruiting profile you control.
      </PageIntro>
      <section className="bg-white">
        <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
          <BasePath
            steps={[
              {
                title: 'Search schools',
                body: 'Every program is checked against official sources before it is listed, with each fact’s source and year.',
              },
              {
                title: 'Understand academic fit',
                body: 'Your grades and scores are compared with published ranges under each school’s own testing rules.',
              },
              {
                title: 'Build your shortlist',
                body: 'Compare schools and save as many as you want, on your device or in a free account.',
              },
              {
                title: 'Create your recruiting profile',
                body: 'Choose what verified college coaches can see. Turn it off whenever you like.',
              },
            ]}
          />
        </div>
      </section>
      <ContentSection title="Who can see what" tone="ice">
        <ul>
          <li>Your profile is private until you choose to share it.</li>
          <li>Only coaches whose role we&apos;ve confirmed against their program&apos;s official staff page can search athletes.</li>
          <li>Athletes under 18 need a linked parent or guardian to approve coach visibility.</li>
          <li>Parents see only what the athlete shares with them.</li>
        </ul>
      </ContentSection>
      <ContentSection title="What it costs">
        <p>
          Searching, matching, comparing, saving schools, a basic profile and coach visibility are free for good. See{' '}
          <a href="/pricing">free and planned plans</a>.
        </p>
      </ContentSection>
    </>
  );
}
