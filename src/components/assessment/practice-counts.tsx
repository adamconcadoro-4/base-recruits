import { TextField } from '@/components/ui/field';
import {
  COUNT_SOURCE_LABELS,
  formatTotal,
  PRACTICE_COUNT_MAX,
  PRACTICE_COUNT_MEASURES,
  summarizeCounts,
  type PracticeCountFields,
} from '@/lib/assessment/practice-counts';
import type { SourceKind } from '@/lib/assessment/types';

const SOURCES: readonly SourceKind[] = ['development_coach', 'self'];

/** Optional practice counts on a hitting log form. Blank means not counted. */
export function PracticeCountInputs({ idPrefix }: { readonly idPrefix: string }) {
  return (
    <fieldset className="space-y-2">
      <legend className="font-semibold">Practice counts (optional)</legend>
      <p className="text-sm text-slate">Leave a box blank if you didn&apos;t count it. Blank is not zero.</p>
      <div className="grid gap-3 md:grid-cols-3">
        {PRACTICE_COUNT_MEASURES.map((item) => (
          <div key={item.key} className="grid grid-cols-2 gap-2">
            <TextField id={`${idPrefix}-${item.of}`} name={item.of} type="number" min={0} max={PRACTICE_COUNT_MAX} label={item.ofLabel} />
            <TextField id={`${idPrefix}-${item.made}`} name={item.made} type="number" min={0} max={PRACTICE_COUNT_MAX} label={item.madeLabel} />
          </div>
        ))}
      </div>
    </fieldset>
  );
}

/** Totals across a plan's logs, with coach observations and the athlete's or family's own reports kept apart. */
export function PracticeCountSummary({ logs }: { readonly logs: ReadonlyArray<PracticeCountFields & { readonly logger_kind: SourceKind }> }) {
  const summary = summarizeCounts(logs);
  if (summary.length === 0) return null;
  return (
    <div className="space-y-2">
      <h4 className="text-xl font-semibold">Practice counts</h4>
      <ul className="list-disc space-y-1 pl-5 text-sm">
        {summary.map(({ measure, bySource }) => (
          <li key={measure.key}>
            <span className="font-semibold">{measure.label}:</span>{' '}
            {SOURCES.flatMap((source) => {
              const total = bySource[source];
              return total
                ? [`${formatTotal(total, measure.unit)} ${COUNT_SOURCE_LABELS[source]}, over ${total.rounds} ${total.rounds === 1 ? 'log' : 'logs'}`]
                : [];
            }).join('; ')}
          </li>
        ))}
      </ul>
      <p className="text-sm text-slate">
        Counts include only logs where both numbers were counted. They describe practice, are not measurements, and never change
        an assessment score.
      </p>
    </div>
  );
}
