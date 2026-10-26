import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { PrintButton } from '@/components/assessment/print-button';
import { ReportView } from '@/components/assessment/report-view';
import { Notice } from '@/components/ui/notice';
import { getRevision } from '@/lib/assessment/server/queries';

export const metadata: Metadata = { title: 'Shared report' };

/**
 * A published report an athlete shared with a college coach. Row-level
 * security returns it only while the share is in effect, and only the current
 * revision; clips and the working data are never part of a share.
 */
export default async function SharedReportPage({ params }: { readonly params: Promise<{ revisionId: string }> }) {
  const { revisionId } = await params;
  const revision = await getRevision(revisionId);
  if (!revision) notFound();
  return (
    <>
      <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-5xl text-navy">Shared assessment report</h1>
          <p className="mt-2 text-slate print:hidden">
            <Link href="/assessment" className="font-semibold text-royal-ink underline">
              Back to reports shared with you
            </Link>
          </p>
        </div>
        <PrintButton />
      </div>
      <Notice className="mb-8" title="How to read this">
        This report describes one assessment session and shows the evidence behind every result. It is not a ranking, a
        prediction of college level, or a medical evaluation.
      </Notice>
      {revision.snapshot ? <ReportView snapshot={revision.snapshot} /> : <Notice tone="error">This report could not be read.</Notice>}
    </>
  );
}
