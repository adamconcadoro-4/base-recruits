'use client';

import { useFormStatus } from 'react-dom';
import type { ButtonHTMLAttributes, ReactNode } from 'react';

import { Button, type buttonStyles } from '@/components/ui/button';
import type { VariantProps } from 'class-variance-authority';

interface SubmitButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'type'>, VariantProps<typeof buttonStyles> {
  readonly children: ReactNode;
  /** Shown while the form is submitting. */
  readonly pendingLabel?: ReactNode;
}

export function SubmitButton({ children, pendingLabel, disabled, ...props }: SubmitButtonProps) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending || disabled} aria-disabled={pending || disabled} {...props}>
      {pending && pendingLabel ? pendingLabel : children}
    </Button>
  );
}
