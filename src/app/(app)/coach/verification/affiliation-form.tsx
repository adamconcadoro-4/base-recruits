'use client';

import { useActionState } from 'react';

import { submitAffiliationAction } from '@/app/(app)/coach/actions';
import { TextAreaField, TextField } from '@/components/ui/field';
import { Notice } from '@/components/ui/notice';
import { SubmitButton } from '@/components/ui/submit-button';
import { IDLE, type ActionState } from '@/lib/forms/action-state';

interface Defaults {
  readonly institutionName: string;
  readonly coachingTitle: string;
  readonly staffDirectoryUrl: string;
}

export function AffiliationForm({ defaults }: { readonly defaults: Defaults }) {
  const [state, action] = useActionState<ActionState, FormData>(submitAffiliationAction, IDLE);
  const errors = state.fieldErrors ?? {};
  return (
    <form action={action} className="max-w-xl space-y-5" noValidate>
      <TextField
        id="institutionName"
        name="institutionName"
        label="School"
        defaultValue={defaults.institutionName}
        autoComplete="organization"
        error={errors.institutionName}
        required
      />
      <TextField
        id="coachingTitle"
        name="coachingTitle"
        label="Your coaching title"
        hint="As it appears on the staff page."
        defaultValue={defaults.coachingTitle}
        autoComplete="organization-title"
        error={errors.coachingTitle}
        required
      />
      <TextField
        id="staffDirectoryUrl"
        name="staffDirectoryUrl"
        type="url"
        label="Official staff directory page"
        hint="The page on your athletics website that lists you in a baseball role. It must start with https://."
        defaultValue={defaults.staffDirectoryUrl}
        error={errors.staffDirectoryUrl}
        required
      />
      <TextAreaField
        id="note"
        name="note"
        label="Anything the reviewer should know (optional)"
        maxLength={2000}
        error={errors.note}
      />
      {state.message ? (
        <Notice tone={state.status === 'error' ? 'error' : 'success'} live>
          {state.message}
        </Notice>
      ) : null}
      <SubmitButton pendingLabel="Sending…">Send for review</SubmitButton>
    </form>
  );
}
