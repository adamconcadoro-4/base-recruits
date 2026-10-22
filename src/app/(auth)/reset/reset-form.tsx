'use client';

import { useActionState } from 'react';

import { requestResetAction } from '@/app/(auth)/reset/actions';
import { TextField } from '@/components/ui/field';
import { Notice } from '@/components/ui/notice';
import { SubmitButton } from '@/components/ui/submit-button';
import { IDLE, type ActionState } from '@/lib/forms/action-state';

export function ResetForm() {
  const [state, action] = useActionState<ActionState, FormData>(requestResetAction, IDLE);
  return (
    <form action={action} className="mt-8 space-y-6" noValidate>
      <TextField id="email" name="email" type="email" label="Email" autoComplete="email" error={state.fieldErrors?.email} required />
      {state.status === 'error' && state.message ? (
        <Notice tone="error" live>
          {state.message}
        </Notice>
      ) : null}
      <SubmitButton pendingLabel="Sending your code…">Email me a code</SubmitButton>
    </form>
  );
}
