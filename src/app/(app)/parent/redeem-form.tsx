'use client';

import { useActionState } from 'react';

import { redeemCodeAction } from '@/app/(app)/parent/actions';
import { SelectField, TextField } from '@/components/ui/field';
import { Notice } from '@/components/ui/notice';
import { SubmitButton } from '@/components/ui/submit-button';
import { IDLE, type ActionState } from '@/lib/forms/action-state';

export function RedeemForm() {
  const [state, action] = useActionState<ActionState, FormData>(redeemCodeAction, IDLE);
  const errors = state.fieldErrors ?? {};
  return (
    <form action={action} className="max-w-xl space-y-5" noValidate>
      <TextField
        id="code"
        name="code"
        label="Family code"
        hint="The athlete creates it from their account."
        autoComplete="off"
        autoCapitalize="characters"
        spellCheck={false}
        error={errors.code}
        required
      />
      <SelectField id="relationship" name="relationship" label="Your relationship to the athlete" defaultValue="" error={errors.relationship} required>
        <option value="">Choose one</option>
        <option value="parent">Parent</option>
        <option value="legal_guardian">Legal guardian</option>
        <option value="other_family">Other family member</option>
      </SelectField>
      {state.message ? (
        <Notice tone={state.status === 'error' ? 'error' : 'success'} live>
          {state.message}
        </Notice>
      ) : null}
      <SubmitButton pendingLabel="Checking code…">Connect to athlete</SubmitButton>
    </form>
  );
}
