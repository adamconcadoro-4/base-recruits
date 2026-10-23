import Link from 'next/link';
import type { ReactNode } from 'react';

import { StatusChip } from '@/components/ui/status-chip';
import {
  CONTROL_LABELS,
  LEVEL_LABELS,
  SETTING_LABELS,
  TEST_POLICY_LABELS,
  VERIFICATION_LABELS,
  formatAcademicYear,
  formatCount,
  formatMoney,
  formatRange,
  formatRate,
  placeLabel,
} from '@/lib/registry/labels';
import { entryLabel } from '@/lib/registry/policy';
import type { CurrentPolicy, SchoolSummary } from '@/lib/registry/types';

import { Value, YearTag } from './values';

/**
 * One search result. Every figure shows the term or year it describes, and
 * the baseball division says how it was confirmed. "Add to compare" (up to
 * five) and "Save school" (no limit) are separate controls.
 */
export function SchoolCard({
  school,
  compare,
  actions,
  currentPolicy,
}: {
  readonly school: SchoolSummary;
  /** Compare control for pages that keep the selection in their URL (the search). */
  readonly compare?: { readonly href: string; readonly inCompare: boolean; readonly full: boolean } | null;
  /** Other controls: Save, or a form-based compare toggle. */
  readonly actions?: ReactNode;
  /** The checked current first-year testing policy, if any. */
  readonly currentPolicy?: CurrentPolicy | null;
}) {
  const headingId = `school-${school.slug}`;
  const sameTuition =
    school.tuition_in_state !== null && school.tuition_in_state === school.tuition_out_of_state;
  const checked = school.verification !== 'federal_report';
  return (
    <article aria-labelledby={headingId} className="border-2 border-rule bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 id={headingId} className="text-2xl text-navy">
            <Link href={`/schools/${school.slug}`} className="underline decoration-2 underline-offset-4 hover:text-royal-ink">
              {school.name}
            </Link>
          </h3>
          <p className="mt-1 text-slate">
            {placeLabel(school.city, school.state)}
            {school.control ? ` · ${CONTROL_LABELS[school.control]}` : ''}
            {school.level ? ` · ${LEVEL_LABELS[school.level]}` : ''}
            {school.setting ? ` · ${SETTING_LABELS[school.setting]}` : ''}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatusChip tone="progress">{school.division_name}</StatusChip>
          {school.two_year_association ? <StatusChip tone="neutral">Two-year association</StatusChip> : null}
        </div>
      </div>
      <p className="mt-2 text-sm text-slate">
        Baseball team listed in the {formatAcademicYear(school.program_season)} federal athletics report ·{' '}
        {checked ? VERIFICATION_LABELS[school.verification].short : 'Division as reported by the school, not yet checked'}
        {school.conference ? ` · ${school.conference}` : ' · Conference not yet verified'}
      </p>

      <dl className="mt-4 grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
        <div>
          <dt className="text-sm font-semibold text-slate">
            Admission rate{school.admissions_term ? <YearTag>{school.admissions_term}</YearTag> : null}
          </dt>
          <dd className="text-lg font-semibold">
            <Value value={school.admission_rate}>{formatRate(school.admission_rate)}</Value>
          </dd>
        </div>
        <div>
          <dt className="text-sm font-semibold text-slate">
            SAT middle 50%{school.admissions_term && (school.sat_math_25 !== null || school.sat_erw_25 !== null) ? <YearTag>{school.admissions_term}</YearTag> : null}
          </dt>
          <dd>
            {school.sat_math_25 !== null || school.sat_erw_25 !== null ? (
              <span>
                Reading/Writing {formatRange(school.sat_erw_25, school.sat_erw_75)}; Math {formatRange(school.sat_math_25, school.sat_math_75)}
              </span>
            ) : (
              <Value value={null} />
            )}
          </dd>
        </div>
        <div>
          <dt className="text-sm font-semibold text-slate">
            ACT composite middle 50%{school.admissions_term && school.act_composite_25 !== null ? <YearTag>{school.admissions_term}</YearTag> : null}
          </dt>
          <dd>
            <Value value={school.act_composite_25}>{formatRange(school.act_composite_25, school.act_composite_75)}</Value>
          </dd>
        </div>
        <div>
          <dt className="text-sm font-semibold text-slate">Test policy</dt>
          <dd>
            {currentPolicy ? (
              <span className="block">
                Now: {TEST_POLICY_LABELS[currentPolicy.test_policy].short.toLowerCase()} for first-year students{' '}
                {entryLabel(currentPolicy.entry_year)} <span className="text-sm text-slate">(checked)</span>
              </span>
            ) : null}
            <span className={currentPolicy ? 'block text-sm text-slate' : 'block'}>
              {school.test_policy ? (
                <>
                  {TEST_POLICY_LABELS[school.test_policy].short}
                  {school.admissions_term ? ` for the ${school.admissions_term} class` : ''}
                </>
              ) : (
                <Value value={null} />
              )}
            </span>
            {!currentPolicy ? <span className="block text-sm text-slate">Current policy not yet checked</span> : null}
          </dd>
        </div>
        <div>
          <dt className="text-sm font-semibold text-slate">
            Cost of attendance{school.cost_year ? <YearTag>{formatAcademicYear(school.cost_year)}</YearTag> : null}
          </dt>
          <dd>
            <Value value={school.cost_of_attendance}>{formatMoney(school.cost_of_attendance)}</Value>
            {sameTuition ? null : school.tuition_in_state !== null ? (
              <span className="block text-sm text-slate">In-state tuition and fees {formatMoney(school.tuition_in_state)}</span>
            ) : null}
          </dd>
        </div>
        <div>
          <dt className="text-sm font-semibold text-slate">
            Undergraduates{school.enrollment_term ? <YearTag>{school.enrollment_term}</YearTag> : null}
          </dt>
          <dd>
            <Value value={school.undergraduate_enrollment}>{formatCount(school.undergraduate_enrollment)}</Value>
          </dd>
        </div>
      </dl>

      <div className="mt-4 flex flex-wrap items-start gap-x-5 gap-y-2">
        <Link href={`/schools/${school.slug}`} aria-label={`Details and sources for ${school.name}`} className="font-semibold text-royal-ink underline">
          Details and sources
        </Link>
        {compare ? (
          compare.inCompare ? (
            <Link href={compare.href} aria-label={`Remove from compare: ${school.name}`} className="font-semibold text-royal-ink underline" scroll={false}>
              Remove from compare
            </Link>
          ) : compare.full ? (
            <span className="text-sm text-slate">Compare holds five schools</span>
          ) : (
            <Link href={compare.href} aria-label={`Add to compare: ${school.name}`} className="font-semibold text-royal-ink underline" scroll={false}>
              Add to compare
            </Link>
          )
        ) : null}
        {actions}
      </div>
    </article>
  );
}
