import { formatRetrieved } from '@/lib/registry/labels';
import type { SourceRef } from '@/lib/registry/types';

import { ExternalLink } from './values';

/** Distinct sources behind a page, with the dataset and when it was retrieved. */
export function SourceList({ sources }: { readonly sources: readonly (SourceRef | null | undefined)[] }) {
  const seen = new Map<string, SourceRef>();
  for (const source of sources) {
    if (source && !seen.has(`${source.id}|${source.dataset}`)) seen.set(`${source.id}|${source.dataset}`, source);
  }
  return (
    <ul className="space-y-3">
      {[...seen.values()].map((source) => (
        <li key={`${source.id}|${source.dataset}`}>
          <p className="font-semibold">{source.attribution}</p>
          <p className="text-sm text-slate">
            {source.dataset}, retrieved {formatRetrieved(source.retrieved_at)}
            {source.homepage_url ? (
              <>
                {' · '}
                <ExternalLink href={source.homepage_url}>{source.name}</ExternalLink>
              </>
            ) : null}
          </p>
        </li>
      ))}
    </ul>
  );
}
