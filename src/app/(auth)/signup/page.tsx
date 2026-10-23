import type { Metadata } from 'next';
import Link from 'next/link';

import { AgeScreenBlocked } from '@/app/(auth)/signup/age-screen-blocked';
import { SignupForm } from '@/app/(auth)/signup/signup-form';
import { isAgeGateBlocked } from '@/lib/auth/age-gate';

export const metadata: Metadata = { title: 'Create a free account', alternates: { canonical: '/signup' } };

export default async function SignupPage() {
  const blocked = await isAgeGateBlocked();
  return (
    <div className="border-t-8 border-royal bg-white p-6 sm:p-8">
      <h1 className="text-5xl text-navy">Create a free account</h1>
      {blocked ? (
        <AgeScreenBlocked />
      ) : (
        <>
          <p className="mt-3 text-slate">
            Already have an account?{' '}
            <Link href="/login" className="font-semibold text-royal-ink underline">
              Log in
            </Link>
          </p>
          <SignupForm />
        </>
      )}
    </div>
  );
}
