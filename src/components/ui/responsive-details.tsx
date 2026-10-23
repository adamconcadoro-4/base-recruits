'use client';

import { useEffect, useRef, type ReactNode } from 'react';

/**
 * A <details> disclosure that starts closed (so small screens see results
 * first) and opens itself on wide screens once the page has loaded. The
 * visitor's own open/close choice is never overridden after that, and focus is
 * never moved. Without JavaScript it is an ordinary, keyboard-operable
 * <details>.
 */
export function ResponsiveDetails({
  id,
  summary,
  openFrom = '(min-width: 1024px)',
  className,
  summaryClassName,
  children,
}: {
  readonly id?: string;
  readonly summary: ReactNode;
  readonly openFrom?: string;
  readonly className?: string;
  readonly summaryClassName?: string;
  readonly children: ReactNode;
}) {
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const element = ref.current;
    if (element && window.matchMedia(openFrom).matches) element.open = true;
  }, [openFrom]);
  return (
    <details id={id} ref={ref} className={className}>
      <summary className={summaryClassName}>{summary}</summary>
      {children}
    </details>
  );
}
