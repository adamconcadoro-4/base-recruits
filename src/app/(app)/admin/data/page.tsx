import type { Metadata } from 'next';
import Link from 'next/link';

import { StageSnapshotForm } from '@/app/(app)/admin/data/forms';
import { JOB_STATUS, type JobStatus } from '@/app/(app)/admin/data/job-status';
import { DashboardSection, PageTitle } from '@/components/app/section';
import { Notice } from '@/components/ui/notice';
import { StatusChip } from '@/components/ui/status-chip';
import { requireAccess } from '@/lib/auth/guard';
import { formatCount, formatRetrieved } from '@/lib/registry/labels';
import { registryCoverage } from '@/lib/registry/queries';
import { listSnapshots } from '@/lib/registry/snapshot';
import { createClient } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'School data' };

interface JobRow {
  readonly id: string;
  readonly snapshot_name: string;
  readonly season: string;
  readonly status: JobStatus;
  readonly counts: Record<string, unknown>;
  readonly created_at: string;
  readonly published_at: string | null;
  readonly restaged_from: string | null;
}

interface SourceRow {
  readonly id: string;
  readonly name: string;
  readonly publisher: string;
  readonly homepage_url: string | null;
  readonly access_method: string;
  readonly terms_note: string;
}


export default async function AdminDataPage() {
  await requireAccess('/admin');
  const supabase = await createClient();
  const [jobsResult, sourcesResult, coverage, snapshots] = await Promise.all([
    supabase
      .from('data_import_jobs')
      .select('id, snapshot_name, season, status, counts, created_at, published_at, restaged_from')
      .order('created_at', { ascending: false })
      .limit(30),
    supabase.from('data_sources').select('id, name, publisher, homepage_url, access_method, terms_note').order('id'),
    registryCoverage(),
    listSnapshots(),
  ]);
  const jobs = (jobsResult.data ?? []) as JobRow[];
  const sources = (sourcesResult.data ?? []) as SourceRow[];
  const openJob = jobs.find((j) => j.status === 'staging' || j.status === 'staged');

  return (
    <>
      <PageTitle title="School data">
        Stage a reviewed snapshot, check what would change, then publish. Nothing reaches the public registry without a
        publish from this page. <Link href="/admin/schools" className="font-semibold text-royal-ink underline">Correct a school or program</Link>
      </PageTitle>
      {jobsResult.error || sourcesResult.error ? (
        <Notice tone="error" className="mb-8">
          Some of this page didn&apos;t load. Refresh to try again.
        </Notice>
      ) : null}

      <div className="space-y-14">
        <DashboardSection id="coverage" title="Coverage">
          {coverage ? (
            <dl className="grid gap-x-8 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
              {[
                ['Active programs', coverage.active_programs],
                ['Not in the latest report', coverage.programs_by_status.not_reported ?? 0],
                ['Discontinued or suspended (admin)', (coverage.programs_by_status.inactive ?? 0) + (coverage.programs_by_status.suspended ?? 0)],
                ['With admission rate', coverage.with_admission_rate],
                ['With SAT or ACT ranges', coverage.with_test_scores],
                ['With published cost', coverage.with_cost_of_attendance],
                ['Four-year, no admissions data', coverage.four_year_without_admissions],
                ['Division only from the federal report', coverage.federal_report_only],
                ['Conference verified', coverage.with_conference],
              ].map(([label, value]) => (
                <div key={String(label)}>
                  <dt className="text-sm font-semibold text-slate">{label}</dt>
                  <dd className="text-2xl font-semibold">{formatCount(Number(value))}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <p>Coverage didn&apos;t load.</p>
          )}
        </DashboardSection>

        <DashboardSection
          id="snapshots"
          title="Snapshots ready to stage"
          description="Built from the official sources by the data-refresh workflow and reviewed in a pull request before they ship with the app."
        >
          {openJob ? (
            <Notice tone="attention" className="mb-5">
              An import is {openJob.status === 'staging' ? 'being staged' : 'waiting for review'}.{' '}
              <Link href={`/admin/data/jobs/${openJob.id}`} className="font-semibold underline">
                Open it
              </Link>{' '}
              to publish or discard it first.
            </Notice>
          ) : null}
          {snapshots.length === 0 ? (
            <p>No snapshot files are bundled with this build.</p>
          ) : (
            <ul className="space-y-5">
              {snapshots.map((s) => (
                <li key={s.name} className="border-2 border-rule p-4">
                  <p className="text-lg font-semibold">{s.name}</p>
                  {s.ok ? (
                    <>
                      <p className="text-sm text-slate">
                        Season {s.season} · {formatCount(s.records ?? 0)} programs · built {formatRetrieved(s.generatedAt)} · file
                        SHA-256 <span className="font-mono break-all">{s.fileSha256}</span>
                      </p>
                      {openJob?.status === 'staging' ? null : (
                        <div className="mt-3">
                          <StageSnapshotForm name={s.name} />
                        </div>
                      )}
                    </>
                  ) : (
                    <Notice tone="error">{s.problem}</Notice>
                  )}
                </li>
              ))}
            </ul>
          )}
        </DashboardSection>

        <DashboardSection id="imports" title="Imports">
          {jobs.length === 0 ? (
            <p>No imports yet.</p>
          ) : (
            <ul className="divide-y-2 divide-rule border-y-2 border-rule">
              {jobs.map((job) => (
                <li key={job.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <div>
                    <Link href={`/admin/data/jobs/${job.id}`} className="font-semibold text-royal-ink underline">
                      {job.snapshot_name}
                    </Link>
                    <span className="block text-sm text-slate">
                      Season {job.season} · started {formatRetrieved(job.created_at)}
                      {job.published_at ? ` · published ${formatRetrieved(job.published_at)}` : ''}
                      {job.restaged_from ? ' · restaged from an earlier import' : ''}
                    </span>
                  </div>
                  <StatusChip tone={JOB_STATUS[job.status].tone}>{JOB_STATUS[job.status].label}</StatusChip>
                </li>
              ))}
            </ul>
          )}
        </DashboardSection>

        <DashboardSection id="sources" title="Source registry">
          <ul className="space-y-4">
            {sources.map((s) => (
              <li key={s.id}>
                <p className="font-semibold">
                  {s.name} <span className="font-normal text-slate">({s.publisher})</span>
                </p>
                <p className="text-sm">{s.access_method}</p>
                <p className="text-sm text-slate">{s.terms_note}</p>
              </li>
            ))}
          </ul>
        </DashboardSection>
      </div>
    </>
  );
}
