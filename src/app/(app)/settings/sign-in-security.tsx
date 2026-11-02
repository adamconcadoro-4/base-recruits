import Link from 'next/link';

import { ActionButtonForm } from '@/components/app/action-button-form';
import { PasskeySetup } from '@/components/auth/passkey-setup';
import { formatDateTime } from '@/components/assessment/result-format';
import { Notice } from '@/components/ui/notice';
import { removePasskeyAction } from '@/lib/auth/passkey-actions';
import type { PasskeyListing } from '@/lib/auth/passkeys';

/** Settings → Sign-in and security: passkeys on this account, and the password option. */
export function SignInSecurity({ listing, isAdmin }: { readonly listing: PasskeyListing; readonly isAdmin: boolean }) {
  const { passkeys } = listing;
  return (
    <div className="max-w-2xl space-y-6">
      <p>
        Log in with one touch using Face ID, Touch ID, a fingerprint or your device PIN. Your face or fingerprint never
        leaves your device; Base Recruits only stores a passkey that can’t be used anywhere else. An emailed code always
        works as a backup.
      </p>
      {!listing.available ? (
        <Notice tone="attention">Face ID and fingerprint sign-in isn’t available right now. An emailed code still works.</Notice>
      ) : (
        <>
          {passkeys.length > 0 ? (
            <ul className="divide-y-2 divide-rule border-y-2 border-rule">
              {passkeys.map((passkey) => (
                <li key={passkey.id} className="flex flex-wrap items-start justify-between gap-4 py-4">
                  <div>
                    <p className="font-semibold">{passkey.name}</p>
                    <p className="text-sm text-slate">
                      Added {formatDateTime(passkey.createdAt)}
                      {passkey.lastUsedAt ? ` · Last used ${formatDateTime(passkey.lastUsedAt)}` : ' · Not used yet'}
                    </p>
                  </div>
                  <ActionButtonForm
                    action={removePasskeyAction}
                    fields={{ passkeyId: passkey.id }}
                    label="Remove"
                    pendingLabel="Removing…"
                    variant="danger"
                    size="sm"
                  />
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-slate">No passkeys yet.</p>
          )}
          <PasskeySetup
            next="/settings#sign-in"
            label={passkeys.length > 0 ? 'Add Face ID or fingerprint on another device' : 'Set up Face ID or fingerprint'}
          />
        </>
      )}
      {isAdmin ? (
        <p className="text-sm text-slate">
          Admin pages ask you to confirm with Face ID or fingerprint every 12 hours, so set up a passkey on each device you use
          for admin work.
        </p>
      ) : null}
      <p>
        Prefer a password too?{' '}
        <Link href="/reset" className="font-semibold text-royal-ink underline">
          Set or change your password with an emailed code
        </Link>
        .
      </p>
    </div>
  );
}
