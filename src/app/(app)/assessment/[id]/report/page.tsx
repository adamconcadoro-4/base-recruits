import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { PrintButton } from '@/components/assessment/print-button';
import { formatDateTime } from '@/components/assessment/result-format';
import { ReportView } from '@/components/assessment/report-view';
import { Notice } from '@/components/ui/notice';
import { single, type SearchParams } from '@/lib/assessment/server/page-context';
import { getAssessment, getRevision, getRevisions } from '@/lib/assessment/server/queries';

export const metadata: Metadata = { title: 'Report' };

export default async function AssessmentReportPage({
  params,
  searchParams,
}: {
  readonly params: Promise<{ id: string }>;
  readonly searchParams: SearchParams;
}) {
  const { id } = await params;
  const query = await searchParams;
  const row = await getAssessment(id);
  if (!row) notFound();
  const requested = single(query.revision);
  const revisionId = requested ?? row.current_revision_id;
  if (!revisionId) {
    return (
      <Notice title="Not published yet">
        This assessment has no published report.{' '}
        <Link href={`/assessment/${row.id}?step=results`} className="font-semibold text-royal-ink underline">
          See the live preview
        </Link>
        .
      </Notice>
    );
  }
  const [revision, revisions] = await Promise.all([getRevision(revisionId), getRevisions(row.id)]);
  if (!revision || revision.assessment_id !== row.id) notFound();
  const snapshot = revision.snapshot;
  const clipLinks = Object.fromEntries((snapshot?.clips ?? []).map((clip) => [clip.id, `/assessment/film?clip=${clip.id}`]));

  return (
    <>
      <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-5xl text-navy">Assessment report</h1>
          <p className="mt-2 text-slate print:hidden">
            <Link href={`/assessment/${row.id}`} className="font-semibold text-royal-ink underline">
              Back to the assessment
            </Link>
          </p>
        </div>
        <PrintButton />
      </div>
      {revision.status === 'superseded' ? (
        <Notice tone="attention" title="An earlier revision" className="mb-8">
          This revision was replaced by a later one.{' '}
          {row.current_revision_id ? (
            <Link href={`/assessment/${row.id}/report`} className="font-semibold text-royal-ink underline">
              Open the current report
            </Link>
          ) : null}
        </Notice>
      ) : null}
      {row.status !== 'published' && revision.status === 'current' ? (
        <Notice tone="attention" title="Being corrected" className="mb-8">
          This assessment was reopened{row.last_reopen_reason ? `: ${row.last_reopen_reason}` : ''}. The report below stays as published
          until a new revision is published.
        </Notice>
      ) : null}
      {snapshot ? (
        <ReportView snapshot={snapshot} clipLinks={clipLinks} />
      ) : (
        <Notice tone="error">This report could not be read.</Notice>
      )}
      {revisions.length > 1 ? (
        <section aria-labelledby="revisions" className="mt-12 space-y-3 print:hidden">
          <h2 id="revisions" className="text-2xl text-navy">
            Revisions
          </h2>
          <ul className="space-y-1">
            {revisions.map((item) => (
              <li key={item.id}>
                {item.id === revision.id ? (
                  <span className="font-semibold">
                    Revision {item.revision} · {formatDateTime(item.published_at)} (showing)
                  </span>
                ) : (
                  <Link href={`/assessment/${row.id}/report?revision=${item.id}`} className="text-royal-ink underline">
                    Revision {item.revision} · {formatDateTime(item.published_at)}
                    {item.note ? ` — ${item.note}` : ''}
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </>
  );
}
