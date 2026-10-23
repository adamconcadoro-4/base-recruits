'use client';

import { useState, useSyncExternalStore, useTransition } from 'react';

import { setAccountSaved } from '@/app/(site)/saved/actions';
import { getGuestSaves, getServerGuestSaves, setGuestSaved, subscribeGuestSaves } from '@/lib/shortlist/guest-store';

/**
 * Save a school to the shortlist. Separate from "Add to compare": saving has
 * no limit, and comparing never changes what is saved.
 *
 * Signed out, the school is kept in this browser; signed in, in the account.
 * The button names the school for screen readers, and a polite status line
 * announces each change.
 */
export function SaveButton({
  slug,
  name,
  mode,
  initiallySaved = false,
}: {
  readonly slug: string;
  readonly name: string;
  readonly mode: 'guest' | 'account';
  /** Account mode only: whether the school is already saved. */
  readonly initiallySaved?: boolean;
}) {
  const guest = useSyncExternalStore(subscribeGuestSaves, getGuestSaves, getServerGuestSaves);
  const [accountSaved, setAccountSavedState] = useState(initiallySaved);
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const saved = mode === 'guest' ? guest.slugs.includes(slug) : accountSaved;
  const unavailable = mode === 'guest' && !guest.available;

  function toggle() {
    setError('');
    const next = !saved;
    if (mode === 'guest') {
      if (!setGuestSaved(slug, next)) {
        setError('This browser isn’t letting us save. Private browsing or blocked site storage can cause this. A free account keeps your list instead.');
        return;
      }
      setMessage(next ? `Saved ${name} in this browser.` : `Removed ${name} from your saved schools.`);
      return;
    }
    startTransition(async () => {
      const result = await setAccountSaved(slug, next);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setAccountSavedState(result.saved);
      setMessage(result.saved ? `Saved ${name} to your account.` : `Removed ${name} from your saved schools.`);
    });
  }

  const visible = saved ? 'Remove from saved' : 'Save school';
  return (
    <span className="inline-flex flex-col">
      <button
        type="button"
        onClick={toggle}
        disabled={pending || unavailable}
        aria-label={`${visible}: ${name}`}
        className="min-h-6 text-left font-semibold text-royal-ink underline disabled:cursor-not-allowed disabled:text-slate disabled:no-underline"
      >
        {visible}
      </button>
      {unavailable ? <span className="text-sm text-slate">Saving isn’t available in this browser.</span> : null}
      <span role="status" className="sr-only">
        {message}
      </span>
      {error ? (
        <span role="alert" className="text-sm text-danger">
          {error}
        </span>
      ) : null}
    </span>
  );
}
