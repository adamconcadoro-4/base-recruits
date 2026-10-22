import { CircleAlert, CircleCheck, Clock, Info } from 'lucide-react';
import type { ReactNode } from 'react';

import { cn } from '@/lib/utils/cn';

export type NoticeTone = 'info' | 'success' | 'attention' | 'error';

const toneStyles: Record<NoticeTone, string> = {
  info: 'border-royal-ink bg-ice text-graphite',
  success: 'border-success bg-success-soft text-graphite',
  attention: 'border-attention bg-attention-soft text-graphite',
  error: 'border-danger bg-danger-soft text-graphite',
};

const toneIcons = { info: Info, success: CircleCheck, attention: Clock, error: CircleAlert } as const;

interface NoticeProps {
  readonly tone?: NoticeTone;
  readonly title?: ReactNode;
  readonly children?: ReactNode;
  readonly className?: string;
  /** Announce to screen readers when it appears (form results). */
  readonly live?: boolean;
}

export function Notice({ tone = 'info', title, children, className, live = false }: NoticeProps) {
  const Icon = toneIcons[tone];
  return (
    <div
      role={live ? (tone === 'error' ? 'alert' : 'status') : undefined}
      className={cn('flex gap-3 border-l-4 px-4 py-3', toneStyles[tone], className)}
    >
      <Icon aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
      <div className="space-y-1">
        {title ? <p className="font-semibold">{title}</p> : null}
        {children ? <div className="text-[0.95rem]">{children}</div> : null}
      </div>
    </div>
  );
}
