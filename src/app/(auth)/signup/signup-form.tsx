'use client';

import { useActionState, useState } from 'react';

import { checkAgeAction, signUpAction } from '@/app/(auth)/signup/actions';
import { AgeScreenBlocked } from '@/app/(auth)/signup/age-screen-blocked';
import type { AgeStepState } from '@/app/(auth)/signup/schema';
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

const ACCOUNT_TYPES = [
  { value: 'athlete', label: 'Student-athlete', hint: 'Explore programs, compare your scores and save your shortlist. Recruiting profiles come later.', adultsOnly: false },
  { value: 'parent', label: 'Parent or guardian', hint: 'Link to your player’s account with their approval. You see only what they choose to share.', adultsOnly: true },
  { value: 'coach', label: 'College coach', hint: 'Use the email address your school gave you. We verify your coaching role before coach tools open to you.', adultsOnly: true },
] as const;

/** Offered only while Assessment is switched on; the server checks again. */
const DEVELOPMENT_COACH = {
  value: 'development_coach',
  label: 'Development coach',
  hint: 'A hitting or pitching instructor who reviews the assessments of the players they train.',
  adultsOnly: true,
} as const;

export function SignupForm({ developmentCoachOpen = false }: { readonly developmentCoachOpen?: boolean }) {
  const [ageState, checkAge] = useActionState<AgeStepState, FormData>(checkAgeAction, IDLE);
  const [accountState, signUp] = useActionState<ActionState, FormData>(signUpAction, IDLE);
  const [birth, setBirth] = useState({ month: '', day: '', year: '' });

  if (ageState.blocked) return <AgeScreenBlocked />;

  if (!ageState.passed) {
    return (
      <form action={checkAge} className="mt-8 space-y-6" noValidate>
        <fieldset className="space-y-4">
          <legend className="text-xl font-bold text-navy">What is your date of birth?</legend>
          <div className="grid grid-cols-[1.4fr_1fr_1fr] gap-3">
            <SelectField
              id="month"
              name="month"
              label="Month"
              value={birth.month}
              onChange={(event) => setBirth({ ...birth, month: event.target.value })}
              required
            >
              <option value="">Month</option>
              {MONTHS.map((name, index) => (
                <option key={name} value={String(index + 1)}>
                  {name}
                </option>
              ))}
            </SelectField>
            <TextField
              id="day"
              name="day"
              label="Day"
              inputMode="numeric"
              autoComplete="bday-day"
              maxLength={2}
              value={birth.day}
              onChange={(event) => setBirth({ ...birth, day: event.target.value })}
              required
            />
            <TextField
              id="year"
              name="year"
              label="Year"
              inputMode="numeric"
              autoComplete="bday-year"
              maxLength={4}
              value={birth.year}
              onChange={(event) => setBirth({ ...birth, year: event.target.value })}
              required
            />
          </div>
        </fieldset>
        {ageState.status === 'error' && ageState.message ? (
          <Notice tone="error" live>
            {ageState.message}
          </Notice>
        ) : null}
        <SubmitButton pendingLabel="Checking…">Continue</SubmitButton>
      </form>
    );
  }

  const errors = accountState.fieldErrors ?? {};
  const choices = [...ACCOUNT_TYPES, ...(developmentCoachOpen ? [DEVELOPMENT_COACH] : [])].filter(
    (type) => ageState.adult || !type.adultsOnly,
  );

  return (
    <form action={signUp} className="mt-8 space-y-6" noValidate>
      <input type="hidden" name="month" value={birth.month} />
      <input type="hidden" name="day" value={birth.day} />
      <input type="hidden" name="year" value={birth.year} />

      <fieldset className="space-y-3" aria-describedby={errors.accountType ? 'accountType-error' : undefined}>
        <legend className="text-xl font-bold text-navy">Who is this account for?</legend>
        {choices.map((type, index) => (
          <label
            key={type.value}
            className="flex cursor-pointer gap-3 border-2 border-field bg-white p-4 has-[:checked]:border-royal has-[:checked]:bg-ice"
          >
            <input
              type="radio"
              name="accountType"
              value={type.value}
              defaultChecked={index === 0}
              className="mt-1 size-5 accent-royal"
            />
            <span>
              <span className="block font-semibold">{type.label}</span>
              <span className="block text-sm text-slate">{type.hint}</span>
            </span>
          </label>
        ))}
        {!ageState.adult ? (
          <p className="text-sm text-slate">Parent, guardian and coach accounts are for adults.</p>
        ) : null}
        {errors.accountType ? (
          <p id="accountType-error" className="text-sm font-semibold text-danger">
            {errors.accountType}
          </p>
        ) : null}
      </fieldset>

      <TextField id="displayName" name="displayName" label="Your name" autoComplete="name" error={errors.displayName} required />
      <TextField
        id="email"
        name="email"
        type="email"
        label="Email"
        hint="We'll email you a 6-digit code. Coaches: use the email address your school gave you."
        autoComplete="email"
        error={errors.email}
        required
      />

      {accountState.status === 'error' && accountState.message ? (
        <Notice tone="error" live>
          {accountState.message}
        </Notice>
      ) : null}

      <p className="text-sm text-slate">
        By creating an account you agree to the draft <a href="/terms" className="font-semibold text-royal-ink underline">terms of use</a>{' '}
        and <a href="/privacy" className="font-semibold text-royal-ink underline">privacy approach</a>. Nothing you enter is shared
        until you choose to share it.
      </p>
      <SubmitButton pendingLabel="Sending your code…">Email me a code</SubmitButton>
    </form>
  );
}
