import type { Metadata } from 'next';
import Link from 'next/link';

import { LoginCodeForm } from '@/app/(auth)/login/code/login-code-form';
import { safeNextPath } from '@/lib/auth/route-access';

export const metadata: Metadata = { title: 'Log in with a code', alternates: { canonical: '/login/code' } };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function LoginCodePage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const next = safeNextPath(first(params.next), '/dashboard');
  const passwordHref = next === '/dashboard' ? '/login' : `/login?next=${encodeURIComponent(next)}`;

  return (
    <div className="border-t-8 border-royal bg-white p-6 sm:p-8">
      <h1 className="text-5xl text-navy">Log in with a code</h1>
      <p className="mt-3 text-lg">We&apos;ll email you a 6-digit code. Enter it on the next page and you&apos;re in, no password needed.</p>
      <LoginCodeForm next={next} />
      <p className="mt-6">
        <Link href={passwordHref} className="font-semibold text-royal-ink underline">
          Log in with your password instead
        </Link>
      </p>
    </div>
  );
}
