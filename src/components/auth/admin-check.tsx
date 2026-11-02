import { ButtonLink } from '@/components/ui/button';
import { PasskeySignInButton } from '@/components/auth/passkey-sign-in-button';
import { Notice } from '@/components/ui/notice';

/**
 * Shown on admin pages when this session hasn't confirmed with a passkey in the
 * last 12 hours. The database refuses administrator actions until it has
 * (private.admin_session_verified), so this page is the way through, not the lock.
 */
export function AdminCheck({ hasPasskey, passkeysAvailable }: { readonly hasPasskey: boolean; readonly passkeysAvailable: boolean }) {
  return (
    <div className="max-w-2xl">
      <h1 className="text-5xl text-navy sm:text-6xl">Confirm it’s you</h1>
      <p className="mt-4 text-lg text-slate">
        Admin pages can see players’ information, so they ask for Face ID, Touch ID or your fingerprint every 12 hours.
      </p>
      <div className="mt-8 space-y-4">
        {!passkeysAvailable ? (
          <Notice tone="attention" title="Passkeys aren’t switched on yet">
            Face ID and fingerprint sign-in has to be switched on in Supabase before admin pages can open. See the
            “Passkeys” steps in docs/deployment.md.
          </Notice>
        ) : hasPasskey ? (
          <PasskeySignInButton label="Confirm with Face ID or fingerprint" />
        ) : (
          <>
            <Notice tone="info" title="Set up Face ID or fingerprint first">
              Your account doesn’t have a passkey yet. Add one in Settings (within 15 minutes of logging in), then come back
              here.
            </Notice>
            <ButtonLink href="/settings#sign-in">Go to Settings</ButtonLink>
          </>
        )}
      </div>
    </div>
  );
}
