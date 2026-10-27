'use client';

import Link from 'next/link';
import { useEffect, useState, useSyncExternalStore } from 'react';

import { lookupSchools } from '@/app/(site)/saved/actions';
import { CompareToggle } from '@/components/registry/compare-toggle';
import { SchoolCard } from '@/components/registry/school-card';
import { SaveButton } from '@/components/shortlist/save-button';
import { Notice } from '@/components/ui/notice';
import type { SchoolSummary } from '@/lib/registry/types';
import { clearGuestSaves, getGuestSaves, getServerGuestSaves, subscribeGuestSaves } from '@/lib/shortlist/guest-store';

/**
 * The browser's saved schools, looked up fresh from the registry.
 * `compareSelection` comes from the server (the comparison cookie), so it is
 * current again after each add or remove.
 */
export function GuestSavedList({ compareSelection }: { readonly compareSelection: readonly string[] }) {
  const local = useSyncExternalStore(subscribeGuestSaves, getGuestSaves, getServerGuestSaves);
  const [hydrated, setHydrated] = useState(false);
  const [schools, setSchools] = useState<readonly SchoolSummary[] | 'failed' | null>(null);
  const [confirming, setConfirming] = useState(false);
  const key = local.slugs.join(',');

  useEffect(() => setHydrated(true), []);

  useEffect(() => {
    if (!hydrated) return;
    if (local.slugs.length === 0) {
      setSchools([]);
      return;
    }
    let cancelled = false;
    lookupSchools([...local.slugs])
      .then((result) => {
        if (!cancelled) setSchools(result);
      })
      .catch(() => {
        if (!cancelled) setSchools('failed');
      });
    return () => {
      cancelled = true;
    };
    // `key` captures the list's contents.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, hydrated]);

  if (!hydrated) {
    return (
      <noscript>
        <Notice tone="attention" title="Saving in this browser needs JavaScript">
          Turn on JavaScript, or create a free account, to save schools.
        </Notice>
      </noscript>
    );
  }
  if (!local.available) {
    return (
      <Notice tone="attention" title="This browser isn't letting us save schools">
        Private browsing or blocked site storage can cause this. A free account keeps your list instead.
      </Notice>
    );
  }
  if (local.slugs.length === 0) {
    return (
      <Notice tone="info" title="No saved schools yet">
        Use <strong>Save school</strong> on any school in the{' '}
        <Link href="/schools" className="font-semibold text-royal-ink underline">
          school search
        </Link>
        .
      </Notice>
    );
  }
  if (schools === null) return <p role="status">Loading your {local.slugs.length} saved schools…</p>;
  if (schools === 'failed') {
    return (
      <Notice tone="error" title="Your saved schools didn't load">
        They are still saved in this browser. Refresh the page to try again.
      </Notice>
    );
  }

  const missing = local.slugs.length - schools.length;
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <p role="status" className="text-lg">
          {local.slugs.length} saved {local.slugs.length === 1 ? 'school' : 'schools'} in this browser
        </p>
        {confirming ? (
          <span className="flex flex-wrap items-center gap-3">
            <span>Remove all {local.slugs.length} from this browser?</span>
            <button
              type="button"
              className="font-semibold text-danger underline"
              onClick={() => {
                clearGuestSaves();
                setConfirming(false);
              }}
            >
              Yes, clear the list
            </button>
            <button type="button" className="font-semibold text-royal-ink underline" onClick={() => setConfirming(false)}>
              Keep it
            </button>
          </span>
        ) : (
          <button type="button" className="font-semibold text-royal-ink underline" onClick={() => setConfirming(true)}>
            Clear this browser&apos;s list
          </button>
        )}
      </div>
      {missing > 0 ? (
        <Notice tone="attention">
          {missing === 1 ? 'One saved school is' : `${missing} saved schools are`} no longer listed on Base Recruits, so{' '}
          {missing === 1 ? 'it isn’t' : 'they aren’t'} shown.
        </Notice>
      ) : null}
      <ul className="space-y-5">
        {schools.map((school) => (
          <li key={school.slug}>
            <SchoolCard
              school={school}
              actions={
                <>
                  <SaveButton slug={school.slug} name={school.name} mode="guest" />
                  <CompareToggle slug={school.slug} name={school.name} selected={compareSelection} back="/saved" />
                </>
              }
            />
          </li>
        ))}
      </ul>
    </div>
  );
}
