import { LogOut } from 'lucide-react';
import Link from 'next/link';

import { signOutAction } from '@/app/(auth)/login/actions';
import { Logo } from '@/components/site/logo';
import { assessmentSiteEnabled } from '@/config/assessment';
import type { Account } from '@/lib/auth/account';
import { ROLE_HOME_PATHS, ROLE_LABELS } from '@/lib/auth/roles';

export function AppHeader({ account }: { readonly account: Account }) {
  const signedIn = account.viewer.kind === 'signed_in' && account.viewer.onboardingComplete;
  const homes = signedIn ? account.roles : [];
  // The development coach's home is Assessment, so the separate link is only for other roles.
  const showAssessment = signedIn && assessmentSiteEnabled() && !account.roles.includes('development_coach');
  return (
    <header className="on-navy bg-navy print:hidden">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-6 gap-y-3 px-4 py-3 sm:px-6">
        <Logo />
        <nav aria-label="Account" className="flex flex-wrap items-center gap-1">
          {homes.map((role) => (
            <Link
              key={role}
              href={ROLE_HOME_PATHS[role]}
              className="rounded-md px-3 py-2 font-semibold text-white no-underline hover:bg-white/10"
            >
              {ROLE_LABELS[role]}
            </Link>
          ))}
          {showAssessment ? (
            <Link href="/assessment" className="rounded-md px-3 py-2 font-semibold text-white no-underline hover:bg-white/10">
              Assessment
            </Link>
          ) : null}
          <Link href="/settings" className="rounded-md px-3 py-2 font-semibold text-white no-underline hover:bg-white/10">
            Settings
          </Link>
          <form action={signOutAction}>
            <button
              type="submit"
              className="inline-flex min-h-11 items-center gap-2 rounded-md px-3 py-2 font-semibold text-white hover:bg-white/10"
            >
              <LogOut aria-hidden="true" className="size-5" />
              Sign out
            </button>
          </form>
        </nav>
      </div>
    </header>
  );
}
