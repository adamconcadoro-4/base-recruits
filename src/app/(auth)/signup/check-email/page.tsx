import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = { title: 'Check your email' };

export default function CheckEmailPage() {
  return (
    <div className="border-t-8 border-royal bg-white p-6 sm:p-8">
      <h1 className="text-5xl text-navy">Check your email</h1>
      <p className="mt-4 text-lg">
        We sent a confirmation link to the address you entered. Open it on this device to finish creating your account.
      </p>
      <p className="mt-4 text-slate">
        Nothing there after a few minutes? Check your spam folder. If you already have an account with that address,{' '}
        <Link href="/login" className="font-semibold text-royal-ink underline">
          log in
        </Link>{' '}
        instead.
      </p>
    </div>
  );
}
