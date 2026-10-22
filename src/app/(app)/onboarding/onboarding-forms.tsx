'use client';

import { useActionState } from 'react';

import { chooseRoleAction, recordBirthdateAction } from '@/app/(app)/onboarding/actions';
import { SelectField, TextField } from '@/components/ui/field';
import { Notice } from '@/components/ui/notice';
import { SubmitButton } from '@/components/ui/submit-button';
import { IDLE, type ActionState } from '@/lib/forms/action-state';

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

export function RoleForm({ defaultName }: { readonly defaultName: string }) {
  const [state, action] = useActionState<ActionState, FormData>(chooseRoleAction, IDLE);
  return (
    <form action={action} className="max-w-xl space-y-6">
      <fieldset className="space-y-3">
        <legend className="text-xl font-bold text-navy">Who is this account for?</legend>
        {[
          { value: 'athlete', label: 'Student-athlete' },
          { value: 'parent', label: 'Parent or guardian' },
          { value: 'coach', label: 'College coach' },
        ].map((option, index) => (
          <label key={option.value} className="flex cursor-pointer items-center gap-3 border-2 border-field p-4 has-[:checked]:border-royal has-[:checked]:bg-ice">
            <input type="radio" name="accountType" value={option.value} defaultChecked={index === 0} className="size-5 accent-royal" />
            <span className="font-semibold">{option.label}</span>
          </label>
        ))}
      </fieldset>
      <TextField id="displayName" name="displayName" label="Your name" defaultValue={defaultName} autoComplete="name" />
      {state.status === 'error' && state.message ? (
        <Notice tone="error" live>
          {state.message}
        </Notice>
      ) : null}
      <SubmitButton pendingLabel="Saving…">Continue</SubmitButton>
    </form>
  );
}

export function BirthdateForm() {
  const [state, action] = useActionState<ActionState, FormData>(recordBirthdateAction, IDLE);
  return (
    <form action={action} className="max-w-xl space-y-6" noValidate>
      <fieldset>
        <legend className="text-xl font-bold text-navy">What is your date of birth?</legend>
        <div className="mt-4 grid grid-cols-[1.4fr_1fr_1fr] gap-3">
          <SelectField id="month" name="month" label="Month" defaultValue="" required>
            <option value="">Month</option>
            {MONTHS.map((name, index) => (
              <option key={name} value={String(index + 1)}>
                {name}
              </option>
            ))}
          </SelectField>
          <TextField id="day" name="day" label="Day" inputMode="numeric" maxLength={2} required />
          <TextField id="year" name="year" label="Year" inputMode="numeric" maxLength={4} required />
        </div>
      </fieldset>
      {state.status === 'error' && state.message ? (
        <Notice tone="error" live>
          {state.message}
        </Notice>
      ) : null}
      <SubmitButton pendingLabel="Saving…">Continue</SubmitButton>
    </form>
  );
}
