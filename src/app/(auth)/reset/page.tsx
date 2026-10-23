import type { Metadata } from 'next';

import { ResetForm } from '@/app/(auth)/reset/reset-form';

export const metadata: Metadata = { title: 'Reset your password', robots: { index: false, follow: false } };

export default function ResetPage() {
  return (
    <div className="border-t-8 border-royal bg-white p-6 sm:p-8">
      <h1 className="text-5xl text-navy">Reset your password</h1>
      <p className="mt-4 text-lg">Enter your account email. We&apos;ll send a 6-digit code so you can choose a new password.</p>
      <ResetForm />
    </div>
  );
}
