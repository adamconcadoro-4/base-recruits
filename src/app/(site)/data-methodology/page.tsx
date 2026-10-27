import type { Metadata } from 'next';
import Link from 'next/link';

import { ExternalLink } from '@/components/registry/values';
import { ContentSection, DraftNotice, PageIntro } from '@/components/site/page-intro';
import { Notice } from '@/components/ui/notice';
import { formatCount, formatRetrieved } from '@/lib/registry/labels';
import { registryCoverage } from '@/lib/registry/queries';

export const metadata: Metadata = {
  title: 'Data methodology',
  description:
    'Where Base Recruits school and baseball program data comes from, how divisions and testing policies are checked, and what the coverage numbers mean.',
  alternates: { canonical: '/data-methodology' },
};

export default async function DataMethodologyPage() {
  const coverage = await registryCoverage();
  const active = coverage?.active_programs ?? 0;
  return (
    <>
      <PageIntro title="Data methodology">Where school information comes from, what it covers today, and how we keep it honest.</PageIntro>
      <DraftNotice />

      <ContentSection title="Coverage today">
        {coverage && active > 0 ? (
          <>
            <p>
              {formatCount(active)} colleges are listed with an active baseball program
              {coverage.seasons.length ? ` (federal athletics report for ${coverage.seasons.join(', ')})` : ''}. Data last
              retrieved {formatRetrieved(coverage.last_retrieved_at)}.
            </p>
            <div className="overflow-x-auto" role="region" aria-label="Programs by division" tabIndex={0}>
              <table className="min-w-[20rem] border-collapse text-left">
                <caption className="pb-2 text-left font-semibold">Active programs by division</caption>
                <thead>
                  <tr className="border-b-2 border-navy">
                    <th scope="col" className="py-2 pr-6">
                      Division
                    </th>
                    <th scope="col" className="py-2 text-right">
                      Programs
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {coverage.by_division
                    .filter((d) => d.count > 0)
                    .map((d) => (
                      <tr key={d.code} className="border-b border-rule">
                        <th scope="row" className="py-1.5 pr-6 font-normal">
                          {d.name}
                        </th>
                        <td className="py-1.5 text-right">{formatCount(d.count)}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
            <ul>
              <li>
                Admission rate reported: {formatCount(coverage.with_admission_rate)} of {formatCount(active)} (
                {coverage.latest_admissions_term ?? 'no term'}). Two-year and open-admission colleges usually don&apos;t report one.
              </li>
              <li>SAT or ACT ranges reported: {formatCount(coverage.with_test_scores)}.</li>
              <li>
                Test policy reported for a past entering class: {formatCount(coverage.with_test_policy)}. This is
                history, not today&apos;s rule.
              </li>
              {coverage.with_current_test_policy !== undefined ? (
                <li>
                  Current testing policy checked on the school&apos;s own admissions page:{' '}
                  {formatCount(coverage.with_current_test_policy)}. Everywhere else the current policy shows as not yet
                  checked.
                </li>
              ) : null}
              <li>Published cost of attendance: {formatCount(coverage.with_cost_of_attendance)}.</li>
              <li>GPA: {formatCount(coverage.with_gpa)}. Federal data doesn&apos;t include GPA; we&apos;ll add it only from schools&apos; own published reports.</li>
              <li>
                Division checked against the association or the team&apos;s own site: {formatCount(coverage.association_or_school_verified)}.
                The rest use the school&apos;s athletics classification from the federal report.
              </li>
              <li>Conference verified: {formatCount(coverage.with_conference)}.</li>
              {coverage.reported_as_other !== undefined && coverage.reported_as_other > 0 ? (
                <li>
                  Listed under &ldquo;Other&rdquo; because the federal report doesn&apos;t name a baseball division we can
                  use: {formatCount(coverage.reported_as_other)}. They move to their division once it is checked.
                </li>
              ) : null}
              {coverage.stale_admissions > 0 ? <li>Admissions figures older than the newest term: {formatCount(coverage.stale_admissions)}.</li> : null}
            </ul>
            <p>We don&apos;t claim to cover every college. These counts are computed live from the published records.</p>
          </>
        ) : (
          <Notice tone="info">The registry hasn&apos;t been published yet, so there is nothing to count.</Notice>
        )}
      </ContentSection>

      <ContentSection title="Sources" tone="ice">
        <ul>
          <li>
            <strong>Which colleges have a baseball team:</strong> the U.S. Department of Education&apos;s{' '}
            <ExternalLink href="https://ope.ed.gov/athletics/">Equity in Athletics Data Analysis (EADA)</ExternalLink>. Colleges
            that receive federal student aid and have intercollegiate athletics report their teams and participants each year.
            A program is listed as active only when the latest report shows a men&apos;s baseball team with participants.
          </li>
          <li>
            <strong>Teams the federal report leaves out:</strong> the report does not cover service academies, men&apos;s
            colleges, colleges that take no federal student aid, or teams that started or restarted after its latest season. We add those by hand after
            checking a current schedule, roster or announcement on the school&apos;s or conference&apos;s own site. Their school
            pages say so and link the page we checked; they don&apos;t show admissions figures or costs yet.
          </li>
          <li>
            <strong>Division:</strong> the school&apos;s athletics classification in the same report (for example NCAA Division
            II or NJCAA Division I). Where we have checked the association&apos;s directory or the team&apos;s own site, the
            school page says so and links the page we checked.
          </li>
          <li>
            <strong>Admissions, cost and enrollment:</strong> the U.S. Department of Education&apos;s{' '}
            <ExternalLink href="https://collegescorecard.ed.gov/">College Scorecard</ExternalLink>, which publishes IPEDS
            data reported by the colleges.
          </li>
          <li>
            Planned, not yet in use: schools&apos; own Common Data Set reports (for GPA), and athletics association
            directories, used only within each provider&apos;s terms.
          </li>
        </ul>
      </ContentSection>

      <ContentSection title="How figures are labelled">
        <ul>
          <li>Admissions describe one fall entering class (for example Fall 2024).</li>
          <li>
            SAT and ACT ranges are the 25th to 75th percentile of enrolled first-time students whose scores were used in
            the admission decision. SAT sections are shown separately; we don&apos;t add them into a total.
          </li>
          <li>Prices are published sticker prices for one academic year, before aid. We link each school&apos;s own net price calculator.</li>
          <li>Enrollment is fall undergraduate degree-seeking enrollment.</li>
          <li>Missing figures stay missing and say “Not reported”. They are never shown as zero or estimated.</li>
        </ul>
      </ContentSection>

      <ContentSection title="How records change" tone="ice">
        <ul>
          <li>An automated job fetches each new release and saves it as a snapshot that is reviewed before use.</li>
          <li>An administrator stages the snapshot, sees every new, changed and missing record, and publishes it.</li>
          <li>When a newer report no longer lists a team, the school drops out of search and its page says so.</li>
          <li>Corrections cite the official page that was checked. Every change is kept with who made it and why, and an earlier release can be restored.</li>
          <li>
            A listed team says nothing about roster openings, scholarships or a coach&apos;s interest, and a school&apos;s
            admission rate is not anyone&apos;s personal chance of admission.
          </li>
        </ul>
        <p>
          Spot something wrong? Use &ldquo;Report a correction&rdquo; on any school page (a free account is needed so we
          can follow up), or see <Link href="/support" className="font-semibold text-royal-ink underline">Help and corrections</Link>.
        </p>
      </ContentSection>

      <ContentSection title="The score comparison">
        <p>
          <Link href="/match" className="font-semibold text-royal-ink underline">Compare your scores</Link> uses a fixed,
          published set of rules. A testing requirement counts only when the school&apos;s current policy has been checked
          for your applicant type and entry year; otherwise it says Unknown. Past-class score ranges are shown as
          history, never as minimums, and transfer students aren&apos;t compared with first-year ranges. Scores are
          compared in your browser and never sent to us.
        </p>
      </ContentSection>

      <ContentSection title="Admissions history" tone="ice">
        <p>
          We don&apos;t publish admissions scattergrams or acceptance predictions. They will appear only if real,
          permissioned applicant outcomes exist in large enough numbers to protect privacy, with their sample size and
          source shown.
        </p>
      </ContentSection>
    </>
  );
}
