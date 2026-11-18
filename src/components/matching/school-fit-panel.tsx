'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Notice } from '@/components/ui/notice';
import { StatusChip, type ChipTone } from '@/components/ui/status-chip';
import { PlayerNumbersForm, TYPED_GRADES_NOTE } from '@/components/matching/player-numbers-form';
import { METRIC_INFO, PUBLIC_BENCHMARKS, evaluateLevel, type AthleticLevelDetail, type AthleticMetric } from '@/lib/matching/athletic';
import { levelForDivision, type EligibilityStatus } from '@/lib/matching/eligibility';
import { BENCHMARK_LABELS, BENCHMARK_NAMES, REASONS } from '@/lib/matching/explain';
import type { AcademicFit } from '@/lib/matching/fit';
import {
  EMPTY_PLAYER_NUMBERS,
  forgetPlayerNumbers,
  hasAnyNumber,
  readPlayerNumbers,
  savePlayerNumbers,
  type PlayerNumbers,
} from '@/lib/matching/player-store';
import { hasTypedAcademics, readPlayerInput, type PlayerErrors } from '@/lib/matching/player-input';
import type { SchoolEvidence } from '@/lib/matching/rules';
import { schoolFit, type SchoolFit } from '@/lib/matching/school-fit';
import {
  ACADEMIC_FIT_LABELS,
  ACADEMIC_FIT_REASONS,
  ATHLETIC_STATUS_LABELS,
  ATHLETIC_STATUS_TEXT,
  ELIGIBILITY_LABELS,
  ELIGIBILITY_REASONS,
  ELIGIBILITY_SCOPE_NOTE,
  FLOOR_BASIS_TEXT,
  GROUP_DESCRIPTIONS,
  GROUP_NAMES,
  LEVEL_LABELS,
  METRIC_LABELS,
  SELF_REPORTED_NOTE,
  SUGGESTION_DISCLAIMER,
  power4Note,
} from '@/lib/matching/suggestions-explain';
import type { AthleticLevelResult, AthleticStatus, SuggestionGroup } from '@/lib/matching/suggestions';
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
const ATHLETIC_TONES: Readonly<Record<AthleticStatus, ChipTone>> = { in_range: 'positive', below: 'attention', not_enough_data: 'neutral' };

type Errors = PlayerErrors;

interface Props {
  readonly schoolName: string;
  readonly division: DivisionCode;
  readonly evidence: SchoolEvidence;
  readonly thisYear: number;
  /**
   * An athletic result supplied by the server (for example from a published assessment). When null, the player's
   * self-reported numbers are compared with the public benchmarks in the browser.
   */
  readonly athletic: AthleticLevelResult | null;
  /**
   * The school's Power 4 conference name (for example "SEC") when it is a Division I school in one; its
   * numbers are then compared with the Power 4 benchmarks. Null otherwise.
   */
  readonly power4Conference: string | null;
}

interface Outcome {
  readonly fit: SchoolFit;
  /** The self-reported comparison, when the player entered a position. */
  readonly athleticDetail: AthleticLevelDetail | null;
  readonly positionEntered: boolean;
}

function evaluate(numbers: PlayerNumbers, props: Props): Outcome | { readonly errors: Errors } {
  const read = readPlayerInput(numbers, props.thisYear);
  if (!read.ok) return { errors: read.errors };
  const level = levelForDivision(props.division);
  const detail = read.athletic && level ? evaluateLevel(read.athletic, level, PUBLIC_BENCHMARKS, props.power4Conference !== null) : null;
  const athleticResult = props.athletic ?? (detail ? { status: detail.status, standardsVersion: detail.standardsVersion } : null);
  return {
    fit: schoolFit(props.evidence, props.division, read.input, athleticResult, read.extras),
    athleticDetail: props.athletic ? null : detail,
    positionEntered: read.athletic !== null,
  };
}

function formatValue(metric: AthleticMetric, value: number): string {
  const info = METRIC_INFO[metric];
  return info.unit === 's' ? `${value.toFixed(2)} s` : `${Number.isInteger(value) ? value : value.toFixed(1)} mph`;
}

function AthleticDetail({ detail, conference }: { readonly detail: AthleticLevelDetail; readonly conference: string | null }) {
  const sourceIds = [...new Set(detail.comparisons.map((c) => c.floor.source))];
  return (
    <div className="space-y-2">
      <StatusChip tone={ATHLETIC_TONES[detail.status]}>{ATHLETIC_STATUS_LABELS[detail.status]}</StatusChip>
      <p>{ATHLETIC_STATUS_TEXT[detail.status]}</p>
      {detail.power4 && conference ? <p className="text-sm">{power4Note(conference)}</p> : null}
      {detail.comparisons.length > 0 ? (
        <ul className="list-disc space-y-1 pl-5 text-sm">
          {detail.comparisons.map((c) => (
            <li key={c.metric}>
              {METRIC_LABELS[c.metric]}: yours {formatValue(c.metric, c.player)}; benchmark{' '}
              {METRIC_INFO[c.metric].lowerIsBetter ? 'at or under' : 'at or above'} {formatValue(c.metric, c.floor.value)} (
              {FLOOR_BASIS_TEXT[c.floor.basis]}
              {c.floor.average !== null && c.floor.basis !== 'level_average' ? `; average ${formatValue(c.metric, c.floor.average)}` : ''}
              {c.floor.sourceText ? `; guideline as published: ${c.floor.sourceText}` : ''}).{' '}
              <strong>{c.meets ? 'Meets it.' : 'Not yet.'}</strong>
            </li>
          ))}
        </ul>
      ) : null}
      {detail.notEntered.length > 0 ? (
        <p className="text-sm text-slate">Not entered: {detail.notEntered.map((m) => METRIC_LABELS[m].toLowerCase()).join(', ')}.</p>
      ) : null}
      {detail.notCovered.length > 0 ? (
        <p className="text-sm text-slate">
          No public benchmark at this level for: {detail.notCovered.map((m) => METRIC_LABELS[m].toLowerCase()).join(', ')}.
        </p>
      ) : null}
      {sourceIds.length > 0 ? (
        <p className="text-sm text-slate">
          Source{sourceIds.length > 1 ? 's' : ''}:{' '}
          {sourceIds.map((id, i) => {
            const s = PUBLIC_BENCHMARKS.sources[id];
            if (!s) return null;
            return (
              <span key={id}>
                {i > 0 ? '; ' : ''}
                <a href={s.url} target="_blank" rel="noopener noreferrer" className="font-semibold text-royal-ink underline">
                  {s.publisher}, {s.title}
                </a>{' '}
                ({s.kind === 'measured' ? 'measured data' : 'guideline with no published data'})
              </span>
            );
          })}
          . Checked {PUBLIC_BENCHMARKS.checkedOn}.
        </p>
      ) : null}
      <p className="text-sm text-slate">{SELF_REPORTED_NOTE}</p>
    </div>
  );
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
  // Changes after "Forget my numbers", so the open form starts blank again.
  const [formKey, setFormKey] = useState(0);
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

  const ncaa = division === 'ncaa_d1' ? 'd1' : division === 'ncaa_d2' ? 'd2' : null;
  const level = levelForDivision(division);

  function onSubmit(candidate: PlayerNumbers) {
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
    setFormKey((k) => k + 1);
    setEditing(true);
  }

  if (editing) {
    return (
      <PlayerNumbersForm
        key={formKey}
        idPrefix="fit"
        numbers={numbers}
        errors={errors}
        thisYear={thisYear}
        coreGpa={ncaa ? [ncaa] : []}
        ariaLabel={`See your fit with ${schoolName}`}
        submitLabel="See your fit"
        errorSummaryRef={errorSummary}
        onSubmit={onSubmit}
        onForget={onForget}
        intro={
          <p>
            Enter your numbers once and every school page, and your{' '}
            <Link href="/my-schools" className="font-semibold text-royal-ink underline">
              My schools
            </Link>{' '}
            list, shows how you compare. They are compared in your browser and remembered on this device only. They are
            never sent to Base Recruits.
          </p>
        }
      />
    );
  }

  if (!outcome || 'errors' in outcome) return null;
  const { fit, athleticDetail, positionEntered } = outcome;
  const benchmarks = fit.comparison.benchmarks.filter((b) => b.low !== null && b.high !== null);
  // The Power 4 benchmarks apply only when this page compared the player's own numbers with them.
  const power4 = athleticDetail?.power4 === true;
  const levelName = power4 ? 'Power 4' : level ? LEVEL_LABELS[level] : null;

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
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              <span className="font-semibold text-graphite">Academic result</span>
              <StatusChip tone={FIT_TONES[fit.academic.fit]}>{ACADEMIC_FIT_LABELS[fit.academic.fit]}</StatusChip>
            </div>
            <p className="text-slate">
              Base Recruits doesn&apos;t place schools in this association by level yet, so there&apos;s no overall fit. The details
              are below.
            </p>
          </div>
        ) : fit.group === null ? (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              <span className="font-semibold text-graphite">Athletic level</span>
              <StatusChip tone="attention">{ATHLETIC_STATUS_LABELS.below}</StatusChip>
            </div>
            <p className="text-slate">
              Your numbers are below the {levelName} typical range on most of what was compared, so this school isn&apos;t in your
              suggestions. The details, and your academic comparison, are below.
            </p>
          </div>
        ) : fit.athletic.status !== 'in_range' ? (
          // No athletic result for this level: lead with the results that can be worked out.
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              <span className="font-semibold text-graphite">Academic result</span>
              <StatusChip tone={FIT_TONES[fit.academic.fit]}>{ACADEMIC_FIT_LABELS[fit.academic.fit]}</StatusChip>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <span className="font-semibold text-graphite">Academic minimum to compete</span>
              <StatusChip tone={ELIGIBILITY_TONES[fit.eligibility.status]}>{ELIGIBILITY_LABELS[fit.eligibility.status]}</StatusChip>
            </div>
            <p className="text-slate">
              {positionEntered
                ? `Not enough of your baseball numbers could be compared with ${levelName} benchmarks to give an overall fit (Strong fit, Possible fit or Reach). The details are below.`
                : 'Add your position and baseball numbers to see your overall fit (Strong fit, Possible fit or Reach).'}
            </p>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            <StatusChip tone={GROUP_TONES[fit.group]}>{GROUP_NAMES[fit.group]}</StatusChip>
            <span className="text-slate">
              {fit.group === 'not_enough_data'
                ? 'Your academics couldn’t be compared with this school, so it can’t be placed yet. The details are below.'
                : GROUP_DESCRIPTIONS[fit.group]}
            </span>
          </div>
        )}
      </div>

      <dl className="space-y-0">
        {fit.placed ? (
          <div className="grid gap-1 border-b-2 border-rule py-3 sm:grid-cols-[16rem_1fr] sm:gap-4">
            <dt className="font-semibold text-graphite">
              Athletic level ({LEVEL_LABELS[fit.level]}
              {power4 ? ', Power 4' : ''})
            </dt>
            <dd>
              {athleticDetail ? (
                <AthleticDetail detail={athleticDetail} conference={props.power4Conference} />
              ) : props.athletic ? (
                <p>{ATHLETIC_STATUS_TEXT[props.athletic.status]}</p>
              ) : (
                <p>Add your position and baseball numbers to compare them with this level&apos;s benchmarks.</p>
              )}
            </dd>
          </div>
        ) : null}
        <div className="grid gap-1 border-b-2 border-rule py-3 sm:grid-cols-[16rem_1fr] sm:gap-4">
          <dt className="font-semibold text-graphite">Academics</dt>
          <dd className="space-y-2">
            <StatusChip tone={FIT_TONES[fit.academic.fit]}>{ACADEMIC_FIT_LABELS[fit.academic.fit]}</StatusChip>
            <p>{ACADEMIC_FIT_REASONS[fit.academic.reason]}</p>
            {hasTypedAcademics(numbers) ? (
              <p className="text-sm text-slate">
                Your grades and scores are as you typed them. <strong>{TYPED_GRADES_NOTE}.</strong>
              </p>
            ) : null}
            {benchmarks.length > 0 ? (
              <ul className="list-disc space-y-1 pl-5 text-sm">
                {benchmarks.map((b) => {
                  const gpa = b.key === 'gpa';
                  const show = (value: number | null) => (value === null ? '' : gpa ? value.toFixed(2) : String(value));
                  // GPA notes travel with the GPA line: whether the school said it's weighted, or why it isn't compared.
                  const notes = gpa ? b.reasons.filter((r) => r === 'GPA_WEIGHTING_NOT_STATED' || r === 'GPA_SCALE_NOT_COMPARABLE') : [];
                  return (
                    <li key={b.key}>
                      {gpa ? 'High school GPA, middle half' : BENCHMARK_NAMES[b.key]}: {show(b.low)}–{show(b.high)} for the {b.term ?? 'past'} class
                      {b.applicant !== null ? `; yours ${show(b.applicant)} (${BENCHMARK_LABELS[b.status].toLowerCase()})` : ''}
                      {notes.map((r) => (
                        <span key={r} className="block text-slate">
                          {REASONS[r]}
                        </span>
                      ))}
                    </li>
                  );
                })}
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
