'use client';

import { useActionState } from 'react';

import { SelectField, TextAreaField, TextField } from '@/components/ui/field';
import { Notice } from '@/components/ui/notice';
import { SubmitButton } from '@/components/ui/submit-button';
import { IDLE, type ActionState } from '@/lib/forms/action-state';

import { submitCorrectionAction } from './actions';
import { CORRECTION_TOPICS } from './topics';

export function CorrectionForm({ slug }: { readonly slug: string }) {
  const [state, action] = useActionState<ActionState, FormData>(submitCorrectionAction, IDLE);
  if (state.status === 'success') {
    return (
      <Notice tone="success" live title="Report sent">
        {state.message}
      </Notice>
    );
  }
  return (
    <form action={action} className="max-w-2xl space-y-5" noValidate>
      <input type="hidden" name="school" value={slug} />
      <SelectField id="topic" name="topic" label="What is wrong or missing?" defaultValue="" error={state.fieldErrors?.topic} required>
        <option value="" disabled>
          Choose one
        </option>
        {Object.entries(CORRECTION_TOPICS).map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </SelectField>
      <TextAreaField
        id="details"
        name="details"
        label="What should it say?"
        hint="For example: Baseball plays in NCAA Division III. 10 to 2,000 characters. Don’t include personal information."
        rows={5}
        maxLength={2000}
        error={state.fieldErrors?.details}
        required
      />
      <TextField
        id="evidence"
        name="evidence"
        type="url"
        label="Link to an official page that shows it (optional)"
        hint="The school’s athletics or admissions page, or the association’s directory."
        maxLength={500}
        error={state.fieldErrors?.evidence}
      />
      {state.status === 'error' && state.message ? (
        <Notice tone="error" live>
          {state.message}
        </Notice>
      ) : null}
      <SubmitButton pendingLabel="Sending…">Send report</SubmitButton>
    </form>
  );
}
