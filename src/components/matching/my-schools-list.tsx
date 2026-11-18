'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { PlayerNumbersForm, TYPED_GRADES_NOTE } from '@/components/matching/player-numbers-form';
import { AccountNumbersNote, initialNumbers, useAccountNumbers } from '@/components/matching/use-account-numbers';
import { SaveButton } from '@/components/shortlist/save-button';
import { Button } from '@/components/ui/button';
import { SelectField } from '@/components/ui/field';
import { Notice } from '@/components/ui/notice';
import { StatusChip, type ChipTone } from '@/components/ui/status-chip';
import type { AccountNumbers } from '@/lib/matching/account-numbers';
import { PUBLIC_BENCHMARKS, evaluateAthletic } from '@/lib/matching/athletic';
import type { ListCandidate } from '@/lib/matching/candidates';
import { LEVELS, type EligibilityStatus, type Level } from '@/lib/matching/eligibility';
import { BENCHMARK_LABELS, BENCHMARK_NAMES, REASONS } from '@/lib/matching/explain';
import { ACADEMIC_FITS, type AcademicFit } from '@/lib/matching/fit';
import {
  BUDGET_CHOICES,
  DEFAULT_LIST_FILTERS,
  readListFilters,
  saveListFilters,
  toPreferences,
  type ListFilters,
} from '@/lib/matching/list-filters';
import { academicsLine } from '@/lib/matching/numbers-summary';
import { hasTypedAcademics, readPlayerInput, type PlayerErrors } from '@/lib/matching/player-input';
import { EMPTY_PLAYER_NUMBERS, forgetPlayerNumbers, hasAnyNumber, savePlayerNumbers, type PlayerNumbers } from '@/lib/matching/player-store';
import {
  ACADEMIC_FIT_LABELS,
  ATHLETIC_STATUS_LABELS,
  ELIGIBILITY_LABELS,
  ELIGIBILITY_SCOPE_NOTE,
  EXCLUSION_REASONS,
  GROUP_DESCRIPTIONS,
  GROUP_NAMES,
  LEVEL_LABELS,
  POSITION_LABELS,
  SELF_REPORTED_NOTE,
  SUGGESTION_DISCLAIMER,
  SUGGESTION_REASONS,
} from '@/lib/matching/suggestions-explain';
import {
  SUGGESTION_GROUPS,
  sortByCost,
  suggestSchools,
  type AthleticStatus,
  type ExclusionReason,
  type Suggestion,
  type SuggestionGroup,
  type SuggestionList,
} from '@/lib/matching/suggestions';
import { SETTING_LABELS, formatAcademicYear, formatMoney, placeLabel } from '@/lib/registry/labels';
import { STATE_NAMES, STATE_OPTIONS } from '@/lib/registry/states';
import { SETTINGS, type CampusSetting } from '@/lib/registry/types';

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

/** Short level names for the filter boxes and school rows. */
const LEVEL_SHORT: Readonly<Record<Level, string>> = {
  ncaa_d1: 'NCAA Division I',
  ncaa_d2: 'NCAA Division II',
  ncaa_d3: 'NCAA Division III',
  naia: 'NAIA',
  juco: 'Junior college',
};

const EXCLUSION_ORDER: readonly ExclusionReason[] = [
  'LEVEL_NOT_CHOSEN',
  'OUTSIDE_CHOSEN_STATES',
  'OUTSIDE_CHOSEN_SETTINGS',
  'OVER_BUDGET',
  'ATHLETIC_BELOW_LEVEL',
];

const PAGE = 25;

interface Props {
  readonly candidates: readonly ListCandidate[];
  /** Programs in associations not placed by level yet (USCAA, NCCAA, independents, "Other"). */
  readonly otherAssociations: number | null;
  readonly thisYear: number;
  readonly signedIn: boolean;
  /** The account's saved schools when signed in. */
  readonly savedSlugs: readonly string[];
  /** Set for signed-in athletes, who can save their numbers to their account (F63). */
  readonly account: AccountNumbers | null;
}

interface Computed {
  readonly list: SuggestionList | null;
  readonly athletic: ReturnType<typeof evaluateAthletic>;
  readonly positionEntered: boolean;
}

function compute(numbers: PlayerNumbers, filters: ListFilters, props: Props): Computed | { readonly errors: PlayerErrors } {
  const read = readPlayerInput(numbers, props.thisYear);
  if (!read.ok) return { errors: read.errors };
  const athletic = evaluateAthletic(read.athletic, PUBLIC_BENCHMARKS);
  const prefs = toPreferences(filters);
  const list = prefs ? suggestSchools(props.candidates, read.input, athletic, prefs, read.extras) : null;
  return { list, athletic, positionEntered: read.athletic !== null };
}

function Checkbox({ id, checked, onChange, children }: { readonly id: string; readonly checked: boolean; readonly onChange: (checked: boolean) => void; readonly children: ReactNode }) {
  return (
    <div className="flex items-center gap-2.5">
      <input id={id} type="checkbox" checked={checked} onChange={(e) => onChange(e.currentTarget.checked)} className="size-5 accent-royal" />
      <label htmlFor={id}>{children}</label>
    </div>
  );
}

function toggle<T>(list: readonly T[], value: T, on: boolean): T[] {
  return on ? [...new Set([...list, value])] : list.filter((v) => v !== value);
}

function SchoolRow({ s, signedIn, saved }: { readonly s: Suggestion; readonly signedIn: boolean; readonly saved: boolean }) {
  const school = s.school as ListCandidate['school'];
  const benchmarks = s.comparison.benchmarks.filter((b) => b.low !== null && b.high !== null && b.applicant !== null);
  const eligibilityFlag = s.eligibility.status === 'below' || s.eligibility.status === 'likely_below' || s.eligibility.status === 'depends';
  return (
    <li className="space-y-3 border-b-2 border-rule py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h4 className="text-lg font-semibold">
            <Link href={`/schools/${school.slug}`} className="text-royal-ink underline">
              {school.name}
            </Link>
          </h4>
          <p className="text-sm text-slate">
            {placeLabel(school.city, school.state)} · {LEVEL_SHORT[s.level]}
            {s.power4 && school.power4Conference ? ` · ${school.power4Conference} (Power 4)` : school.conference ? ` · ${school.conference}` : ''}
          </p>
          <p className="text-sm">
            Published cost of attendance:{' '}
            {school.cost_of_attendance === null ? (
              <span className="text-slate italic">not reported</span>
            ) : (
              <>
                {formatMoney(school.cost_of_attendance)} <span className="text-slate">({formatAcademicYear(school.cost_year)}, before aid)</span>
              </>
            )}
          </p>
        </div>
        <SaveButton slug={school.slug} name={school.name} mode={signedIn ? 'account' : 'guest'} initiallySaved={saved} />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <StatusChip tone={FIT_TONES[s.academic.fit]}>{ACADEMIC_FIT_LABELS[s.academic.fit]}</StatusChip>
        <StatusChip tone={ATHLETIC_TONES[s.athletic.status]}>Baseball: {ATHLETIC_STATUS_LABELS[s.athletic.status]}</StatusChip>
        {eligibilityFlag ? <StatusChip tone={ELIGIBILITY_TONES[s.eligibility.status]}>{ELIGIBILITY_LABELS[s.eligibility.status]}</StatusChip> : null}
      </div>
      <details className="text-sm">
        <summary className="cursor-pointer font-semibold text-royal-ink">Why it&apos;s in this group</summary>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          {s.reasons.map((r) => (
            <li key={r}>{SUGGESTION_REASONS[r]}</li>
          ))}
          {benchmarks.map((b) => {
            const gpa = b.key === 'gpa';
            const show = (value: number | null) => (value === null ? '' : gpa ? value.toFixed(2) : String(value));
            return (
              <li key={b.key}>
                {gpa ? 'High school GPA, middle half' : BENCHMARK_NAMES[b.key]}: {show(b.low)}–{show(b.high)} for the {b.term ?? 'past'} class; yours{' '}
                {show(b.applicant)} ({BENCHMARK_LABELS[b.status].toLowerCase()}).
                {b.reasons.includes('SAT_TOTAL_FROM_SECTIONS') ? <span className="block text-slate">{REASONS.SAT_TOTAL_FROM_SECTIONS}</span> : null}
              </li>
            );
          })}
        </ul>
        <p className="mt-2 text-slate">
          <Link href={`/schools/${school.slug}`} className="font-semibold text-royal-ink underline">
            See every comparison on the school&apos;s page
          </Link>
          .
        </p>
      </details>
    </li>
  );
}

function GroupSection({
  group,
  items,
  sort,
  signedIn,
  saved,
  positionEntered,
}: {
  readonly group: SuggestionGroup;
  readonly items: readonly Suggestion[];
  readonly sort: ListFilters['sort'];
  readonly signedIn: boolean;
  readonly saved: ReadonlySet<string>;
  readonly positionEntered: boolean;
}) {
  const [shown, setShown] = useState(PAGE);
  const sorted = sort === 'cost' ? sortByCost(items) : items;
  const headingId = `group-${group}`;
  // Not enough data: lead with what is known (rulebook §6), sub-grouped by the academic result.
  const parts: readonly { readonly key: string; readonly title: string | null; readonly items: readonly Suggestion[] }[] =
    group === 'not_enough_data'
      ? ACADEMIC_FITS.map((fit) => ({ key: fit, title: ACADEMIC_FIT_LABELS[fit], items: sorted.filter((s) => s.academic.fit === fit) })).filter((p) => p.items.length > 0)
      : [{ key: 'all', title: null, items: sorted }];
  let budget = shown;
  return (
    <section aria-labelledby={headingId} className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <h2 id={headingId} tabIndex={-1} className="text-2xl text-navy">
          {GROUP_NAMES[group]}
        </h2>
        <StatusChip tone={GROUP_TONES[group]}>
          {items.length} {items.length === 1 ? 'school' : 'schools'}
        </StatusChip>
      </div>
      <p className="text-slate">
        {group === 'not_enough_data' && !positionEntered
          ? 'Add your position and baseball numbers to sort these into Strong fit, Possible fit and Reach. Until then they are grouped by your academic result.'
          : GROUP_DESCRIPTIONS[group]}
      </p>
      {items.length === 0 ? (
        <p className="text-slate italic">No schools in this group with your current numbers and filters.</p>
      ) : (
        <>
          {parts.map((part) => {
            const visible = part.items.slice(0, Math.max(budget, 0));
            budget -= visible.length;
            if (visible.length === 0) return null;
            return (
              <div key={part.key}>
                {part.title ? (
                  <h3 className="mt-4 text-lg font-semibold text-graphite">
                    {part.title} ({part.items.length})
                  </h3>
                ) : null}
                <ul>
                  {visible.map((s) => (
                    <SchoolRow key={s.school.slug} s={s} signedIn={signedIn} saved={saved.has(s.school.slug)} />
                  ))}
                </ul>
              </div>
            );
          })}
          {items.length > shown ? (
            <div className="flex flex-wrap items-center gap-4">
              <p className="text-slate">
                Showing {shown} of {items.length}.
              </p>
              <Button type="button" variant="secondary" size="sm" onClick={() => setShown(shown + PAGE)}>
                Show {Math.min(PAGE, items.length - shown)} more
              </Button>
              <Button type="button" variant="quiet" size="sm" onClick={() => setShown(items.length)}>
                Show all {items.length}
              </Button>
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}

function filterSummary(filters: ListFilters): string {
  const levels = LEVELS.filter((l) => filters.levels.includes(l)).map((l) => LEVEL_SHORT[l]);
  return [
    levels.length > 0 ? levels.join(', ') : 'No levels',
    filters.states.length > 0 ? filters.states.join(', ') : 'any state',
    filters.settings.length > 0 ? filters.settings.map((s) => SETTING_LABELS[s].toLowerCase()).join(', ') : 'any setting',
    filters.maxCost === null ? 'any cost' : `up to ${formatMoney(filters.maxCost)}`,
  ].join(' · ');
}

function Filters({ filters, onChange }: { readonly filters: ListFilters; readonly onChange: (next: ListFilters) => void }) {
  const [stateDraft, setStateDraft] = useState('');
  return (
    <details className="rounded-md border-2 border-rule bg-white p-4 sm:p-6">
      <summary className="cursor-pointer">
        <span className="text-xl font-semibold text-navy">Filters</span>{' '}
        <span className="text-slate">({filterSummary(filters)})</span>{' '}
        <span className="font-semibold text-royal-ink underline">Change</span>
      </summary>
      <div className="mt-5 grid gap-6 md:grid-cols-2">
        <fieldset className="space-y-2">
          <legend className="mb-1 font-semibold text-graphite">Levels</legend>
          {LEVELS.map((level) => (
            <Checkbox
              key={level}
              id={`ms-level-${level}`}
              checked={filters.levels.includes(level)}
              onChange={(on) => onChange({ ...filters, levels: LEVELS.filter((l) => (l === level ? on : filters.levels.includes(l))) })}
            >
              {LEVEL_LABELS[level]}
            </Checkbox>
          ))}
        </fieldset>
        <fieldset className="space-y-2">
          <legend className="mb-1 font-semibold text-graphite">Campus setting</legend>
          <p className="text-sm text-slate">Leave all unticked for any setting.</p>
          {SETTINGS.map((setting: CampusSetting) => (
            <Checkbox
              key={setting}
              id={`ms-setting-${setting}`}
              checked={filters.settings.includes(setting)}
              onChange={(on) => onChange({ ...filters, settings: toggle(filters.settings, setting, on) })}
            >
              {SETTING_LABELS[setting]}
            </Checkbox>
          ))}
        </fieldset>
        <div className="space-y-2">
          <SelectField
            id="ms-state"
            label="States"
            hint="Add as many as you like. None added means any state."
            value={stateDraft}
            onChange={(e) => {
              const code = e.currentTarget.value;
              setStateDraft('');
              if (code) onChange({ ...filters, states: toggle(filters.states, code, true) });
            }}
          >
            <option value="">Add a state</option>
            {STATE_OPTIONS.filter((o) => !filters.states.includes(o.code)).map((o) => (
              <option key={o.code} value={o.code}>
                {o.name}
              </option>
            ))}
          </SelectField>
          {filters.states.length > 0 ? (
            <ul className="flex flex-wrap gap-2" aria-label="States chosen">
              {filters.states.map((code) => (
                <li key={code}>
                  <Button type="button" variant="secondary" size="sm" onClick={() => onChange({ ...filters, states: toggle(filters.states, code, false) })} aria-label={`Remove ${STATE_NAMES[code] ?? code}`}>
                    {STATE_NAMES[code] ?? code} ×
                  </Button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
        <div className="space-y-4">
          <SelectField
            id="ms-budget"
            label="Budget"
            hint="Published cost of attendance, before any aid. What your family pays can be lower."
            value={filters.maxCost === null ? '' : String(filters.maxCost)}
            onChange={(e) => onChange({ ...filters, maxCost: e.currentTarget.value === '' ? null : Number(e.currentTarget.value) })}
          >
            <option value="">Any cost</option>
            {BUDGET_CHOICES.map((c) => (
              <option key={c} value={c}>
                Up to {formatMoney(c)} a year
              </option>
            ))}
          </SelectField>
          <SelectField
            id="ms-sort"
            label="Order within each group"
            value={filters.sort}
            onChange={(e) => onChange({ ...filters, sort: e.currentTarget.value === 'cost' ? 'cost' : 'name' })}
          >
            <option value="name">School name</option>
            <option value="cost">Published cost, lowest first</option>
          </SelectField>
        </div>
      </div>
      <Button type="button" variant="quiet" size="sm" className="mt-4" onClick={() => onChange(DEFAULT_LIST_FILTERS)}>
        Reset filters
      </Button>
    </details>
  );
}

/**
 * The My schools list: every program at the chosen levels, sorted into Strong
 * fit, Possible fit, Reach and Not enough data by the approved rules
 * (docs/matching-rulebook.md). The player's numbers are the same ones "Your
 * fit" uses on school pages, compared in the browser and remembered on this
 * device (decision F45). They reach Base Recruits only when a signed-in
 * athlete ticks "Save to my account" (F63).
 */
export function MySchoolsList(props: Props) {
  const { thisYear, signedIn } = props;
  const [numbers, setNumbers] = useState<PlayerNumbers | null>(null);
  const [filters, setFilters] = useState<ListFilters>(DEFAULT_LIST_FILTERS);
  const [editing, setEditing] = useState(false);
  const [errors, setErrors] = useState<PlayerErrors>({});
  const [notSaved, setNotSaved] = useState(false);
  const [formKey, setFormKey] = useState(0);
  const errorSummary = useRef<HTMLDivElement>(null);
  const resultsHeading = useRef<HTMLHeadingElement>(null);
  const [focusTarget, setFocusTarget] = useState<'errors' | 'results' | null>(null);
  const saved = useMemo(() => new Set(props.savedSlugs), [props.savedSlugs]);
  const account = props.account;
  const accountNumbers = useAccountNumbers(account);

  useEffect(() => {
    const stored = initialNumbers(account);
    setNumbers(stored ?? { ...EMPTY_PLAYER_NUMBERS, entryYear: String(thisYear + 1) });
    setEditing(!stored || !hasAnyNumber(stored));
    setFilters(readListFilters() ?? DEFAULT_LIST_FILTERS);
  }, [thisYear, account]);

  useEffect(() => {
    if (!focusTarget) return;
    (focusTarget === 'errors' ? errorSummary.current : resultsHeading.current)?.focus();
    setFocusTarget(null);
  }, [focusTarget]);

  const computed = useMemo(() => (numbers && !editing ? compute(numbers, filters, props) : null), [numbers, editing, filters, props]);
  // Stored numbers that no longer validate (for example an entry year that has passed) reopen the form.
  useEffect(() => {
    if (computed && 'errors' in computed) {
      setErrors(computed.errors);
      setEditing(true);
    }
  }, [computed]);

  if (numbers === null) return <p className="text-slate">Loading your numbers…</p>;

  function onSubmit(candidate: PlayerNumbers, saveToAccount: boolean) {
    const result = compute(candidate, filters, props);
    if ('errors' in result) {
      setErrors(result.errors);
      setFocusTarget('errors');
      return;
    }
    setErrors({});
    setNotSaved(!savePlayerNumbers(candidate));
    setNumbers(candidate);
    setEditing(false);
    setFocusTarget('results');
    void accountNumbers.persist(candidate, saveToAccount);
  }

  function onForget() {
    forgetPlayerNumbers();
    setNumbers({ ...EMPTY_PLAYER_NUMBERS, entryYear: String(thisYear + 1) });
    setErrors({});
    setNotSaved(false);
    setFormKey((k) => k + 1);
    setEditing(true);
    void accountNumbers.forget();
  }

  function onFilters(next: ListFilters) {
    setFilters(next);
    saveListFilters(next);
  }

  if (editing) {
    return (
      <section aria-labelledby="ms-numbers" className="space-y-4">
        <h2 id="ms-numbers" className="text-2xl text-navy">
          Your numbers
        </h2>
        <AccountNumbersNote note={accountNumbers.note} />
        <PlayerNumbersForm
          key={formKey}
          idPrefix="ms"
          numbers={numbers}
          errors={errors}
          thisYear={thisYear}
          coreGpa={['d1', 'd2']}
          ariaLabel="Your numbers for My schools"
          submitLabel="Show my schools"
          errorSummaryRef={errorSummary}
          onSubmit={onSubmit}
          onForget={onForget}
          accountSave={accountNumbers.canSave ? { checked: accountNumbers.onAccount } : undefined}
          secondary={
            hasAnyNumber(numbers) && Object.keys(errors).length === 0 ? (
              <Button type="button" variant="secondary" onClick={() => setEditing(false)}>
                Cancel
              </Button>
            ) : null
          }
          intro={
            <p>
              Enter your numbers once. Every program at the levels you choose is sorted into Strong fit, Possible fit,
              Reach and Not enough data, and every school page shows the same result. Your numbers are compared in your
              browser and remembered on this device
              {accountNumbers.canSave
                ? '. They are saved to your account only if you tick “Save to my account”, and coaches can’t see them.'
                : ' only. They are never sent to Base Recruits, and coaches can’t see them.'}
            </p>
          }
        />
      </section>
    );
  }

  if (!computed || 'errors' in computed) return null;
  const { list, athletic, positionEntered } = computed;
  const total = list ? SUGGESTION_GROUPS.reduce((n, g) => n + list.groups[g].length, 0) : 0;
  const academics = academicsLine(numbers);
  const chosenLevels = LEVELS.filter((l) => filters.levels.includes(l));

  return (
    <div className="space-y-8">
      <AccountNumbersNote note={accountNumbers.note} />
      {notSaved ? (
        <Notice tone="attention" title="Not remembered on this device">
          This browser won&apos;t store your numbers, so you&apos;ll need to enter them again next time.
        </Notice>
      ) : null}

      <section aria-labelledby="ms-yours" className="space-y-3 rounded-md border-2 border-rule bg-ice p-4 sm:p-6">
        <h2 id="ms-yours" ref={resultsHeading} tabIndex={-1} className="text-xl text-navy">
          Your numbers
        </h2>
        <p>
          {academics ? (
            <>
              {academics}.{' '}
              {hasTypedAcademics(numbers) ? <StatusChip tone="attention">{TYPED_GRADES_NOTE}</StatusChip> : null}
            </>
          ) : (
            <span className="text-slate">No grades or test scores entered, so academics can&apos;t be compared yet.</span>
          )}
        </p>
        <p>
          {positionEntered && numbers.position ? (
            <>
              {POSITION_LABELS[numbers.position as keyof typeof POSITION_LABELS]}. <span className="text-slate">{SELF_REPORTED_NOTE}</span>
            </>
          ) : (
            <span className="text-slate">No position or baseball numbers entered yet.</span>
          )}
        </p>
        {!positionEntered ? (
          <p className="font-semibold">
            Add your position and baseball numbers to sort schools into Strong fit, Possible fit and Reach.
          </p>
        ) : null}
        <div className="flex flex-wrap items-center gap-4">
          <Button type="button" variant={positionEntered ? 'secondary' : 'primary'} size="sm" onClick={() => setEditing(true)}>
            {positionEntered ? 'Edit my numbers' : 'Add baseball numbers'}
          </Button>
          <Button type="button" variant="quiet" size="sm" onClick={onForget}>
            Forget my numbers
          </Button>
        </div>
        {accountNumbers.onAccount ? (
          <p className="text-sm text-slate">
            Saved to your account. Coaches can&apos;t see them.{' '}
            <Link href="/athlete#numbers-sharing" className="font-semibold text-royal-ink underline">
              Share them with a parent or guardian
            </Link>
          </p>
        ) : null}
      </section>

      {list !== null ? (
        <>
          <section aria-labelledby="ms-summary" className="space-y-3">
            <h2 id="ms-summary" className="text-xl text-navy">
              Your list
            </h2>
            <p role="status" className="text-lg">
              {total} {total === 1 ? 'school' : 'schools'} at the levels you chose.
            </p>
            <ul className="flex flex-wrap gap-3">
              {SUGGESTION_GROUPS.map((g) => (
                <li key={g}>
                  <a href={`#group-${g}`} className="inline-flex items-center gap-2 font-semibold text-royal-ink underline">
                    {GROUP_NAMES[g]}
                    <StatusChip tone={GROUP_TONES[g]}>{list.groups[g].length}</StatusChip>
                  </a>
                </li>
              ))}
            </ul>
            <p>
              <strong>Your next step:</strong> open a few Strong fit and Possible fit schools, read their pages, and save
              the ones you want to research. You can{' '}
              <Link href="/compare" className="font-semibold text-royal-ink underline">
                compare up to five
              </Link>{' '}
              side by side.
            </p>
          </section>

        </>
      ) : null}

      <Filters filters={filters} onChange={onFilters} />

      {list === null ? (
        <Notice tone="attention" title="No levels chosen">
          Tick at least one level in the filters to see schools.
        </Notice>
      ) : (
        <>
          <section aria-labelledby="ms-levels" className="space-y-3">
            <h2 id="ms-levels" className="text-xl text-navy">
              By level
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[32rem] border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b-2 border-rule">
                    <th scope="col" className="py-2 pr-4 font-semibold">Level</th>
                    <th scope="col" className="py-2 pr-4 font-semibold">Your baseball numbers</th>
                    <th scope="col" className="py-2 font-semibold">Academic minimum to compete</th>
                  </tr>
                </thead>
                <tbody>
                  {chosenLevels.map((level) => {
                    const status = athletic.byLevel[level]?.status ?? 'not_enough_data';
                    const elig = list.eligibilityByLevel[level];
                    return (
                      <tr key={level} className="border-b border-rule align-top">
                        <th scope="row" className="py-2 pr-4 font-semibold">
                          {LEVEL_LABELS[level]}
                        </th>
                        <td className="py-2 pr-4">
                          <StatusChip tone={ATHLETIC_TONES[status]}>{ATHLETIC_STATUS_LABELS[status]}</StatusChip>
                          {level === 'ncaa_d1' && athletic.ncaaD1Power4 && athletic.ncaaD1Power4.status !== status ? (
                            <span className="mt-1 block text-slate">
                              Power 4 schools: {ATHLETIC_STATUS_LABELS[athletic.ncaaD1Power4.status].toLowerCase()}
                            </span>
                          ) : null}
                        </td>
                        <td className="py-2">
                          <StatusChip tone={ELIGIBILITY_TONES[elig.status]}>{ELIGIBILITY_LABELS[elig.status]}</StatusChip>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="text-sm text-slate">{ELIGIBILITY_SCOPE_NOTE}</p>
          </section>

          {SUGGESTION_GROUPS.map((g) => (
            <GroupSection key={g} group={g} items={list.groups[g]} sort={filters.sort} signedIn={signedIn} saved={saved} positionEntered={positionEntered} />
          ))}

          <section aria-labelledby="ms-aside" className="space-y-2">
            <h2 id="ms-aside" className="text-xl text-navy">
              Not in your list
            </h2>
            <ul className="list-disc space-y-1 pl-5">
              {EXCLUSION_ORDER.filter((r) => list.excluded[r] > 0).map((r) => (
                <li key={r}>
                  {EXCLUSION_REASONS[r]} <strong>{list.excluded[r]}</strong>
                </li>
              ))}
              {props.otherAssociations ? (
                <li>
                  {EXCLUSION_REASONS.LEVEL_NOT_SUGGESTED} <strong>{props.otherAssociations}</strong>
                </li>
              ) : null}
            </ul>
            <p className="text-sm text-slate">
              A school whose cost, state or setting isn&apos;t reported always stays in your list, with a note. Missing data
              never counts against you.
            </p>
          </section>

          <section className="space-y-2 text-sm text-slate">
            <p>{SUGGESTION_DISCLAIMER}</p>
            <p>
              Paying for Base Recruits never changes this list or its order. Rules used: suggestions {list.versions.suggestions}, score
              comparison {list.versions.comparison}, academic fit {list.versions.academicFit}, eligibility {list.versions.eligibility}
              {list.versions.athleticStandards.length > 0 ? `, baseball benchmarks ${list.versions.athleticStandards.join(', ')}` : ''}.
            </p>
          </section>
        </>
      )}
    </div>
  );
}
