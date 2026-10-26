import type { NextConfig } from 'next';

const isDevelopment = process.env.NODE_ENV !== 'production';
const isProduction = process.env.NEXT_PUBLIC_APP_ENV === 'production';

// Assessment video: clips are uploaded straight from the browser to Supabase
// Storage with a short-lived signed upload link (Vercel functions cannot take
// files this large) and played back from short-lived signed links. Only while
// Assessment is switched on for the site does the browser contact that one
// origin; storage policies decide who may create or read each file.
const assessmentEnabled = process.env.NEXT_PUBLIC_ASSESSMENT_ENABLED === 'true';
const supabaseOrigin = (() => {
  try {
    return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').origin;
  } catch {
    return null;
  }
})();
const storageSource = assessmentEnabled && supabaseOrigin ? ` ${supabaseOrigin}` : '';

// Server actions post to this origin and every other Supabase call runs on the
// server, so otherwise the browser only ever talks to this origin.
// Known gap: script-src allows inline scripts (Next.js bootstrapping). Moving to
// a per-request nonce is tracked in docs/reports/stage-1.md.
const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDevelopment ? " 'unsafe-eval'" : ''}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  `connect-src 'self'${storageSource}`,
  `media-src 'self'${assessmentEnabled ? ' blob:' : ''}${storageSource}`,
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join('; ');

const securityHeaders = [
  { key: 'Content-Security-Policy', value: contentSecurityPolicy },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
  ...(isProduction ? [{ key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' }] : []),
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Registry snapshots are read from disk by the admin import page's server action.
  outputFileTracingIncludes: { '/admin/data': ['./data/snapshots/*.json'] },
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

export default nextConfig;
