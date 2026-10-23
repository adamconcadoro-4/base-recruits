import type { MetadataRoute } from 'next';

import { PRIVATE_PREFIXES, indexingAllowed } from '@/lib/seo/indexing';
import { siteUrl } from '@/lib/supabase/env';

export default function robots(): MetadataRoute.Robots {
  if (!indexingAllowed()) {
    return { rules: { userAgent: '*', disallow: '/' } };
  }
  return {
    rules: { userAgent: '*', allow: '/', disallow: [...PRIVATE_PREFIXES] },
    sitemap: `${siteUrl()}/sitemap.xml`,
  };
}
