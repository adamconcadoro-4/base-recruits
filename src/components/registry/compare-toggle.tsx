import Link from 'next/link';

import { toggleCompare } from '@/app/(site)/compare/actions';
import { MAX_COMPARE } from '@/lib/registry/search-params';

/**
 * "Add to compare" / "Remove from compare". A form post (see
 * src/app/(site)/compare/actions.ts), so it works without JavaScript and is
 * never triggered by link prefetching.
 */
export function CompareToggle({
  slug,
  name,
  selected,
  back,
  compact = false,
  showCount = true,
}: {
  readonly slug: string;
  readonly name: string;
  /** The current comparison selection. */
  readonly selected: readonly string[];
  /** Where to return after the change (a same-site path). */
  readonly back: string;
  /** On the comparison itself: a plain "Remove" button. */
  readonly compact?: boolean;
  /** Show "(n of 5 · view comparison)" next to a school that is in the comparison. */
  readonly showCount?: boolean;
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
  if (compact) {
    return (
      <form action={toggleCompare} className="inline">
        <input type="hidden" name="school" value={slug} />
        <input type="hidden" name="back" value={back} />
        <button type="submit" aria-label={`Remove ${name}`} className="text-left text-sm font-semibold text-royal-ink underline">
          Remove
        </button>
      </form>
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
      {inCompare && showCount ? (
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
