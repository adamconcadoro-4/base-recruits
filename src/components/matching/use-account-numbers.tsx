'use client';

import Link from 'next/link';
import { useState } from 'react';

import { deleteMyNumbersAction, saveMyNumbersAction } from '@/app/(site)/my-schools/actions';
import { Notice } from '@/components/ui/notice';
import type { AccountNumbers } from '@/lib/matching/account-numbers';
import { readPlayerNumbers, savePlayerNumbers, type PlayerNumbers } from '@/lib/matching/player-store';

/**
 * The numbers to start from: the ones saved to the account when there are any
 * (copied to this device so other pages match), otherwise this device's.
 */
export function initialNumbers(account: AccountNumbers | null): PlayerNumbers | null {
  if (account?.saved) {
    savePlayerNumbers(account.saved);
    return account.saved;
  }
  return readPlayerNumbers();
}

type Note = { readonly tone: 'success' | 'error'; readonly text: string; readonly shareLink: boolean };

/**
 * Saving to the account (decision F63): only for signed-in athletes, only when
 * they tick "Save to my account". Unticking it, or "Forget my numbers",
 * removes them from the account.
 */
export function useAccountNumbers(account: AccountNumbers | null) {
  const [onAccount, setOnAccount] = useState(account?.saved != null);
  const [note, setNote] = useState<Note | null>(null);

  async function persist(candidate: PlayerNumbers, toAccount: boolean) {
    if (!account) return;
    if (toAccount) {
      const result = await saveMyNumbersAction(candidate);
      if (result.ok) {
        setOnAccount(true);
        setNote({ tone: 'success', text: 'Saved to your account.', shareLink: true });
      } else {
        setNote({ tone: 'error', text: `Not saved to your account. ${result.message}`, shareLink: false });
      }
    } else if (onAccount) {
      await remove('Removed from your account. They are still remembered on this device.');
    } else {
      setNote(null);
    }
  }

  async function remove(done: string) {
    const result = await deleteMyNumbersAction();
    if (result.ok) {
      setOnAccount(false);
      setNote({ tone: 'success', text: done, shareLink: false });
    } else {
      setNote({ tone: 'error', text: result.message, shareLink: false });
    }
  }

  async function forget() {
    if (account && onAccount) await remove('Forgotten on this device and removed from your account.');
    else setNote(null);
  }

  return { canSave: account !== null, onAccount, note, persist, forget };
}

export function AccountNumbersNote({ note }: { readonly note: Note | null }) {
  if (!note) return null;
  return (
    <Notice tone={note.tone} live>
      {note.text}
      {note.shareLink ? (
        <>
          {' '}
          To let a parent or guardian see them, go to{' '}
          <Link href="/athlete#numbers-sharing" className="font-semibold text-royal-ink underline">
            your athlete home
          </Link>
          . Coaches can&apos;t see them.
        </>
      ) : null}
    </Notice>
  );
}
