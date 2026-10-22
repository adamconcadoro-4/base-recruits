import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { ListingForm, ProgramForm } from '@/app/(app)/admin/schools/forms';
import { DashboardSection, PageTitle } from '@/components/app/section';
import { Notice } from '@/components/ui/notice';
import { StatusChip } from '@/components/ui/status-chip';
import { requireAccess } from '@/lib/auth/guard';
import { STATUS_LABELS, VERIFICATION_LABELS, formatRetrieved } from '@/lib/registry/labels';
import { SLUG_PATTERN } from '@/lib/registry/search-params';
import type { ProgramStatus, ProgramVerification } from '@/lib/registry/types';
import { createClient } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Correct a school' };

interface Institution {
  readonly id: string;
  readonly unitid: number;
  readonly slug: string;
  readonly name: string;
  readonly city: string | null;
  readonly state: string | null;
  readonly is_listed: boolean;
  readonly unlisted_reason: string | null;
}

interface Program {
  readonly status: ProgramStatus;
  readonly status_source: 'import' | 'admin';
  readonly season: string;
  readonly association_code: string;
  readonly division_code: string;
  readonly classification_label: string | null;
  readonly classification_other: string | null;
  readonly conference: string | null;
  readonly athletics_url: string | null;
  readonly roster_url: string | null;
  readonly questionnaire_url: string | null;
  readonly verification: ProgramVerification;
  readonly verification_source_url: string | null;
  readonly verified_at: string;
}

interface Revision {
  readonly id: number;
  readonly entity_type: string;
  readonly action: string;
  readonly reason: string | null;
  readonly import_job_id: string | null;
  readonly created_at: string;
  readonly before: Record<string, unknown> | null;
  readonly after: Record<string, unknown> | null;
}

const IGNORED = new Set(['created_at', 'updated_at', 'import_job_id', 'source_retrieved_at', 'retrieved_at', 'facts_retrieved_at', 'verified_at']);

function changedFields(before: Record<string, unknown> | null, after: Record<string, unknown> | null): string[] {
  if (!before || !after) return [];
  return Object.keys(after).filter((k) => !IGNORED.has(k) && JSON.stringify(before[k]) !== JSON.stringify(after[k]));
}

export default async function AdminSchoolPage({ params }: { readonly params: Promise<{ slug: string }> }) {
  await requireAccess('/admin');
  const { slug } = await params;
  if (!SLUG_PATTERN.test(slug)) notFound();
  const supabase = await createClient();
  const { data: institutionData } = await supabase
    .from('institutions')
    .select('id, unitid, slug, name, city, state, is_listed, unlisted_reason')
    .eq('slug', slug)
    .maybeSingle();
  if (!institutionData) notFound();
  const institution = institutionData as Institution;
  const [programResult, divisionsResult, revisionsResult] = await Promise.all([
    supabase
      .from('baseball_programs')
      .select('status, status_source, season, association_code, division_code, classification_label, classification_other, conference, athletics_url, roster_url, questionnaire_url, verification, verification_source_url, verified_at')
      .eq('institution_id', institution.id)
      .maybeSingle(),
    supabase.from('athletic_divisions').select('code, association_code, name').order('sort_order'),
    supabase
      .from('registry_revisions')
      .select('id, entity_type, action, reason, import_job_id, created_at, before, after')
      .eq('institution_id', institution.id)
      .order('id', { ascending: false })
      .limit(30),
  ]);
  const program = programResult.data as Program | null;
  const divisions = ((divisionsResult.data ?? []) as { code: string; association_code: string; name: string }[]).map((d) => ({
    code: d.code,
    association: d.association_code,
    name: d.name,
  }));
  const revisions = (revisionsResult.data ?? []) as Revision[];

  return (
    <>
      <p className="mb-4">
        <Link href="/admin/schools" className="font-semibold text-royal-ink underline">
          Schools and programs
        </Link>
      </p>
      <PageTitle title={institution.name}>
        {[institution.city, institution.state].filter(Boolean).join(', ')} · IPEDS {institution.unitid} ·{' '}
        {institution.is_listed ? (
          <Link href={`/schools/${institution.slug}`} className="font-semibold text-royal-ink underline">
            Public page
          </Link>
        ) : (
          'Hidden from public pages'
        )}
      </PageTitle>

      <div className="space-y-14">
        <DashboardSection
          id="program"
          title="Baseball program"
          description="Imports never overwrite a division you verified or a status you confirmed for the same season; they flag the difference in review instead."
        >
          {program ? (
            <>
              <div className="mb-5 flex flex-wrap gap-2">
                <StatusChip tone={program.status === 'active' ? 'neutral' : 'attention'}>{STATUS_LABELS[program.status]}</StatusChip>
                <StatusChip tone="neutral">{VERIFICATION_LABELS[program.verification].short}</StatusChip>
                {program.status_source === 'admin' ? <StatusChip tone="progress">Status set by an administrator</StatusChip> : null}
              </div>
              <p className="mb-5 text-sm text-slate">
                Reported to EADA for {program.season} as: {program.classification_label ?? 'no classification'}
                {program.classification_other ? ` (${program.classification_other})` : ''}. Last confirmed {formatRetrieved(program.verified_at)}.
              </p>
              <ProgramForm
                divisions={divisions}
                values={{
                  institutionId: institution.id,
                  slug: institution.slug,
                  status: program.status,
                  association: program.association_code,
                  division: program.division_code,
                  conference: program.conference,
                  athleticsUrl: program.athletics_url,
                  rosterUrl: program.roster_url,
                  questionnaireUrl: program.questionnaire_url,
                  verification: program.verification,
                  evidenceUrl: program.verification_source_url,
                }}
              />
            </>
          ) : (
            <Notice tone="info">This school has no baseball program record.</Notice>
          )}
        </DashboardSection>

        <DashboardSection id="listing" title="Public listing">
          {institution.is_listed ? null : (
            <Notice tone="attention" className="mb-4" title="Hidden from public pages">
              {institution.unlisted_reason}
            </Notice>
          )}
          <ListingForm institutionId={institution.id} slug={institution.slug} listed={institution.is_listed} />
        </DashboardSection>

        <DashboardSection id="history" title="Change history">
          {revisions.length === 0 ? (
            <p>No changes recorded.</p>
          ) : (
            <ul className="divide-y-2 divide-rule border-y-2 border-rule">
              {revisions.map((r) => {
                const fields = changedFields(r.before, r.after);
                return (
                  <li key={r.id} className="py-3 text-sm">
                    <p className="font-semibold">
                      {formatRetrieved(r.created_at)} · {r.entity_type.replace('_', ' ')} {r.action}
                      {r.import_job_id ? (
                        <>
                          {' '}
                          by{' '}
                          <Link href={`/admin/data/jobs/${r.import_job_id}`} className="text-royal-ink underline">
                            an import
                          </Link>
                        </>
                      ) : (
                        ' by an administrator'
                      )}
                    </p>
                    {fields.length ? <p className="text-slate">Changed: {fields.join(', ')}</p> : null}
                    {r.reason ? <p>“{r.reason}”</p> : null}
                  </li>
                );
              })}
            </ul>
          )}
        </DashboardSection>
      </div>
    </>
  );
}
