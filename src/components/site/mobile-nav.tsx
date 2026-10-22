'use client';

import { Menu, X } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

import type { NavItem } from '@/components/site/navigation';

export function MobileNav({ items }: { readonly items: readonly NavItem[] }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <div className="lg:hidden">
      <button
        type="button"
        aria-expanded={open}
        aria-controls="mobile-menu"
        onClick={() => setOpen((value) => !value)}
        className="inline-flex min-h-11 items-center gap-2 rounded-md px-3 py-2 font-semibold text-white hover:bg-white/10"
      >
        {open ? <X aria-hidden="true" className="size-5" /> : <Menu aria-hidden="true" className="size-5" />}
        Menu
      </button>
      <nav
        id="mobile-menu"
        aria-label="Main"
        hidden={!open}
        className="absolute inset-x-0 top-full z-40 border-t border-white/15 bg-navy px-4 pb-6 pt-2 shadow-lg"
      >
        <ul className="space-y-1">
          {items.map((item) => (
            <li key={item.href}>
              <Link
                href={item.href}
                className="block rounded-md px-3 py-3 text-lg font-semibold text-white no-underline hover:bg-white/10"
              >
                {item.label}
              </Link>
            </li>
          ))}
          <li>
            <Link
              href="/login"
              className="block rounded-md px-3 py-3 text-lg font-semibold text-white no-underline hover:bg-white/10"
            >
              Log in
            </Link>
          </li>
        </ul>
        <Link
          href="/match"
          className="mt-3 flex min-h-12 items-center justify-center rounded-md bg-royal px-5 text-lg font-semibold text-white no-underline"
        >
          Find my matches
        </Link>
      </nav>
    </div>
  );
}
