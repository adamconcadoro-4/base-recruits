import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { PasskeySetup } from '@/components/auth/passkey-setup';
import { PageTitle } from '@/components/app/section';
import { requireAccess } from '@/lib/auth/guard';
import { listPasskeys } from '@/lib/auth/passkeys';
import { safeNextPath } from '@/lib/auth/route-access';
import { createClient } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Log in faster next time', robots: { index: false, follow: false } };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/** The offer shown once after an emailed-code or password sign-in, to accounts with no passkey yet. */
export default async function PasskeyOfferPage({ searchParams }: { searchParams: SearchParams }) {
  await requireAccess('/settings/passkey');
  const params = await searchParams;
  const raw = Array.isArray(params.next) ? params.next[0] : params.next;
  const next = safeNextPath(raw, '/dashboard');

  const listing = await listPasskeys(await createClient());
  if (!listing.available || listing.passkeys.length > 0) redirect(next);

  return (
    <div className="max-w-2xl">
      <PageTitle title="Log in faster next time">
        Use Face ID, Touch ID or your fingerprint instead of waiting for an emailed code.
      </PageTitle>
      <ul className="mb-8 list-disc space-y-2 pl-6">
        <li>One touch to log in on this device. No code, no password.</li>
        <li>Safer than a password: it can’t be guessed, leaked or used on a fake site.</li>
        <li>Your face or fingerprint stays on your device. Base Recruits never sees it.</li>
      </ul>
      <PasskeySetup next={next} offer />
    </div>
  );
}
