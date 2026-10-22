'use client';

import { useActionState } from 'react';

import { updateNameAction } from '@/app/(app)/settings/actions';
import { TextField } from '@/components/ui/field';
import { Notice } from '@/components/ui/notice';
import { SubmitButton } from '@/components/ui/submit-button';
import { IDLE, type ActionState } from '@/lib/forms/action-state';

export function NameForm({ defaultName }: { readonly defaultName: string }) {
  const [state, action] = useActionState<ActionState, FormData>(updateNameAction, IDLE);
  return (
    <form action={action} className="max-w-xl space-y-4" noValidate>
      <TextField
        id="displayName"
        name="displayName"
        label="Your name"
        defaultValue={defaultName}
        autoComplete="name"
        error={state.fieldErrors?.displayName}
        required
      />
      {state.message ? (
        <Notice tone={state.status === 'error' ? 'error' : 'success'} live>
          {state.message}
        </Notice>
      ) : null}
      <SubmitButton pendingLabel="Saving…">Save name</SubmitButton>
    </form>
  );
}
