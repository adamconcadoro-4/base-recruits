'use client';

import { startTransition, useActionState, useState, type FormEvent } from 'react';

import {
  addSchoolAction,
  resolveCorrectionAction,
  setAdmissionsPolicyAction,
  setGpaRangeAction,
  setListingAction,
  updateProgramAction,
} from '@/app/(app)/admin/schools/actions';
import { Button } from '@/components/ui/button';
import { SelectField, TextAreaField, TextField } from '@/components/ui/field';
import { Notice } from '@/components/ui/notice';
import { SubmitButton } from '@/components/ui/submit-button';
import { IDLE, type ActionState } from '@/lib/forms/action-state';
import { CDS_GPA_BANDS } from '@/lib/registry/gpa';

export interface ProgramFormValues {
  readonly institutionId: string;
  readonly slug: string;
  readonly status: string;
  readonly association: string;
  readonly division: string;
  readonly conference: string | null;
  readonly athleticsUrl: string | null;
  readonly rosterUrl: string | null;
  readonly questionnaireUrl: string | null;
  readonly verification: string;
  readonly evidenceUrl: string | null;
}

export function ProgramForm({
  values,
  divisions,
}: {
  readonly values: ProgramFormValues;
  readonly divisions: readonly { readonly code: string; readonly association: string; readonly name: string }[];
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(updateProgramAction, IDLE);
  const errors = state.fieldErrors ?? {};
  // Submitted through a transition rather than the form action, so a refused
  // change keeps everything the administrator typed (form actions reset fields).
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    startTransition(() => action(data));
  }
  return (
    <form action={action} onSubmit={submit} className="grid gap-5 lg:grid-cols-2" noValidate aria-label="Correct the baseball program">
      <input type="hidden" name="institutionId" value={values.institutionId} />
      <input type="hidden" name="slug" value={values.slug} />
      <SelectField id="p-status" name="status" label="Status" defaultValue={values.status} error={errors.status}>
        <option value="active">Active</option>
        <option value="inactive">Discontinued (confirmed)</option>
        <option value="suspended">Suspended (confirmed)</option>
        {values.status === 'not_reported' ? <option value="not_reported">Not in the latest federal report</option> : null}
      </SelectField>
      <SelectField id="p-division" name="division" label="Division" defaultValue={`${values.association}|${values.division}`} error={errors.division}>
        {divisions.map((d) => (
          <option key={d.code} value={`${d.association}|${d.code}`}>
            {d.name}
          </option>
        ))}
      </SelectField>
      <TextField id="p-conference" name="conference" label="Conference" hint="Leave blank until you've confirmed it." defaultValue={values.conference ?? ''} maxLength={120} />
      <SelectField id="p-verification" name="verification" label="How you confirmed this" defaultValue={values.verification} error={errors.verification}>
        <option value="federal_report">Federal report only (no manual check)</option>
        <option value="association_directory">Checked the association&apos;s directory</option>
        <option value="official_athletics_site">Checked the school&apos;s official athletics site</option>
      </SelectField>
      <TextField
        id="p-evidence"
        name="evidenceUrl"
        type="url"
        label="Official page you checked"
        hint="Required for a status, division or conference change, and for any manual check."
        defaultValue={values.evidenceUrl ?? ''}
        error={errors.evidenceUrl}
        className="lg:col-span-2"
      />
      <TextField id="p-athletics" name="athleticsUrl" type="url" label="Team page" defaultValue={values.athleticsUrl ?? ''} error={errors.athleticsUrl} />
      <TextField id="p-roster" name="rosterUrl" type="url" label="Roster page" defaultValue={values.rosterUrl ?? ''} error={errors.rosterUrl} />
      <TextField
        id="p-questionnaire"
        name="questionnaireUrl"
        type="url"
        label="Recruiting questionnaire"
        defaultValue={values.questionnaireUrl ?? ''}
        error={errors.questionnaireUrl}
      />
      <TextAreaField id="p-note" name="note" label="What you checked" maxLength={1000} error={errors.note} className="lg:col-span-2" />
      <div className="space-y-3 lg:col-span-2">
        {state.message ? (
          <Notice tone={state.status === 'error' ? 'error' : 'success'} live>
            {state.message}
          </Notice>
        ) : null}
        <Button type="submit" disabled={pending} aria-disabled={pending}>
          {pending ? 'Saving…' : 'Save program'}
        </Button>
      </div>
    </form>
  );
}

export function AddSchoolForm({
  divisions,
  seasons,
  defaultSeason,
  states,
}: {
  readonly divisions: readonly { readonly code: string; readonly association: string; readonly name: string }[];
  readonly seasons: readonly string[];
  readonly defaultSeason: string;
  readonly states: readonly { readonly code: string; readonly name: string }[];
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(addSchoolAction, IDLE);
  const errors = state.fieldErrors ?? {};
  // Submitted through a transition so a refused addition keeps what was typed.
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    startTransition(() => action(data));
  }
  return (
    <form action={action} onSubmit={submit} className="grid gap-5 lg:grid-cols-2" noValidate aria-label="Add a school">
      <TextField
        id="n-unitid"
        name="unitid"
        label="Federal school ID (IPEDS UNITID)"
        hint="Six digits, from the school's College Navigator page (nces.ed.gov/collegenavigator)."
        inputMode="numeric"
        maxLength={6}
        error={errors.unitid}
      />
      <TextField id="n-name" name="name" label="Official school name" maxLength={200} error={errors.name} />
      <TextField id="n-city" name="city" label="City" maxLength={100} error={errors.city} />
      <SelectField id="n-state" name="state" label="State" defaultValue="" error={errors.state}>
        <option value="" disabled>
          Choose one
        </option>
        {states.map((s) => (
          <option key={s.code} value={s.code}>
            {s.name}
          </option>
        ))}
      </SelectField>
      <TextField id="n-website" name="websiteUrl" type="url" label="School website" error={errors.websiteUrl} />
      <SelectField id="n-control" name="control" label="Control" defaultValue="" error={errors.control}>
        <option value="" disabled>
          Choose one
        </option>
        <option value="public">Public</option>
        <option value="private_nonprofit">Private nonprofit</option>
        <option value="private_for_profit">Private for-profit</option>
      </SelectField>
      <SelectField id="n-level" name="level" label="Level" defaultValue="four_year" error={errors.level}>
        <option value="four_year">Four-year</option>
        <option value="two_year">Two-year</option>
        <option value="less_than_two_year">Less than two-year</option>
      </SelectField>
      <SelectField
        id="n-season"
        name="season"
        label="Season you confirmed"
        hint="The season the official page shows. Choose the one just finished if next season's roster isn't posted yet."
        defaultValue={defaultSeason}
        error={errors.season}
      >
        {seasons.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </SelectField>
      <SelectField id="n-division" name="division" label="Division" defaultValue="" error={errors.division}>
        <option value="" disabled>
          Choose one
        </option>
        {divisions.map((d) => (
          <option key={d.code} value={`${d.association}|${d.code}`}>
            {d.name}
          </option>
        ))}
      </SelectField>
      <TextField id="n-conference" name="conference" label="Conference" hint="Leave blank until you've confirmed it." maxLength={120} error={errors.conference} />
      <SelectField id="n-verification" name="verification" label="How you confirmed the team" defaultValue="official_athletics_site" error={errors.verification}>
        <option value="official_athletics_site">Checked the school&apos;s official athletics site</option>
        <option value="association_directory">Checked the association&apos;s directory</option>
      </SelectField>
      <TextField id="n-athletics" name="athleticsUrl" type="url" label="Team page (optional)" error={errors.athleticsUrl} />
      <TextField
        id="n-evidence"
        name="evidenceUrl"
        type="url"
        label="Official page you checked"
        hint="A current schedule, roster or announcement on the school's or conference's own site."
        error={errors.evidenceUrl}
        className="lg:col-span-2"
      />
      <TextAreaField id="n-note" name="note" label="What you checked" maxLength={1000} error={errors.note} className="lg:col-span-2" />
      <div className="space-y-3 lg:col-span-2">
        {state.message ? (
          <Notice tone={state.status === 'error' ? 'error' : 'success'} live>
            {state.message}
          </Notice>
        ) : null}
        <Button type="submit" disabled={pending} aria-disabled={pending}>
          {pending ? 'Adding…' : 'Add school'}
        </Button>
      </div>
    </form>
  );
}

export function ListingForm({ institutionId, slug, listed }: { readonly institutionId: string; readonly slug: string; readonly listed: boolean }) {
  const [state, action] = useActionState<ActionState, FormData>(setListingAction, IDLE);
  const errors = state.fieldErrors ?? {};
  return (
    <form action={action} className="max-w-xl space-y-4" noValidate aria-label={listed ? 'Hide from public pages' : 'List on public pages'}>
      <input type="hidden" name="institutionId" value={institutionId} />
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="listed" value={listed ? 'false' : 'true'} />
      <TextField id="l-reason" name="reason" label="Reason" maxLength={500} error={errors.reason} />
      {state.message ? (
        <Notice tone={state.status === 'error' ? 'error' : 'success'} live>
          {state.message}
        </Notice>
      ) : null}
      <SubmitButton variant={listed ? 'danger' : 'primary'} pendingLabel="Saving…">
        {listed ? 'Hide from public pages' : 'List on public pages again'}
      </SubmitButton>
    </form>
  );
}

export function PolicyForm({ institutionId, slug, years }: { readonly institutionId: string; readonly slug: string; readonly years: readonly number[] }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(setAdmissionsPolicyAction, IDLE);
  const errors = state.fieldErrors ?? {};
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    startTransition(() => action(data));
  }
  return (
    <form action={action} onSubmit={submit} className="grid gap-5 lg:grid-cols-2" noValidate aria-label="Record a checked admissions testing policy">
      <input type="hidden" name="institutionId" value={institutionId} />
      <input type="hidden" name="slug" value={slug} />
      <SelectField id="a-applicant" name="applicantType" label="Applicants" defaultValue="first_year" error={errors.applicantType}>
        <option value="first_year">First-year</option>
        <option value="transfer">Transfer</option>
      </SelectField>
      <SelectField id="a-year" name="entryYear" label="Entering in fall" defaultValue={String(years[1] ?? years[0] ?? '')} error={errors.entryYear}>
        {years.map((y) => (
          <option key={y} value={y}>
            {y}
          </option>
        ))}
      </SelectField>
      <SelectField id="a-policy" name="testPolicy" label="Testing policy" defaultValue="" error={errors.testPolicy}>
        <option value="" disabled>
          Choose one
        </option>
        <option value="required">Required</option>
        <option value="considered_not_required">Optional (considered if submitted)</option>
        <option value="not_considered">Blind (not considered)</option>
      </SelectField>
      <TextField id="a-title" name="sourceTitle" label="Page title (optional)" maxLength={200} />
      <TextField
        id="a-source"
        name="sourceUrl"
        type="url"
        label="Official admissions page you checked"
        error={errors.sourceUrl}
        className="lg:col-span-2"
      />
      <TextAreaField
        id="a-exceptions"
        name="exceptions"
        label="Exceptions, in the school's words (optional)"
        hint="For example, programs or applicants the policy treats differently."
        maxLength={1000}
        error={errors.exceptions}
        className="lg:col-span-2"
      />
      <TextAreaField id="a-note" name="note" label="What you checked" maxLength={1000} error={errors.note} className="lg:col-span-2" />
      <div className="space-y-3 lg:col-span-2">
        {state.message ? (
          <Notice tone={state.status === 'error' ? 'error' : 'success'} live>
            {state.message}
          </Notice>
        ) : null}
        <Button type="submit" disabled={pending} aria-disabled={pending}>
          {pending ? 'Saving…' : 'Record policy'}
        </Button>
      </div>
    </form>
  );
}

export function ResolveReportForm({ reportId }: { readonly reportId: string }) {
  const [state, action] = useActionState<ActionState, FormData>(resolveCorrectionAction, IDLE);
  const errors = state.fieldErrors ?? {};
  if (state.status === 'success') {
    return (
      <Notice tone="success" live>
        {state.message}
      </Notice>
    );
  }
  return (
    <form action={action} className="max-w-xl space-y-3" noValidate aria-label="Close this report">
      <input type="hidden" name="reportId" value={reportId} />
      <TextField id={`r-note-${reportId}`} name="note" label="What you did" maxLength={1000} error={errors.note} />
      {state.status === 'error' && state.message ? (
        <Notice tone="error" live>
          {state.message}
        </Notice>
      ) : null}
      <div className="flex flex-wrap gap-3">
        <SubmitButton name="status" value="resolved" pendingLabel="Saving…">
          Resolved
        </SubmitButton>
        <SubmitButton name="status" value="dismissed" variant="secondary" pendingLabel="Saving…">
          Dismiss
        </SubmitButton>
      </div>
    </form>
  );
}

/**
 * Records a high school GPA range (F51) from the school's Common Data Set (section C11 bands, all enrolled
 * first-year students) or its own class-profile page (a published 25th–75th percentile range).
 */
export function GpaRangeForm({ unitid, slug, years }: { readonly unitid: number; readonly slug: string; readonly years: readonly number[] }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(setGpaRangeAction, IDLE);
  const [kind, setKind] = useState('common_data_set');
  const errors = state.fieldErrors ?? {};
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    startTransition(() => action(data));
  }
  return (
    <form action={action} onSubmit={submit} className="grid gap-5 lg:grid-cols-2" noValidate aria-label="Record a published GPA range">
      <input type="hidden" name="unitid" value={unitid} />
      <input type="hidden" name="slug" value={slug} />
      <SelectField id="g-kind" name="sourceKind" label="Where the numbers come from" value={kind} onChange={(e) => setKind(e.currentTarget.value)} error={errors.sourceKind}>
        <option value="common_data_set">Common Data Set (section C11)</option>
        <option value="school_profile">The school&apos;s class profile (middle 50% GPA)</option>
      </SelectField>
      <SelectField id="g-year" name="enteringYear" label="Entering class (fall)" defaultValue={String(years[1] ?? years[0] ?? '')} error={errors.enteringYear} hint={kind === 'common_data_set' ? 'A Common Data Set 2025-2026 describes fall 2025.' : undefined}>
        {years.map((y) => (
          <option key={y} value={y}>
            Fall {y}
          </option>
        ))}
      </SelectField>
      {kind === 'common_data_set' ? (
        <fieldset className="grid gap-4 sm:grid-cols-3 lg:col-span-2">
          <legend className="mb-2 font-semibold text-graphite">C11 percentages, column for all enrolled students (blank counts as 0)</legend>
          {CDS_GPA_BANDS.map((label, i) => (
            <TextField key={label} id={`g-band${i}`} name={`band${i}`} label={label} inputMode="decimal" error={errors[`band${i}`]} autoComplete="off" />
          ))}
        </fieldset>
      ) : (
        <>
          <TextField id="g-low" name="low" label="25th percentile GPA (4.0 scale)" inputMode="decimal" error={errors.low} autoComplete="off" />
          <TextField id="g-high" name="high" label="75th percentile GPA (4.0 scale)" inputMode="decimal" error={errors.high} autoComplete="off" />
        </>
      )}
      <TextField id="g-average" name="average" label="Average GPA as printed (optional)" hint="Leave blank if it's on another scale, such as 89.3." inputMode="decimal" error={errors.average} autoComplete="off" />
      <TextField id="g-submitting" name="percentSubmitting" label="Percent submitting a GPA (optional)" inputMode="decimal" error={errors.percentSubmitting} autoComplete="off" />
      <SelectField id="g-weighting" name="weighting" label="Does the school say if these are weighted?" defaultValue="not_stated" error={errors.weighting}>
        <option value="not_stated">Not stated</option>
        <option value="weighted">Weighted</option>
        <option value="unweighted">Unweighted</option>
      </SelectField>
      <TextField id="g-title" name="sourceTitle" label="Document or page title (optional)" maxLength={200} />
      <TextField id="g-source" name="sourceUrl" type="url" label="Link to the document or page you read" error={errors.sourceUrl} className="lg:col-span-2" />
      <TextAreaField id="g-note" name="note" label="What you checked" maxLength={1000} error={errors.note} className="lg:col-span-2" />
      <div className="space-y-3 lg:col-span-2">
        {state.message ? (
          <Notice tone={state.status === 'error' ? 'error' : 'success'} live>
            {state.message}
          </Notice>
        ) : null}
        <Button type="submit" disabled={pending} aria-disabled={pending}>
          {pending ? 'Saving…' : 'Record GPA range'}
        </Button>
      </div>
    </form>
  );
}
