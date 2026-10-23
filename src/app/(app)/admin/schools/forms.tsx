'use client';

import { startTransition, useActionState, type FormEvent } from 'react';

import {
  resolveCorrectionAction,
  setAdmissionsPolicyAction,
  setListingAction,
  updateProgramAction,
} from '@/app/(app)/admin/schools/actions';
import { Button } from '@/components/ui/button';
import { SelectField, TextAreaField, TextField } from '@/components/ui/field';
import { Notice } from '@/components/ui/notice';
import { SubmitButton } from '@/components/ui/submit-button';
import { IDLE, type ActionState } from '@/lib/forms/action-state';

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
