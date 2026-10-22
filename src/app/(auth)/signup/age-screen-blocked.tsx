import Link from 'next/link';

/** Shown after an under-13 answer. Plain, with no hint to try another date. */
export function AgeScreenBlocked() {
  return (
    <div role="status" className="mt-6 space-y-4">
      <p className="text-lg">Base Recruits accounts are for people 13 and older.</p>
      <p>
        You can still search schools and explore academic matches without an account.{' '}
        <Link href="/schools" className="font-semibold text-royal-ink underline">
          Go to the school explorer
        </Link>
      </p>
    </div>
  );
}
