import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react';

import { cn } from '@/lib/utils/cn';

const controlStyles =
  'block w-full rounded-md border-2 border-field bg-white px-3 py-2.5 text-base text-graphite placeholder:text-slate/80 aria-[invalid=true]:border-danger';

interface FieldShellProps {
  readonly id: string;
  readonly label: ReactNode;
  readonly hint?: ReactNode;
  readonly error?: string;
  readonly children: ReactNode;
  readonly className?: string;
}

/** Label, optional hint and error, wired to the control through ids. */
export function FieldShell({ id, label, hint, error, children, className }: FieldShellProps) {
  return (
    <div className={cn('space-y-1.5', className)}>
      <label htmlFor={id} className="block font-semibold text-graphite">
        {label}
      </label>
      {hint ? (
        <p id={`${id}-hint`} className="text-sm text-slate">
          {hint}
        </p>
      ) : null}
      {children}
      {error ? (
        <p id={`${id}-error`} className="text-sm font-semibold text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function describedBy(id: string, hint: unknown, error: unknown): string | undefined {
  const ids = [hint ? `${id}-hint` : null, error ? `${id}-error` : null].filter(Boolean);
  return ids.length > 0 ? ids.join(' ') : undefined;
}

interface TextFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'id'> {
  readonly id: string;
  readonly label: ReactNode;
  readonly hint?: ReactNode;
  readonly error?: string;
}

export function TextField({ id, label, hint, error, className, ...props }: TextFieldProps) {
  return (
    <FieldShell id={id} label={label} hint={hint} error={error} className={className}>
      <input
        id={id}
        className={controlStyles}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, hint, error)}
        {...props}
      />
    </FieldShell>
  );
}

interface SelectFieldProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'id'> {
  readonly id: string;
  readonly label: ReactNode;
  readonly hint?: ReactNode;
  readonly error?: string;
}

export function SelectField({ id, label, hint, error, className, children, ...props }: SelectFieldProps) {
  return (
    <FieldShell id={id} label={label} hint={hint} error={error} className={className}>
      <select
        id={id}
        className={controlStyles}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, hint, error)}
        {...props}
      >
        {children}
      </select>
    </FieldShell>
  );
}

interface TextAreaFieldProps extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'id'> {
  readonly id: string;
  readonly label: ReactNode;
  readonly hint?: ReactNode;
  readonly error?: string;
}

export function TextAreaField({ id, label, hint, error, className, ...props }: TextAreaFieldProps) {
  return (
    <FieldShell id={id} label={label} hint={hint} error={error} className={className}>
      <textarea
        id={id}
        className={cn(controlStyles, 'min-h-28')}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, hint, error)}
        {...props}
      />
    </FieldShell>
  );
}
