'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

import { mergeGuestSaves } from '@/app/(site)/saved/actions';
import { Notice } from '@/components/ui/notice';
import { clearGuestSaves, getGuestSaves } from '@/lib/shortlist/guest-store';

/**
 * Shown on signed-in pages: moves any schools saved in this browser before
 * signing in into the account, once, and says so. Idempotent on the server;
 * the browser list is cleared only for schools the server confirmed.
 */
export function GuestSavesMerger() {
  const router = useRouter();
  const [state, setState] = useState<{ kind: 'idle' } | { kind: 'done'; added: number } | { kind: 'failed' }>({ kind: 'idle' });
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const local = getGuestSaves();
    if (!local.available || local.slugs.length === 0) return;
    void mergeGuestSaves([...local.slugs]).then((result) => {
      if (result.status === 'merged') {
        clearGuestSaves(result.moved);
        setState({ kind: 'done', added: result.added });
        // Re-render server lists (the saved page) with the merged schools.
        if (result.added > 0) router.refresh();
      } else if (result.status === 'failed') {
        setState({ kind: 'failed' });
      }
    }).catch(() => setState({ kind: 'failed' }));
  }, [router]);

  if (state.kind === 'done' && state.added > 0) {
    return (
      <Notice tone="success" live title={`Moved ${state.added} ${state.added === 1 ? 'school' : 'schools'} from this browser into your account`}>
        <Link href="/saved" className="font-semibold text-royal-ink underline">
          See your saved schools
        </Link>
      </Notice>
    );
  }
  if (state.kind === 'failed') {
    return (
      <Notice tone="attention" live title="Schools saved in this browser weren’t moved to your account yet">
        They are still saved in this browser. We&apos;ll try again next time you open a page while signed in.
      </Notice>
    );
  }
  return null;
}
