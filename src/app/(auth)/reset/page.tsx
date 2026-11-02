import type { Metadata } from 'next';

import { ResetForm } from '@/app/(auth)/reset/reset-form';

export const metadata: Metadata = { title: 'Set or reset your password', robots: { index: false, follow: false } };

export default function ResetPage() {
  return (
    <div className="border-t-8 border-royal bg-white p-6 sm:p-8">
      <h1 className="text-5xl text-navy">Set or reset your password</h1>
      <p className="mt-4 text-lg">Enter your account email. We&apos;ll send a 6-digit code so you can choose a password. You don&apos;t need one if you log in with Face ID, fingerprint or an emailed code.</p>
      <ResetForm />
    </div>
  );
}
