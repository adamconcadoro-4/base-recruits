import Link from 'next/link';

import { Logo } from '@/components/site/logo';
import { FOOTER_NAV } from '@/components/site/navigation';

export function SiteFooter() {
  return (
    <footer className="on-navy bg-navy text-white">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-12 sm:px-6 md:grid-cols-[1.4fr_repeat(3,1fr)]">
        <div className="space-y-4">
          <Logo />
          <p className="max-w-xs text-white/85">Where academics meet opportunity.</p>
        </div>
        {FOOTER_NAV.map((group) => (
          <nav key={group.heading} aria-label={group.heading}>
            <h2 className="text-lg text-white">{group.heading}</h2>
            <ul className="mt-3 space-y-2">
              {group.items.map((item) => (
                <li key={item.href}>
                  <Link href={item.href} className="text-white/90 underline-offset-4 hover:text-white hover:underline">
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>
      <div className="border-t border-white/15">
        <p className="mx-auto max-w-6xl px-4 py-6 text-sm text-white/80 sm:px-6">
          Base Recruits does not guarantee admission, transfer eligibility, scholarships or coach offers, and is not
          affiliated with the NCAA, NAIA, NJCAA or any college.
        </p>
      </div>
    </footer>
  );
}
