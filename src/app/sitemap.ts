import { createClient } from '@supabase/supabase-js';
import type { MetadataRoute } from 'next';

import { parseExplorerParams, toSearchArgs } from '@/lib/registry/search-params';
import { SITEMAP_PAGES, indexingAllowed } from '@/lib/seo/indexing';
import { siteUrl, supabaseConfigured, supabasePublishableKey, supabaseUrl } from '@/lib/supabase/env';

/** Rebuilt at most once a day. */
export const revalidate = 86400;

const PAGE = 100;
const MAX_PAGES = 60;

/** Every listed school, read anonymously (the same rows any visitor can see). */
async function schoolSlugs(): Promise<string[]> {
  if (!supabaseConfigured()) return [];
  const supabase = createClient(supabaseUrl(), supabasePublishableKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const slugs: string[] = [];
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const args = toSearchArgs(parseExplorerParams({ page: String(page + 1) }), PAGE);
    const { data, error } = await supabase.rpc('search_schools', args);
    if (error) return slugs;
    const rows = (data ?? []) as { slug: string }[];
    for (const row of rows) slugs.push(row.slug);
    if (rows.length < PAGE) break;
  }
  return slugs;
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  if (!indexingAllowed()) return [];
  const base = siteUrl();
  const pages: MetadataRoute.Sitemap = SITEMAP_PAGES.map((path) => ({ url: `${base}${path === '/' ? '' : path}` }));
  const schools = (await schoolSlugs()).map((slug) => ({ url: `${base}/schools/${slug}` }));
  return [...pages, ...schools];
}
