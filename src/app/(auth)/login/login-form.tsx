'use client';

import { useActionState } from 'react';

import { logInAction } from '@/app/(auth)/login/actions';
import { TextField } from '@/components/ui/field';
import { Notice } from '@/components/ui/notice';
import { SubmitButton } from '@/components/ui/submit-button';
import { IDLE, type ActionState } from '@/lib/forms/action-state';

export function LoginForm({ next }: { readonly next: string }) {
  const [state, logIn] = useActionState<ActionState, FormData>(logInAction, IDLE);
  const errors = state.fieldErrors ?? {};
  return (
    <form action={logIn} className="mt-8 space-y-6" noValidate>
      <input type="hidden" name="next" value={next} />
      <TextField id="email" name="email" type="email" label="Email" autoComplete="email" error={errors.email} required />
      <TextField
        id="password"
        name="password"
        type="password"
        label="Password"
        autoComplete="current-password"
        error={errors.password}
        required
      />
      {state.status === 'error' && state.message ? (
        <Notice tone="error" live>
          {state.message}
        </Notice>
      ) : null}
      <SubmitButton pendingLabel="Logging in…">Log in</SubmitButton>
    </form>
  );
}
