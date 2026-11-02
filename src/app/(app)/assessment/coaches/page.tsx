import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import { CoachCodeForm } from '@/app/(app)/assessment/coaches/coach-code-form';
import { AthleteComparisonGroups, GuardianComparisonRequests } from '@/app/(app)/assessment/coaches/comparison-groups';
import {
  approveCoachLinkAction,
  cancelCoachCodeAction,
  declineCoachLinkAction,
  endCoachLinkAction,
  redeemCoachCodeAction,
  revokeShareAction,
  shareReportsWithCoachAction,
  shareWithFamilyAction,
} from '@/app/(app)/assessment/connection-actions';
import { DashboardSection, PageTitle } from '@/components/app/section';
import { ActionForm } from '@/components/assessment/action-form';
import { formatDateTime } from '@/components/assessment/result-format';
import { TextField } from '@/components/ui/field';
import { Notice } from '@/components/ui/notice';
import { StatusChip, type ChipTone } from '@/components/ui/status-chip';
import { listCoachLinks, type CoachLinkRow } from '@/lib/assessment/server/queries';
import { getAccount } from '@/lib/auth/account';
import { RELATIONSHIP_LABELS } from '@/lib/family/family';
import { createClient } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Connections' };

const ACCESS: Readonly<Record<CoachLinkRow['access'], { label: string; tone: ChipTone }>> = {
  pending_athlete_approval: { label: 'Waiting for the athlete to approve', tone: 'attention' },
  awaiting_guardian: { label: 'Waiting for a parent or guardian to approve', tone: 'attention' },
  active: { label: 'Connected', tone: 'positive' },
  declined: { label: 'Declined', tone: 'neutral' },
  ended: { label: 'Ended', tone: 'neutral' },
};

interface FamilyAccess {
  readonly link_id: string;
  readonly guardian_name: string | null;
  readonly relationship: keyof typeof RELATIONSHIP_LABELS;
  readonly grant_id: string | null;
  readonly in_effect: boolean;
}

interface ReportShare {
  readonly grant_id: string;
  readonly coach_name: string | null;
  readonly status: string;
  readonly in_effect: boolean;
  readonly created_at: string;
  readonly expires_at: string | null;
}

interface OpenInvite {
  readonly invite_id: string;
  readonly expires_at: string;
}

export default async function ConnectionsPage() {
  const account = await getAccount();
  const isAthlete = account.roles.includes('athlete');
  const isDevelopmentCoach = account.roles.includes('development_coach');
  const supabase = await createClient();
  const [links, invites, family, shares] = await Promise.all([
    listCoachLinks(),
    isAthlete ? supabase.rpc('my_development_coach_invites') : Promise.resolve({ data: [], error: null }),
    isAthlete ? supabase.rpc('assessment_family_access') : Promise.resolve({ data: [], error: null }),
    isAthlete ? supabase.rpc('my_assessment_report_shares') : Promise.resolve({ data: [], error: null }),
  ]);
  const visibleLinks = links.data.filter((link) => link.access !== 'declined');
  const athleteLinks = visibleLinks.filter((link) => link.my_side === 'athlete');
  const coachLinks = visibleLinks.filter((link) => link.my_side === 'coach');
  const guardianLinks = visibleLinks.filter((link) => link.my_side === 'guardian');
  const openInvites = (invites.data ?? []) as OpenInvite[];
  const familyRows = (family.data ?? []) as FamilyAccess[];
  const shareRows = ((shares.data ?? []) as ReportShare[]).filter((share) => share.status === 'active' || share.status === 'pending_guardian');

  return (
    <>
      <PageTitle title="Connections">Who can see and work on assessments, and what is shared.</PageTitle>
      {links.failed ? (
        <Notice tone="error" className="mb-8">
          Connections didn&apos;t load. Refresh to try again.
        </Notice>
      ) : null}
      <div className="space-y-14">
        {isAthlete ? (
          <>
            <DashboardSection
              id="development-coach"
              title="Your development coach"
              description="A development coach — a hitting or pitching instructor you work with — can review your clips, rate what they see, set targets and approve training plans. They can't see your recruiting profile or messages."
            >
              <div className="space-y-6">
                <CoachCodeForm />
                {openInvites.length > 0 ? (
                  <div>
                    <h3 className="font-semibold">Open codes</h3>
                    <ul className="mt-2 space-y-2">
                      {openInvites.map((invite) => (
                        <li key={invite.invite_id} className="flex flex-wrap items-center gap-4">
                          <span>Expires {formatDateTime(invite.expires_at)}</span>
                          <ActionForm action={cancelCoachCodeAction} fields={{ inviteId: invite.invite_id }} submitLabel="Cancel code" size="sm" variant="quiet" />
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                <LinkList
                  links={athleteLinks}
                  empty="No development coach connected."
                  render={(link) => (
                    <>
                      <p className="font-semibold">{link.coach_name ?? 'Development coach'}</p>
                      {link.coach_email ? <p className="text-sm text-slate">{link.coach_email}</p> : null}
                      {link.access === 'awaiting_guardian' ? (
                        <p className="text-sm">
                          Because you&apos;re under 18, a linked parent or guardian approves from their parent home before
                          the coach can see anything.
                        </p>
                      ) : null}
                    </>
                  )}
                  actions={(link) =>
                    link.access === 'pending_athlete_approval' ? (
                      <div className="flex flex-wrap gap-3">
                        <ActionForm action={approveCoachLinkAction} fields={{ linkId: link.link_id }} submitLabel="Approve" size="sm" />
                        <ActionForm action={declineCoachLinkAction} fields={{ linkId: link.link_id }} submitLabel="Decline" size="sm" variant="secondary" />
                      </div>
                    ) : link.access !== 'ended' ? (
                      <ActionForm
                        action={endCoachLinkAction}
                        fields={{ linkId: link.link_id }}
                        submitLabel="End connection"
                        size="sm"
                        variant="danger"
                        confirm="End this connection? The coach immediately loses access to your assessments."
                      />
                    ) : null
                  }
                />
              </div>
            </DashboardSection>

            <DashboardSection
              id="family"
              title="Your parent or guardian"
              description="Let a linked parent or guardian see your assessments and help record them. Link family members from your athlete home first."
            >
              {familyRows.length > 0 ? (
                <ul className="divide-y-2 divide-rule border-y-2 border-rule">
                  {familyRows.map((row) => (
                    <li key={row.link_id} className="flex flex-wrap items-center justify-between gap-4 py-4">
                      <div>
                        <p className="font-semibold">{row.guardian_name ?? 'Parent or guardian'}</p>
                        <p className="text-sm text-slate">{RELATIONSHIP_LABELS[row.relationship]}</p>
                      </div>
                      {row.in_effect && row.grant_id ? (
                        <div className="flex flex-wrap items-center gap-3">
                          <StatusChip tone="positive">Can see your assessments</StatusChip>
                          <ActionForm action={revokeShareAction} fields={{ grantId: row.grant_id }} submitLabel="Stop sharing" size="sm" variant="secondary" />
                        </div>
                      ) : (
                        <ActionForm action={shareWithFamilyAction} fields={{ linkId: row.link_id }} submitLabel="Share assessments" size="sm" variant="secondary" />
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-slate">No linked parent or guardian.</p>
              )}
            </DashboardSection>

            <DashboardSection
              id="college-coaches"
              title="Share reports with a college coach"
              description="Share your published reports — never your clips or unpublished work — with a verified college coach. Under 18, a parent or guardian approves first. Sharing lasts a year unless you stop it."
            >
              <div className="space-y-6">
                <ActionForm action={shareReportsWithCoachAction} submitLabel="Share my reports" variant="secondary" inline>
                  <TextField id="coach-email" name="email" type="email" required label="Coach’s work email" className="w-80" autoComplete="off" />
                </ActionForm>
                {shareRows.length > 0 ? (
                  <ul className="divide-y-2 divide-rule border-y-2 border-rule">
                    {shareRows.map((share) => (
                      <li key={share.grant_id} className="flex flex-wrap items-center justify-between gap-4 py-4">
                        <div>
                          <p className="font-semibold">{share.coach_name ?? 'College coach'}</p>
                          <p className="text-sm text-slate">
                            {share.in_effect ? 'Can see your published reports' : share.status === 'pending_guardian' ? 'Waiting for parent or guardian approval' : 'Not in effect'}
                            {share.expires_at ? ` · until ${formatDateTime(share.expires_at)}` : ''}
                          </p>
                        </div>
                        <ActionForm action={revokeShareAction} fields={{ grantId: share.grant_id }} submitLabel="Stop sharing" size="sm" variant="secondary" />
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-slate">Not shared with any college coach.</p>
                )}
              </div>
            </DashboardSection>

            {account.userId ? <AthleteComparisonGroups athleteId={account.userId} /> : null}
          </>
        ) : null}

        {account.roles.includes('parent') ? <GuardianComparisonRequests /> : null}

        {isDevelopmentCoach ? (
          <DashboardSection
            id="athletes"
            title="Your athletes"
            description="Ask each athlete for a coach code from their Connections page. They approve the connection, and a parent or guardian approves for athletes under 18."
          >
            <div className="space-y-6">
              <ActionForm action={redeemCoachCodeAction} submitLabel="Connect" inline>
                <TextField id="coach-code" name="code" required label="Athlete’s coach code" placeholder="XXXX-XXXX-XXXX" className="w-64" autoComplete="off" />
              </ActionForm>
              <LinkList
                links={coachLinks}
                empty="No athletes connected yet."
                render={(link) => <p className="font-semibold">{link.athlete_name ?? 'Athlete'}</p>}
                actions={(link) =>
                  link.access !== 'ended' ? (
                    <ActionForm action={endCoachLinkAction} fields={{ linkId: link.link_id }} submitLabel="End connection" size="sm" variant="secondary" />
                  ) : null
                }
              />
            </div>
          </DashboardSection>
        ) : null}

        {guardianLinks.length > 0 ? (
          <DashboardSection
            id="guardian"
            title="Development coaches for your athlete"
            description="Approve a development coach's access from your parent and guardian home. You can remove a coach here at any time."
          >
            <LinkList
              links={guardianLinks}
              empty=""
              render={(link) => (
                <>
                  <p className="font-semibold">
                    {link.coach_name ?? 'Development coach'} for {link.athlete_name ?? 'your athlete'}
                  </p>
                  {link.coach_email ? <p className="text-sm text-slate">{link.coach_email}</p> : null}
                </>
              )}
              actions={(link) =>
                link.access !== 'ended' ? (
                  <ActionForm
                    action={endCoachLinkAction}
                    fields={{ linkId: link.link_id }}
                    submitLabel="Remove this coach"
                    size="sm"
                    variant="danger"
                    confirm="Remove this development coach? They immediately lose access to your athlete's assessments."
                  />
                ) : null
              }
            />
          </DashboardSection>
        ) : null}

        {!isAthlete && !isDevelopmentCoach && guardianLinks.length === 0 ? (
          <p className="text-slate">Connections are set up by athletes and their development coaches.</p>
        ) : null}
      </div>
    </>
  );
}

function LinkList({
  links,
  empty,
  render,
  actions,
}: {
  readonly links: readonly CoachLinkRow[];
  readonly empty: string;
  readonly render: (link: CoachLinkRow) => ReactNode;
  readonly actions: (link: CoachLinkRow) => ReactNode;
}) {
  if (links.length === 0) return empty ? <p className="text-slate">{empty}</p> : null;
  return (
    <ul className="divide-y-2 divide-rule border-y-2 border-rule">
      {links.map((link) => (
        <li key={link.link_id} className="flex flex-wrap items-start justify-between gap-4 py-4">
          <div className="space-y-2">
            {render(link)}
            <StatusChip tone={ACCESS[link.access].tone}>{ACCESS[link.access].label}</StatusChip>
          </div>
          {actions(link)}
        </li>
      ))}
    </ul>
  );
}
