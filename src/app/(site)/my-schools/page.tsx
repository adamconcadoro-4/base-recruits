import type { Metadata } from 'next';
import Link from 'next/link';

import { MySchoolsList } from '@/components/matching/my-schools-list';
import { ContentSection, PageIntro } from '@/components/site/page-intro';
import { Notice } from '@/components/ui/notice';
import { isSignedIn } from '@/lib/auth/session';
import { loadAccountNumbers } from '@/lib/matching/account-numbers-server';
import { mySavedSlugs } from '@/lib/registry/queries';

import { loadListCandidates } from './load';

export const metadata: Metadata = {
  title: 'My schools',
  description:
    'Enter your grades and baseball numbers once and see every college baseball program at the levels you choose, sorted into Strong fit, Possible fit, Reach and Not enough data, with the reasons.',
  alternates: { canonical: '/my-schools' },
};

export default async function MySchoolsPage() {
  const [load, signedIn] = await Promise.all([loadListCandidates(), isSignedIn()]);
  const [savedSlugs, accountNumbers] = signedIn ? await Promise.all([mySavedSlugs(), loadAccountNumbers()]) : [null, null];
  const thisYear = new Date().getUTCFullYear();

  return (
    <>
      <PageIntro title="My schools">
        Enter your grades and baseball numbers once. Every program at the levels you choose is sorted into Strong fit,
        Possible fit, Reach and Not enough data, with the reasons. Free, and no account needed.
      </PageIntro>
      <div className="mx-auto max-w-6xl space-y-8 px-4 py-10 sm:px-6">
        <noscript>
          <Notice tone="attention" title="This list needs JavaScript">
            Your numbers are compared in your browser. Turn on JavaScript to use it, or
            browse school pages, which show each school&apos;s reported ranges.
          </Notice>
        </noscript>
        {load.status === 'failed' ? (
          <Notice tone="error" title="The schools didn't load">
            Something went wrong on our side. Your numbers are still saved. Refresh the page to try again.
          </Notice>
        ) : (
          <MySchoolsList
            candidates={load.candidates}
            otherAssociations={load.otherAssociations}
            thisYear={thisYear}
            signedIn={signedIn}
            savedSlugs={savedSlugs ?? []}
            account={accountNumbers}
          />
        )}
      </div>
      <ContentSection title="How the list works">
        <ul>
          <li>
            <strong>Strong fit:</strong> your baseball numbers are in the typical range for the level, and your grades and
            scores are within or above every range the school reported (or the school has open admission).
          </li>
          <li>
            <strong>Possible fit:</strong> in range for the level, and some of your numbers are below a range the school
            reported.
          </li>
          <li>
            <strong>Reach:</strong> in range for the level, but your numbers are below the school&apos;s reported ranges, or
            your GPA may be below the level&apos;s academic minimum to compete.
          </li>
          <li>
            <strong>Not enough data:</strong> something needed couldn&apos;t be compared. These schools are always shown,
            never hidden.
          </li>
          <li>
            Schools at levels where your baseball numbers are below the typical range are set aside and counted at the
            bottom of the list.
          </li>
          <li>
            There is no hidden score. Schools are listed by name, or by published cost if you choose. Every rule is written
            out in our{' '}
            <Link href="/data-methodology" className="font-semibold text-royal-ink underline">
              data methodology
            </Link>
            .
          </li>
        </ul>
      </ContentSection>
      <ContentSection title="What the list is not" tone="ice">
        <p>
          It is not an admission decision, a prediction of a roster spot or scholarship, or a coach&apos;s evaluation.
          Grades you type in need transcripts for verification, and baseball numbers you type in are self-reported.
        </p>
      </ContentSection>
    </>
  );
}
