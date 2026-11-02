'use client';

import { FingerprintPattern as Fingerprint } from 'lucide-react';
import { useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Notice } from '@/components/ui/notice';
import { finishPasskeySignInAction, startPasskeySignInAction } from '@/lib/auth/passkey-actions';
import { getPasskeyCredential, passkeysSupported } from '@/lib/auth/webauthn-browser';

interface PasskeySignInButtonProps {
  /** Where to go after signing in (a same-site path; checked again on the server). Leave out to stay on this page. */
  readonly next?: string;
  readonly label?: string;
  readonly className?: string;
}

/**
 * "Sign in with Face ID or fingerprint": the device shows its own passkey
 * picker, so no email or password is typed. Hidden on browsers without passkeys.
 */
export function PasskeySignInButton({ next, label = 'Log in with Face ID or fingerprint', className }: PasskeySignInButtonProps) {
  const [supported, setSupported] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => setSupported(passkeysSupported()), []);

  if (supported === false) return null;

  async function signIn() {
    setBusy(true);
    setMessage(null);
    try {
      const start = await startPasskeySignInAction();
      if (!start.ok) return setMessage(start.message);
      const ceremony = await getPasskeyCredential(start.options);
      if (!ceremony.ok) return setMessage(ceremony.message);
      const destination = next ?? `${window.location.pathname}${window.location.search}`;
      const finish = await finishPasskeySignInAction(start.challengeId, ceremony.credential, destination);
      if (!finish.ok) return setMessage(finish.message);
      // A full page load, so every part of the page sees the new session.
      window.location.assign(finish.redirectTo);
    } catch {
      setMessage('Something went wrong. Please try again, or use an emailed code.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={className}>
      <Button onClick={signIn} disabled={busy || supported === null} aria-disabled={busy || supported === null} className="w-full sm:w-auto">
        <Fingerprint aria-hidden="true" className="size-5" />
        {busy ? 'Waiting for your device…' : label}
      </Button>
      {message ? (
        <Notice tone="error" live className="mt-4">
          {message}
        </Notice>
      ) : null}
    </div>
  );
}
