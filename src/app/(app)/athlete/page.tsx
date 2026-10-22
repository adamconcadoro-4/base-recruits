import type { Metadata } from 'next';

import {
  approveLinkAction,
  cancelInviteAction,
  endLinkAction,
  turnOffCoachVisibilityAction,
  turnOnCoachVisibilityAction,
} from '@/app/(app)/athlete/actions';
import { InviteForm } from '@/app/(app)/athlete/invite-form';
import { ActionButtonForm } from '@/components/app/action-button-form';
import { DashboardSection, PageTitle } from '@/components/app/section';
import { Notice } from '@/components/ui/notice';
import { StatusChip } from '@/components/ui/status-chip';
import { requireAccess } from '@/lib/auth/guard';
import { CONSENT_SCOPES } from '@/lib/consent/scopes';
import { formatDate, RELATIONSHIP_LABELS, type FamilyLinkRow } from '@/lib/family/family';
import { createClient } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Athlete home' };

interface GrantRow {
  readonly grant_id: string;
  readonly scope: string;
  readonly in_effect: boolean;
  readonly waiting_for_guardian: boolean;
}

interface InviteRow {
  readonly id: string;
  readonly expires_at: string;
}

type VisibilityState = 'unknown' | 'off' | 'on' | 'waiting' | 'not_in_effect';

/** Always the database's effective state (public.my_consent_grants), never the raw status. */
function VisibilityChip({ state }: { readonly state: VisibilityState }) {
  switch (state) {
    case 'unknown':
      return <StatusChip tone="neutral">Couldn’t load</StatusChip>;
    case 'off':
      return <StatusChip tone="neutral">Off</StatusChip>;
    case 'on':
      return <StatusChip tone="positive">On: visible to verified coaches</StatusChip>;
    case 'waiting':
      return <StatusChip tone="attention">Waiting for parent or guardian approval</StatusChip>;
    case 'not_in_effect':
      return <StatusChip tone="attention">Not in effect</StatusChip>;
  }
}

export default async function AthleteHomePage() {
  const account = await requireAccess('/athlete');
  const supabase = await createClient();
  const [grantsResult, linksResult, invitesResult] = await Promise.all([
    supabase.rpc('my_consent_grants'),
    supabase.rpc('list_family_links'),
    supabase
      .from('family_invites')
      .select('id, expires_at')
      .is('redeemed_at', null)
      .is('cancelled_at', null)
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false }),
  ]);

  const grants = (grantsResult.data ?? []) as GrantRow[];
  const links = ((linksResult.data ?? []) as FamilyLinkRow[]).filter((link) => link.status !== 'ended');
  const invites = (invitesResult.data ?? []) as InviteRow[];
  const discovery = grants.find((grant) => grant.scope === 'coach_discovery') ?? null;
  const hasActiveGuardian = links.some(
    (link) => link.status === 'active' && (link.relationship === 'parent' || link.relationship === 'legal_guardian'),
  );
  const loadFailed = Boolean(grantsResult.error || linksResult.error || invitesResult.error);
  const visibility: VisibilityState = grantsResult.error
    ? 'unknown'
    : discovery === null
      ? 'off'
      : discovery.in_effect
        ? 'on'
        : discovery.waiting_for_guardian
          ? 'waiting'
          : 'not_in_effect';

  return (
    <>
      <PageTitle title={`Welcome${account.profile?.display_name ? `, ${account.profile.display_name}` : ''}`}>
        Your recruiting profile is private until you choose to share it.
      </PageTitle>

      {loadFailed ? (
        <Notice tone="error" className="mb-8">
          Some of your settings didn&apos;t load. Refresh the page to try again.
        </Notice>
      ) : null}

      <div className="space-y-14">
        <DashboardSection
          id="coach-visibility"
          title="Coach visibility"
          description={CONSENT_SCOPES.coach_discovery.description}
          aside={<VisibilityChip state={visibility} />}
        >
          <div className="space-y-4">
            {visibility === 'unknown' ? (
              <p className="max-w-2xl">We couldn&apos;t load your coach visibility. Refresh the page to see it.</p>
            ) : null}
            {visibility === 'off' ? (
              <p className="max-w-2xl">
                Only coaches whose role we&apos;ve confirmed can search athletes. You can turn this off at any time.
                {account.isMinor ? ' Because you’re under 18, a linked parent or legal guardian must approve it too.' : ''}
              </p>
            ) : null}
            {visibility === 'on' ? <p className="max-w-2xl">Verified college coaches can find your basic recruiting profile.</p> : null}
            {visibility === 'waiting' ? (
              <p className="max-w-2xl">
                {!account.isMinor
                  ? 'You’re 18 now, so you can turn this on yourself.'
                  : hasActiveGuardian
                    ? 'Your parent or guardian can approve this from their Base Recruits account. Coaches can’t see you until they do.'
                    : 'Link a parent or legal guardian below, then ask them to approve this. Coaches can’t see you until they do.'}
              </p>
            ) : null}
            {visibility === 'not_in_effect' ? (
              <p className="max-w-2xl">This permission isn&apos;t in effect right now, so coaches can&apos;t see you. Turn it on again to share.</p>
            ) : null}

            <div className="flex flex-wrap gap-4">
              {visibility === 'off' || visibility === 'not_in_effect' || (visibility === 'waiting' && !account.isMinor) ? (
                <ActionButtonForm action={turnOnCoachVisibilityAction} label="Turn on coach visibility" pendingLabel="Saving…" />
              ) : null}
              {discovery !== null && visibility !== 'unknown' ? (
                <ActionButtonForm
                  action={turnOffCoachVisibilityAction}
                  fields={{ grantId: discovery.grant_id }}
                  label="Turn off coach visibility"
                  pendingLabel="Saving…"
                  variant="secondary"
                />
              ) : null}
            </div>
          </div>
        </DashboardSection>

        <DashboardSection
          id="family-access"
          title="Family access"
          description="Link a parent or guardian so they can support your search. They see only what you choose to share."
        >
          <div className="space-y-8">
            {links.length > 0 ? (
              <ul className="divide-y-2 divide-rule border-y-2 border-rule">
                {links.map((link) => (
                  <li key={link.link_id} className="flex flex-wrap items-start justify-between gap-4 py-4">
                    <div>
                      <p className="font-semibold">{link.other_party_name ?? 'Family member'}</p>
                      <p className="text-sm text-slate">
                        {RELATIONSHIP_LABELS[link.relationship]}
                        {link.other_party_email ? `, ${link.other_party_email}` : ''}
                      </p>
                      <div className="mt-2">
                        {link.status === 'active' ? (
                          <StatusChip tone="positive">Linked</StatusChip>
                        ) : (
                          <StatusChip tone="attention">Needs your approval</StatusChip>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-3">
                      {link.status === 'pending_athlete_approval' || link.status === 'reconsent_required' ? (
                        <ActionButtonForm
                          action={approveLinkAction}
                          fields={{ linkId: link.link_id }}
                          label="Approve link"
                          pendingLabel="Approving…"
                          size="sm"
                        />
                      ) : null}
                      <ActionButtonForm
                        action={endLinkAction}
                        fields={{ linkId: link.link_id }}
                        label={link.status === 'active' ? 'Remove access' : 'Decline'}
                        pendingLabel="Saving…"
                        variant="danger"
                        size="sm"
                      />
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p>No family members are linked yet.</p>
            )}

            <div className="space-y-3">
              <h3 className="text-2xl text-navy">Invite a parent or guardian</h3>
              <p className="max-w-2xl text-slate">
                Create a one-time code and give it to them. After they enter it, you&apos;ll see their name and email
                here and decide whether to approve.
              </p>
              <InviteForm />
              {invites.length > 0 ? (
                <ul className="mt-4 space-y-3">
                  {invites.map((invite) => (
                    <li key={invite.id} className="flex flex-wrap items-center gap-4">
                      <span className="text-sm">Unused code, expires {formatDate(invite.expires_at)}</span>
                      <ActionButtonForm
                        action={cancelInviteAction}
                        fields={{ inviteId: invite.id }}
                        label="Cancel code"
                        pendingLabel="Cancelling…"
                        variant="quiet"
                        size="sm"
                      />
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          </div>
        </DashboardSection>

        <DashboardSection id="coming-next" title="Coming next">
          <p className="max-w-2xl">
            Your academic profile, saved schools and full recruiting profile arrive with the national school registry.
            They&apos;ll be free, like everything here.
          </p>
        </DashboardSection>
      </div>
    </>
  );
}
