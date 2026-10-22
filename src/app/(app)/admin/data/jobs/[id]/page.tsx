import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { DecisionButton, JobButton, PublishForm } from '@/app/(app)/admin/data/forms';
import { CHANGE_LABELS, JOB_STATUS, type ChangeKind, type JobStatus } from '@/app/(app)/admin/data/job-status';
import { DashboardSection, PageTitle } from '@/components/app/section';
import { Notice } from '@/components/ui/notice';
import { StatusChip } from '@/components/ui/status-chip';
import { requireAccess } from '@/lib/auth/guard';
import { formatCount, formatRetrieved } from '@/lib/registry/labels';
import { createClient } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Review import' };

const PAGE = 50;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const KINDS = Object.keys(CHANGE_LABELS) as ChangeKind[];

interface Job {
  readonly id: string;
  readonly snapshot_name: string;
  readonly snapshot_sha256: string;
  readonly season: string;
  readonly admissions_term: string | null;
  readonly cost_year: string | null;
  readonly status: JobStatus;
  readonly counts: Record<string, unknown>;
  readonly sources: readonly { id: string; dataset: string; retrieved_at: string; sha256?: string }[];
  readonly created_at: string;
  readonly published_at: string | null;
  readonly publish_note: string | null;
  readonly restaged_from: string | null;
}

interface Row {
  readonly unitid: number;
  readonly record: { facts?: { name?: string; state?: string } } | null;
  readonly change: ChangeKind;
  readonly changes: Record<string, { old: unknown; new: unknown }>;
  readonly problems: string[];
  readonly source_issues: { code: string; detail: string }[];
  readonly decision: 'apply' | 'skip';
}

function show(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (Array.isArray(value)) return value.length ? value.join(', ') : '(none)';
  return String(value);
}

export default async function ImportJobPage({
  params,
  searchParams,
}: {
  readonly params: Promise<{ id: string }>;
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAccess('/admin');
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const query = await searchParams;
  const supabase = await createClient();
  const { data: jobData } = await supabase
    .from('data_import_jobs')
    .select('id, snapshot_name, snapshot_sha256, season, admissions_term, cost_year, status, counts, sources, created_at, published_at, publish_note, restaged_from')
    .eq('id', id)
    .maybeSingle();
  if (!jobData) notFound();
  const job = jobData as Job;
  const counts = job.counts as Record<string, number>;

  const requested = typeof query.change === 'string' && (KINDS as string[]).includes(query.change) ? (query.change as ChangeKind) : null;
  const kind: ChangeKind = requested ?? (KINDS.find((k) => (counts[k] ?? 0) > 0 && k !== 'unchanged') ?? 'unchanged');
  const page = Math.max(1, Math.min(1000, Number(query.page) || 1));

  const { data: rowData, count } = await supabase
    .from('data_import_rows')
    .select('unitid, record, change, changes, problems, source_issues, decision', { count: 'exact' })
    .eq('job_id', id)
    .eq('change', kind)
    .order('unitid')
    .range((page - 1) * PAGE, page * PAGE - 1);
  const rows = (rowData ?? []) as Row[];
  const missingIds = rows.filter((r) => !r.record).map((r) => r.unitid);
  const names = new Map<number, string>();
  if (missingIds.length) {
    const { data } = await supabase.from('institutions').select('unitid, name, state').in('unitid', missingIds);
    for (const i of (data ?? []) as { unitid: number; name: string; state: string | null }[]) names.set(i.unitid, `${i.name}${i.state ? `, ${i.state}` : ''}`);
  }
  const pages = Math.max(1, Math.ceil((count ?? 0) / PAGE));
  const status = JOB_STATUS[job.status];

  return (
    <>
      <p className="mb-4">
        <Link href="/admin/data" className="font-semibold text-royal-ink underline">
          School data
        </Link>
      </p>
      <PageTitle title={`Import: ${job.snapshot_name}`}>
        Season {job.season}
        {job.admissions_term ? ` · admissions ${job.admissions_term}` : ''}
        {job.cost_year ? ` · costs ${job.cost_year}` : ''} · started {formatRetrieved(job.created_at)}
      </PageTitle>
      <div className="mb-8 flex flex-wrap items-center gap-3">
        <StatusChip tone={status.tone}>{status.label}</StatusChip>
        {job.restaged_from ? (
          <Link href={`/admin/data/jobs/${job.restaged_from}`} className="text-sm font-semibold text-royal-ink underline">
            Restaged from an earlier import
          </Link>
        ) : null}
      </div>

      <div className="space-y-14">
        <DashboardSection id="summary" title="What would change">
          <ul className="flex flex-wrap gap-3" aria-label="Rows by kind of change">
            {KINDS.map((k) => (
              <li key={k}>
                <Link
                  href={`/admin/data/jobs/${id}?change=${k}`}
                  aria-current={k === kind ? 'true' : undefined}
                  className={`inline-block border-2 px-3 py-1.5 font-semibold ${k === kind ? 'border-navy bg-navy text-white' : 'border-rule text-navy underline'}`}
                >
                  {CHANGE_LABELS[k]}: {formatCount(counts[k] ?? 0)}
                </Link>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-sm text-slate">
            {formatCount(counts.with_source_issues ?? 0)} records carry a note from the pipeline;{' '}
            {formatCount(counts.with_notes ?? 0)} keep an earlier administrator decision.
          </p>
          <ul className="mt-3 space-y-1 text-sm text-slate">
            {job.sources.map((s) => (
              <li key={s.id}>
                {s.id === 'eada' ? 'EADA' : 'College Scorecard'}: {s.dataset}, retrieved {formatRetrieved(s.retrieved_at)}
                {s.sha256 ? <span className="font-mono break-all"> · sha256 {s.sha256}</span> : null}
              </li>
            ))}
            <li>
              Snapshot file sha256 <span className="font-mono break-all">{job.snapshot_sha256}</span>
            </li>
          </ul>
        </DashboardSection>

        <DashboardSection id="rows" title={`${CHANGE_LABELS[kind]} (${formatCount(count ?? 0)})`}>
          {rows.length === 0 ? (
            <p>None.</p>
          ) : (
            <ul className="divide-y-2 divide-rule border-y-2 border-rule">
              {rows.map((row) => {
                const name = row.record?.facts?.name ? `${row.record.facts.name}${row.record.facts.state ? `, ${row.record.facts.state}` : ''}` : (names.get(row.unitid) ?? `Unit ${row.unitid}`);
                const changes = Object.entries(row.changes ?? {});
                return (
                  <li key={row.unitid} className="grid gap-3 py-4 md:grid-cols-[1fr_auto]" data-testid={`import-row-${row.unitid}`}>
                    <div className="min-w-0 space-y-2">
                      <p className="font-semibold">
                        {name} <span className="font-normal text-slate">· IPEDS {row.unitid}</span>
                      </p>
                      {changes.length ? (
                        <ul className="space-y-1 text-sm">
                          {changes.map(([path, diff]) => (
                            <li key={path} className="break-words">
                              <span className="font-mono">{path}</span>: {show(diff.old)} → <strong>{show(diff.new)}</strong>
                            </li>
                          ))}
                        </ul>
                      ) : null}
                      {row.problems.length ? (
                        <ul className="space-y-1 text-sm text-attention">
                          {row.problems.map((p) => (
                            <li key={p}>{p}</li>
                          ))}
                        </ul>
                      ) : null}
                      {row.source_issues.length ? (
                        <ul className="space-y-1 text-sm text-slate">
                          {row.source_issues.map((i) => (
                            <li key={i.code}>Pipeline note: {i.detail}</li>
                          ))}
                        </ul>
                      ) : null}
                    </div>
                    <div className="space-y-1 text-sm">
                      <p className="font-semibold">{row.decision === 'apply' ? 'Will be applied' : 'Will be skipped'}</p>
                      {job.status === 'staged' && row.change !== 'unchanged' && row.change !== 'invalid' ? (
                        <DecisionButton
                          jobId={job.id}
                          unitid={row.unitid}
                          decision={row.decision === 'apply' ? 'skip' : 'apply'}
                          label={row.decision === 'apply' ? `Skip ${name}` : `Apply ${name}`}
                        />
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          {pages > 1 ? (
            <nav aria-label="Row pages" className="mt-4 flex items-center justify-between gap-4">
              {page > 1 ? (
                <Link href={`/admin/data/jobs/${id}?change=${kind}&page=${page - 1}`} className="font-semibold text-royal-ink underline">
                  Previous
                </Link>
              ) : (
                <span />
              )}
              <span className="text-slate">
                Page {page} of {pages}
              </span>
              {page < pages ? (
                <Link href={`/admin/data/jobs/${id}?change=${kind}&page=${page + 1}`} className="font-semibold text-royal-ink underline">
                  Next
                </Link>
              ) : (
                <span />
              )}
            </nav>
          ) : null}
        </DashboardSection>

        <DashboardSection id="decide" title="Decide">
          {job.status === 'staged' ? (
            <div className="grid gap-10 lg:grid-cols-[2fr_1fr]">
              <PublishForm jobId={job.id} />
              <JobButton jobId={job.id} kind="discard" />
            </div>
          ) : job.status === 'staging' ? (
            <div className="space-y-4">
              <Notice tone="attention">This import stopped before it was ready for review.</Notice>
              <JobButton jobId={job.id} kind="discard" />
            </div>
          ) : (
            <div className="space-y-4">
              <p>
                {job.status === 'published'
                  ? `Published ${formatRetrieved(job.published_at)}${job.publish_note ? `: “${job.publish_note}”` : '.'}`
                  : 'This import was discarded; nothing from it was published.'}{' '}
                Staging it again compares its records with the registry as it is now, so it can be republished (for
                example, to roll back a later import).
              </p>
              <JobButton jobId={job.id} kind="restage" />
            </div>
          )}
        </DashboardSection>
      </div>
    </>
  );
}
