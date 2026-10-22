import type { Metadata } from 'next';
import Link from 'next/link';

import { LoginForm } from '@/app/(auth)/login/login-form';
import { safeNextPath } from '@/lib/auth/route-access';

export const metadata: Metadata = { title: 'Log in' };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function LoginPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const next = safeNextPath(first(params.next), '/dashboard');

  return (
    <div className="border-t-8 border-royal bg-white p-6 sm:p-8">
      <h1 className="text-5xl text-navy">Log in</h1>
      <p className="mt-3 text-slate">
        New to Base Recruits?{' '}
        <Link href="/signup" className="font-semibold text-royal-ink underline">
          Create a free account
        </Link>
      </p>
      <LoginForm next={next} />
      <p className="mt-6">
        <Link href="/reset" className="font-semibold text-royal-ink underline">
          Forgot your password?
        </Link>
      </p>
    </div>
  );
}
