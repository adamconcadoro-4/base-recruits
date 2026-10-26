'use client';

import { useActionState } from 'react';

import { requestLoginCodeAction } from '@/app/(auth)/login/actions';
import { TextField } from '@/components/ui/field';
import { Notice } from '@/components/ui/notice';
import { SubmitButton } from '@/components/ui/submit-button';
import { IDLE, type ActionState } from '@/lib/forms/action-state';

export function LoginCodeForm({ next }: { readonly next: string }) {
  const [state, request] = useActionState<ActionState, FormData>(requestLoginCodeAction, IDLE);
  const errors = state.fieldErrors ?? {};
  return (
    <form action={request} className="mt-8 space-y-6" noValidate>
      <input type="hidden" name="next" value={next} />
      <TextField id="email" name="email" type="email" label="Email" autoComplete="email" error={errors.email} required />
      {state.status === 'error' && state.message ? (
        <Notice tone="error" live>
          {state.message}
        </Notice>
      ) : null}
      <SubmitButton pendingLabel="Sending…">Email me a sign-in code</SubmitButton>
    </form>
  );
}
