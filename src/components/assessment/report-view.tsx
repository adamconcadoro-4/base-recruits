import type { ReactNode } from 'react';

import {
  formatDateOnly,
  formatDateTime,
  formulaText,
  metricLabel,
  scoreText,
  STATISTIC_LABELS,
  targetText,
  valueText,
} from '@/components/assessment/result-format';
import { StatusChip, type ChipTone } from '@/components/ui/status-chip';
import {
  AGE_BAND_LABELS,
  CAMERA_VIEW_LABELS,
  COMPETITION_LEVEL_LABELS,
  DRILL_TYPE_LABELS,
  TIMING_BASIS_LABELS,
} from '@/lib/assessment/catalog/context';
import { BENCHMARK_COMPATIBILITY, requireMetric } from '@/lib/assessment/catalog/metrics';
import { PILLARS } from '@/lib/assessment/catalog/pillars';
import { MODE_EVIDENCE, MODE_LABELS, protocol as findProtocol } from '@/lib/assessment/catalog/protocols';
import { EXCLUSION_LABELS, METRIC_STATUS_LABELS, PILLAR_STATUS_LABELS, REVIEW_LABELS, evidenceLabel, scoreLabel } from '@/lib/assessment/labels';
import { findingsFrom, strengthsFrom } from '@/lib/assessment/recommendations';
import type { MetricResult, PillarResult } from '@/lib/assessment/results';
import type { ReportSnapshot } from '@/lib/assessment/snapshot';
import type { PillarStatus } from '@/lib/assessment/types';
import { formatValue } from '@/lib/assessment/units';
import { cn } from '@/lib/utils/cn';

const PILLAR_TONES: Readonly<Record<PillarStatus, ChipTone>> = {
  complete: 'progress',
  incomplete: 'attention',
  descriptive: 'neutral',
  no_data: 'neutral',
};

/** A 0–100 score as a labelled bar. Missing scores show words, never an empty or zero bar. */
export function ScoreBar({ score, label }: { readonly score: number | null; readonly label: string }) {
  if (score === null) return <p className="text-sm text-slate">No score</p>;
  return (
    <div className="space-y-1">
      <p className="text-sm">
        <span className="text-2xl font-bold text-navy">{scoreText(score)}</span>
        <span className="text-slate"> of 100 · {label}</span>
      </p>
      <div aria-hidden="true" className="h-2 w-full rounded-full bg-rule print:border print:border-graphite">
        <div className="h-2 rounded-full bg-royal-ink" style={{ width: `${Math.max(2, Math.min(100, score))}%` }} />
      </div>
    </div>
  );
}

function PillarCard({ pillar }: { readonly pillar: PillarResult }) {
  const definition = PILLARS[pillar.pillar];
  return (
    <div className="flex flex-col gap-3 border-2 border-rule bg-white p-5 break-inside-avoid">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h3 className="text-2xl text-navy">{definition.name}</h3>
        <StatusChip tone={PILLAR_TONES[pillar.status]}>{PILLAR_STATUS_LABELS[pillar.status]}</StatusChip>
      </div>
      <p className="text-sm text-slate">{definition.summary}</p>
      {pillar.status === 'complete' ? (
        <ScoreBar score={pillar.score} label={`from ${pillar.included.length} scored ${pillar.included.length === 1 ? 'metric' : 'metrics'}`} />
      ) : pillar.status === 'incomplete' ? (
        <p className="text-sm">
          <span className="font-semibold">No pillar score yet.</span> Still needed:{' '}
          {pillar.missing_required.map((key) => requireMetric(key).name).join(', ')}.
        </p>
      ) : pillar.status === 'descriptive' ? (
        <p className="text-sm">
          <span className="font-semibold">Described, not scored.</span> The evidence here has no rubric or coach target to score against.
        </p>
      ) : (
        <p className="text-sm">
          <span className="font-semibold">No data yet.</span> Nothing has been recorded for this pillar.
        </p>
      )}
    </div>
  );
}

function SummaryItem({ label, children }: { readonly label: string; readonly children: ReactNode }) {
  return (
    <div>
      <dt className="text-sm font-semibold text-slate">{label}</dt>
      <dd className="mt-0.5">{children}</dd>
    </div>
  );
}

function MetricRow({ result }: { readonly result: MetricResult }) {
  const definition = requireMetric(result.metric_key);
  const formula = formulaText(result);
  const target = targetText(result);
  const missing = result.status !== 'ok';
  return (
    <tr className="align-top">
      <th scope="row" className="py-3 pr-4 text-left font-semibold">
        <span className="block">{metricLabel(result)}</span>
        <details className="mt-1 text-sm font-normal text-slate print:hidden">
          <summary className="cursor-pointer text-royal-ink underline">About this metric</summary>
          <div className="mt-2 max-w-prose space-y-2">
            <p>{definition.explanation}</p>
            <p>
              <span className="font-semibold">Needs:</span> {definition.equipment}
            </p>
            <p>
              <span className="font-semibold">Protocol:</span> {definition.protocolRequirement}
            </p>
            <p>
              <span className="font-semibold">Limitations:</span> {definition.limitations}
            </p>
          </div>
        </details>
      </th>
      <td className="py-3 pr-4">
        <span className={cn('block', missing ? 'text-slate' : 'font-semibold')}>{valueText(result)}</span>
        {!missing ? <span className="block text-sm text-slate">{STATISTIC_LABELS[result.statistic]}</span> : null}
        {result.peak !== null ? (
          <span className="block text-sm">Peak: {formatValue(result.peak, definition.unit)}</span>
        ) : null}
        {result.status !== 'ok' && result.status !== 'not_collected' ? (
          <span className="block text-sm text-slate">{METRIC_STATUS_LABELS[result.status]}</span>
        ) : null}
      </td>
      <td className="py-3 pr-4 text-sm">
        {result.status === 'not_collected' ? (
          '—'
        ) : (
          <>
            {result.valid_count} valid{result.excluded_count > 0 ? `, ${result.excluded_count} excluded` : ''}
            <span className="block text-slate">needs {result.min_count}</span>
          </>
        )}
      </td>
      <td className="py-3 pr-4 text-sm">
        {evidenceLabel(result)}
        {result.input_evidence.length > 0 ? (
          <span className="block text-slate">from {result.input_evidence.map((item) => evidenceLabel({ ...result, evidence: [item] })).join(', ')}</span>
        ) : null}
        {result.devices.length > 0 ? <span className="block text-slate">Device: {result.devices.join(', ')}</span> : null}
        {result.limited_count > 0 ? <span className="block text-attention">{result.limited_count} marked limited</span> : null}
        {result.reviewed_count > 0 && result.source_kinds.includes('self') ? (
          <span className="block text-slate">Reviewed by the development coach</span>
        ) : null}
      </td>
      <td className="py-3 text-sm">
        {result.score !== null ? (
          <>
            <span className="block text-base font-semibold">{scoreText(result.score)}</span>
            <span className="block text-slate">{scoreLabel(result.method, result.source_kinds)}</span>
          </>
        ) : (
          <span className="text-slate">{result.method === 'descriptive' ? 'Not scored' : '—'}</span>
        )}
        {formula ? <span className="mt-1 block text-slate">{formula}</span> : null}
        {target ? <span className="mt-1 block text-slate">{target}</span> : null}
        {result.percentile ? (
          <span className="mt-1 block">
            Reference percentile {scoreText(result.percentile.value)} (dataset {result.percentile.dataset_version},{' '}
            {result.percentile.reference_count} athletes) — position in a group, not a grade.
          </span>
        ) : definition.scoring !== 'rubric' && result.status === 'ok' ? (
          <span className="mt-1 block text-slate">Reference benchmarks are not available for this metric and protocol.</span>
        ) : null}
      </td>
    </tr>
  );
}

function PillarDetail({ pillar, metrics }: { readonly pillar: PillarResult; readonly metrics: readonly MetricResult[] }) {
  const definition = PILLARS[pillar.pillar];
  const rows = metrics.filter((row) => row.pillar === pillar.pillar);
  return (
    <section aria-labelledby={`pillar-${pillar.pillar}`} className="space-y-3 break-inside-avoid-page">
      <h3 id={`pillar-${pillar.pillar}`} className="text-2xl text-navy">
        {definition.name}
      </h3>
      <p className="max-w-3xl text-sm text-slate">{definition.limits}</p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[44rem] border-y-2 border-rule text-left">
          <caption className="sr-only">{definition.name} metrics, evidence and scores</caption>
          <thead>
            <tr className="border-b-2 border-rule text-sm text-slate">
              <th scope="col" className="py-2 pr-4 font-semibold">Metric</th>
              <th scope="col" className="py-2 pr-4 font-semibold">Result</th>
              <th scope="col" className="py-2 pr-4 font-semibold">Repetitions</th>
              <th scope="col" className="py-2 pr-4 font-semibold">Evidence</th>
              <th scope="col" className="py-2 font-semibold">Score and how it was scored</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-rule">
            {rows.map((row) => (
              <MetricRow key={`${row.metric_key}:${row.pitch_type ?? ''}`} result={row} />
            ))}
          </tbody>
        </table>
      </div>
      {pillar.status === 'complete' ? (
        <p className="text-sm">
          Pillar score: weighted average of{' '}
          {pillar.included.map((item) => `${requireMetric(item.metric_key).name} (${scoreText(item.score)}, weight ${item.weight})`).join(', ')}.
        </p>
      ) : null}
      {pillar.excluded.length > 0 ? (
        <p className="text-sm text-slate">
          Not in the pillar score:{' '}
          {pillar.excluded.map((item) => `${requireMetric(item.metric_key).name} — ${EXCLUSION_LABELS[item.reason].toLowerCase()}`).join('; ')}.
        </p>
      ) : null}
    </section>
  );
}

export function ReportView({
  snapshot,
  clipLinks,
}: {
  readonly snapshot: ReportSnapshot;
  /** Film Room links for clips, when the viewer may watch them. */
  readonly clipLinks?: Readonly<Record<string, string>>;
}) {
  const { assessment, review, results } = snapshot;
  const definition = findProtocol(assessment.protocol_key, assessment.protocol_version);
  const strengths = strengthsFrom(results.metrics);
  const priorities = findingsFrom(results.metrics).slice(0, 3);
  const disciplineLabel = assessment.discipline === 'hitting' ? 'Hitting' : 'Pitching';

  return (
    <article className="space-y-12">
      {snapshot.fictional ? (
        <div role="note" className="border-4 border-attention bg-attention-soft p-4 font-semibold text-graphite">
          Fictional sample. Every name and number on this page is invented to show how a report is laid out. It is not
          a real athlete, not a benchmark and not part of anyone&apos;s results.
        </div>
      ) : null}

      <section aria-labelledby="report-summary" className="space-y-5">
        <h2 id="report-summary" className="text-3xl text-navy">
          {disciplineLabel} assessment · {formatDateOnly(assessment.assessment_date)}
        </h2>
        <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <SummaryItem label="Athlete">{assessment.athlete_name ?? 'Athlete'}</SummaryItem>
          <SummaryItem label="Protocol">
            {definition?.title ?? assessment.protocol_key} (version {assessment.protocol_version})
          </SummaryItem>
          <SummaryItem label="Mode">{MODE_LABELS[assessment.mode]}</SummaryItem>
          <SummaryItem label="Review">
            {review ? (
              <>
                {REVIEW_LABELS[review.kind]}
                {review.reviewer_name ? ` by ${review.reviewer_name}` : ''}
              </>
            ) : (
              'Preview — not published'
            )}
          </SummaryItem>
          <SummaryItem label="Published">{review ? `${formatDateTime(review.published_at)} · revision ${review.revision}` : 'Not yet'}</SummaryItem>
          <SummaryItem label="Repetitions">
            {assessment.repetitions.valid} valid of {assessment.repetitions.total}
            {assessment.repetitions.excluded > 0 ? ` (${assessment.repetitions.excluded} excluded with reasons)` : ''} · goal {assessment.rep_goal}
          </SummaryItem>
        </dl>
        <p className="max-w-3xl text-sm text-slate">{MODE_EVIDENCE[assessment.mode]}</p>
        {review?.kind === 'self_assessed' ? (
          <p className="max-w-3xl border-l-4 border-attention bg-attention-soft px-4 py-3 text-sm">
            This is a self-assessment. Ratings and charted outcomes were entered by the athlete or their family and have
            not all been reviewed by a development coach.
          </p>
        ) : null}
        {review?.note ? (
          <p className="max-w-3xl text-sm">
            <span className="font-semibold">Note:</span> {review.note}
          </p>
        ) : null}
      </section>

      <section aria-labelledby="report-pillars" className="space-y-4">
        <h2 id="report-pillars" className="text-3xl text-navy">
          The four pillars
        </h2>
        <p className="max-w-3xl text-sm text-slate">
          A pillar shows a score only when every metric it needs has enough valid evidence. Missing evidence is never counted
          as zero. There is no overall grade.
        </p>
        <div className="grid gap-4 md:grid-cols-2">
          {results.pillars.map((pillar) => (
            <PillarCard key={pillar.pillar} pillar={pillar} />
          ))}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[30rem] text-left text-sm">
            <caption className="py-2 text-left font-semibold">Pillar results as a table</caption>
            <thead>
              <tr className="border-b-2 border-rule text-slate">
                <th scope="col" className="py-2 pr-4">Pillar</th>
                <th scope="col" className="py-2 pr-4">Status</th>
                <th scope="col" className="py-2 pr-4">Score</th>
                <th scope="col" className="py-2">Scored metrics</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-rule">
              {results.pillars.map((pillar) => (
                <tr key={pillar.pillar}>
                  <th scope="row" className="py-2 pr-4 font-semibold">{PILLARS[pillar.pillar].name}</th>
                  <td className="py-2 pr-4">{PILLAR_STATUS_LABELS[pillar.status]}</td>
                  <td className="py-2 pr-4">{pillar.status === 'complete' ? `${scoreText(pillar.score)} of 100` : 'No score'}</td>
                  <td className="py-2">{pillar.included.length}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section aria-labelledby="report-findings" className="grid gap-8 md:grid-cols-2">
        <div className="space-y-3">
          <h2 id="report-findings" className="text-3xl text-navy">
            Strengths
          </h2>
          {strengths.length > 0 ? (
            <ul className="list-disc space-y-1 pl-5">
              {strengths.map((result) => (
                <li key={`${result.metric_key}:${result.pitch_type ?? ''}`}>
                  {metricLabel(result)}: {valueText(result)} ({scoreLabel(result.method, result.source_kinds).toLowerCase()} {scoreText(result.score)})
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-slate">No strengths can be named from this evidence yet.</p>
          )}
        </div>
        <div className="space-y-3">
          <h2 className="text-3xl text-navy">Development priorities</h2>
          {priorities.length > 0 ? (
            <ol className="list-decimal space-y-1 pl-5">
              {priorities.map((finding) => (
                <li key={`${finding.metricKey}:${finding.pitchType ?? ''}`}>{finding.summary}</li>
              ))}
            </ol>
          ) : (
            <p className="text-slate">No priorities can be named from this evidence yet.</p>
          )}
          <p className="text-sm text-slate">Priorities come only from scored results with enough valid evidence.</p>
        </div>
      </section>

      <section aria-labelledby="report-metrics" className="space-y-10">
        <h2 id="report-metrics" className="text-3xl text-navy">
          Metrics, evidence and scoring
        </h2>
        {results.pillars.map((pillar) => (
          <PillarDetail key={pillar.pillar} pillar={pillar} metrics={results.metrics} />
        ))}
      </section>

      <section aria-labelledby="report-context" className="space-y-4">
        <h2 id="report-context" className="text-3xl text-navy">
          How it was captured
        </h2>
        <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <SummaryItem label="Drill">{assessment.drill_type ? DRILL_TYPE_LABELS[assessment.drill_type] : 'Not recorded'}</SummaryItem>
          <SummaryItem label="Age band">{AGE_BAND_LABELS[assessment.age_band]}</SummaryItem>
          <SummaryItem label="Level">
            {assessment.competition_level ? COMPETITION_LEVEL_LABELS[assessment.competition_level] : 'Not recorded'}
          </SummaryItem>
          <SummaryItem label={assessment.discipline === 'hitting' ? 'Bats / throws' : 'Throws'}>
            {assessment.discipline === 'hitting' ? `${assessment.bats ?? '—'} / ${assessment.throws ?? '—'}` : (assessment.throws ?? 'Not recorded')}
          </SummaryItem>
          <SummaryItem label="Camera views">
            {assessment.camera_views.length > 0 ? assessment.camera_views.map((view) => CAMERA_VIEW_LABELS[view]).join('; ') : 'Not recorded'}
          </SummaryItem>
          <SummaryItem label="Environment">
            {[assessment.environment, assessment.surface].filter(Boolean).join(', ') || 'Not recorded'}
          </SummaryItem>
          <SummaryItem label="Equipment">{assessment.equipment ?? 'Not recorded'}</SummaryItem>
          {assessment.discipline === 'hitting' ? <SummaryItem label="Bat">{assessment.bat_details ?? 'Not recorded'}</SummaryItem> : null}
          <SummaryItem label="Reassessment">{formatDateOnly(assessment.reassessment_due_on)}</SummaryItem>
        </dl>
        {assessment.capture_limitations ? (
          <p className="max-w-3xl">
            <span className="font-semibold">Capture limitations:</span> {assessment.capture_limitations}
          </p>
        ) : null}
        {assessment.notes ? (
          <p className="max-w-3xl">
            <span className="font-semibold">Notes:</span> {assessment.notes}
          </p>
        ) : null}
        <div>
          <h3 className="text-xl text-navy">Clips</h3>
          {snapshot.clips.length > 0 ? (
            <ul className="mt-2 list-disc space-y-1 pl-5">
              {snapshot.clips.map((clip) => (
                <li key={clip.id}>
                  {clipLinks?.[clip.id] ? (
                    <a className="font-semibold text-royal-ink underline print:no-underline" href={clipLinks[clip.id]}>
                      {clip.label ?? 'Clip'}
                    </a>
                  ) : (
                    <span>{clip.label ?? 'Clip'}</span>
                  )}
                  {clip.camera_view ? ` — ${CAMERA_VIEW_LABELS[clip.camera_view]}` : ''} · {TIMING_BASIS_LABELS[clip.timing_basis]}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-slate">No clips were attached.</p>
          )}
        </div>
      </section>

      <section aria-labelledby="report-method" className="space-y-3 text-sm">
        <h2 id="report-method" className="text-3xl text-navy">
          Methodology and limitations
        </h2>
        <ul className="max-w-3xl list-disc space-y-2 pl-5">
          <li>
            <span className="font-semibold">Evidence.</span> Sensor measurements come from a named device; a value typed in by
            hand is labelled as entered by hand and is not independently verified. Video estimates come from moments
            marked on a clip and are limited by its frame rate. Observations are labelled coach or self-assessed. Derived
            calculations list the evidence they were calculated from.
          </li>
          <li>
            <span className="font-semibold">Scores.</span> Rubric score = 25 × (rating − 1), from written anchors; it is not a
            percentile. Measured values are scored only against a target the athlete&apos;s development coach set, and the
            target is shown. Everything else is described without a score.
          </li>
          <li>
            <span className="font-semibold">Pillars.</span> A weighted average of scored metrics, shown only when every
            required metric has enough valid evidence. Missing or excluded evidence is never counted as zero.
          </li>
          <li>
            <span className="font-semibold">Reference benchmarks.</span>{' '}
            {snapshot.benchmarks_available
              ? 'A percentile appears only where an approved reference dataset matched exactly.'
              : 'No approved reference dataset matched this report, so no percentiles are shown.'}{' '}
            {BENCHMARK_COMPATIBILITY}
          </li>
          <li>
            <span className="font-semibold">What this is not.</span> This report describes the evidence from one session. It
            does not predict recruiting, admission, scholarships or college division, does not assess injury risk, and is
            not a medical evaluation. Video-only and lab results are not interchangeable.
          </li>
          <li>
            Calculation version {results.calculation_version}; protocol {assessment.protocol_key} version{' '}
            {assessment.protocol_version}. Published reports are frozen; corrections appear as new revisions.
          </li>
        </ul>
      </section>
    </article>
  );
}
