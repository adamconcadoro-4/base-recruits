'use client';

import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';

import { Button } from '@/components/ui/button';
import { SelectField, TextField } from '@/components/ui/field';
import { Notice } from '@/components/ui/notice';
import { StatusChip, type ChipTone } from '@/components/ui/status-chip';
import {
  METRIC_INFO,
  POSITIONS,
  POSITION_METRICS,
  PUBLIC_BENCHMARKS,
  evaluateLevel,
  isPosition,
  parseAthleticInput,
  type AthleticLevelDetail,
  type AthleticMetric,
} from '@/lib/matching/athletic';
import { levelForDivision, parseCoreGpa, type EligibilityStatus } from '@/lib/matching/eligibility';
import { BENCHMARK_LABELS, BENCHMARK_NAMES, REASONS } from '@/lib/matching/explain';
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
  POSITION_LABELS,
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

type Errors = Partial<Record<PlayerField, string>>;

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
  const athletic = parseAthleticInput({
    position: numbers.position,
    fastball_mph: numbers.fastball_mph,
    exit_velocity_mph: numbers.exit_velocity_mph,
    sixty_yard_s: numbers.sixty_yard_s,
    infield_velocity_mph: numbers.infield_velocity_mph,
    outfield_velocity_mph: numbers.outfield_velocity_mph,
    catcher_velocity_mph: numbers.catcher_velocity_mph,
    pop_time_s: numbers.pop_time_s,
  });
  if (!athletic.ok) Object.assign(errors, athletic.errors);
  if (!parsed.ok || !d1.ok || !d2.ok || !athletic.ok) return { errors };
  const level = levelForDivision(props.division);
  const detail = athletic.input && level ? evaluateLevel(athletic.input, level, PUBLIC_BENCHMARKS, props.power4Conference !== null) : null;
  const athleticResult = props.athletic ?? (detail ? { status: detail.status, standardsVersion: detail.standardsVersion } : null);
  return {
    fit: schoolFit(props.evidence, props.division, parsed.input, athleticResult, {
      ncaaCoreGpaDivisionI: d1.value,
      ncaaCoreGpaDivisionII: d2.value,
    }),
    athleticDetail: props.athletic ? null : detail,
    positionEntered: athletic.input !== null,
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
  // The position chosen in the open form, so its own numbers can be asked for.
  const [positionDraft, setPositionDraft] = useState<string | null>(null);
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
    setPositionDraft(null);
    setEditing(false);
    setFocusTarget('result');
  }

  function onForget() {
    forgetPlayerNumbers();
    setNumbers({ ...EMPTY_PLAYER_NUMBERS, entryYear: String(thisYear + 1) });
    setErrors({});
    setNotSaved(false);
    setPositionDraft(null);
    setEditing(true);
  }

  if (editing) {
    const errorEntries = Object.entries(errors).filter(([, v]) => v);
    const years = [thisYear, thisYear + 1, thisYear + 2, thisYear + 3, thisYear + 4];
    const formPosition = positionDraft ?? numbers.position;
    const positionMetrics = isPosition(formPosition) ? POSITION_METRICS[formPosition] : [];
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
        <h4 className="text-xl text-navy">Academics</h4>
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
          {ncaa === 'd1' ? (
            <TextField id="fit-coreGpaDivisionI" name="coreGpaDivisionI" label="NCAA Division I core-course GPA" hint="Optional, from the NCAA Eligibility Center" inputMode="decimal" defaultValue={numbers.coreGpaDivisionI} error={errors.coreGpaDivisionI} autoComplete="off" />
          ) : null}
          {ncaa === 'd2' ? (
            <TextField id="fit-coreGpaDivisionII" name="coreGpaDivisionII" label="NCAA Division II core-course GPA" hint="Optional, from the NCAA Eligibility Center" inputMode="decimal" defaultValue={numbers.coreGpaDivisionII} error={errors.coreGpaDivisionII} autoComplete="off" />
          ) : null}
        </div>

        <h4 className="text-xl text-navy">Baseball numbers (optional)</h4>
        <p className="text-sm text-slate">
          Your best numbers, from a showcase or your own measuring. Leave any you don&apos;t know blank.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField
            id="fit-position"
            name="position"
            label="Main position"
            value={formPosition}
            onChange={(e) => setPositionDraft(e.currentTarget.value)}
            error={errors.position}
          >
            <option value="">Choose a position</option>
            {POSITIONS.map((p) => (
              <option key={p} value={p}>
                {POSITION_LABELS[p]}
              </option>
            ))}
          </SelectField>
          {positionMetrics.map((metric) => {
            const info = METRIC_INFO[metric];
            return (
              <TextField
                key={metric}
                id={`fit-${metric}`}
                name={metric}
                label={`${METRIC_LABELS[metric]} (${info.unit === 's' ? 'seconds' : 'mph'})`}
                hint={`${info.min}–${info.max}`}
                inputMode="decimal"
                defaultValue={numbers[metric]}
                error={errors[metric]}
                autoComplete="off"
              />
            );
          })}
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
