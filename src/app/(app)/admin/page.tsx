import type { Metadata } from 'next';
import Link from 'next/link';

import { setAssessmentSwitchesAction, setSeamstateSettingsAction } from '@/app/(app)/admin/actions';
import { ReviewForm } from '@/app/(app)/admin/review-form';
import { ActionForm } from '@/components/assessment/action-form';
import { DashboardSection, PageTitle } from '@/components/app/section';
import { TextField } from '@/components/ui/field';
import { Notice } from '@/components/ui/notice';
import { StatusChip } from '@/components/ui/status-chip';
import { assessmentSiteEnabled } from '@/config/assessment';
import { requireAccess } from '@/lib/auth/guard';
import { describeCoachStatus, type CoachVerificationStatus } from '@/lib/auth/coach-verification';
import { reviewFlags, staffUrlProblem } from '@/lib/auth/staff-url';
import { formatDate } from '@/lib/family/family';
import { seamstateReadiness } from '@/lib/seamstate/server/config';
import { getSeamstateSwitches } from '@/lib/seamstate/server/queries';
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

/**
 * Shows the site the link really opens (ASCII host) first, then the full link.
 * Flags internationalized hosts and staff pages on a different site from the
 * work email, which are common ways to disguise a fake listing.
 */
function StaffLink({ url, emailDomain }: { readonly url: string | null; readonly emailDomain: string }) {
  if (!url) return <span>Not provided</span>;
  const flags = reviewFlags(url, emailDomain);
  const safe = flags.host !== null && staffUrlProblem(url) === null;
  return (
    <div className="space-y-2">
      <p>
        <span className="font-semibold">Site: </span>
        <span className="break-all">{flags.host ?? 'Not a valid link'}</span>
      </p>
      {safe ? (
        <a href={url} target="_blank" rel="noopener noreferrer nofollow" className="block break-all text-sm font-semibold text-royal-ink underline">
          {url}
        </a>
      ) : (
        <p className="break-all text-sm">{url}</p>
      )}
      <div className="flex flex-wrap gap-2">
        {flags.internationalized ? <StatusChip tone="blocked">Look-alike characters in the site name</StatusChip> : null}
        {flags.domainMismatch ? <StatusChip tone="attention">Different site from the work email</StatusChip> : null}
        {!safe ? <StatusChip tone="blocked">Not a plain https link</StatusChip> : null}
      </div>
    </div>
  );
}

export default async function AdminPage() {
  await requireAccess('/admin');
  const supabase = await createClient();
  const [queueResult, recentResult, switchesResult] = await Promise.all([
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
    supabase.rpc('assessment_switches'),
  ]);
  const seamstate = assessmentSiteEnabled() ? await getSeamstateSwitches() : null;
  const readiness = seamstateReadiness();
  const switchRow = (Array.isArray(switchesResult.data) ? switchesResult.data[0] : switchesResult.data) as
    | { enabled?: boolean; video_enabled?: boolean }
    | null;
  const queue = (queueResult.data ?? []) as QueueRow[];
  const recent = (recentResult.data ?? []) as RecentRow[];

  return (
    <>
      <PageTitle title="Admin">
        Every decision is recorded in the audit log with your account.{' '}
        <Link href="/admin/data" className="font-semibold text-royal-ink underline">
          School data and imports
        </Link>{' '}
        ·{' '}
        <Link href="/admin/corrections" className="font-semibold text-royal-ink underline">
          Correction reports
        </Link>
      </PageTitle>
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
                    <dd className="break-all">
                      {coach.work_email}
                      <span className="block text-sm text-slate">Domain: {coach.email_domain}</span>
                    </dd>
                    <dt className="font-semibold">School</dt>
                    <dd>{coach.institution_name_claimed ?? 'Not provided'}</dd>
                    <dt className="font-semibold">Title</dt>
                    <dd>{coach.coaching_title ?? 'Not provided'}</dd>
                    <dt className="font-semibold">Staff page</dt>
                    <dd>
                      <StaffLink url={coach.staff_directory_url} emailDomain={coach.email_domain} />
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

        {assessmentSiteEnabled() ? (
          <DashboardSection
            id="assessment"
            title="Assessment switches"
            description="Assessment shows on the site only when the site switch is on in the deployment settings. These database switches decide whether anything can be recorded and whether video can be uploaded. Keep video off until the legal review of minors' video is complete."
          >
            {switchesResult.error ? (
              <Notice tone="error">The switches didn&apos;t load. Refresh to try again.</Notice>
            ) : (
              <ActionForm action={setAssessmentSwitchesAction} submitLabel="Save switches" variant="secondary">
                <label className="flex min-h-11 items-center gap-3">
                  <input type="checkbox" name="enabled" defaultChecked={Boolean(switchRow?.enabled)} className="size-5" />
                  Assessment is open (people can record and publish)
                </label>
                <label className="flex min-h-11 items-center gap-3">
                  <input type="checkbox" name="video_enabled" defaultChecked={Boolean(switchRow?.video_enabled)} className="size-5" />
                  Video uploads are on
                </label>
              </ActionForm>
            )}
          </DashboardSection>
        ) : null}

        {assessmentSiteEnabled() ? (
          <DashboardSection
            id="seamstate"
            title="SeamState swing analysis"
            description="Each analysis sends up to 24 still frames to the AI provider and is billed by the provider. The monthly limit stops new requests once it is reached; it starts at 0. Athletes under 18 stay excluded until you include them below."
          >
            <div className="space-y-4">
              {readiness.missing.length > 0 ? (
                <Notice tone="attention" title="Not ready to run">
                  Still to set up in the deployment settings:{' '}
                  {readiness.missing.map((item) => (item === 'ai_provider' ? 'the AI provider key' : 'the video worker address and signing secret')).join(' and ')}.
                  People see “Swing analysis isn’t available yet” until then.
                </Notice>
              ) : null}
              {seamstate ? (
                <>
                  <p>
                    Analyses requested this month: {seamstate.usedThisMonth ?? 0} of {seamstate.monthlyLimit}.
                  </p>
                  <ActionForm action={setSeamstateSettingsAction} submitLabel="Save SeamState settings" variant="secondary">
                    <label className="flex min-h-11 items-center gap-3">
                      <input type="checkbox" name="seamstate_enabled" defaultChecked={seamstate.enabled} className="size-5" />
                      SeamState analysis is on (needs Assessment and video uploads on)
                    </label>
                    <label className="flex min-h-11 items-center gap-3">
                      <input type="checkbox" name="minors_enabled" defaultChecked={seamstate.minorsEnabled} className="size-5" />
                      Include athletes under 18 (only after counsel has reviewed minors&apos; footage going to the AI provider)
                    </label>
                    <div className="grid max-w-xl gap-4 sm:grid-cols-2">
                      <TextField id="daily_limit" name="daily_limit" type="number" min={0} max={100} label="Analyses per person per day" defaultValue={seamstate.dailyLimit} />
                      <TextField id="monthly_limit" name="monthly_limit" type="number" min={0} max={100000} label="Analyses per month, site-wide" defaultValue={seamstate.monthlyLimit} />
                    </div>
                  </ActionForm>
                </>
              ) : (
                <Notice tone="error">The SeamState settings didn&apos;t load. Refresh to try again.</Notice>
              )}
            </div>
          </DashboardSection>
        ) : null}

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
