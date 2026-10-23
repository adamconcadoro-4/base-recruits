import Link from 'next/link';

import { toggleCompare } from '@/app/(site)/compare/actions';
import { MAX_COMPARE } from '@/lib/registry/search-params';

/**
 * "Add to compare" / "Remove from compare" for pages that don't carry the
 * comparison in their URL. A form post, so it works without JavaScript and is
 * never triggered by link prefetching.
 */
export function CompareToggle({
  slug,
  name,
  selected,
  back,
}: {
  readonly slug: string;
  readonly name: string;
  /** The current comparison selection. */
  readonly selected: readonly string[];
  /** Where to return after the change (a same-site path). */
  readonly back: string;
}) {
  const inCompare = selected.includes(slug);
  const full = !inCompare && selected.length >= MAX_COMPARE;
  if (full) {
    return (
      <span className="text-sm text-slate">
        Compare holds five schools.{' '}
        <Link href="/compare" className="font-semibold text-royal-ink underline">
          Remove one to add this school
        </Link>
      </span>
    );
  }
  const visible = inCompare ? 'Remove from compare' : 'Add to compare';
  return (
    <form action={toggleCompare} className="inline">
      <input type="hidden" name="school" value={slug} />
      <input type="hidden" name="back" value={back} />
      <button type="submit" aria-label={`${visible}: ${name}`} className="text-left font-semibold text-royal-ink underline">
        {visible}
      </button>
      {inCompare ? (
        <>
          {' '}
          <span className="text-sm text-slate">
            ({selected.length} of {MAX_COMPARE} ·{' '}
            <Link href="/compare" className="font-semibold text-royal-ink underline">
              view comparison
            </Link>
            )
          </span>
        </>
      ) : null}
    </form>
  );
}
