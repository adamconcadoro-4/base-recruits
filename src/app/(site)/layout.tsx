import type { ReactNode } from 'react';

import { SiteFooter } from '@/components/site/site-footer';
import { SiteHeader } from '@/components/site/site-header';

export default function SiteLayout({ children }: { readonly children: ReactNode }) {
  return (
    <>
      <SiteHeader />
      <main id="main" tabIndex={-1} className="focus:outline-none">
        {children}
      </main>
      <SiteFooter />
    </>
  );
}
