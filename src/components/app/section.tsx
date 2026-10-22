import type { ReactNode } from 'react';

/** A dashboard section: a navy rule, a heading, and its content. */
export function DashboardSection({
  title,
  id,
  description,
  aside,
  children,
}: {
  readonly title: string;
  readonly id: string;
  readonly description?: ReactNode;
  readonly aside?: ReactNode;
  readonly children: ReactNode;
}) {
  return (
    <section aria-labelledby={id} className="border-t-4 border-navy pt-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h2 id={id} className="text-3xl text-navy">
          {title}
        </h2>
        {aside}
      </div>
      {description ? <div className="mt-2 max-w-2xl text-slate">{description}</div> : null}
      <div className="mt-5">{children}</div>
    </section>
  );
}

export function PageTitle({ title, children }: { readonly title: string; readonly children?: ReactNode }) {
  return (
    <div className="mb-10">
      <h1 className="text-5xl text-navy sm:text-6xl">{title}</h1>
      {children ? <div className="mt-3 max-w-2xl text-lg text-slate">{children}</div> : null}
    </div>
  );
}
