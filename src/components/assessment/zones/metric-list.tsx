import { metricText, type MetricResult } from '@/lib/assessment/zones/metrics';

/** Missing and excluded counts in plain words, or null when there are none. */
export function coverageText(result: MetricResult): string | null {
  const parts: string[] = [];
  if (result.missing > 0) parts.push(`${result.missing} not recorded`);
  for (const item of result.excluded) parts.push(`${item.count} left out: ${item.reason.toLowerCase()}`);
  return parts.length > 0 ? parts.join('; ') : null;
}

/**
 * Rates with their counts. Every rate shows its numerator and denominator,
 * what was not recorded, and what was left out and why; "N/A" when nothing
 * was eligible.
 */
export function MetricList({ results, caption }: { readonly results: readonly MetricResult[]; readonly caption?: string }) {
  return (
    <dl className="divide-y-2 divide-rule border-y-2 border-rule" aria-label={caption}>
      {results.map((result) => {
        const coverage = coverageText(result);
        return (
          <div key={result.key} className="grid gap-1 py-3 sm:grid-cols-[minmax(12rem,1fr)_2fr] sm:gap-4">
            <dt className="font-semibold text-graphite">{result.label}</dt>
            <dd className="space-y-1">
              <p className="text-lg font-semibold text-navy" data-testid={`metric-${result.key}`}>
                {metricText(result)}
              </p>
              {coverage ? <p className="text-sm text-slate">{coverage}</p> : null}
              <details className="text-sm text-slate">
                <summary className="cursor-pointer font-semibold text-royal-ink">How it is counted</summary>
                <p className="mt-1">{result.definition}</p>
                {result.workbook ? <p className="mt-1">Workbook: {result.workbook}.</p> : null}
              </details>
            </dd>
          </div>
        );
      })}
    </dl>
  );
}
