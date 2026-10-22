import type { ReactNode } from 'react';

import { cn } from '@/lib/utils/cn';

export type ChipTone = 'neutral' | 'progress' | 'positive' | 'attention' | 'blocked';

const chipStyles: Record<ChipTone, string> = {
  neutral: 'border-field text-graphite bg-white',
  progress: 'border-royal-ink text-royal-ink bg-ice',
  positive: 'border-success text-success-ink bg-success-soft',
  attention: 'border-attention text-attention bg-attention-soft',
  blocked: 'border-danger text-danger bg-danger-soft',
};

/** A status label. Green appears only for genuinely positive states. */
export function StatusChip({ tone, children }: { readonly tone: ChipTone; readonly children: ReactNode }) {
  return (
    <span className={cn('inline-flex items-center rounded-full border-2 px-3 py-0.5 text-sm font-semibold', chipStyles[tone])}>
      {children}
    </span>
  );
}
