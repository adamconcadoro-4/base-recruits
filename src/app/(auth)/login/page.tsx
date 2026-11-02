import type { Metadata } from 'next';
import Link from 'next/link';

import { LoginForm } from '@/app/(auth)/login/login-form';
import { PasskeySignInButton } from '@/components/auth/passkey-sign-in-button';
import { ButtonLink } from '@/components/ui/button';
import { safeNextPath } from '@/lib/auth/route-access';

export const metadata: Metadata = { title: 'Log in', alternates: { canonical: '/login' } };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function LoginPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const next = safeNextPath(first(params.next), '/dashboard');
  const codeHref = next === '/dashboard' ? '/login/code' : `/login/code?next=${encodeURIComponent(next)}`;

  return (
    <div className="border-t-8 border-royal bg-white p-6 sm:p-8">
      <h1 className="text-5xl text-navy">Log in</h1>
      <p className="mt-3 text-slate">
        New to Base Recruits?{' '}
        <Link href="/signup" className="font-semibold text-royal-ink underline">
          Create a free account
        </Link>
      </p>
      <div className="mt-8 space-y-4">
        <PasskeySignInButton next={next} />
        <ButtonLink href={codeHref} variant="secondary" className="w-full sm:w-auto">
          Email me a sign-in code
        </ButtonLink>
        <p className="text-sm text-slate">
          Face ID or fingerprint works once you’ve set it up on this device. An emailed code always works.
        </p>
      </div>
      <div className="mt-8 border-t-2 border-rule pt-6">
        <h2 className="text-2xl text-navy">Or use your password</h2>
        <LoginForm next={next} />
        <p className="mt-6">
          <Link href="/reset" className="font-semibold text-royal-ink underline">
            Forgot your password, or want to set one?
          </Link>
        </p>
      </div>
    </div>
  );
}
