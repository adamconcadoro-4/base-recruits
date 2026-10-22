import { cva, type VariantProps } from 'class-variance-authority';
import Link from 'next/link';
import type { ButtonHTMLAttributes, ComponentProps } from 'react';

import { cn } from '@/lib/utils/cn';

export const buttonStyles = cva(
  'inline-flex items-center justify-center gap-2 rounded-md font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60 min-h-11',
  {
    variants: {
      variant: {
        primary: 'bg-royal text-white hover:bg-royal-ink',
        secondary: 'border-2 border-navy bg-white text-navy hover:bg-ice',
        quiet: 'text-royal-ink underline hover:text-navy',
        onNavy: 'bg-white text-navy hover:bg-ice',
        outlineOnNavy: 'border-2 border-white/70 text-white hover:bg-white/10',
        danger: 'border-2 border-danger bg-white text-danger hover:bg-danger-soft',
      },
      size: {
        md: 'px-5 py-2.5 text-base',
        sm: 'px-3.5 py-2 text-sm min-h-10',
        lg: 'px-6 py-3 text-lg',
      },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  },
);

type ButtonStyleProps = VariantProps<typeof buttonStyles>;

export function Button({
  className,
  variant,
  size,
  type = 'button',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & ButtonStyleProps) {
  return <button type={type} className={cn(buttonStyles({ variant, size }), className)} {...props} />;
}

export function ButtonLink({ className, variant, size, ...props }: ComponentProps<typeof Link> & ButtonStyleProps) {
  return <Link className={cn(buttonStyles({ variant, size }), className)} {...props} />;
}
