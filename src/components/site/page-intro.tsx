import type { ReactNode } from 'react';

import { Notice } from '@/components/ui/notice';

/** Page title band used on public content pages. */
export function PageIntro({ title, children }: { readonly title: string; readonly children?: ReactNode }) {
  return (
    <section className="border-b-4 border-royal bg-ice">
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
        <h1 className="max-w-3xl text-5xl text-navy sm:text-6xl">{title}</h1>
        {children ? <div className="mt-5 max-w-2xl text-lg text-graphite">{children}</div> : null}
      </div>
    </section>
  );
}

export function ContentSection({
  title,
  children,
  tone = 'white',
}: {
  readonly title?: string;
  readonly children: ReactNode;
  readonly tone?: 'white' | 'ice';
}) {
  return (
    <section className={tone === 'ice' ? 'bg-ice' : 'bg-white'}>
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
        {title ? <h2 className="text-4xl text-navy">{title}</h2> : null}
        <div className="mt-5 max-w-3xl space-y-4 text-graphite [&_ul>li]:ml-5 [&_ul>li]:list-disc [&_li_a]:font-semibold [&_li_a]:text-royal-ink [&_li_a]:underline [&_p_a]:font-semibold [&_p_a]:text-royal-ink [&_p_a]:underline [&_ul]:space-y-2">
          {children}
        </div>
      </div>
    </section>
  );
}

/** Trust pages are drafts until counsel reviews them (docs/decisions.md L8). */
export function DraftNotice() {
  return (
    <div className="mx-auto max-w-6xl px-4 pt-8 sm:px-6">
      <Notice tone="attention" title="Draft, pending legal review">
        This page explains how Base Recruits is built to work. It has not yet been reviewed by counsel and will be
        replaced by the final version before launch.
      </Notice>
    </div>
  );
}
