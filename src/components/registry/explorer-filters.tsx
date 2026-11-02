import Link from 'next/link';
import type { ReactNode } from 'react';

import { buttonStyles } from '@/components/ui/button';
import { SelectField, TextField } from '@/components/ui/field';
import { ResponsiveDetails } from '@/components/ui/responsive-details';
import { DIVISION_GROUPS } from '@/lib/registry/divisions';
import { CONTROL_LABELS, LEVEL_LABELS, SETTING_LABELS, TEST_POLICY_LABELS } from '@/lib/registry/labels';
import { PROGRAM_AREA_CHOICES } from '@/lib/registry/program-areas';
import { COST_CHOICES, RATE_CHOICES, SIZE_BANDS, activeFilterCount, type ExplorerState } from '@/lib/registry/search-params';
import { STATE_OPTIONS } from '@/lib/registry/states';
import { CONTROLS, SETTINGS, TEST_POLICIES } from '@/lib/registry/types';

function Check({ name, value, label, checked }: { readonly name: string; readonly value: string; readonly label: string; readonly checked: boolean }) {
  const id = `f-${name}-${value}`;
  return (
    <div className="flex items-center gap-2.5">
      <input id={id} type="checkbox" name={name} value={value} defaultChecked={checked} className="size-5 accent-royal" />
      <label htmlFor={id}>{label}</label>
    </div>
  );
}

function Group({ legend, children }: { readonly legend: string; readonly children: ReactNode }) {
  return (
    <fieldset className="space-y-2">
      <legend className="mb-1 font-semibold text-graphite">{legend}</legend>
      {children}
    </fieldset>
  );
}

/**
 * A plain GET form: works without JavaScript and every result page is a
 * shareable link. The name search is always visible; the other filters sit in
 * a disclosure that starts closed on small screens so results come first.
 */
export function ExplorerFilters({
  state,
  admissionsTerm,
}: {
  readonly state: ExplorerState;
  /** The entering class the admissions figures describe, e.g. "Fall 2024". */
  readonly admissionsTerm: string | null;
}) {
  const termNote = admissionsTerm ? ` (${admissionsTerm} entering class)` : '';
  const active = activeFilterCount(state);
  return (
    <form method="get" action="/schools" className="space-y-4" aria-label="Search and filter schools">
      <TextField id="f-q" name="q" label="School name or city" defaultValue={state.q} maxLength={100} autoComplete="off" />
      <div className="flex flex-wrap items-center gap-4">
        <button type="submit" className={buttonStyles({ variant: 'primary' })}>
          Show schools
        </button>
        {active > 0 || state.q ? (
          <Link href="/schools" className="font-semibold text-royal-ink underline">
            Clear search and filters
          </Link>
        ) : null}
      </div>

      <ResponsiveDetails
        id="filters"
        className="group border-t-2 border-rule pt-3"
        summaryClassName="flex min-h-11 cursor-pointer items-center justify-between gap-3 font-semibold text-navy"
        summary={
          <>
            <span>Filters{active > 0 ? ` (${active} active)` : ''}</span>
            <span aria-hidden="true" className="text-slate group-open:rotate-180">
              ▾
            </span>
          </>
        }
      >
        <div className="mt-4 space-y-6">
          <SelectField id="f-state" name="state" label="State" defaultValue={state.state ?? ''}>
            <option value="">Any state</option>
            {STATE_OPTIONS.map((s) => (
              <option key={s.code} value={s.code}>
                {s.name}
              </option>
            ))}
          </SelectField>

          <Group legend="Baseball division">
            <div className="space-y-4">
              {DIVISION_GROUPS.map((group) => (
                <div key={group.key} className="space-y-2">
                  <p className="text-sm font-semibold text-slate">{group.label}</p>
                  {group.divisions.map(([code, label]) => (
                    <Check key={code} name="division" value={code} label={label} checked={state.divisions.includes(code)} />
                  ))}
                </div>
              ))}
            </div>
          </Group>

          <Group legend="School type">
            {CONTROLS.map((c) => (
              <Check key={c} name="control" value={c} label={CONTROL_LABELS[c]} checked={state.controls.includes(c)} />
            ))}
          </Group>
          <Group legend="Two-year or four-year">
            <Check name="level" value="four_year" label={LEVEL_LABELS.four_year} checked={state.levels.includes('four_year')} />
            <Check name="level" value="two_year" label={LEVEL_LABELS.two_year} checked={state.levels.includes('two_year')} />
          </Group>
          <Group legend="Campus setting">
            {SETTINGS.map((s) => (
              <Check key={s} name="setting" value={s} label={SETTING_LABELS[s]} checked={state.settings.includes(s)} />
            ))}
          </Group>

          <SelectField id="f-size" name="size" label="Undergraduate enrollment" defaultValue={state.size ?? ''}>
            <option value="">Any size</option>
            {Object.entries(SIZE_BANDS).map(([key, band]) => (
              <option key={key} value={key}>
                {band.label}
              </option>
            ))}
          </SelectField>
          <SelectField
            id="f-rate"
            name="rate"
            label={`Admission rate${termNote}`}
            hint="Schools that don't report a rate are left out when you pick one."
            defaultValue={state.rate ?? ''}
          >
            <option value="">Any rate</option>
            {Object.entries(RATE_CHOICES).map(([key, choice]) => (
              <option key={key} value={key}>
                {choice.label}
              </option>
            ))}
          </SelectField>
          <Group legend={`Test policy reported for a past class${termNote}`}>
            <p className="text-sm text-slate">A past class&apos;s policy. Current policies can differ; check each school page.</p>
            {TEST_POLICIES.map((t) => (
              <Check key={t} name="test" value={t} label={TEST_POLICY_LABELS[t].short} checked={state.tests.includes(t)} />
            ))}
          </Group>
          <SelectField id="f-cost" name="cost" label="Published cost of attendance" defaultValue={state.cost ?? ''}>
            <option value="">Any cost</option>
            {COST_CHOICES.map((c) => (
              <option key={c} value={c}>
                {`Up to $${Number(c).toLocaleString('en-US')} a year`}
              </option>
            ))}
          </SelectField>
          <SelectField
            id="f-major"
            name="major"
            label="Major (program area)"
            hint="Offered on campus at the bachelor’s or associate level, as reported to the College Scorecard."
            defaultValue={state.major ?? ''}
          >
            <option value="">Any major</option>
            {PROGRAM_AREA_CHOICES.map(([code, name]) => (
              <option key={code} value={code}>
                {name}
              </option>
            ))}
          </SelectField>
          <SelectField id="f-sort" name="sort" label="Sort by" defaultValue={state.sort ?? ''}>
            <option value="">{state.q ? 'Best match' : 'Name'}</option>
            <option value="name">Name</option>
            <option value="admission_rate">Admission rate, lowest first</option>
            <option value="cost">Cost of attendance, lowest first</option>
            <option value="enrollment">Enrollment, largest first</option>
          </SelectField>

          <div className="flex flex-wrap items-center gap-4">
            <button type="submit" className={buttonStyles({ variant: 'primary' })}>
              Apply filters
            </button>
            <a href="#results-heading" className="font-semibold text-royal-ink underline lg:hidden">
              Back to results
            </a>
          </div>
        </div>
      </ResponsiveDetails>

    </form>
  );
}
