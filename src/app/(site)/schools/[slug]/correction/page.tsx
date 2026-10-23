import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { PageIntro } from '@/components/site/page-intro';
import { ButtonLink } from '@/components/ui/button';
import { Notice } from '@/components/ui/notice';
import { isSignedIn } from '@/lib/auth/session';
import { getSchool } from '@/lib/registry/queries';
import { SLUG_PATTERN } from '@/lib/registry/search-params';

import { CorrectionForm } from './correction-form';

export const metadata: Metadata = {
  title: 'Report a correction',
  robots: { index: false, follow: false },
};

export default async function CorrectionPage({ params }: { readonly params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!SLUG_PATTERN.test(slug) || slug.length > 120) notFound();
  const [school, signedIn] = await Promise.all([getSchool(slug), isSignedIn()]);
  if (school === 'failed') {
    return (
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <Notice tone="error" title="This page didn't load">
          Something went wrong on our side. Refresh the page to try again.
        </Notice>
      </div>
    );
  }
  if (!school) notFound();
  const back = `/schools/${school.institution.slug}`;

  return (
    <>
      <PageIntro title="Report a correction">
        About <Link href={back} className="font-semibold text-royal-ink underline">{school.institution.name}</Link>. A
        reviewer checks every report against official sources before anything changes.
      </PageIntro>
      <div className="mx-auto max-w-6xl space-y-6 px-4 py-10 sm:px-6">
        {signedIn ? (
          <CorrectionForm slug={school.institution.slug} />
        ) : (
          <Notice tone="info" title="Reports need a free account">
            So we can follow up and keep the queue free of spam.{' '}
            <ButtonLink href={`/login?next=${encodeURIComponent(`${back}/correction`)}`} size="sm" className="mt-3">
              Log in to report a correction
            </ButtonLink>
          </Notice>
        )}
        <p>
          <Link href={back} className="font-semibold text-royal-ink underline">
            Back to {school.institution.name}
          </Link>
        </p>
      </div>
    </>
  );
}
