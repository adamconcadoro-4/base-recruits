import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import Link from 'next/link';

import { clearCompare } from '@/app/(site)/compare/actions';
import { CompareToggle } from '@/components/registry/compare-toggle';
import { ExplorerFilters } from '@/components/registry/explorer-filters';
import { SchoolCard } from '@/components/registry/school-card';
import { SaveButton } from '@/components/shortlist/save-button';
import { PageIntro } from '@/components/site/page-intro';
import { ButtonLink } from '@/components/ui/button';
import { Notice } from '@/components/ui/notice';
import { isSignedIn } from '@/lib/auth/session';
import { COMPARE_COOKIE, readCompareCookie } from '@/lib/registry/compare-selection';
import { formatAcademicYear, formatCount } from '@/lib/registry/labels';
import { latestPolicy } from '@/lib/registry/policy';
import { currentPolicies, mySavedSlugs, registryCoverage, searchSchools } from '@/lib/registry/queries';
import {
  MAX_COMPARE,
  PAGE_SIZE,
  explorerQuery,
  figureFilters,
  hasFilters,
  parseExplorerParams,
} from '@/lib/registry/search-params';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const DESCRIPTION =
  'Free search of colleges that reported a baseball team in the latest federal athletics report, with admissions figures, test policy and cost, each with its source and year.';

/** The unfiltered directory is the canonical page; filtered and paged variants are not indexed. */
export async function generateMetadata({ searchParams }: { readonly searchParams: SearchParams }): Promise<Metadata> {
  const params = await searchParams;
  const variant = Object.keys(params).length > 0;
  return {
    title: 'Search college baseball programs',
    description: DESCRIPTION,
    alternates: { canonical: '/schools' },
    ...(variant ? { robots: { index: false, follow: true } } : {}),
  };
}

export default async function SchoolsPage({ searchParams }: { readonly searchParams: SearchParams }) {
  const [params, cookieStore] = await Promise.all([searchParams, cookies()]);
  const parsed = parseExplorerParams(params);
  // The comparison is the visitor's stored selection; it only changes through form posts.
  const state = { ...parsed, compare: readCompareCookie(cookieStore.get(COMPARE_COOKIE)?.value) };
  const here = `/schools${explorerQuery(state)}`;
  const [result, coverage, signedIn] = await Promise.all([searchSchools(state), registryCoverage(), isSignedIn()]);
  const slugsOnPage = result.rows.map((row) => row.slug);
  const [policies, savedSlugs] = await Promise.all([
    currentPolicies(slugsOnPage),
    signedIn ? mySavedSlugs() : Promise.resolve(null),
  ]);
  const saved = new Set(savedSlugs ?? []);
  const published = (coverage?.active_programs ?? 0) > 0;
  const pages = Math.max(1, Math.ceil(result.total / PAGE_SIZE));
  const first = result.total === 0 ? 0 : (state.page - 1) * PAGE_SIZE + 1;
  const last = Math.min(state.page * PAGE_SIZE, result.total);
  const excluded = figureFilters(state);
  const season = coverage?.seasons.length ? coverage.seasons.map(formatAcademicYear).join(', ') : null;

  return (
    <>
      <PageIntro title="Find college baseball programs">
        {published ? (
          <>
            {formatCount(coverage?.active_programs)} colleges reported a baseball team in the{' '}
            {season ?? 'latest'} federal athletics report. Search them free, with no account.
          </>
        ) : (
          'Search colleges that reported a baseball team to the U.S. Department of Education. Free, with no account.'
        )}
      </PageIntro>

      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-8 sm:px-6 lg:grid-cols-[18rem_1fr] lg:gap-10">
        <aside aria-label="Search and filters">
          <ExplorerFilters state={state} admissionsTerm={coverage?.latest_admissions_term ?? null} />
        </aside>

        <section aria-labelledby="results-heading" className="min-w-0 space-y-6">
          <h2 id="results-heading" className="sr-only">
            Results
          </h2>

          {state.ignored.length > 0 ? (
            <Notice tone="attention" title="Some filters in this link weren't recognised, so they weren't applied">
              Ignored: {state.ignored.join(', ')}. The results below don&apos;t use {state.ignored.length === 1 ? 'it' : 'them'}.
            </Notice>
          ) : null}

          {state.compare.length > 0 ? (
            <div className="flex flex-wrap items-center justify-between gap-3 border-2 border-navy bg-ice px-4 py-3">
              <p className="font-semibold">
                {state.compare.length} of {MAX_COMPARE} schools picked to compare
              </p>
              <div className="flex flex-wrap items-center gap-4">
                <ButtonLink href="/compare" size="sm">
                  Compare now
                </ButtonLink>
                <form action={clearCompare}>
                  <input type="hidden" name="back" value={here} />
                  <button type="submit" className="font-semibold text-royal-ink underline">
                    Clear compare
                  </button>
                </form>
              </div>
            </div>
          ) : null}

          {result.failed ? (
            <Notice tone="error" title="Search didn't load">
              Something went wrong on our side. Refresh the page to try again.
            </Notice>
          ) : !published ? (
            <Notice tone="info" title="School listings aren't published yet">
              School records appear here once they have been imported from official sources and reviewed. We won&apos;t
              show made-up ones in the meantime.
            </Notice>
          ) : (
            <>
              <p role="status" className="text-lg">
                {result.total === 0
                  ? 'No programs match.'
                  : `Showing ${formatCount(first)}–${formatCount(last)} of ${formatCount(result.total)} programs`}
                {state.q ? ` for “${state.q}”` : ''}.
              </p>
              {policies === 'failed' ? (
                <p className="text-sm text-slate">Checked current testing policies didn&apos;t load; the past class&apos;s policy is shown.</p>
              ) : null}
              {excluded.length > 0 ? (
                <p className="text-sm text-slate">
                  Filtering by {excluded.join(', ')} leaves out schools that don&apos;t report that figure.
                </p>
              ) : null}

              {result.rows.length > 0 ? (
                <ul className="space-y-5">
                  {result.rows.map((school) => {
                    return (
                      <li key={school.slug}>
                        <SchoolCard
                          school={school}
                          currentPolicy={policies === 'failed' ? null : latestPolicy(policies.get(school.slug), 'first_year')}
                          actions={
                            <>
                              <CompareToggle slug={school.slug} name={school.name} selected={state.compare} back={here} showCount={false} />
                              <SaveButton
                                slug={school.slug}
                                name={school.name}
                                mode={signedIn ? 'account' : 'guest'}
                                initiallySaved={saved.has(school.slug)}
                              />
                            </>
                          }
                        />
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <Notice tone="info" title="Nothing matches all of those filters">
                  {hasFilters(state) ? 'Try removing a filter or two.' : 'Try a different spelling or a shorter name.'}
                </Notice>
              )}

              {pages > 1 ? (
                <nav aria-label="Result pages" className="flex flex-wrap items-center justify-between gap-4 border-t-2 border-rule pt-5">
                  {state.page > 1 ? (
                    <Link href={`/schools${explorerQuery(state, { page: state.page - 1 })}`} className="font-semibold text-royal-ink underline">
                      Previous page
                    </Link>
                  ) : (
                    <span />
                  )}
                  <span className="text-slate">
                    Page {state.page} of {pages}
                  </span>
                  {state.page < pages ? (
                    <Link href={`/schools${explorerQuery(state, { page: state.page + 1 })}`} className="font-semibold text-royal-ink underline">
                      Next page
                    </Link>
                  ) : (
                    <span />
                  )}
                </nav>
              ) : null}
            </>
          )}

          <p className="border-t-2 border-rule pt-5 text-sm text-slate">
            Baseball programs: U.S. Department of Education, Equity in Athletics Data Analysis (EADA). Admissions, costs
            and enrollment: U.S. Department of Education, College Scorecard (IPEDS). A listed team says nothing about
            roster openings or scholarships. <Link href="/data-methodology" className="font-semibold text-royal-ink underline">How we source and label this data</Link>
          </p>
        </section>
      </div>
    </>
  );
}
