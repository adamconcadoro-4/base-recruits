import Link from 'next/link';

import { formatDateOnly, scoreText } from '@/components/assessment/result-format';
import { StatusChip, type ChipTone } from '@/components/ui/status-chip';
import { PILLARS } from '@/lib/assessment/catalog/pillars';
import { MODE_LABELS, protocol as findProtocol } from '@/lib/assessment/catalog/protocols';
import { PILLAR_STATUS_LABELS, REVIEW_LABELS, STATUS_LABELS } from '@/lib/assessment/labels';
import type { AssessmentRow, RevisionRow } from '@/lib/assessment/server/queries';
import type { ReportSnapshot } from '@/lib/assessment/snapshot';
import type { AssessmentStatus } from '@/lib/assessment/types';

const STATUS_TONES: Readonly<Record<AssessmentStatus, ChipTone>> = {
  draft: 'neutral',
  ready_for_review: 'attention',
  reviewed: 'progress',
  published: 'positive',
};

export function AssessmentStatusChip({ status }: { readonly status: AssessmentStatus }) {
  return <StatusChip tone={STATUS_TONES[status]}>{STATUS_LABELS[status]}</StatusChip>;
}

export function protocolTitle(row: Pick<AssessmentRow, 'protocol_key' | 'protocol_version' | 'mode'>): string {
  return findProtocol(row.protocol_key, row.protocol_version)?.title ?? MODE_LABELS[row.mode];
}

/** A list of assessments with their status and where to continue. */
export function AssessmentList({ rows, empty }: { readonly rows: readonly AssessmentRow[]; readonly empty: string }) {
  if (rows.length === 0) return <p className="text-slate">{empty}</p>;
  return (
    <ul className="divide-y-2 divide-rule border-y-2 border-rule">
      {rows.map((row) => (
        <li key={row.id} className="flex flex-wrap items-center justify-between gap-3 py-4">
          <div className="space-y-1">
            <Link href={`/assessment/${row.id}`} className="text-lg font-semibold text-royal-ink underline">
              {row.discipline === 'hitting' ? 'Hitting' : 'Pitching'} · {formatDateOnly(row.assessment_date)}
            </Link>
            <p className="text-sm text-slate">{protocolTitle(row)}</p>
            {row.last_reopen_reason && row.status !== 'published' ? (
              <p className="text-sm text-slate">Reopened: {row.last_reopen_reason}</p>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <AssessmentStatusChip status={row.status} />
            {row.current_revision_id ? (
              <Link href={`/assessment/${row.id}/report`} className="text-sm font-semibold text-royal-ink underline">
                Report
              </Link>
            ) : null}
          </div>
        </li>
      ))}
    </ul>
  );
}

/** One line per pillar: status and score, never a zero for missing evidence. */
export function PillarSummary({ snapshot }: { readonly snapshot: ReportSnapshot }) {
  return (
    <dl className="grid gap-3 sm:grid-cols-2">
      {snapshot.results.pillars.map((pillar) => (
        <div key={pillar.pillar} className="border-l-4 border-rule pl-3">
          <dt className="font-semibold">{PILLARS[pillar.pillar].name}</dt>
          <dd className="text-sm">
            {pillar.status === 'complete' ? (
              <>
                <span className="text-lg font-bold text-navy">{scoreText(pillar.score)}</span> of 100
              </>
            ) : (
              <span className="text-slate">{PILLAR_STATUS_LABELS[pillar.status]}</span>
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** A published report as a card: date, review kind, pillar summary and a link. */
export function ReportCard({ revision }: { readonly revision: RevisionRow }) {
  const snapshot = revision.snapshot;
  return (
    <div className="space-y-4 border-2 border-rule p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-2xl text-navy">
            {revision.discipline === 'hitting' ? 'Hitting' : 'Pitching'} ·{' '}
            {formatDateOnly(snapshot?.assessment.assessment_date ?? revision.published_at)}
          </h3>
          <p className="text-sm text-slate">
            {REVIEW_LABELS[revision.review_kind]} · revision {revision.revision}
          </p>
        </div>
        <Link href={`/assessment/${revision.assessment_id}/report`} className="font-semibold text-royal-ink underline">
          Open report
        </Link>
      </div>
      {snapshot ? <PillarSummary snapshot={snapshot} /> : <p className="text-slate">This report could not be read.</p>}
    </div>
  );
}
