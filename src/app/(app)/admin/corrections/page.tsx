import type { Metadata } from 'next';
import Link from 'next/link';

import { ResolveReportForm } from '@/app/(app)/admin/schools/forms';
import { DashboardSection, PageTitle } from '@/components/app/section';
import { Notice } from '@/components/ui/notice';
import { requireAccess } from '@/lib/auth/guard';
import { formatRetrieved } from '@/lib/registry/labels';
import { createClient } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Correction reports' };

interface ReportRow {
  readonly id: string;
  readonly topic: string;
  readonly details: string;
  readonly evidence_url: string | null;
  readonly created_at: string;
  readonly institutions: { readonly slug: string; readonly name: string } | null;
}

/**
 * Reports from signed-in visitors. Nothing public changes from a report: the
 * reviewer checks an official source, corrects the record on the school's
 * admin page (which logs the change), then closes the report here.
 */
export default async function CorrectionsPage() {
  await requireAccess('/admin');
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('correction_reports')
    .select('id, topic, details, evidence_url, created_at, institutions(slug, name)')
    .eq('status', 'open')
    .order('created_at', { ascending: true })
    .limit(100);
  const reports = (data ?? []) as unknown as ReportRow[];

  return (
    <>
      <p className="mb-4">
        <Link href="/admin" className="font-semibold text-royal-ink underline">
          Admin
        </Link>
      </p>
      <PageTitle title="Correction reports">
        Check an official source before changing anything. Evidence links come from visitors: open them with care.
      </PageTitle>
      {error ? (
        <Notice tone="error" className="mb-8">
          Reports didn&apos;t load. Refresh to try again.
        </Notice>
      ) : null}
      <DashboardSection id="open" title={`Open (${reports.length})`}>
        {reports.length === 0 ? (
          <p>No open reports.</p>
        ) : (
          <ul className="space-y-6">
            {reports.map((r) => (
              <li key={r.id} className="space-y-3 border-2 border-rule p-4">
                <p className="font-semibold">
                  {r.institutions ? (
                    <Link href={`/admin/schools/${r.institutions.slug}`} className="text-royal-ink underline">
                      {r.institutions.name}
                    </Link>
                  ) : (
                    'Unlisted school'
                  )}{' '}
                  · {r.topic.replace('_', ' ')} · {formatRetrieved(r.created_at)}
                </p>
                <p className="whitespace-pre-line">{r.details}</p>
                {r.evidence_url ? <p className="break-all text-sm text-slate">Evidence given (not opened automatically): {r.evidence_url}</p> : null}
                <ResolveReportForm reportId={r.id} />
              </li>
            ))}
          </ul>
        )}
      </DashboardSection>
    </>
  );
}
