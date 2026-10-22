'use client';

import { useActionState } from 'react';

import { reviewCoachAction } from '@/app/(app)/admin/actions';
import { SelectField, TextAreaField } from '@/components/ui/field';
import { Notice } from '@/components/ui/notice';
import { SubmitButton } from '@/components/ui/submit-button';
import { IDLE, type ActionState } from '@/lib/forms/action-state';

export function ReviewForm({ coachId, coachLabel }: { readonly coachId: string; readonly coachLabel: string }) {
  const [state, action] = useActionState<ActionState, FormData>(reviewCoachAction, IDLE);
  const errors = state.fieldErrors ?? {};
  const prefix = `review-${coachId}`;
  return (
    <form action={action} className="space-y-4" aria-label={`Review ${coachLabel}`} noValidate>
      <input type="hidden" name="coachId" value={coachId} />
      <SelectField id={`${prefix}-decision`} name="decision" label="Decision" defaultValue="" error={errors.decision}>
        <option value="">Choose one</option>
        <option value="approve">Approve: staff listing confirms a baseball role</option>
        <option value="request_info">Ask for more information</option>
        <option value="reject">Reject</option>
      </SelectField>
      <TextAreaField
        id={`${prefix}-note`}
        name="note"
        label="Note to the coach"
        hint="Required when asking for more information or rejecting."
        maxLength={2000}
        error={errors.note}
      />
      {state.message ? (
        <Notice tone={state.status === 'error' ? 'error' : 'success'} live>
          {state.message}
        </Notice>
      ) : null}
      <SubmitButton pendingLabel="Saving…">Save decision</SubmitButton>
    </form>
  );
}
