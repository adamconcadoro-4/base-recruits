import type { Metadata } from 'next';
import Link from 'next/link';

import { DashboardSection, PageTitle } from '@/components/app/section';
import { buttonStyles } from '@/components/ui/button';
import { TextField } from '@/components/ui/field';
import { Notice } from '@/components/ui/notice';
import { StatusChip } from '@/components/ui/status-chip';
import { requireAccess } from '@/lib/auth/guard';
import { STATUS_LABELS, VERIFICATION_LABELS } from '@/lib/registry/labels';
import type { ProgramStatus, ProgramVerification } from '@/lib/registry/types';
import { createClient } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Schools and programs' };

const QUEUES = {
  other: 'Division reported as "Other"',
  federal: 'Not yet checked by hand',
  not_reported: 'Not in the latest report',
  unlisted: 'Hidden from public pages',
} as const;
type Queue = keyof typeof QUEUES;

interface Row {
  readonly slug: string;
  readonly name: string;
  readonly state: string | null;
  readonly is_listed: boolean;
  readonly baseball_programs: { status: ProgramStatus; division_code: string; verification: ProgramVerification; classification_other: string | null } | null;
}

export default async function AdminSchoolsPage({
  searchParams,
}: {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAccess('/admin');
  const query = await searchParams;
  const q = typeof query.q === 'string' ? query.q.trim().slice(0, 100) : '';
  const queue = typeof query.queue === 'string' && query.queue in QUEUES ? (query.queue as Queue) : null;

  let rows: Row[] = [];
  let failed = false;
  if (q || queue) {
    const supabase = await createClient();
    let request = supabase
      .from('institutions')
      .select('slug, name, state, is_listed, baseball_programs!inner(status, division_code, verification, classification_other)')
      .order('name')
      .limit(100);
    if (q) request = request.ilike('name', `%${q.replace(/[%_\\]/g, (c) => `\\${c}`)}%`);
    if (queue === 'other') request = request.eq('baseball_programs.division_code', 'other');
    if (queue === 'federal') request = request.eq('baseball_programs.verification', 'federal_report');
    if (queue === 'not_reported') request = request.eq('baseball_programs.status', 'not_reported');
    if (queue === 'unlisted') request = request.eq('is_listed', false);
    const { data, error } = await request;
    failed = Boolean(error);
    rows = (data ?? []) as unknown as Row[];
  }

  return (
    <>
      <p className="mb-4">
        <Link href="/admin/data" className="font-semibold text-royal-ink underline">
          School data
        </Link>
      </p>
      <PageTitle title="Schools and programs">Find a record to correct against an official page, or to hide from public pages.</PageTitle>
      <div className="space-y-14">
        <DashboardSection id="find" title="Find a school">
          <form method="get" action="/admin/schools" className="flex max-w-2xl flex-wrap items-end gap-4">
            <TextField id="admin-q" name="q" label="School name" defaultValue={q} className="min-w-64 flex-1" />
            <button type="submit" className={buttonStyles({ variant: 'primary' })}>
              Search
            </button>
          </form>
          <ul className="mt-5 flex flex-wrap gap-3" aria-label="Review queues">
            {(Object.keys(QUEUES) as Queue[]).map((key) => (
              <li key={key}>
                <Link
                  href={`/admin/schools?queue=${key}`}
                  aria-current={key === queue ? 'true' : undefined}
                  className={`inline-block border-2 px-3 py-1.5 font-semibold ${key === queue ? 'border-navy bg-navy text-white' : 'border-rule text-navy underline'}`}
                >
                  {QUEUES[key]}
                </Link>
              </li>
            ))}
          </ul>
        </DashboardSection>

        {q || queue ? (
          <DashboardSection id="matches" title={`Matches (${rows.length}${rows.length === 100 ? '+' : ''})`}>
            {failed ? <Notice tone="error">The search didn&apos;t load. Try again.</Notice> : null}
            {rows.length === 0 && !failed ? <p>No matching records.</p> : null}
            <ul className="divide-y-2 divide-rule border-y-2 border-rule">
              {rows.map((row) => (
                <li key={row.slug} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <div>
                    <Link href={`/admin/schools/${row.slug}`} className="font-semibold text-royal-ink underline">
                      {row.name}
                      {row.state ? `, ${row.state}` : ''}
                    </Link>
                    {row.baseball_programs?.classification_other ? (
                      <span className="block text-sm text-slate">Reported as: {row.baseball_programs.classification_other}</span>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {!row.is_listed ? <StatusChip tone="blocked">Hidden</StatusChip> : null}
                    {row.baseball_programs ? (
                      <>
                        <StatusChip tone={row.baseball_programs.status === 'active' ? 'neutral' : 'attention'}>
                          {STATUS_LABELS[row.baseball_programs.status]}
                        </StatusChip>
                        <StatusChip tone="neutral">{VERIFICATION_LABELS[row.baseball_programs.verification].short}</StatusChip>
                      </>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          </DashboardSection>
        ) : null}
      </div>
    </>
  );
}
