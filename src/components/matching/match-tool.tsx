'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';

import { matchCandidates, savedCandidates, type CandidateResult } from '@/app/(site)/match/actions';
import { SaveButton } from '@/components/shortlist/save-button';
import { buttonStyles } from '@/components/ui/button';
import { SelectField, TextField } from '@/components/ui/field';
import { Notice } from '@/components/ui/notice';
import { StatusChip } from '@/components/ui/status-chip';
import {
  BENCHMARK_LABELS,
  BENCHMARK_NAMES,
  EVIDENCE_LABELS,
  GROUP_LABELS,
  REASONS,
  REQUIREMENT_LABELS,
} from '@/lib/matching/explain';
import {
  RULES_VERSION,
  compareSchool,
  parseApplicantInput,
  scoreGroup,
  type ApplicantInput,
  type ComparisonResult,
  type ReasonCode,
  type SchoolEvidence,
  type ScoreGroup,
} from '@/lib/matching/rules';
import { DIVISION_SHORTCUTS, type DivisionShortcut } from '@/lib/registry/divisions';
import { TEST_POLICY_LABELS, formatRange, formatRetrieved, linkHost, placeLabel } from '@/lib/registry/labels';
import { STATE_OPTIONS } from '@/lib/registry/states';
import type { CurrentPolicy, SchoolSummary } from '@/lib/registry/types';
import { getGuestSaves } from '@/lib/shortlist/guest-store';

const SHORTCUTS = Object.keys(DIVISION_SHORTCUTS) as DivisionShortcut[];
const GROUP_ORDER: readonly ScoreGroup[] = ['at_or_above', 'mixed', 'below', 'not_compared'];

function evidenceFor(school: SchoolSummary, policies: readonly CurrentPolicy[]): SchoolEvidence {
  return {
    slug: school.slug,
    admissionsTerm: school.admissions_term,
    satErw: [school.sat_erw_25, school.sat_erw_75],
    satMath: [school.sat_math_25, school.sat_math_75],
    actComposite: [school.act_composite_25, school.act_composite_75],
    historicalTestPolicy: school.test_policy,
    currentPolicies: policies.filter((p) => p.slug === school.slug),
  };
}

function Radio({ name, value, label, defaultChecked }: { readonly name: string; readonly value: string; readonly label: ReactNode; readonly defaultChecked?: boolean }) {
  const id = `m-${name}-${value}`;
  return (
    <div className="flex items-center gap-2.5">
      <input id={id} type="radio" name={name} value={value} defaultChecked={defaultChecked} className="size-5 accent-royal" />
      <label htmlFor={id}>{label}</label>
    </div>
  );
}

function Fieldset({ legend, error, errorId, children }: { readonly legend: string; readonly error?: string; readonly errorId: string; readonly children: ReactNode }) {
  return (
    <fieldset className="space-y-2" aria-describedby={error ? errorId : undefined} aria-invalid={error ? true : undefined}>
      <legend className="mb-1 font-semibold text-graphite">{legend}</legend>
      {children}
      {error ? (
        <p id={errorId} className="text-sm font-semibold text-danger">
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}

function uniqueReasons(result: ComparisonResult): ReasonCode[] {
  const all = [
    ...result.requirements.flatMap((r) => r.reasons),
    ...result.benchmarks.flatMap((b) => b.reasons),
    ...result.evidence.reasons,
  ];
  return [...new Set(all)];
}

function ResultCard({ school, result, signedIn }: { readonly school: SchoolSummary; readonly result: ComparisonResult; readonly signedIn: boolean }) {
  const testing = result.requirements.find((r) => r.key === 'testing');
  const gpaRequirement = result.requirements.find((r) => r.key === 'gpa_minimum');
  const headingId = `match-${school.slug}`;
  return (
    <article aria-labelledby={headingId} className="space-y-4 border-2 border-rule bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 id={headingId} className="text-2xl text-navy">
            <Link href={`/schools/${school.slug}`} className="underline decoration-2 underline-offset-4 hover:text-royal-ink">
              {school.name}
            </Link>
          </h3>
          <p className="text-slate">
            {placeLabel(school.city, school.state)} · {school.division_name}
          </p>
        </div>
        <StatusChip tone={result.evidence.status === 'sufficient' ? 'progress' : 'neutral'}>{EVIDENCE_LABELS[result.evidence.status]}</StatusChip>
      </div>

      <div>
        <h4 className="font-semibold text-navy">Requirements</h4>
        <dl className="mt-1 grid gap-1 sm:grid-cols-[14rem_1fr]">
          <dt className="text-slate">Testing</dt>
          <dd>
            <strong>{testing ? REQUIREMENT_LABELS[testing.status] : 'Unknown'}</strong>
            {testing?.policy ? (
              <span className="block text-sm text-slate">
                {TEST_POLICY_LABELS[testing.policy.test_policy].short} for fall {testing.policy.entry_year} entry, checked{' '}
                {formatRetrieved(testing.policy.verified_at)} on{' '}
                <a href={testing.policy.source_url} target="_blank" rel="noopener noreferrer" className="font-semibold text-royal-ink underline">
                  {linkHost(testing.policy.source_url) ?? 'the official page'}
                </a>
              </span>
            ) : null}
          </dd>
          <dt className="text-slate">Minimum GPA</dt>
          <dd>
            <strong>{gpaRequirement ? REQUIREMENT_LABELS[gpaRequirement.status] : 'Unknown'}</strong>
          </dd>
        </dl>
      </div>

      <div>
        <h4 className="font-semibold text-navy">
          Your scores against the {school.admissions_term ? `${school.admissions_term} entering class` : 'reported ranges'}
        </h4>
        <dl className="mt-1 grid gap-1 sm:grid-cols-[14rem_1fr]">
          {result.benchmarks.map((b) => (
            <div key={b.key} className="contents">
              <dt className="text-slate">{BENCHMARK_NAMES[b.key]}</dt>
              <dd>
                <strong>{BENCHMARK_LABELS[b.status]}</strong>
                {b.applicant !== null && b.key !== 'gpa' ? <span className="text-slate"> · you: {b.applicant}</span> : null}
                {b.low !== null && b.high !== null ? <span className="text-slate"> · range {formatRange(b.low, b.high)}</span> : null}
              </dd>
            </div>
          ))}
        </dl>
        {result.evidence.stale ? (
          <p className="mt-2 text-sm text-attention">{REASONS.HISTORICAL_DATA_STALE}</p>
        ) : null}
      </div>

      <details className="text-sm">
        <summary className="cursor-pointer font-semibold text-royal-ink underline">Why these results</summary>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          {uniqueReasons(result).map((code) => (
            <li key={code}>{REASONS[code]}</li>
          ))}
          <li>
            Ranges: U.S. Department of Education, College Scorecard (IPEDS), {school.admissions_term ?? 'no class reported'}.
          </li>
        </ul>
      </details>

      <div className="flex flex-wrap gap-x-5 gap-y-2">
        <Link href={`/schools/${school.slug}`} className="font-semibold text-royal-ink underline" aria-label={`Details and sources for ${school.name}`}>
          Details and sources
        </Link>
        <SaveButton slug={school.slug} name={school.name} mode={signedIn ? 'account' : 'guest'} />
      </div>
    </article>
  );
}

/**
 * The score comparison. Grades and scores are checked and compared entirely
 * in the browser; only school filters are sent to the server.
 */
export function MatchTool({ signedIn, thisYear }: { readonly signedIn: boolean; readonly thisYear: number }) {
  const [errors, setErrors] = useState<Readonly<Record<string, string>>>({});
  const [input, setInput] = useState<ApplicantInput | null>(null);
  const [data, setData] = useState<CandidateResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState<{ state: string; divisions: string[]; source: 'filters' | 'saved' }>({ state: '', divisions: [], source: 'filters' });
  const [sort, setSort] = useState<'group' | 'name'>('group');
  const errorSummary = useRef<HTMLDivElement>(null);
  const resultsHeading = useRef<HTMLHeadingElement>(null);
  // Where focus goes after a submission, applied once React has rendered it.
  const [focusRequest, setFocusRequest] = useState<{ readonly target: 'errors' | 'results' } | null>(null);

  useEffect(() => {
    if (!focusRequest) return;
    (focusRequest.target === 'errors' ? errorSummary.current : resultsHeading.current)?.focus();
  }, [focusRequest]);

  const results = useMemo(() => {
    if (!input || !data || data.status !== 'ok') return [];
    const rows = data.schools.map((school) => {
      const result = compareSchool(evidenceFor(school, data.policies), input);
      return { school, result, group: scoreGroup(result) };
    });
    if (sort === 'group') rows.sort((a, b) => GROUP_ORDER.indexOf(a.group) - GROUP_ORDER.indexOf(b.group) || a.school.name.localeCompare(b.school.name));
    else rows.sort((a, b) => a.school.name.localeCompare(b.school.name));
    return rows;
  }, [input, data, sort]);

  const counts = useMemo(() => {
    const map = new Map<ScoreGroup, number>();
    for (const row of results) map.set(row.group, (map.get(row.group) ?? 0) + 1);
    return map;
  }, [results]);

  async function load(nextFilters: typeof filters, nextPage: number, append: boolean) {
    setLoading(true);
    try {
      const next =
        nextFilters.source === 'saved'
          ? await savedCandidates(signedIn ? [] : [...getGuestSaves().slugs])
          : await matchCandidates({ state: nextFilters.state, divisions: nextFilters.divisions, page: nextPage });
      setData((previous) =>
        append && previous && previous.status === 'ok' && next.status === 'ok'
          ? { ...next, schools: [...previous.schools, ...next.schools], policies: [...previous.policies, ...next.policies] }
          : next,
      );
      setPage(nextPage);
    } catch {
      setData({ status: 'failed', schools: [], policies: [], total: 0 });
    } finally {
      setLoading(false);
    }
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const value = (name: string) => {
      const v = form.get(name);
      return typeof v === 'string' ? v : '';
    };
    const parsed = parseApplicantInput(
      {
        applicantType: value('applicantType'),
        entryYear: value('entryYear'),
        satErw: value('satErw'),
        satMath: value('satMath'),
        act: value('act'),
        submitScores: value('submitScores'),
        gpa: value('gpa'),
        gpaScale: value('gpaScale'),
        gpaType: value('gpaType'),
      },
      thisYear,
    );
    if (!parsed.ok) {
      setErrors(parsed.errors);
      setInput(null);
      // Move focus to the error summary only after a failed submission.
      setFocusRequest({ target: 'errors' });
      return;
    }
    setErrors({});
    setInput(parsed.input);
    const nextFilters = {
      state: value('state'),
      divisions: form.getAll('division').filter((d): d is string => typeof d === 'string'),
      source: value('source') === 'saved' ? ('saved' as const) : ('filters' as const),
    };
    setFilters(nextFilters);
    await load(nextFilters, 1, false);
    setFocusRequest({ target: 'results' });
  }

  const errorEntries = Object.entries(errors);
  const fieldIds: Record<string, string> = {
    applicantType: 'm-applicantType-first_year',
    entryYear: 'm-entryYear',
    satErw: 'm-satErw',
    satMath: 'm-satMath',
    act: 'm-act',
    submitScores: 'm-submitScores-yes',
    gpa: 'm-gpa',
    gpaScale: 'm-gpaScale',
  };
  const years = [thisYear, thisYear + 1, thisYear + 2, thisYear + 3, thisYear + 4];

  return (
    <div className="space-y-10">
      <form onSubmit={onSubmit} noValidate className="space-y-8" aria-label="Compare your scores">
        {errorEntries.length > 0 ? (
          <div ref={errorSummary} tabIndex={-1} role="alert" className="border-l-4 border-danger bg-danger-soft px-4 py-3">
            <p className="font-semibold">Check {errorEntries.length === 1 ? 'this field' : 'these fields'}:</p>
            <ul className="mt-1 list-disc pl-5">
              {errorEntries.map(([key, message]) => (
                <li key={key}>
                  <a href={`#${fieldIds[key] ?? 'm-entryYear'}`} className="font-semibold text-royal-ink underline">
                    {message}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="grid gap-8 lg:grid-cols-2">
          <div className="space-y-5">
            <h2 className="text-3xl text-navy">About you</h2>
            <Fieldset legend="Applying as" error={errors.applicantType} errorId="m-applicantType-error">
              <Radio name="applicantType" value="first_year" label="A first-year student (from high school)" defaultChecked />
              <Radio name="applicantType" value="transfer" label="A transfer student" />
            </Fieldset>
            <SelectField id="m-entryYear" name="entryYear" label="Entering college in fall" defaultValue={String(thisYear + 1)} error={errors.entryYear}>
              {years.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </SelectField>

            <h2 className="pt-2 text-3xl text-navy">Test scores (optional)</h2>
            <p className="text-sm text-slate">Leave these empty if you haven&apos;t taken the SAT or ACT.</p>
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField id="m-satErw" name="satErw" label="SAT Reading and Writing" inputMode="numeric" hint="200–800" error={errors.satErw} autoComplete="off" />
              <TextField id="m-satMath" name="satMath" label="SAT Math" inputMode="numeric" hint="200–800" error={errors.satMath} autoComplete="off" />
              <TextField id="m-act" name="act" label="ACT composite" inputMode="numeric" hint="1–36" error={errors.act} autoComplete="off" />
            </div>
            <Fieldset legend="Will you send your scores?" error={errors.submitScores} errorId="m-submitScores-error">
              <Radio name="submitScores" value="yes" label="Yes" defaultChecked />
              <Radio name="submitScores" value="undecided" label="Not sure yet" />
              <Radio name="submitScores" value="no" label="No" />
            </Fieldset>

            <h2 className="pt-2 text-3xl text-navy">GPA (optional)</h2>
            <p className="text-sm text-slate">
              Schools don&apos;t report GPA in the federal data we use, so your GPA can&apos;t be compared yet. We won&apos;t
              estimate it.
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField id="m-gpa" name="gpa" label="Your GPA" inputMode="decimal" error={errors.gpa} autoComplete="off" />
              <SelectField id="m-gpaScale" name="gpaScale" label="Scale" defaultValue="4" error={errors.gpaScale}>
                <option value="4">Out of 4.0</option>
                <option value="5">Out of 5.0</option>
                <option value="100">Out of 100</option>
              </SelectField>
            </div>
            <Fieldset legend="GPA type" errorId="m-gpaType-error">
              <Radio name="gpaType" value="unweighted" label="Unweighted" defaultChecked />
              <Radio name="gpaType" value="weighted" label="Weighted" />
              <Radio name="gpaType" value="unknown" label="Not sure" />
            </Fieldset>
          </div>

          <div className="space-y-5">
            <h2 className="text-3xl text-navy">Which schools</h2>
            <Fieldset legend="Compare against" errorId="m-source-error">
              <Radio name="source" value="filters" label="Schools matching the filters below" defaultChecked />
              <Radio name="source" value="saved" label="My saved schools" />
            </Fieldset>
            <SelectField id="m-state" name="state" label="State" defaultValue="">
              <option value="">Any state</option>
              {STATE_OPTIONS.map((s) => (
                <option key={s.code} value={s.code}>
                  {s.name}
                </option>
              ))}
            </SelectField>
            <Fieldset legend="Division" errorId="m-division-error">
              {SHORTCUTS.map((key) => {
                const id = `m-division-${key}`;
                return (
                  <div key={key} className="flex items-center gap-2.5">
                    <input id={id} type="checkbox" name="division" value={key} className="size-5 accent-royal" />
                    <label htmlFor={id}>{DIVISION_SHORTCUTS[key].label}</label>
                  </div>
                );
              })}
            </Fieldset>
            <Notice tone="info" title="Your scores stay in this browser">
              Only the school filters are sent to Base Recruits. Your grades and scores are compared on this device and
              are not saved.
            </Notice>
            <button type="submit" className={buttonStyles({ variant: 'primary', size: 'lg' })} disabled={loading}>
              {loading ? 'Comparing…' : 'Compare'}
            </button>
          </div>
        </div>
      </form>

      {data ? (
        <section aria-labelledby="match-results" className="space-y-6">
          <h2 id="match-results" ref={resultsHeading} tabIndex={-1} className="text-4xl text-navy">
            Results
          </h2>
          {data.status === 'failed' ? (
            <Notice tone="error" live title="Schools didn't load">
              Something went wrong on our side. Try again.
            </Notice>
          ) : results.length === 0 ? (
            <Notice tone="info" live title="No schools to compare">
              {filters.source === 'saved' ? 'You have no saved schools yet.' : 'No programs match those filters.'}
            </Notice>
          ) : (
            <>
              <p role="status" className="text-lg">
                Compared with {results.length} of {data.total} {data.total === 1 ? 'school' : 'schools'}.
              </p>
              <ul className="space-y-1 text-sm">
                {GROUP_ORDER.filter((g) => (counts.get(g) ?? 0) > 0).map((g) => (
                  <li key={g}>
                    {GROUP_LABELS[g]}: <strong>{counts.get(g)}</strong>
                  </li>
                ))}
              </ul>
              <SelectField
                id="m-sort"
                label="Order"
                value={sort}
                onChange={(event) => setSort(event.target.value === 'name' ? 'name' : 'group')}
                className="max-w-xs"
              >
                <option value="group">By score position, then name</option>
                <option value="name">By name</option>
              </SelectField>
              <ul className="space-y-5">
                {results.map(({ school, result }) => (
                  <li key={school.slug}>
                    <ResultCard school={school} result={result} signedIn={signedIn} />
                  </li>
                ))}
              </ul>
              {filters.source === 'filters' && data.schools.length < data.total ? (
                <button
                  type="button"
                  className={buttonStyles({ variant: 'secondary' })}
                  disabled={loading}
                  onClick={() => void load(filters, page + 1, true)}
                >
                  {loading ? 'Loading…' : 'Compare with the next 100 schools'}
                </button>
              ) : null}
            </>
          )}
          <p className="text-sm text-slate">
            Comparison rules version {RULES_VERSION}. A comparison describes how your numbers sit against what schools
            reported about a past entering class. It is not an admission decision, a prediction of your chances, or a
            promise of a roster spot or scholarship.
          </p>
        </section>
      ) : null}
    </div>
  );
}
