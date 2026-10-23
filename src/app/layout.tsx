import type { Metadata, Viewport } from 'next';
import { Archivo } from 'next/font/google';
import type { ReactNode } from 'react';

import { indexingAllowed } from '@/lib/seo/indexing';

import './globals.css';

const archivo = Archivo({
  subsets: ['latin'],
  axes: ['wdth'],
  display: 'swap',
  variable: '--font-archivo',
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'),
  title: {
    default: 'Base Recruits: Where Academics Meet Opportunity',
    template: '%s | Base Recruits',
  },
  description:
    'Free college baseball program search and score comparison for student-athletes and families, with coach verification for college coaches.',
  // Off until launch sign-off; see src/lib/seo/indexing.ts.
  ...(indexingAllowed() ? {} : { robots: { index: false, follow: false } }),
};

export const viewport: Viewport = {
  themeColor: '#071426',
};

export default function RootLayout({ children }: { readonly children: ReactNode }) {
  return (
    <html lang="en" className={archivo.variable}>
      <body className="min-h-dvh bg-white font-sans text-graphite antialiased">
        <a href="#main" className="skip-link">
          Skip to main content
        </a>
        {children}
      </body>
    </html>
  );
}
