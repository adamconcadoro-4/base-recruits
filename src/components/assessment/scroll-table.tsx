import type { ReactNode } from 'react';

import { cn } from '@/lib/utils/cn';

/**
 * A wide table that scrolls sideways on small screens. The scroll area is
 * focusable and named, so keyboard users can scroll it too.
 */
export function ScrollTable({ label, className, children }: { readonly label: string; readonly className?: string; readonly children: ReactNode }) {
  return (
    <div role="region" aria-label={label} tabIndex={0} className={cn('overflow-x-auto focus-visible:outline-3', className)}>
      {children}
    </div>
  );
}
