'use client';

import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';

import { Button } from '@/components/ui/button';
import { SelectField, TextField } from '@/components/ui/field';
import { Notice } from '@/components/ui/notice';
import { StatusChip, type ChipTone } from '@/components/ui/status-chip';
import { parseCoreGpa, type EligibilityStatus } from '@/lib/matching/eligibility';
import { BENCHMARK_LABELS, BENCHMARK_NAMES } from '@/lib/matching/explain';
import type { AcademicFit } from '@/lib/matching/fit';
import {
  EMPTY_PLAYER_NUMBERS,
  forgetPlayerNumbers,
  hasAnyNumber,
  readPlayerNumbers,
  savePlayerNumbers,
  type PlayerField,
  type PlayerNumbers,
} from '@/lib/matching/player-store';
import { parseApplicantInput, type SchoolEvidence } from '@/lib/matching/rules';
import { schoolFit, type SchoolFit } from '@/lib/matching/school-fit';
import {
  ACADEMIC_FIT_LABELS,
  ACADEMIC_FIT_REASONS,
  ELIGIBILITY_LABELS,
  ELIGIBILITY_REASONS,
  ELIGIBILITY_SCOPE_NOTE,
  GROUP_DESCRIPTIONS,
  GROUP_NAMES,
  LEVEL_LABELS,
  SUGGESTION_DISCLAIMER,
} from '@/lib/matching/suggestions-explain';
import type { AthleticLevelResult, SuggestionGroup } from '@/lib/matching/suggestions';
import type { DivisionCode } from '@/lib/registry/types';

const GROUP_TONES: Readonly<Record<SuggestionGroup, ChipTone>> = {
  strong_fit: 'positive',
  possible_fit: 'progress',
  reach: 'attention',
  not_enough_data: 'neutral',
};
const FIT_TONES: Readonly<Record<AcademicFit, ChipTone>> = { fit: 'positive', stretch: 'progress', reach: 'attention', not_enough_data: 'neutral' };
const ELIGIBILITY_TONES: Readonly<Record<EligibilityStatus, ChipTone>> = {
  meets: 'positive',
  likely_meets: 'positive',
  below: 'blocked',
  likely_below: 'blocked',
  depends: 'attention',
  unknown: 'neutral',
  not_applicable: 'neutral',
};

type Errors = Partial<Record<PlayerField, string>>;

interface Props {
  readonly schoolName: string;
  readonly division: DivisionCode;
  readonly evidence: SchoolEvidence;
  readonly thisYear: number;
  /** The player's athletic result for this school's level; null until level standards and an assessment exist. */
  readonly athletic: AthleticLevelResult | null;
}

function evaluate(numbers: PlayerNumbers, props: Props): { readonly fit: SchoolFit } | { readonly errors: Errors } {
  const parsed = parseApplicantInput(
    {
      applicantType: numbers.applicantType,
      entryYear: numbers.entryYear,
      satErw: numbers.satErw,
      satMath: numbers.satMath,
      act: numbers.act,
      submitScores: numbers.submitScores,
      gpa: numbers.gpa,
      gpaScale: numbers.gpaScale,
      gpaType: numbers.gpaType,
    },
    props.thisYear,
  );
  const errors: Errors = parsed.ok ? {} : { ...(parsed.errors as Errors) };
  const d1 = parseCoreGpa(numbers.coreGpaDivisionI);
  const d2 = parseCoreGpa(numbers.coreGpaDivisionII);
  if (!d1.ok) errors.coreGpaDivisionI = d1.error;
  if (!d2.ok) errors.coreGpaDivisionII = d2.error;
  if (!parsed.ok || !d1.ok || !d2.ok) return { errors };
  return {
    fit: schoolFit(props.evidence, props.division, parsed.input, props.athletic, {
      ncaaCoreGpaDivisionI: d1.value,
      ncaaCoreGpaDivisionII: d2.value,
    }),
  };
}

/**
 * "Your fit with this school" on a school page. The player's numbers are
 * compared in the browser and remembered on this device only
 * (src/lib/matching/player-store.ts); nothing is sent to Base Recruits.
 */
export function SchoolFitPanel(props: Props) {
  const { schoolName, division, thisYear } = props;
  // null until the browser has been checked, so the server render never guesses.
  const [numbers, setNumbers] = useState<PlayerNumbers | null>(null);
  const [editing, setEditing] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [notSaved, setNotSaved] = useState(false);
  const errorSummary = useRef<HTMLDivElement>(null);
  const resultHeading = useRef<HTMLHeadingElement>(null);
  const [focusTarget, setFocusTarget] = useState<'errors' | 'result' | null>(null);

  useEffect(() => {
    const stored = readPlayerNumbers();
    const start = stored ?? { ...EMPTY_PLAYER_NUMBERS, entryYear: String(thisYear + 1) };
    setNumbers(start);
    setEditing(!stored || !hasAnyNumber(stored));
  }, [thisYear]);

  useEffect(() => {
    if (!focusTarget) return;
    (focusTarget === 'errors' ? errorSummary.current : resultHeading.current)?.focus();
    setFocusTarget(null);
  }, [focusTarget]);

  const outcome = useMemo(() => (numbers && !editing ? evaluate(numbers, props) : null), [numbers, editing, props]);
  // Stored numbers that no longer validate (for example an entry year that has passed) reopen the form.
  useEffect(() => {
    if (outcome && 'errors' in outcome) {
      setErrors(outcome.errors);
      setEditing(true);
    }
  }, [outcome]);

  if (numbers === null) {
    return <p className="text-slate">Loading your numbers…</p>;
  }

  const level = division === 'ncaa_d1' ? 'd1' : division === 'ncaa_d2' ? 'd2' : null;

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const next: Record<string, string> = { ...(numbers ?? EMPTY_PLAYER_NUMBERS) };
    for (const [key, value] of form.entries()) if (typeof value === 'string' && key in next) next[key] = value.trim();
    const candidate = next as PlayerNumbers;
    const result = evaluate(candidate, props);
    if ('errors' in result) {
      setErrors(result.errors);
      setFocusTarget('errors');
      return;
    }
    setErrors({});
    setNotSaved(!savePlayerNumbers(candidate));
    setNumbers(candidate);
    setEditing(false);
    setFocusTarget('result');
  }

  function onForget() {
    forgetPlayerNumbers();
    setNumbers({ ...EMPTY_PLAYER_NUMBERS, entryYear: String(thisYear + 1) });
    setErrors({});
    setNotSaved(false);
    setEditing(true);
  }

  if (editing) {
    const errorEntries = Object.entries(errors).filter(([, v]) => v);
    const years = [thisYear, thisYear + 1, thisYear + 2, thisYear + 3, thisYear + 4];
    return (
      <form onSubmit={onSubmit} noValidate className="space-y-6" aria-label={`See your fit with ${schoolName}`}>
        <p>
          Enter your numbers once and every school page shows how you compare. They are compared in your browser and
          remembered on this device only. They are never sent to Base Recruits.
        </p>
        {errorEntries.length > 0 ? (
          <div ref={errorSummary} tabIndex={-1} role="alert" className="border-l-4 border-danger bg-danger-soft px-4 py-3">
            <p className="font-semibold">Check {errorEntries.length === 1 ? 'this field' : 'these fields'}:</p>
            <ul className="mt-1 list-disc pl-5">
              {errorEntries.map(([key, message]) => (
                <li key={key}>
                  <a href={`#fit-${key}`} className="font-semibold text-royal-ink underline">
                    {message}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField id="fit-applicantType" name="applicantType" label="Applying as" defaultValue={numbers.applicantType} error={errors.applicantType}>
            <option value="first_year">A first-year student</option>
            <option value="transfer">A transfer student</option>
          </SelectField>
          <SelectField id="fit-entryYear" name="entryYear" label="Entering college in fall" defaultValue={numbers.entryYear || String(thisYear + 1)} error={errors.entryYear}>
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </SelectField>
          <TextField id="fit-gpa" name="gpa" label="GPA" inputMode="decimal" defaultValue={numbers.gpa} error={errors.gpa} autoComplete="off" />
          <SelectField id="fit-gpaScale" name="gpaScale" label="GPA scale" defaultValue={numbers.gpaScale} error={errors.gpaScale}>
            <option value="4">Out of 4.0</option>
            <option value="5">Out of 5.0</option>
            <option value="100">Out of 100</option>
          </SelectField>
          <SelectField id="fit-gpaType" name="gpaType" label="GPA type" defaultValue={numbers.gpaType}>
            <option value="unweighted">Unweighted</option>
            <option value="weighted">Weighted</option>
            <option value="">Not sure</option>
          </SelectField>
          <SelectField id="fit-submitScores" name="submitScores" label="Will you send test scores?" defaultValue={numbers.submitScores} error={errors.submitScores}>
            <option value="yes">Yes</option>
            <option value="undecided">Not sure yet</option>
            <option value="no">No</option>
          </SelectField>
          <TextField id="fit-satErw" name="satErw" label="SAT Reading and Writing" hint="200–800, optional" inputMode="numeric" defaultValue={numbers.satErw} error={errors.satErw} autoComplete="off" />
          <TextField id="fit-satMath" name="satMath" label="SAT Math" hint="200–800, optional" inputMode="numeric" defaultValue={numbers.satMath} error={errors.satMath} autoComplete="off" />
          <TextField id="fit-act" name="act" label="ACT composite" hint="1–36, optional" inputMode="numeric" defaultValue={numbers.act} error={errors.act} autoComplete="off" />
          {level === 'd1' ? (
            <TextField id="fit-coreGpaDivisionI" name="coreGpaDivisionI" label="NCAA Division I core-course GPA" hint="Optional, from the NCAA Eligibility Center" inputMode="decimal" defaultValue={numbers.coreGpaDivisionI} error={errors.coreGpaDivisionI} autoComplete="off" />
          ) : null}
          {level === 'd2' ? (
            <TextField id="fit-coreGpaDivisionII" name="coreGpaDivisionII" label="NCAA Division II core-course GPA" hint="Optional, from the NCAA Eligibility Center" inputMode="decimal" defaultValue={numbers.coreGpaDivisionII} error={errors.coreGpaDivisionII} autoComplete="off" />
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <Button type="submit">See your fit</Button>
          {hasAnyNumber(numbers) ? (
            <Button type="button" variant="quiet" onClick={onForget}>
              Forget my numbers
            </Button>
          ) : null}
        </div>
      </form>
    );
  }

  if (!outcome || 'errors' in outcome) return null;
  const { fit } = outcome;
  const benchmarks = fit.comparison.benchmarks.filter((b) => b.key !== 'gpa' && b.low !== null && b.high !== null);

  return (
    <div className="space-y-6" aria-live="polite">
      {notSaved ? (
        <Notice tone="attention" title="Not remembered on this device">
          This browser won&apos;t store your numbers, so you&apos;ll need to enter them again on other school pages.
        </Notice>
      ) : null}

      <div className="space-y-2">
        <h3 ref={resultHeading} tabIndex={-1} className="text-2xl text-navy">
          Your fit with {schoolName}
        </h3>
        {!fit.placed ? (
          <p>
            Base Recruits doesn&apos;t place schools in this association by level yet, so there&apos;s no overall result. Your
            academic comparison is below.
          </p>
        ) : fit.group === null ? (
          <p>
            Your assessment is below the {LEVEL_LABELS[fit.level]} standard, so this school isn&apos;t in your suggestions. Your
            academic comparison is below.
          </p>
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            <StatusChip tone={GROUP_TONES[fit.group]}>{GROUP_NAMES[fit.group]}</StatusChip>
            <span className="text-slate">{GROUP_DESCRIPTIONS[fit.group]}</span>
          </div>
        )}
      </div>

      <dl className="space-y-0">
        {fit.placed ? (
          <div className="grid gap-1 border-b-2 border-rule py-3 sm:grid-cols-[16rem_1fr] sm:gap-4">
            <dt className="font-semibold text-graphite">Athletic level ({LEVEL_LABELS[fit.level]})</dt>
            <dd>
              {fit.athletic.status === 'in_range'
                ? 'Your assessment results are in range for this level’s standards.'
                : fit.athletic.status === 'below'
                  ? 'Your assessment results are below this level’s standards.'
                  : 'Not available yet. Level standards are being added, and your result appears here once your assessment is matched to them.'}
            </dd>
          </div>
        ) : null}
        <div className="grid gap-1 border-b-2 border-rule py-3 sm:grid-cols-[16rem_1fr] sm:gap-4">
          <dt className="font-semibold text-graphite">Academics</dt>
          <dd className="space-y-2">
            <StatusChip tone={FIT_TONES[fit.academic.fit]}>{ACADEMIC_FIT_LABELS[fit.academic.fit]}</StatusChip>
            <p>{ACADEMIC_FIT_REASONS[fit.academic.reason]}</p>
            {benchmarks.length > 0 ? (
              <ul className="list-disc space-y-1 pl-5 text-sm">
                {benchmarks.map((b) => (
                  <li key={b.key}>
                    {BENCHMARK_NAMES[b.key]}: {b.low}–{b.high} for the {b.term ?? 'past'} class
                    {b.applicant !== null ? `; yours ${b.applicant} (${BENCHMARK_LABELS[b.status].toLowerCase()})` : ''}
                  </li>
                ))}
              </ul>
            ) : null}
          </dd>
        </div>
        {fit.placed ? (
          <div className="grid gap-1 border-b-2 border-rule py-3 sm:grid-cols-[16rem_1fr] sm:gap-4">
            <dt className="font-semibold text-graphite">Academic minimum to compete</dt>
            <dd className="space-y-2">
              <StatusChip tone={ELIGIBILITY_TONES[fit.eligibility.status]}>{ELIGIBILITY_LABELS[fit.eligibility.status]}</StatusChip>
              <ul className="list-disc space-y-1 pl-5 text-sm">
                {fit.eligibility.reasons.map((r) => (
                  <li key={r}>{ELIGIBILITY_REASONS[r]}</li>
                ))}
              </ul>
              <p className="text-sm text-slate">{ELIGIBILITY_SCOPE_NOTE}</p>
            </dd>
          </div>
        ) : null}
      </dl>

      <p className="text-sm text-slate">{SUGGESTION_DISCLAIMER}</p>
      <div className="flex flex-wrap items-center gap-4">
        <Button type="button" variant="secondary" size="sm" onClick={() => setEditing(true)}>
          Edit my numbers
        </Button>
        <Button type="button" variant="quiet" size="sm" onClick={onForget}>
          Forget my numbers
        </Button>
      </div>
    </div>
  );
}
