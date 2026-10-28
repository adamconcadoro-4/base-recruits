'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';

import { cn } from '@/lib/utils/cn';

const SECTIONS = [
  { href: '/assessment', label: 'Overview', exact: true },
  { href: '/assessment/hitting', label: 'Hitting' },
  { href: '/assessment/pitching', label: 'Pitching' },
  { href: '/assessment/film', label: 'Film Room' },
  { href: '/assessment/training', label: 'Training Plan' },
  { href: '/assessment/home-practice', label: 'Home Practice' },
  { href: '/assessment/progress', label: 'Progress' },
  { href: '/assessment/coaches', label: 'Connections' },
] as const;

/** Section navigation for Assessment. Keeps the chosen athlete (?athlete=) across sections. */
export function AssessmentNav() {
  const pathname = usePathname();
  const params = useSearchParams();
  const athlete = params.get('athlete');
  return (
    <nav aria-label="Assessment sections" className="overflow-x-auto border-b-2 border-rule">
      <ul className="flex min-w-max gap-1">
        {SECTIONS.map((section) => {
          const active = 'exact' in section ? pathname === section.href : pathname.startsWith(section.href);
          const href = athlete && section.href !== '/assessment/coaches' ? `${section.href}?athlete=${encodeURIComponent(athlete)}` : section.href;
          return (
            <li key={section.href}>
              <Link
                href={href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  '-mb-0.5 inline-flex min-h-11 items-center border-b-4 px-3 font-semibold no-underline',
                  active ? 'border-royal-ink text-navy' : 'border-transparent text-slate hover:text-navy',
                )}
              >
                {section.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
