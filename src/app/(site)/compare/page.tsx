import type { Metadata } from 'next';
import Link from 'next/link';
import type { ReactNode } from 'react';

import { ExternalLink } from '@/components/registry/values';
import { PageIntro } from '@/components/site/page-intro';
import { ButtonLink } from '@/components/ui/button';
import { Notice } from '@/components/ui/notice';
import {
  CONTROL_LABELS,
  LEVEL_LABELS,
  NOT_REPORTED,
  SETTING_LABELS,
  STATUS_LABELS,
  TEST_POLICY_LABELS,
  VERIFICATION_LABELS,
  formatAcademicYear,
  formatCount,
  formatMoney,
  formatRange,
  formatRate,
  placeLabel,
} from '@/lib/registry/labels';
import { compareSchools } from '@/lib/registry/queries';
import { MAX_COMPARE, parseCompareList } from '@/lib/registry/search-params';
import type { SchoolRecord } from '@/lib/registry/types';

export const metadata: Metadata = {
  title: 'Compare schools',
  description: 'Compare up to five college baseball programs side by side, free, with the source year of every figure.',
};

interface Line {
  readonly label: string;
  readonly value: (school: SchoolRecord) => { readonly text: string; readonly year?: string | null };
}

function fact(text: string | null | undefined, year?: string | null) {
  return { text: text ?? NOT_REPORTED, year: text ? year : null };
}

const LINES: readonly { readonly heading: string; readonly lines: readonly Line[] }[] = [
  {
    heading: 'Baseball',
    lines: [
      {
        label: 'Division',
        value: (s) =>
          s.program
            ? fact(s.program.status === 'active' ? s.program.division.name : STATUS_LABELS[s.program.status], formatAcademicYear(s.program.season))
            : fact(null),
      },
      { label: 'Conference', value: (s) => ({ text: s.program?.conference ?? 'Not yet verified' }) },
      { label: 'How it was confirmed', value: (s) => fact(s.program ? VERIFICATION_LABELS[s.program.verification].short : null) },
      {
        label: 'Team participants',
        value: (s) => fact(s.program?.reported_participants != null ? formatCount(s.program.reported_participants) : null, s.program ? formatAcademicYear(s.program.season) : null),
      },
    ],
  },
  {
    heading: 'Admissions',
    lines: [
      { label: 'Admission rate', value: (s) => fact(s.admissions?.admission_rate != null ? formatRate(s.admissions.admission_rate) : null, s.admissions?.term) },
      { label: 'Test policy', value: (s) => fact(s.admissions?.test_policy ? TEST_POLICY_LABELS[s.admissions.test_policy].short : null, s.admissions?.term) },
      {
        label: 'SAT Reading and Writing, middle 50%',
        value: (s) => fact(s.admissions?.sat_erw_25 != null ? formatRange(s.admissions.sat_erw_25, s.admissions.sat_erw_75) : null, s.admissions?.term),
      },
      {
        label: 'SAT Math, middle 50%',
        value: (s) => fact(s.admissions?.sat_math_25 != null ? formatRange(s.admissions.sat_math_25, s.admissions.sat_math_75) : null, s.admissions?.term),
      },
      {
        label: 'ACT composite, middle 50%',
        value: (s) => fact(s.admissions?.act_composite_25 != null ? formatRange(s.admissions.act_composite_25, s.admissions.act_composite_75) : null, s.admissions?.term),
      },
      { label: 'GPA', value: () => ({ text: 'Not reported in federal data' }) },
    ],
  },
  {
    heading: 'Cost (published, before aid)',
    lines: [
      {
        label: 'Cost of attendance',
        value: (s) => fact(s.costs?.cost_of_attendance != null ? formatMoney(s.costs.cost_of_attendance) : null, s.costs ? formatAcademicYear(s.costs.academic_year) : null),
      },
      {
        label: 'Tuition and fees, in-state',
        value: (s) => fact(s.costs?.tuition_in_state != null ? formatMoney(s.costs.tuition_in_state) : null, s.costs ? formatAcademicYear(s.costs.academic_year) : null),
      },
      {
        label: 'Tuition and fees, out-of-state',
        value: (s) => fact(s.costs?.tuition_out_of_state != null ? formatMoney(s.costs.tuition_out_of_state) : null, s.costs ? formatAcademicYear(s.costs.academic_year) : null),
      },
    ],
  },
  {
    heading: 'School',
    lines: [
      { label: 'Location', value: (s) => ({ text: placeLabel(s.institution.city, s.institution.state) }) },
      { label: 'Type', value: (s) => fact(s.institution.control ? CONTROL_LABELS[s.institution.control] : null) },
      { label: 'Two-year or four-year', value: (s) => fact(s.institution.level ? LEVEL_LABELS[s.institution.level] : null) },
      { label: 'Campus setting', value: (s) => fact(s.institution.setting ? SETTING_LABELS[s.institution.setting] : null) },
      {
        label: 'Undergraduates',
        value: (s) => fact(s.institution.undergraduate_enrollment != null ? formatCount(s.institution.undergraduate_enrollment) : null, s.institution.enrollment_term),
      },
    ],
  },
];

function Cell({ value }: { readonly value: { readonly text: string; readonly year?: string | null } }) {
  const missing = value.text === NOT_REPORTED || value.text === 'Not yet verified';
  return (
    <>
      <span className={missing ? 'text-slate italic' : undefined}>{value.text}</span>
      {value.year ? <span className="block text-sm text-slate">{value.year}</span> : null}
    </>
  );
}

function without(list: readonly string[], slug: string): string {
  const rest = list.filter((s) => s !== slug);
  return rest.length ? `/compare?schools=${rest.join(',')}` : '/compare';
}

function Links({ school }: { readonly school: SchoolRecord }): ReactNode {
  const program = school.program;
  return (
    <ul className="space-y-1 text-sm">
      <li>
        <Link href={`/schools/${school.institution.slug}`} aria-label={`Details and sources for ${school.institution.name}`} className="font-semibold text-royal-ink underline">
          Details and sources
        </Link>
      </li>
      {program?.questionnaire_url ? (
        <li>
          <ExternalLink href={program.questionnaire_url}>Recruiting questionnaire</ExternalLink>
        </li>
      ) : null}
      {program?.athletics_url ? (
        <li>
          <ExternalLink href={program.athletics_url}>Team page</ExternalLink>
        </li>
      ) : null}
    </ul>
  );
}

export default async function ComparePage({
  searchParams,
}: {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw = (await searchParams).schools;
  const requested = (Array.isArray(raw) ? raw : raw ? [raw] : []).flatMap((v) => v.split(','));
  const slugs = parseCompareList(requested);
  const tooMany = new Set(requested.map((s) => s.trim().toLowerCase()).filter(Boolean)).size > MAX_COMPARE;
  const result = await compareSchools(slugs);
  const schools = result === 'failed' ? [] : result;
  const exploreLink = `/schools${slugs.length ? `?compare=${slugs.join(',')}` : ''}`;

  return (
    <>
      <PageIntro title="Compare schools side by side">
        Up to five schools, free, with no account. Every figure shows the term or year it describes.
      </PageIntro>
      <div className="mx-auto max-w-6xl space-y-6 px-4 py-10 sm:px-6">
        {result === 'failed' ? (
          <Notice tone="error" title="The comparison didn't load">
            Something went wrong on our side. Refresh the page to try again.
          </Notice>
        ) : null}
        {tooMany ? (
          <Notice tone="info">Compare shows up to five schools, so only the first five are here.</Notice>
        ) : null}
        {schools.length === 0 && result !== 'failed' ? (
          <Notice tone="info" title="Pick schools to compare">
            Use “Add to compare” in the <Link href="/schools" className="font-semibold text-royal-ink underline">school search</Link>.
          </Notice>
        ) : null}

        {schools.length > 0 ? (
          <>
            <div className="flex flex-wrap items-center gap-4">
              {schools.length < MAX_COMPARE ? (
                <ButtonLink href={exploreLink} variant="secondary" size="sm">
                  Add another school
                </ButtonLink>
              ) : null}
            </div>

            {/* Wide screens: one table, schools as columns. */}
            <div className="hidden overflow-x-auto md:block" role="region" aria-label="Comparison table" tabIndex={0}>
              <table className="w-full min-w-[48rem] border-collapse text-left">
                <caption className="sr-only">Side-by-side comparison of {schools.length} schools</caption>
                <thead>
                  <tr>
                    <td className="w-56" />
                    {schools.map((s) => (
                      <th key={s.institution.slug} scope="col" className="border-b-4 border-navy p-3 align-bottom">
                        <span className="block text-xl text-navy">{s.institution.name}</span>
                        <Link
                          href={without(slugs, s.institution.slug)}
                          aria-label={`Remove ${s.institution.name}`}
                          className="mt-1 inline-block text-sm font-semibold text-royal-ink underline"
                        >
                          Remove
                        </Link>
                      </th>
                    ))}
                  </tr>
                </thead>
                {LINES.map((group) => (
                  <tbody key={group.heading}>
                    <tr>
                      <th scope="colgroup" colSpan={schools.length + 1} className="bg-ice p-3 text-lg text-navy">
                        {group.heading}
                      </th>
                    </tr>
                    {group.lines.map((line) => (
                      <tr key={line.label} className="border-b-2 border-rule">
                        <th scope="row" className="p-3 align-top font-semibold">
                          {line.label}
                        </th>
                        {schools.map((s) => (
                          <td key={s.institution.slug} className="p-3 align-top">
                            <Cell value={line.value(s)} />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                ))}
                <tbody>
                  <tr>
                    <th scope="row" className="p-3 align-top font-semibold">
                      Links
                    </th>
                    {schools.map((s) => (
                      <td key={s.institution.slug} className="p-3 align-top">
                        <Links school={s} />
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Small screens: one card per school. */}
            <ul className="space-y-6 md:hidden">
              {schools.map((s) => (
                <li key={s.institution.slug} className="border-2 border-rule p-4">
                  <h2 className="text-2xl text-navy">{s.institution.name}</h2>
                  <Link href={without(slugs, s.institution.slug)} aria-label={`Remove ${s.institution.name}`} className="text-sm font-semibold text-royal-ink underline">
                    Remove
                  </Link>
                  {LINES.map((group) => (
                    <div key={group.heading} className="mt-4">
                      <h3 className="text-lg text-navy">{group.heading}</h3>
                      <dl>
                        {group.lines.map((line) => (
                          <div key={line.label} className="grid grid-cols-2 gap-3 border-b-2 border-rule py-2">
                            <dt className="font-semibold">{line.label}</dt>
                            <dd>
                              <Cell value={line.value(s)} />
                            </dd>
                          </div>
                        ))}
                      </dl>
                    </div>
                  ))}
                  <div className="mt-4">
                    <Links school={s} />
                  </div>
                </li>
              ))}
            </ul>

            <p className="text-sm text-slate">
              Programs: U.S. Department of Education, EADA. Admissions, costs and enrollment: U.S. Department of Education,
              College Scorecard (IPEDS). Score ranges describe enrolled first-time students whose scores were used in
              admission. <Link href="/data-methodology" className="font-semibold text-royal-ink underline">About this data</Link>
            </p>
          </>
        ) : null}
      </div>
    </>
  );
}
