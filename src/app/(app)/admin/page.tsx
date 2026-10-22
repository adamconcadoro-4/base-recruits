import type { Metadata } from 'next';

import { ReviewForm } from '@/app/(app)/admin/review-form';
import { DashboardSection, PageTitle } from '@/components/app/section';
import { Notice } from '@/components/ui/notice';
import { StatusChip } from '@/components/ui/status-chip';
import { requireAccess } from '@/lib/auth/guard';
import { describeCoachStatus, type CoachVerificationStatus } from '@/lib/auth/coach-verification';
import { formatDate } from '@/lib/family/family';
import { createClient } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Admin' };

interface QueueRow {
  readonly user_id: string;
  readonly work_email: string;
  readonly email_domain: string;
  readonly institution_name_claimed: string | null;
  readonly coaching_title: string | null;
  readonly staff_directory_url: string | null;
  readonly affiliation_submitted_at: string | null;
}

interface RecentRow {
  readonly user_id: string;
  readonly work_email: string;
  readonly verification_status: CoachVerificationStatus;
  readonly status_changed_at: string;
}

/** Shows the URL as text unless it is a well-formed https link. */
function StaffLink({ url }: { readonly url: string | null }) {
  if (!url) return <span>Not provided</span>;
  let safe = false;
  try {
    safe = new URL(url).protocol === 'https:';
  } catch {
    safe = false;
  }
  return safe ? (
    <a href={url} target="_blank" rel="noopener noreferrer nofollow" className="break-all font-semibold text-royal-ink underline">
      {url}
    </a>
  ) : (
    <span className="break-all">{url}</span>
  );
}

export default async function AdminPage() {
  await requireAccess('/admin');
  const supabase = await createClient();
  const [queueResult, recentResult] = await Promise.all([
    supabase
      .from('coaches')
      .select('user_id, work_email, email_domain, institution_name_claimed, coaching_title, staff_directory_url, affiliation_submitted_at')
      .eq('verification_status', 'affiliation_under_review')
      .order('affiliation_submitted_at', { ascending: true })
      .limit(50),
    supabase
      .from('coaches')
      .select('user_id, work_email, verification_status, status_changed_at')
      .neq('verification_status', 'affiliation_under_review')
      .order('status_changed_at', { ascending: false })
      .limit(20),
  ]);
  const queue = (queueResult.data ?? []) as QueueRow[];
  const recent = (recentResult.data ?? []) as RecentRow[];

  return (
    <>
      <PageTitle title="Admin">Every decision is recorded in the audit log with your account.</PageTitle>
      {queueResult.error || recentResult.error ? (
        <Notice tone="error" className="mb-8">
          The review queue didn&apos;t load. Refresh to try again.
        </Notice>
      ) : null}
      <div className="space-y-14">
        <DashboardSection
          id="coach-queue"
          title="Coach verification queue"
          description="Approve only when the official staff page lists this person in a baseball role. The email domain alone is never enough."
          aside={<StatusChip tone={queue.length > 0 ? 'attention' : 'neutral'}>{`${queue.length} waiting`}</StatusChip>}
        >
          {queue.length > 0 ? (
            <ul className="space-y-8">
              {queue.map((coach) => (
                <li key={coach.user_id} className="grid gap-6 border-2 border-navy p-5 lg:grid-cols-2">
                  <dl className="grid gap-x-4 gap-y-2 sm:grid-cols-[9rem_1fr]">
                    <dt className="font-semibold">Work email</dt>
                    <dd className="break-all">{coach.work_email}</dd>
                    <dt className="font-semibold">School</dt>
                    <dd>{coach.institution_name_claimed ?? 'Not provided'}</dd>
                    <dt className="font-semibold">Title</dt>
                    <dd>{coach.coaching_title ?? 'Not provided'}</dd>
                    <dt className="font-semibold">Staff page</dt>
                    <dd>
                      <StaffLink url={coach.staff_directory_url} />
                    </dd>
                    <dt className="font-semibold">Submitted</dt>
                    <dd>{coach.affiliation_submitted_at ? formatDate(coach.affiliation_submitted_at) : 'Unknown'}</dd>
                  </dl>
                  <ReviewForm coachId={coach.user_id} coachLabel={coach.work_email} />
                </li>
              ))}
            </ul>
          ) : (
            <p>No coaches are waiting for review.</p>
          )}
        </DashboardSection>

        <DashboardSection id="recent" title="Recent coach status changes">
          {recent.length > 0 ? (
            <ul className="divide-y-2 divide-rule border-y-2 border-rule">
              {recent.map((coach) => (
                <li key={coach.user_id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <span className="break-all">{coach.work_email}</span>
                  <span className="text-sm text-slate">
                    {describeCoachStatus(coach.verification_status).label}, {formatDate(coach.status_changed_at)}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p>No coach accounts yet.</p>
          )}
        </DashboardSection>
      </div>
    </>
  );
}
