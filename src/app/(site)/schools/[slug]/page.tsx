import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';

import { SourceList } from '@/components/registry/source-list';
import { ExternalLink, Value, YearTag } from '@/components/registry/values';
import { ButtonLink } from '@/components/ui/button';
import { Notice } from '@/components/ui/notice';
import { StatusChip } from '@/components/ui/status-chip';
import {
  CONTROL_LABELS,
  LEVEL_LABELS,
  PREDOMINANT_DEGREE_LABELS,
  SETTING_LABELS,
  STATUS_LABELS,
  TEST_POLICY_LABELS,
  VERIFICATION_LABELS,
  formatAcademicYear,
  formatCount,
  formatMoney,
  formatRange,
  formatRate,
  formatRetrieved,
  linkHost,
  placeLabel,
} from '@/lib/registry/labels';
import { getSchool } from '@/lib/registry/queries';
import { SLUG_PATTERN } from '@/lib/registry/search-params';

type Params = Promise<{ slug: string }>;

async function load(params: Params) {
  const { slug } = await params;
  if (!SLUG_PATTERN.test(slug) || slug.length > 120) return null;
  return getSchool(slug);
}

export async function generateMetadata({ params }: { readonly params: Params }): Promise<Metadata> {
  const school = await load(params);
  if (!school || school === 'failed') return { title: 'School not found' };
  return {
    title: `${school.institution.name} baseball`,
    description: `${school.institution.name}: baseball program, admissions, test policy and published cost, with sources.`,
  };
}

function Row({ label, children }: { readonly label: ReactNode; readonly children: ReactNode }) {
  return (
    <div className="grid gap-1 border-b-2 border-rule py-3 sm:grid-cols-[16rem_1fr] sm:gap-4">
      <dt className="font-semibold text-graphite">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function Section({ id, title, children }: { readonly id: string; readonly title: string; readonly children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="border-t-4 border-navy pt-5">
      <h2 id={id} className="text-3xl text-navy">
        {title}
      </h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

export default async function SchoolPage({ params }: { readonly params: Params }) {
  const school = await load(params);
  if (school === 'failed') {
    return (
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <Notice tone="error" title="This school didn't load">
          Something went wrong on our side. Refresh the page to try again.
        </Notice>
      </div>
    );
  }
  if (!school) notFound();

  const { institution, program, admissions, costs } = school;
  const active = program?.status === 'active';
  const sameTuition = costs !== null && costs.tuition_in_state !== null && costs.tuition_in_state === costs.tuition_out_of_state;
  const hasSat = admissions !== null && (admissions.sat_erw_25 !== null || admissions.sat_math_25 !== null);

  return (
    <>
      <section className="border-b-4 border-royal bg-ice">
        <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
          <p className="font-semibold text-slate">
            <Link href="/schools" className="text-royal-ink underline">
              All programs
            </Link>
          </p>
          <h1 className="mt-3 max-w-4xl text-5xl text-navy sm:text-6xl">{institution.name}</h1>
          <p className="mt-3 text-lg">
            {placeLabel(institution.city, institution.state)}
            {institution.control ? ` · ${CONTROL_LABELS[institution.control]}` : ''}
            {institution.level ? ` · ${LEVEL_LABELS[institution.level]}` : ''}
          </p>
          <div className="mt-5 flex flex-wrap items-center gap-3">
            {program ? (
              <StatusChip tone={active ? 'progress' : 'attention'}>
                {active ? program.division.name : STATUS_LABELS[program.status]}
              </StatusChip>
            ) : null}
            <ButtonLink href={`/schools?compare=${institution.slug}`} variant="secondary" size="sm">
              Add to compare
            </ButtonLink>
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-6xl space-y-14 px-4 py-12 sm:px-6">
        <Section id="baseball" title="Baseball program">
          {program ? (
            <>
              {!active ? (
                <Notice tone="attention" title={STATUS_LABELS[program.status]} className="mb-5">
                  {program.status === 'not_reported'
                    ? `The most recent federal athletics report does not list a baseball team here. The last report that did was for ${formatAcademicYear(program.season)}. This school is not shown in search.`
                    : (program.status_note ?? 'Confirmed by Base Recruits from an official page.')}
                </Notice>
              ) : null}
              <dl>
                <Row label="Division">
                  <span>{program.division.name}</span>
                  <span className="block text-sm text-slate">{program.association.name}</span>
                </Row>
                <Row label="How it was confirmed">
                  <span>{VERIFICATION_LABELS[program.verification].short}</span>
                  <span className="block text-sm text-slate">{VERIFICATION_LABELS[program.verification].long}</span>
                  {program.verification !== 'federal_report' && program.verification_source_url ? (
                    <span className="block text-sm">
                      Checked {formatRetrieved(program.verified_at)} against{' '}
                      <ExternalLink href={program.verification_source_url}>{linkHost(program.verification_source_url) ?? 'the official page'}</ExternalLink>
                    </span>
                  ) : null}
                </Row>
                <Row label="Reported classification">
                  <Value value={program.classification_label}>
                    {program.classification_label}
                    {program.classification_other ? `: ${program.classification_other}` : ''}
                  </Value>
                  <span className="block text-sm text-slate">As the school reported it to EADA for {formatAcademicYear(program.season)}.</span>
                </Row>
                <Row label="Conference">
                  {program.conference ?? <span className="text-slate italic">Not yet verified</span>}
                </Row>
                <Row label={<>Team participants<YearTag>{formatAcademicYear(program.season)}</YearTag></>}>
                  <Value value={program.reported_participants}>{formatCount(program.reported_participants)}</Value>
                  <span className="block text-sm text-slate">Athletes on the team as reported to EADA; not a count of open spots.</span>
                </Row>
                <Row label="Official baseball pages">
                  {program.athletics_url || program.roster_url || program.questionnaire_url ? (
                    <ul className="space-y-1">
                      {program.athletics_url ? (
                        <li>
                          <ExternalLink href={program.athletics_url}>Team page</ExternalLink>
                        </li>
                      ) : null}
                      {program.roster_url ? (
                        <li>
                          <ExternalLink href={program.roster_url}>Roster</ExternalLink>
                        </li>
                      ) : null}
                      {program.questionnaire_url ? (
                        <li>
                          <ExternalLink href={program.questionnaire_url}>Recruiting questionnaire</ExternalLink>
                        </li>
                      ) : null}
                    </ul>
                  ) : (
                    <span className="text-slate italic">Not yet verified</span>
                  )}
                </Row>
              </dl>
              <p className="mt-4 text-sm text-slate">
                A listed team and its division say nothing about roster openings, scholarships or a coach&apos;s interest.
              </p>
            </>
          ) : (
            <p>No baseball program is on record for this school.</p>
          )}
        </Section>

        <Section id="admissions" title="Admissions">
          {admissions ? (
            <>
              <p className="mb-2 text-slate">First-year admissions for the {admissions.term} entering class.</p>
              <dl>
                <Row label="Admission rate">
                  <Value value={admissions.admission_rate}>{formatRate(admissions.admission_rate)}</Value>
                </Row>
                <Row label="Test policy">
                  <Value value={admissions.test_policy}>{admissions.test_policy ? TEST_POLICY_LABELS[admissions.test_policy].long : null}</Value>
                </Row>
                <Row label="SAT Reading and Writing, middle 50%">
                  <Value value={admissions.sat_erw_25}>{formatRange(admissions.sat_erw_25, admissions.sat_erw_75)}</Value>
                </Row>
                <Row label="SAT Math, middle 50%">
                  <Value value={admissions.sat_math_25}>{formatRange(admissions.sat_math_25, admissions.sat_math_75)}</Value>
                </Row>
                <Row label="ACT composite, middle 50%">
                  <Value value={admissions.act_composite_25}>{formatRange(admissions.act_composite_25, admissions.act_composite_75)}</Value>
                </Row>
                <Row label="GPA">
                  <span className="text-slate italic">Not reported in federal data</span>
                </Row>
              </dl>
              {hasSat || admissions.act_composite_25 !== null ? (
                <p className="mt-4 text-sm text-slate">
                  Score ranges are the 25th to 75th percentile of enrolled first-time students whose scores were used in
                  the admission decision, as reported to IPEDS. They are not the range for all applicants, and a school&apos;s
                  admission rate is not anyone&apos;s personal chance of admission.
                </p>
              ) : null}
            </>
          ) : (
            <p>
              <span className="text-slate italic">Not reported.</span> The federal data has no first-year admissions figures for
              this school. Open-admission and two-year colleges usually don&apos;t report them.
            </p>
          )}
        </Section>

        <Section id="cost" title="Published cost">
          {costs ? (
            <>
              <p className="mb-2 text-slate">Sticker prices for the {formatAcademicYear(costs.academic_year)} academic year, before any financial aid.</p>
              <dl>
                <Row label="Cost of attendance">
                  <Value value={costs.cost_of_attendance}>{formatMoney(costs.cost_of_attendance)}</Value>
                  <span className="block text-sm text-slate">Tuition and fees, housing, food, books and other costs for one year.</span>
                </Row>
                {sameTuition ? (
                  <Row label="Tuition and fees">{formatMoney(costs.tuition_in_state)}</Row>
                ) : (
                  <>
                    <Row label="Tuition and fees, in-state">
                      <Value value={costs.tuition_in_state}>{formatMoney(costs.tuition_in_state)}</Value>
                    </Row>
                    <Row label="Tuition and fees, out-of-state">
                      <Value value={costs.tuition_out_of_state}>{formatMoney(costs.tuition_out_of_state)}</Value>
                    </Row>
                  </>
                )}
              </dl>
            </>
          ) : (
            <p>
              <span className="text-slate italic">Not reported.</span> The federal data has no published prices for this school.
            </p>
          )}
          <p className="mt-4">
            {institution.price_calculator_url ? (
              <>
                What a family actually pays depends on aid.{' '}
                <ExternalLink href={institution.price_calculator_url}>Estimate your net price with the school&apos;s calculator</ExternalLink>
              </>
            ) : (
              'What a family actually pays depends on financial aid; ask the school’s financial aid office for an estimate.'
            )}
          </p>
        </Section>

        <Section id="about" title="About the school">
          <dl>
            <Row label="Type">
              <Value value={institution.control}>{institution.control ? CONTROL_LABELS[institution.control] : null}</Value>
            </Row>
            <Row label="Two-year or four-year">
              <Value value={institution.level}>{institution.level ? LEVEL_LABELS[institution.level] : null}</Value>
            </Row>
            <Row label="Campus setting">
              <Value value={institution.setting}>{institution.setting ? SETTING_LABELS[institution.setting] : null}</Value>
            </Row>
            <Row label={<>Undergraduates{institution.enrollment_term ? <YearTag>{institution.enrollment_term}</YearTag> : null}</>}>
              <Value value={institution.undergraduate_enrollment}>{formatCount(institution.undergraduate_enrollment)}</Value>
            </Row>
            <Row label="Degrees awarded">
              <Value value={institution.predominant_degree}>
                {institution.predominant_degree ? PREDOMINANT_DEGREE_LABELS[institution.predominant_degree] : null}
              </Value>
            </Row>
            {institution.aliases.length ? <Row label="Also known as">{institution.aliases.join(', ')}</Row> : null}
            <Row label="Website">
              {institution.website_url ? (
                <ExternalLink href={institution.website_url}>{linkHost(institution.website_url) ?? institution.website_url}</ExternalLink>
              ) : (
                <Value value={null} />
              )}
            </Row>
            <Row label="Majors">
              <span className="text-slate italic">Coming soon</span>
            </Row>
          </dl>
        </Section>

        <Section id="sources" title="Sources">
          <SourceList sources={[program?.source, institution.source, admissions?.source, costs?.source]} />
          <p className="mt-4 text-sm text-slate">
            Federal identifier (IPEDS unit ID) {institution.unitid}.{' '}
            <Link href="/data-methodology" className="font-semibold text-royal-ink underline">
              How we source and label this data
            </Link>
          </p>
        </Section>
      </div>
    </>
  );
}
