import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { CsvImport } from '@/app/(app)/assessment/[id]/import/csv-import';
import { PageTitle } from '@/components/app/section';
import { Notice } from '@/components/ui/notice';
import { requireProtocol } from '@/lib/assessment/catalog/protocols';
import { exampleCsv } from '@/lib/assessment/csv';
import { getAssessment } from '@/lib/assessment/server/queries';

export const metadata: Metadata = { title: 'Import measurements' };

export default async function ImportPage({ params }: { readonly params: Promise<{ id: string }> }) {
  const { id } = await params;
  const row = await getAssessment(id);
  if (!row) notFound();
  const definition = requireProtocol(row.protocol_key, row.protocol_version);
  return (
    <>
      <PageTitle title="Import measurements">
        Bring in values from a radar, ball-tracking or bat-tracking export saved as CSV. Base Recruits reads a generic format —
        no device brand is required — and converts units to the ones it stores.
      </PageTitle>
      <p className="mb-8">
        <Link href={`/assessment/${row.id}?step=reps`} className="font-semibold text-royal-ink underline">
          Back to the assessment
        </Link>
      </p>
      {row.status === 'published' ? (
        <Notice tone="attention">This assessment is published. Reopen it to import more values.</Notice>
      ) : (
        <CsvImport
          assessmentId={row.id}
          discipline={row.discipline}
          metricKeys={definition.metrics.map((item) => item.key)}
          example={exampleCsv(row.discipline)}
        />
      )}
    </>
  );
}
