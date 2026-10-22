'use client';

import { useActionState } from 'react';

import { createInviteAction } from '@/app/(app)/athlete/actions';
import { Notice } from '@/components/ui/notice';
import { SubmitButton } from '@/components/ui/submit-button';
import { formatDate, type InviteState } from '@/lib/family/family';
import { IDLE } from '@/lib/forms/action-state';

export function InviteForm() {
  const [state, action] = useActionState<InviteState, FormData>(createInviteAction, IDLE);
  return (
    <div className="space-y-4">
      <form action={action}>
        <SubmitButton variant="secondary" pendingLabel="Creating code…">
          Create a family code
        </SubmitButton>
      </form>
      {state.status === 'success' && state.code ? (
        <div role="status" className="border-2 border-navy bg-ice p-5">
          <p className="font-semibold">Share this code with your parent or guardian</p>
          <p className="display mt-2 text-5xl tracking-[0.12em] text-navy" data-testid="family-code">
            {state.code}
          </p>
          <p className="mt-2 text-sm text-slate">
            It works once{state.expiresAt ? ` and expires ${formatDate(state.expiresAt)}` : ''}. You&apos;ll still need
            to approve the link after they enter it. We won&apos;t show this code again.
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
