'use client';

import type { VariantProps } from 'class-variance-authority';
import { useActionState, type ReactNode } from 'react';

import type { buttonStyles } from '@/components/ui/button';
import { SubmitButton } from '@/components/ui/submit-button';
import { IDLE, type ActionState } from '@/lib/forms/action-state';
import { cn } from '@/lib/utils/cn';

interface ActionFormProps extends VariantProps<typeof buttonStyles> {
  readonly action: (previous: ActionState, formData: FormData) => Promise<ActionState>;
  /** Hidden fields sent with the form. */
  readonly fields?: Readonly<Record<string, string>>;
  readonly submitLabel: string;
  readonly pendingLabel?: string;
  /** Visible fields, rendered on the server and passed in. */
  readonly children?: ReactNode;
  readonly className?: string;
  /** Lay the fields and button out in one row on wider screens. */
  readonly inline?: boolean;
  /** Ask before submitting (for removals that cannot be undone). */
  readonly confirm?: string;
  readonly testId?: string;
}

/**
 * A form for one server action: the fields, a submit button, and the
 * action's result announced to screen readers.
 */
export function ActionForm({
  action,
  fields,
  submitLabel,
  pendingLabel,
  children,
  className,
  inline = false,
  confirm,
  variant,
  size,
  testId,
}: ActionFormProps) {
  const [state, formAction] = useActionState<ActionState, FormData>(action, IDLE);
  return (
    <form
      action={formAction}
      data-testid={testId}
      onSubmit={(event) => {
        if (confirm && !window.confirm(confirm)) event.preventDefault();
      }}
      className={cn(inline ? 'flex flex-wrap items-end gap-3' : 'space-y-4', className)}
    >
      {Object.entries(fields ?? {}).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      {children}
      <div className="flex flex-col items-start gap-2">
        <SubmitButton variant={variant} size={size} pendingLabel={pendingLabel ?? 'Saving…'}>
          {submitLabel}
        </SubmitButton>
      </div>
      {state.message ? (
        <p
          role={state.status === 'error' ? 'alert' : 'status'}
          className={cn('basis-full text-sm font-semibold', state.status === 'error' ? 'text-danger' : 'text-success-ink')}
        >
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
