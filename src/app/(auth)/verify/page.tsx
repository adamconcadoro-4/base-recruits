import type { Metadata } from 'next';
import Link from 'next/link';

import { VerifyForm } from '@/app/(auth)/verify/verify-form';
import { readPendingVerification } from '@/lib/auth/pending-verification';

export const metadata: Metadata = { title: 'Enter your code' };

export default async function VerifyPage() {
  const pending = await readPendingVerification();

  if (!pending) {
    return (
      <div className="border-t-8 border-royal bg-white p-6 sm:p-8">
        <h1 className="text-5xl text-navy">Start again</h1>
        <p className="mt-4 text-lg">This code request has expired or was opened in a different browser.</p>
        <p className="mt-4">
          <Link href="/signup" className="font-semibold text-royal-ink underline">
            Create an account
          </Link>{' '}
          or{' '}
          <Link href="/reset" className="font-semibold text-royal-ink underline">
            reset your password
          </Link>
          .
        </p>
      </div>
    );
  }

  return (
    <div className="border-t-8 border-royal bg-white p-6 sm:p-8">
      <h1 className="text-5xl text-navy">Check your email</h1>
      <p className="mt-4 text-lg">
        If <span className="font-semibold break-all">{pending.email}</span> can receive email, we sent it a 6-digit code.
        Enter it here{pending.purpose === 'signup' ? ' and choose a password to finish creating your account' : ' with your new password'}.
      </p>
      <VerifyForm purpose={pending.purpose} />
    </div>
  );
}
