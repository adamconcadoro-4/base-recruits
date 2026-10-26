'use client';

import { useActionState } from 'react';

import { MINIMUM_PASSWORD_LENGTH } from '@/app/(auth)/signup/schema';
import { resendCodeAction, verifyCodeAction } from '@/app/(auth)/verify/actions';
import { TextField } from '@/components/ui/field';
import { Notice } from '@/components/ui/notice';
import { SubmitButton } from '@/components/ui/submit-button';
import { IDLE, type ActionState } from '@/lib/forms/action-state';

const SUBMIT_LABELS = { signup: 'Create my account', reset: 'Set new password', login: 'Log in' } as const;

export function VerifyForm({ purpose }: { readonly purpose: 'signup' | 'reset' | 'login' }) {
  const [state, verify] = useActionState<ActionState, FormData>(verifyCodeAction, IDLE);
  const [resendState, resend] = useActionState<ActionState, FormData>(resendCodeAction, IDLE);
  const errors = state.fieldErrors ?? {};
  return (
    <div className="mt-8 space-y-8">
      <form action={verify} className="space-y-6" noValidate>
        <TextField
          id="code"
          name="code"
          label="6-digit code"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={8}
          error={errors.code}
          required
        />
        {purpose === 'login' ? null : (
          <TextField
            id="password"
            name="password"
            type="password"
            label={purpose === 'signup' ? 'Create a password' : 'New password'}
            hint={`At least ${MINIMUM_PASSWORD_LENGTH} characters. Avoid very long passwords with accented letters or emoji.`}
            autoComplete="new-password"
            error={errors.password}
            required
          />
        )}
        {state.status === 'error' && state.message ? (
          <Notice tone="error" live>
            {state.message}
          </Notice>
        ) : null}
        <SubmitButton pendingLabel="Checking…">{SUBMIT_LABELS[purpose]}</SubmitButton>
      </form>
      <form action={resend} className="space-y-3">
        <p className="text-slate">No email after a few minutes? Check spam, or send a new code.</p>
        <SubmitButton variant="secondary" pendingLabel="Sending…">
          Send a new code
        </SubmitButton>
        {resendState.message ? (
          <Notice tone={resendState.status === 'error' ? 'error' : 'info'} live>
            {resendState.message}
          </Notice>
        ) : null}
      </form>
    </div>
  );
}
