import Link from 'next/link';

import { Logo } from '@/components/site/logo';
import { MobileNav } from '@/components/site/mobile-nav';
import { primaryNav } from '@/components/site/navigation';

export function SiteHeader() {
  const items = primaryNav();
  return (
    <header className="on-navy relative bg-navy print:hidden">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-6 px-4 py-3 sm:px-6">
        <Logo />
        <nav aria-label="Main" className="hidden items-center gap-1 lg:flex">
          {items.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-md px-3 py-2 font-semibold text-white no-underline hover:bg-white/10"
            >
              {item.label}
            </Link>
          ))}
          <Link href="/login" className="ml-1 rounded-md border-2 border-white/60 px-3 py-1.5 font-semibold text-white no-underline hover:bg-white/10">
            Log in
          </Link>
        </nav>
        <MobileNav items={items} />
      </div>
    </header>
  );
}
