import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import Link from 'next/link';

import { CompareToggle } from '@/components/registry/compare-toggle';
import { SchoolCard } from '@/components/registry/school-card';
import { GuestSavedList } from '@/components/shortlist/guest-saved-list';
import { GuestSavesMerger } from '@/components/shortlist/guest-saves-merger';
import { SaveButton } from '@/components/shortlist/save-button';
import { PageIntro } from '@/components/site/page-intro';
import { ButtonLink } from '@/components/ui/button';
import { Notice } from '@/components/ui/notice';
import { isSignedIn } from '@/lib/auth/session';
import { COMPARE_COOKIE, readCompareCookie } from '@/lib/registry/compare-selection';
import { mySavedSlugs, schoolsBySlugs } from '@/lib/registry/queries';

export const metadata: Metadata = {
  title: 'Saved schools',
  description: 'Your saved college baseball programs. Free and unlimited, in this browser or in a free account.',
  robots: { index: false, follow: true },
};

export default async function SavedPage() {
  const [signedIn, cookieStore] = await Promise.all([isSignedIn(), cookies()]);
  const compareSelection = readCompareCookie(cookieStore.get(COMPARE_COOKIE)?.value);

  if (!signedIn) {
    return (
      <>
        <PageIntro title="Saved schools">
          Save as many schools as you like. Comparing (up to five at a time) is separate and never changes this list.
        </PageIntro>
        <div className="mx-auto max-w-6xl space-y-6 px-4 py-10 sm:px-6">
          <Notice tone="info" title="Saved in this browser only">
            Without an account, your list stays on this device, in this browser. Clearing your browser&apos;s site data
            removes it. <Link href="/signup" className="font-semibold text-royal-ink underline">Create a free account</Link>{' '}
            or <Link href="/login?next=%2Fsaved" className="font-semibold text-royal-ink underline">log in</Link> to keep it
            on any device; schools saved here move into your account when you sign in.
          </Notice>
          <GuestSavedList compareSelection={compareSelection} />
        </div>
      </>
    );
  }

  const slugs = await mySavedSlugs();
  const schools = slugs === null ? 'failed' : await schoolsBySlugs(slugs);

  return (
    <>
      <PageIntro title="Saved schools">
        Saved to your free account. No limit, and keeping them never depends on a plan.
      </PageIntro>
      <div className="mx-auto max-w-6xl space-y-6 px-4 py-10 sm:px-6">
        <GuestSavesMerger />
        {schools === 'failed' ? (
          <Notice tone="error" title="Your saved schools didn't load">
            Nothing has been lost. Refresh the page to try again.
          </Notice>
        ) : schools.length === 0 ? (
          <Notice tone="info" title="No saved schools yet">
            Use <strong>Save school</strong> on any school in the{' '}
            <Link href="/schools" className="font-semibold text-royal-ink underline">
              school search
            </Link>
            .
          </Notice>
        ) : (
          <>
            <p role="status" className="text-lg">
              {schools.length} saved {schools.length === 1 ? 'school' : 'schools'}
            </p>
            <ul className="space-y-5">
              {schools.map((school) => (
                <li key={school.slug}>
                  <SchoolCard
                    school={school}
                    actions={
                      <>
                        <SaveButton slug={school.slug} name={school.name} mode="account" initiallySaved />
                        <CompareToggle slug={school.slug} name={school.name} selected={compareSelection} back="/saved" />
                      </>
                    }
                  />
                </li>
              ))}
            </ul>
          </>
        )}
        <ButtonLink href="/schools" variant="secondary">
          Find more schools
        </ButtonLink>
      </div>
    </>
  );
}
