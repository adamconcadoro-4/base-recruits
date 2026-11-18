'use client';

import { useState, type FormEvent, type ReactNode, type Ref } from 'react';

import { Button } from '@/components/ui/button';
import { SelectField, TextField } from '@/components/ui/field';
import { METRIC_INFO, POSITIONS, POSITION_METRICS, isPosition } from '@/lib/matching/athletic';
import type { PlayerErrors } from '@/lib/matching/player-input';
import { EMPTY_PLAYER_NUMBERS, hasAnyNumber, type PlayerNumbers } from '@/lib/matching/player-store';
import { METRIC_LABELS, POSITION_LABELS } from '@/lib/matching/suggestions-explain';

/** Shown wherever typed grades appear (founder decision, 2026-11-17). */
export const TYPED_GRADES_NOTE = 'Needs transcripts for verification';

interface Props {
  /** Prefix for field ids, so two forms never share an id (school page "fit", My schools "ms"). */
  readonly idPrefix: string;
  readonly numbers: PlayerNumbers;
  readonly errors: PlayerErrors;
  readonly thisYear: number;
  /** Which NCAA core-course GPA fields to ask for. */
  readonly coreGpa: readonly ('d1' | 'd2')[];
  readonly ariaLabel: string;
  readonly submitLabel: string;
  readonly intro: ReactNode;
  readonly errorSummaryRef?: Ref<HTMLDivElement>;
  readonly onSubmit: (next: PlayerNumbers) => void;
  readonly onForget: () => void;
  /** Shown beside the submit button when the player has numbers saved (for example "Cancel"). */
  readonly secondary?: ReactNode;
}

/**
 * The player's academic and baseball numbers, entered once and remembered on
 * this device (src/lib/matching/player-store.ts). Used by "Your fit" on school
 * pages and by the My schools list, so both ask the same questions.
 */
export function PlayerNumbersForm(props: Props) {
  const { idPrefix, numbers, errors, thisYear, coreGpa } = props;
  // The position chosen in the open form, so its own numbers can be asked for.
  const [positionDraft, setPositionDraft] = useState<string | null>(null);
  const id = (field: string) => `${idPrefix}-${field}`;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const next: Record<string, string> = { ...EMPTY_PLAYER_NUMBERS, ...numbers };
    for (const [key, value] of form.entries()) if (typeof value === 'string' && key in next) next[key] = value.trim();
    props.onSubmit(next as PlayerNumbers);
  }

  const errorEntries = Object.entries(errors).filter(([, v]) => v);
  const years = [thisYear, thisYear + 1, thisYear + 2, thisYear + 3, thisYear + 4];
  const formPosition = positionDraft ?? numbers.position;
  const positionMetrics = isPosition(formPosition) ? POSITION_METRICS[formPosition] : [];

  return (
    <form onSubmit={submit} noValidate className="space-y-6" aria-label={props.ariaLabel}>
      {props.intro}
      {errorEntries.length > 0 ? (
        <div ref={props.errorSummaryRef} tabIndex={-1} role="alert" className="border-l-4 border-danger bg-danger-soft px-4 py-3">
          <p className="font-semibold">Check {errorEntries.length === 1 ? 'this field' : 'these fields'}:</p>
          <ul className="mt-1 list-disc pl-5">
            {errorEntries.map(([key, message]) => (
              <li key={key}>
                <a href={`#${id(key)}`} className="font-semibold text-royal-ink underline">
                  {message}
                </a>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <h4 className="text-xl text-navy">Academics</h4>
      <p className="text-sm text-slate">
        Grades and scores you type in aren&apos;t checked by anyone, so they show as &ldquo;{TYPED_GRADES_NOTE}&rdquo;.
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField id={id('applicantType')} name="applicantType" label="Applying as" defaultValue={numbers.applicantType} error={errors.applicantType}>
          <option value="first_year">A first-year student</option>
          <option value="transfer">A transfer student</option>
        </SelectField>
        <SelectField id={id('entryYear')} name="entryYear" label="Entering college in fall" defaultValue={numbers.entryYear || String(thisYear + 1)} error={errors.entryYear}>
          {years.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </SelectField>
        <TextField id={id('gpa')} name="gpa" label="GPA" inputMode="decimal" defaultValue={numbers.gpa} error={errors.gpa} autoComplete="off" />
        <SelectField id={id('gpaScale')} name="gpaScale" label="GPA scale" defaultValue={numbers.gpaScale} error={errors.gpaScale}>
          <option value="4">Out of 4.0</option>
          <option value="5">Out of 5.0</option>
          <option value="100">Out of 100</option>
        </SelectField>
        <SelectField id={id('gpaType')} name="gpaType" label="GPA type" defaultValue={numbers.gpaType}>
          <option value="unweighted">Unweighted</option>
          <option value="weighted">Weighted</option>
          <option value="">Not sure</option>
        </SelectField>
        <SelectField id={id('submitScores')} name="submitScores" label="Will you send test scores?" defaultValue={numbers.submitScores} error={errors.submitScores}>
          <option value="yes">Yes</option>
          <option value="undecided">Not sure yet</option>
          <option value="no">No</option>
        </SelectField>
        <TextField id={id('satTotal')} name="satTotal" label="SAT total score" hint="400–1600, optional" inputMode="numeric" defaultValue={numbers.satTotal} error={errors.satTotal} autoComplete="off" />
        <TextField id={id('act')} name="act" label="ACT composite" hint="1–36, optional" inputMode="numeric" defaultValue={numbers.act} error={errors.act} autoComplete="off" />
        {coreGpa.includes('d1') ? (
          <TextField id={id('coreGpaDivisionI')} name="coreGpaDivisionI" label="NCAA Division I core-course GPA" hint="Optional, from the NCAA Eligibility Center" inputMode="decimal" defaultValue={numbers.coreGpaDivisionI} error={errors.coreGpaDivisionI} autoComplete="off" />
        ) : null}
        {coreGpa.includes('d2') ? (
          <TextField id={id('coreGpaDivisionII')} name="coreGpaDivisionII" label="NCAA Division II core-course GPA" hint="Optional, from the NCAA Eligibility Center" inputMode="decimal" defaultValue={numbers.coreGpaDivisionII} error={errors.coreGpaDivisionII} autoComplete="off" />
        ) : null}
      </div>

      <h4 className="text-xl text-navy">Baseball numbers (optional)</h4>
      <p className="text-sm text-slate">Your best numbers, from a showcase or your own measuring. Leave any you don&apos;t know blank.</p>
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField
          id={id('position')}
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
              id={id(metric)}
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
        <Button type="submit">{props.submitLabel}</Button>
        {props.secondary}
        {hasAnyNumber(numbers) ? (
          <Button type="button" variant="quiet" onClick={props.onForget}>
            Forget my numbers
          </Button>
        ) : null}
      </div>
    </form>
  );
}
