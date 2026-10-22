import Link from 'next/link';

import { cn } from '@/lib/utils/cn';

/** Original mark: a home plate carrying a BR monogram. */
export function HomePlateMark({ className }: { readonly className?: string }) {
  return (
    <svg viewBox="0 0 40 44" aria-hidden="true" className={cn('h-9 w-8', className)}>
      <path d="M2 2h36v22L20 42 2 24z" fill="currentColor" />
      <path d="M2 2h36v22L20 42 2 24z" fill="none" stroke="#176BFF" strokeWidth="3" strokeLinejoin="round" />
      <text
        x="20"
        y="23"
        textAnchor="middle"
        fontSize="15"
        fontWeight="800"
        fill="#071426"
        style={{ fontVariationSettings: "'wdth' 72" }}
      >
        BR
      </text>
    </svg>
  );
}

export function Logo({ tone = 'light' }: { readonly tone?: 'light' | 'dark' }) {
  return (
    <Link
      href="/"
      className={cn('flex items-center gap-2.5 no-underline', tone === 'light' ? 'text-white' : 'text-navy')}
    >
      <HomePlateMark className={tone === 'light' ? 'text-white' : 'text-ice'} />
      <span className="display text-2xl leading-none tracking-tight">Base Recruits</span>
    </Link>
  );
}
