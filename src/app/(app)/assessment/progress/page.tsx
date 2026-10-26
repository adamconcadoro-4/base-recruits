import type { Metadata } from 'next';
import Link from 'next/link';

import { DashboardSection, PageTitle } from '@/components/app/section';
import { AthletePicker } from '@/components/assessment/athlete-picker';
import { formatDateOnly, metricLabel, resultUnit, scoreText, valueText } from '@/components/assessment/result-format';
import { Notice } from '@/components/ui/notice';
import { PILLARS } from '@/lib/assessment/catalog/pillars';
import { compareSnapshots } from '@/lib/assessment/compatibility';
import { athleteContext, single, type SearchParams } from '@/lib/assessment/server/page-context';
import { getCurrentReports, listAssessments, type RevisionRow } from '@/lib/assessment/server/queries';
import type { ReportSnapshot } from '@/lib/assessment/snapshot';
import { isDiscipline, pillarsFor, type PillarKey } from '@/lib/assessment/types';
import { formatValue } from '@/lib/assessment/units';
import { cn } from '@/lib/utils/cn';

export const metadata: Metadata = { title: 'Progress' };

type Report = RevisionRow & { readonly snapshot: ReportSnapshot };

/**
 * One pillar's complete scores over time. A report where the pillar was not
 * complete leaves a gap; nothing is drawn as zero.
 */
function PillarTrend({ pillar, reports }: { readonly pillar: PillarKey; readonly reports: readonly Report[] }) {
  const width = 320;
  const height = 120;
  const pad = 24;
  const points = reports.map((report, index) => {
    const result = report.snapshot.results.pillars.find((item) => item.pillar === pillar);
    const score = result?.status === 'complete' ? result.score : null;
    const x = reports.length === 1 ? width / 2 : pad + (index * (width - pad * 2)) / (reports.length - 1);
    const y = score === null ? null : height - pad - (score / 100) * (height - pad * 2);
    return { x, y, score, date: report.snapshot.assessment.assessment_date };
  });
  const segments: string[] = [];
  let current: string[] = [];
  for (const point of points) {
    if (point.y === null) {
      if (current.length > 1) segments.push(current.join(' '));
      current = [];
    } else {
      current.push(`${point.x},${point.y}`);
    }
  }
  if (current.length > 1) segments.push(current.join(' '));
  const label = `${PILLARS[pillar].name}: ${points.map((point) => `${formatDateOnly(point.date)} ${point.score === null ? 'no score' : scoreText(point.score)}`).join('; ')}`;

  return (
    <figure className="space-y-1">
      <figcaption className="font-semibold">{PILLARS[pillar].name}</figcaption>
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={label} className="w-full max-w-sm">
        <line x1={pad} x2={width - pad} y1={height - pad} y2={height - pad} stroke="var(--color-rule)" />
        <line x1={pad} x2={width - pad} y1={pad} y2={pad} stroke="var(--color-rule)" strokeDasharray="3 3" />
        <text x={2} y={pad + 4} fontSize="10" fill="var(--color-slate)">
          100
        </text>
        <text x={8} y={height - pad + 4} fontSize="10" fill="var(--color-slate)">
          0
        </text>
        {segments.map((segment) => (
          <polyline key={segment} points={segment} fill="none" stroke="var(--color-royal-ink)" strokeWidth={2} />
        ))}
        {points.map((point) =>
          point.y === null ? (
            <circle key={`${point.x}`} cx={point.x} cy={height - pad} r={3} fill="white" stroke="var(--color-field)" />
          ) : (
            <circle key={`${point.x}`} cx={point.x} cy={point.y} r={4} fill="var(--color-royal-ink)" />
          ),
        )}
      </svg>
      <p className="text-xs text-slate">Open circles on the baseline: no complete score that time (not a zero).</p>
    </figure>
  );
}

export default async function ProgressPage({ searchParams }: { readonly searchParams: SearchParams }) {
  const { options, selected, query, failed } = await athleteContext(searchParams);
  if (!selected) {
    return (
      <>
        <PageTitle title="Progress" />
        <Notice tone={failed ? 'error' : 'info'}>{failed ? 'Your athletes didn’t load. Refresh to try again.' : 'There is no athlete to show yet.'}</Notice>
      </>
    );
  }
  const requested = single(query.discipline);
  const discipline = isDiscipline(requested) ? requested : 'hitting';
  const [revisions, assessments] = await Promise.all([getCurrentReports(selected.athlete_id), listAssessments(selected.athlete_id)]);
  const reports = revisions
    .filter((revision): revision is Report => revision.discipline === discipline && revision.snapshot !== null)
    .sort((a, b) => a.snapshot.assessment.assessment_date.localeCompare(b.snapshot.assessment.assessment_date) || a.published_at.localeCompare(b.published_at));

  const latest = reports.at(-1) ?? null;
  const latestRow = latest ? assessments.data.find((row) => row.id === latest.assessment_id) : undefined;
  const baseline = latestRow?.baseline_assessment_id ? reports.find((report) => report.assessment_id === latestRow.baseline_assessment_id) : undefined;
  const pickA = reports.find((report) => report.id === single(query.a));
  const pickB = reports.find((report) => report.id === single(query.b));
  const before = pickA ?? baseline ?? reports.at(-2) ?? null;
  const after = pickB ?? latest;
  const comparison = before && after && before.id !== after.id ? compareSnapshots(before.snapshot, after.snapshot) : null;
  const base = `/assessment/progress?athlete=${encodeURIComponent(selected.athlete_id)}`;

  return (
    <>
      <PageTitle title="Progress">
        See how results changed between assessments — compared only where they were captured the same way.
      </PageTitle>
      <div className="space-y-12">
        <AthletePicker options={options} selected={selected} action="/assessment/progress" />
        <nav aria-label="Discipline" className="flex gap-2">
          {(['hitting', 'pitching'] as const).map((item) => (
            <Link
              key={item}
              href={`${base}&discipline=${item}`}
              aria-current={item === discipline ? 'page' : undefined}
              className={cn(
                'inline-flex min-h-11 items-center rounded-md border-2 px-4 font-semibold no-underline',
                item === discipline ? 'border-royal-ink bg-ice text-navy' : 'border-rule text-slate',
              )}
            >
              {item === 'hitting' ? 'Hitting' : 'Pitching'}
            </Link>
          ))}
        </nav>

        {reports.length === 0 ? (
          <p className="text-slate">No published {discipline} reports yet.</p>
        ) : (
          <>
            <DashboardSection id="trends" title="Pillar scores over time" description="Each point is one published report.">
              <div className="grid gap-8 md:grid-cols-2">
                {pillarsFor(discipline).map((pillar) => (
                  <PillarTrend key={pillar} pillar={pillar} reports={reports} />
                ))}
              </div>
              <div className="mt-6 overflow-x-auto">
                <table className="w-full min-w-[32rem] text-left text-sm">
                  <caption className="py-2 text-left font-semibold">Pillar scores by report</caption>
                  <thead>
                    <tr className="border-b-2 border-rule text-slate">
                      <th scope="col" className="py-2 pr-3">Report</th>
                      {pillarsFor(discipline).map((pillar) => (
                        <th key={pillar} scope="col" className="py-2 pr-3">
                          {PILLARS[pillar].name}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-rule">
                    {reports.map((report) => (
                      <tr key={report.id}>
                        <th scope="row" className="py-2 pr-3 font-semibold">
                          <Link href={`/assessment/${report.assessment_id}/report`} className="text-royal-ink underline">
                            {formatDateOnly(report.snapshot.assessment.assessment_date)}
                          </Link>
                          <span className="block text-xs font-normal text-slate">
                            {report.review_kind === 'coach_reviewed' ? 'Coach-reviewed' : 'Self-assessed'}
                          </span>
                        </th>
                        {pillarsFor(discipline).map((pillar) => {
                          const result = report.snapshot.results.pillars.find((item) => item.pillar === pillar);
                          return (
                            <td key={pillar} className="py-2 pr-3">
                              {result?.status === 'complete' ? scoreText(result.score) : <span className="text-slate">No score</span>}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </DashboardSection>

            <DashboardSection id="compare" title="Compare two reports">
              {reports.length < 2 ? (
                <p className="text-slate">Publish a second {discipline} assessment to compare.</p>
              ) : (
                <div className="space-y-6">
                  <form method="get" action="/assessment/progress" className="flex flex-wrap items-end gap-3">
                    <input type="hidden" name="athlete" value={selected.athlete_id} />
                    <input type="hidden" name="discipline" value={discipline} />
                    {(['a', 'b'] as const).map((name) => (
                      <div key={name} className="space-y-1">
                        <label htmlFor={`pick-${name}`} className="block font-semibold">
                          {name === 'a' ? 'Earlier' : 'Later'}
                        </label>
                        <select
                          id={`pick-${name}`}
                          name={name}
                          defaultValue={(name === 'a' ? before : after)?.id ?? ''}
                          className="block min-h-11 rounded-md border-2 border-field bg-white px-3"
                        >
                          {reports.map((report) => (
                            <option key={report.id} value={report.id}>
                              {formatDateOnly(report.snapshot.assessment.assessment_date)}
                              {baseline && report.id === baseline.id ? ' (baseline)' : ''}
                            </option>
                          ))}
                        </select>
                      </div>
                    ))}
                    <button type="submit" className="min-h-11 rounded-md border-2 border-navy bg-white px-4 font-semibold text-navy hover:bg-ice">
                      Compare
                    </button>
                  </form>
                  {comparison && before && after ? (
                    <>
                      <ul className="list-disc space-y-1 pl-5 text-sm">
                        {comparison.warnings.map((warning) => (
                          <li key={warning}>{warning}</li>
                        ))}
                      </ul>
                      {comparison.contextDifferences.length > 0 ? (
                        <div className="border-l-4 border-attention bg-attention-soft px-4 py-3 text-sm">
                          <p className="font-semibold">Captured differently</p>
                          <ul className="mt-1 space-y-1">
                            {comparison.contextDifferences.map((difference) => (
                              <li key={difference.field}>
                                {difference.field}: {difference.previous} → {difference.current}
                              </li>
                            ))}
                          </ul>
                        </div>
                      ) : null}
                      <div className="overflow-x-auto">
                        <table className="w-full min-w-[44rem] text-left text-sm">
                          <caption className="py-2 text-left font-semibold">
                            {formatDateOnly(before.snapshot.assessment.assessment_date)} compared with{' '}
                            {formatDateOnly(after.snapshot.assessment.assessment_date)}
                          </caption>
                          <thead>
                            <tr className="border-b-2 border-rule text-slate">
                              <th scope="col" className="py-2 pr-3">Metric</th>
                              <th scope="col" className="py-2 pr-3">Earlier</th>
                              <th scope="col" className="py-2 pr-3">Later</th>
                              <th scope="col" className="py-2 pr-3">Change</th>
                              <th scope="col" className="py-2">Score change</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-rule">
                            {comparison.rows.map((row) => {
                              const sample = row.current ?? row.previous;
                              if (!sample) return null;
                              const unit = resultUnit(sample);
                              return (
                                <tr key={`${row.metricKey}:${row.pitchType ?? ''}`} className="align-top">
                                  <th scope="row" className="py-2 pr-3 font-semibold">
                                    {metricLabel(sample)}
                                  </th>
                                  <td className="py-2 pr-3">{row.previous ? valueText(row.previous) : '—'}</td>
                                  <td className="py-2 pr-3">{row.current ? valueText(row.current) : '—'}</td>
                                  <td className="py-2 pr-3">
                                    {row.comparable && row.valueChange !== null ? (
                                      `${row.valueChange > 0 ? '+' : ''}${formatValue(row.valueChange, unit)}`
                                    ) : (
                                      <span className="text-slate">Not compared: {row.reasons.join(' ')}</span>
                                    )}
                                  </td>
                                  <td className="py-2">
                                    {row.scoreComparable && row.scoreChange !== null ? (
                                      `${row.scoreChange > 0 ? '+' : ''}${scoreText(row.scoreChange)}`
                                    ) : row.comparable ? (
                                      <span className="text-slate">{row.scoreReasons.join(' ')}</span>
                                    ) : (
                                      '—'
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </>
                  ) : (
                    <p className="text-slate">Choose two different reports.</p>
                  )}
                </div>
              )}
            </DashboardSection>
          </>
        )}
      </div>
    </>
  );
}
