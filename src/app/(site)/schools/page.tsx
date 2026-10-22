import type { Metadata } from 'next';
import Link from 'next/link';

import { ExplorerFilters } from '@/components/registry/explorer-filters';
import { SchoolCard } from '@/components/registry/school-card';
import { PageIntro } from '@/components/site/page-intro';
import { ButtonLink } from '@/components/ui/button';
import { Notice } from '@/components/ui/notice';
import { formatAcademicYear, formatCount } from '@/lib/registry/labels';
import { registryCoverage, searchSchools } from '@/lib/registry/queries';
import {
  MAX_COMPARE,
  PAGE_SIZE,
  explorerQuery,
  figureFilters,
  hasFilters,
  parseExplorerParams,
  toggleCompare,
} from '@/lib/registry/search-params';

export const metadata: Metadata = {
  title: 'Search college baseball programs',
  description: 'Free search of colleges with a confirmed baseball team, with admissions, test policy and cost from official federal data.',
};

export default async function SchoolsPage({
  searchParams,
}: {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const state = parseExplorerParams(await searchParams);
  const [result, coverage] = await Promise.all([searchSchools(state), registryCoverage()]);
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
          'Search colleges with a confirmed baseball team. Free, with no account.'
        )}
      </PageIntro>

      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-10 sm:px-6 lg:grid-cols-[18rem_1fr]">
        <aside aria-label="Filters">
          <ExplorerFilters state={state} />
        </aside>

        <section aria-labelledby="results-heading" className="min-w-0 space-y-6">
          <h2 id="results-heading" className="sr-only">
            Results
          </h2>

          {state.compare.length > 0 ? (
            <div className="flex flex-wrap items-center justify-between gap-3 border-2 border-navy bg-ice px-4 py-3">
              <p className="font-semibold">
                {state.compare.length} of {MAX_COMPARE} schools picked to compare
              </p>
              <div className="flex flex-wrap items-center gap-4">
                <ButtonLink href={`/compare?schools=${state.compare.join(',')}`} size="sm">
                  Compare now
                </ButtonLink>
                <Link href={`/schools${explorerQuery(state, { compare: [], page: 1 })}`} className="font-semibold text-royal-ink underline">
                  Clear compare
                </Link>
              </div>
            </div>
          ) : null}

          {result.failed ? (
            <Notice tone="error" title="Search didn't load">
              Something went wrong on our side. Refresh the page to try again.
            </Notice>
          ) : !published ? (
            <Notice tone="info" title="The registry isn't published yet">
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
              {excluded.length > 0 ? (
                <p className="text-sm text-slate">
                  Filtering by {excluded.join(', ')} leaves out schools that don&apos;t report that figure.
                </p>
              ) : null}

              {result.rows.length > 0 ? (
                <ul className="space-y-5">
                  {result.rows.map((school) => {
                    const inCompare = state.compare.includes(school.slug);
                    return (
                      <li key={school.slug}>
                        <SchoolCard
                          school={school}
                          inCompare={inCompare}
                          compareFull={!inCompare && state.compare.length >= MAX_COMPARE}
                          compareHref={`/schools${explorerQuery(state, { compare: toggleCompare(state.compare, school.slug) })}#results-heading`}
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
