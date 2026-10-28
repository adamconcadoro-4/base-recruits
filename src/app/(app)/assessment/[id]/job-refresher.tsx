'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

const EVERY_MS = 5000;
const STOP_AFTER_MS = 15 * 60 * 1000;

/** Refreshes the page while an analysis is under way, so each step shows as it happens. */
export function JobRefresher() {
  const router = useRouter();
  useEffect(() => {
    const started = Date.now();
    const timer = window.setInterval(() => {
      if (Date.now() - started > STOP_AFTER_MS) window.clearInterval(timer);
      else if (document.visibilityState === 'visible') router.refresh();
    }, EVERY_MS);
    return () => window.clearInterval(timer);
  }, [router]);
  return null;
}
