import type { Metadata } from 'next';

import { AffiliationForm } from '@/app/(app)/coach/verification/affiliation-form';
import { CoachStatusSummary } from '@/components/app/coach-status';
import { DashboardSection, PageTitle } from '@/components/app/section';
import { Notice } from '@/components/ui/notice';
import { requireAccess } from '@/lib/auth/guard';
import type { CoachVerificationStatus } from '@/lib/auth/coach-verification';
import { formatDate } from '@/lib/family/family';
import { createClient } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Coach verification' };

const CAN_SUBMIT: ReadonlySet<CoachVerificationStatus> = new Set([
  'email_verified',
  'more_info_requested',
  'reverification_required',
]);

interface EventRow {
  readonly id: number;
  readonly to_status: CoachVerificationStatus;
  readonly note: string | null;
  readonly actor_kind: 'system' | 'coach' | 'admin';
  readonly created_at: string;
}

export default async function CoachVerificationPage() {
  const account = await requireAccess('/coach/verification');
  const verified = account.viewer.kind === 'signed_in' && account.viewer.verifiedCoach;
  const coach = account.coach;

  const supabase = await createClient();
  const { data } = await supabase
    .from('coach_verification_events')
    .select('id, to_status, note, actor_kind, created_at')
    .eq('coach_id', account.userId ?? '')
    .eq('visible_to_coach', true)
    .order('created_at', { ascending: false })
    .limit(20);
  const events = (data ?? []) as EventRow[];

  // A verified status that no longer grants access (for example after an email
  // change) also needs fresh evidence.
  const canSubmit =
    coach !== null && (CAN_SUBMIT.has(coach.verification_status) || (coach.verification_status === 'verified' && !verified));

  return (
    <>
      <PageTitle title="Coach verification">
        We confirm your coaching role from your program&apos;s official staff page. Your institutional email alone
        doesn&apos;t verify you.
      </PageTitle>
      <div className="space-y-14">
        <DashboardSection id="status" title="Status">
          {coach ? <CoachStatusSummary coach={coach} verified={verified} /> : <Notice tone="error">No coach record found.</Notice>}
        </DashboardSection>

        {canSubmit && coach ? (
          <DashboardSection id="submit" title="Send your staff listing">
            <AffiliationForm
              defaults={{
                institutionName: coach.institution_name_claimed ?? '',
                coachingTitle: coach.coaching_title ?? '',
                staffDirectoryUrl: coach.staff_directory_url ?? '',
              }}
            />
          </DashboardSection>
        ) : null}

        {coach?.verification_status === 'affiliation_under_review' ? (
          <DashboardSection id="submitted" title="What you sent">
            <dl className="grid max-w-2xl gap-3 sm:grid-cols-[12rem_1fr]">
              <dt className="font-semibold">School</dt>
              <dd>{coach.institution_name_claimed}</dd>
              <dt className="font-semibold">Title</dt>
              <dd>{coach.coaching_title}</dd>
              <dt className="font-semibold">Staff page</dt>
              <dd className="break-all">{coach.staff_directory_url}</dd>
            </dl>
          </DashboardSection>
        ) : null}

        <DashboardSection id="history" title="History">
          {events.length > 0 ? (
            <ol className="space-y-4">
              {events.map((event) => (
                <li key={event.id} className="border-l-4 border-rule pl-4">
                  <p className="text-sm text-slate">{formatDate(event.created_at)}</p>
                  <p>{event.note ?? 'Status updated.'}</p>
                </li>
              ))}
            </ol>
          ) : (
            <p>No updates yet.</p>
          )}
        </DashboardSection>
      </div>
    </>
  );
}
