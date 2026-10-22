import type { ReactNode } from 'react';

import { NOT_REPORTED } from '@/lib/registry/labels';

/** A figure, or a clearly marked "Not reported" when the source has none. */
export function Value({ value, children }: { readonly value: unknown; readonly children?: ReactNode }) {
  if (value === null || value === undefined || value === NOT_REPORTED) {
    return <span className="text-slate italic">{NOT_REPORTED}</span>;
  }
  return <>{children ?? String(value)}</>;
}

/** The term or academic year a figure describes, shown beside it. */
export function YearTag({ children }: { readonly children: ReactNode }) {
  return <span className="ml-1 text-sm font-normal whitespace-nowrap text-slate">({children})</span>;
}

/** An outbound link to an official page, showing the site it opens. */
export function ExternalLink({ href, children }: { readonly href: string; readonly children: ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="font-semibold break-words text-royal-ink underline">
      {children}
      <span className="sr-only"> (opens in a new tab)</span>
    </a>
  );
}
