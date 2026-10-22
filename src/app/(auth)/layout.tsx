import type { ReactNode } from 'react';

import { SiteFooter } from '@/components/site/site-footer';
import { SiteHeader } from '@/components/site/site-header';

export default function AuthLayout({ children }: { readonly children: ReactNode }) {
  return (
    <>
      <SiteHeader />
      <main id="main" tabIndex={-1} className="bg-ice focus:outline-none">
        <div className="mx-auto max-w-xl px-4 py-12 sm:px-6 sm:py-16">{children}</div>
      </main>
      <SiteFooter />
    </>
  );
}
