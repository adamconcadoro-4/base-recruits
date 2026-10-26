'use client';

import { useActionState } from 'react';

import { createCoachCodeAction, type CoachCodeState } from '@/app/(app)/assessment/connection-actions';
import { formatDateTime } from '@/components/assessment/result-format';
import { Notice } from '@/components/ui/notice';
import { SubmitButton } from '@/components/ui/submit-button';
import { IDLE } from '@/lib/forms/action-state';

/** Creates a coach code and shows it once. */
export function CoachCodeForm() {
  const [state, action] = useActionState<CoachCodeState, FormData>(createCoachCodeAction, IDLE);
  return (
    <div className="space-y-4">
      <form action={action}>
        <SubmitButton variant="secondary" pendingLabel="Creating code…">
          Create a coach code
        </SubmitButton>
      </form>
      {state.status === 'success' && state.code ? (
        <div role="status" className="border-2 border-navy bg-ice p-5">
          <p className="font-semibold">Give this code to your development coach</p>
          <p className="display mt-2 text-4xl tracking-[0.12em] text-navy" data-testid="coach-code">
            {state.code}
          </p>
          <p className="mt-2 text-sm text-slate">
            It works once{state.expiresAt ? ` and expires ${formatDateTime(state.expiresAt)}` : ''}. You&apos;ll approve the
            connection after they enter it. We won&apos;t show this code again.
          </p>
        </div>
      ) : null}
      {state.status === 'error' && state.message ? (
        <Notice tone="error" live>
          {state.message}
        </Notice>
      ) : null}
    </div>
  );
}
