'use client';

import type { VariantProps } from 'class-variance-authority';
import { useActionState } from 'react';

import type { buttonStyles } from '@/components/ui/button';
import { SubmitButton } from '@/components/ui/submit-button';
import { IDLE, type ActionState } from '@/lib/forms/action-state';
import { cn } from '@/lib/utils/cn';

interface ActionButtonFormProps extends VariantProps<typeof buttonStyles> {
  readonly action: (previous: ActionState, formData: FormData) => Promise<ActionState>;
  readonly fields?: Readonly<Record<string, string>>;
  readonly label: string;
  readonly pendingLabel?: string;
  readonly className?: string;
}

/** A one-button form for a server action, showing the action's result message. */
export function ActionButtonForm({ action, fields, label, pendingLabel, variant, size, className }: ActionButtonFormProps) {
  const [state, formAction] = useActionState<ActionState, FormData>(action, IDLE);
  return (
    <form action={formAction} className={cn('flex flex-col items-start gap-2', className)}>
      {Object.entries(fields ?? {}).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <SubmitButton variant={variant} size={size} pendingLabel={pendingLabel}>
        {label}
      </SubmitButton>
      {state.message ? (
        <p
          role={state.status === 'error' ? 'alert' : 'status'}
          className={cn('text-sm font-semibold', state.status === 'error' ? 'text-danger' : 'text-success-ink')}
        >
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
