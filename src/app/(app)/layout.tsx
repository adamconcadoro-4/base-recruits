import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';

import { AppHeader } from '@/components/app/app-header';
import { GuestSavesMerger } from '@/components/shortlist/guest-saves-merger';
import { getAccount } from '@/lib/auth/account';

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function AppLayout({ children }: { readonly children: ReactNode }) {
  const account = await getAccount();
  if (account.viewer.kind === 'anonymous') redirect('/login');
  return (
    <>
      <AppHeader account={account} />
      <main id="main" tabIndex={-1} className="min-h-[60vh] bg-white focus:outline-none">
        <div className="mx-auto max-w-6xl space-y-6 px-4 py-10 sm:px-6">
          {/* Moves schools saved in this browser before sign-in into the account. */}
          <GuestSavesMerger />
          <div>{children}</div>
        </div>
      </main>
    </>
  );
}
