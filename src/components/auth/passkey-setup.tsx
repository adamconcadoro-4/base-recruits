'use client';

import { FingerprintPattern as Fingerprint } from 'lucide-react';
import { useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Notice } from '@/components/ui/notice';
import { finishPasskeySetupAction, skipPasskeySetupAction, startPasskeySetupAction } from '@/lib/auth/passkey-actions';
import { createPasskeyCredential, passkeysSupported } from '@/lib/auth/webauthn-browser';

interface PasskeySetupProps {
  /** Where to go once set up (or skipped). */
  readonly next: string;
  /** The offer right after signing in shows "Not now"; Settings doesn't. */
  readonly offer?: boolean;
  readonly label?: string;
}

/** Saves a passkey for this account on this device (Face ID, Touch ID, fingerprint or device PIN). */
export function PasskeySetup({ next, offer = false, label = 'Set up Face ID or fingerprint' }: PasskeySetupProps) {
  const [supported, setSupported] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => setSupported(passkeysSupported()), []);

  async function setUp() {
    setBusy(true);
    setMessage(null);
    try {
      const start = await startPasskeySetupAction();
      if (!start.ok) return setMessage(start.message);
      const ceremony = await createPasskeyCredential(start.options);
      if (!ceremony.ok) return setMessage(ceremony.message);
      const finish = await finishPasskeySetupAction(start.challengeId, ceremony.credential, next);
      if (!finish.ok) return setMessage(finish.message);
      window.location.assign(finish.redirectTo);
    } catch {
      setMessage('Something went wrong. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  async function skip() {
    setBusy(true);
    const result = await skipPasskeySetupAction(next);
    window.location.assign(result.ok ? result.redirectTo : '/dashboard');
  }

  if (supported === false) {
    return (
      <div className="space-y-4">
        <Notice tone="info">
          This browser can’t save a passkey. You can keep logging in with an emailed code, or set up Face ID or
          fingerprint sign-in later from a phone or computer that supports it.
        </Notice>
        {offer ? (
          <Button variant="secondary" onClick={skip} disabled={busy}>
            Continue
          </Button>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3">
        <Button onClick={setUp} disabled={busy || supported === null} aria-disabled={busy || supported === null}>
          <Fingerprint aria-hidden="true" className="size-5" />
          {busy ? 'Waiting for your device…' : label}
        </Button>
        {offer ? (
          <Button variant="secondary" onClick={skip} disabled={busy}>
            Not now
          </Button>
        ) : null}
      </div>
      {message ? (
        <Notice tone="error" live>
          {message}
        </Notice>
      ) : null}
    </div>
  );
}
