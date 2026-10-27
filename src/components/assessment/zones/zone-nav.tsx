'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';

import { cn } from '@/lib/utils/cn';

const VIEWS = [
  { href: '/assessment/hitting/zones', label: 'Zone Map', exact: true },
  { href: '/assessment/hitting/zones/drills', label: 'Drill Library' },
  { href: '/assessment/hitting/zones/sessions', label: 'Sessions' },
  { href: '/assessment/hitting/zones/path', label: 'Development Path' },
] as const;

/** Views inside 9-Zone Hitting. Keeps the chosen athlete (?athlete=). */
export function ZoneNav() {
  const pathname = usePathname();
  const athlete = useSearchParams().get('athlete');
  return (
    <nav aria-label="9-Zone Hitting views" className="print:hidden">
      <ul className="flex flex-wrap gap-2">
        {VIEWS.map((view) => {
          const active = 'exact' in view ? pathname === view.href : pathname.startsWith(view.href);
          const href = athlete ? `${view.href}?athlete=${encodeURIComponent(athlete)}` : view.href;
          return (
            <li key={view.href}>
              <Link
                href={href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'inline-flex min-h-11 items-center rounded-full border-2 px-4 font-semibold no-underline',
                  active ? 'border-navy bg-navy text-white' : 'border-rule bg-white text-navy hover:border-navy',
                )}
              >
                {view.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
