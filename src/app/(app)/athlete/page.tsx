import type { Metadata } from 'next';

import {
  approveLinkAction,
  cancelInviteAction,
  endLinkAction,
  shareNumbersWithFamilyAction,
  stopSharingNumbersAction,
  turnOffCoachVisibilityAction,
  turnOnCoachVisibilityAction,
} from '@/app/(app)/athlete/actions';
import { InviteForm } from '@/app/(app)/athlete/invite-form';
import { ActionButtonForm } from '@/components/app/action-button-form';
import { DashboardSection, PageTitle } from '@/components/app/section';
import { ButtonLink } from '@/components/ui/button';
import { Notice } from '@/components/ui/notice';
import { StatusChip } from '@/components/ui/status-chip';
import { requireAccess } from '@/lib/auth/guard';
import { CONSENT_SCOPES } from '@/lib/consent/scopes';
import { formatDate, RELATIONSHIP_LABELS, type FamilyLinkRow } from '@/lib/family/family';
import { fromAccountRow, type SavedNumbersRow } from '@/lib/matching/account-numbers';
import { academicsLine, baseballLine } from '@/lib/matching/numbers-summary';
import { TYPED_GRADES_NOTE } from '@/lib/matching/suggestions-explain';
import { createClient } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Athlete home' };

interface GrantRow {
  readonly grant_id: string;
  readonly scope: string;
  readonly in_effect: boolean;
  readonly waiting_for_guardian: boolean;
}

interface NumbersAccessRow {
  readonly link_id: string;
  readonly guardian_name: string | null;
  readonly relationship: FamilyLinkRow['relationship'];
  readonly grant_id: string | null;
  readonly in_effect: boolean;
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
  const [grantsResult, linksResult, invitesResult, numbersResult, numbersAccessResult] = await Promise.all([
    supabase.rpc('my_consent_grants'),
    supabase.rpc('list_family_links'),
    supabase
      .from('family_invites')
      .select('id, expires_at')
      .is('redeemed_at', null)
      .is('cancelled_at', null)
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false }),
    supabase.rpc('my_numbers'),
    supabase.rpc('numbers_family_access'),
  ]);

  const grants = (grantsResult.data ?? []) as GrantRow[];
  const links = ((linksResult.data ?? []) as FamilyLinkRow[]).filter((link) => link.status !== 'ended');
  const invites = (invitesResult.data ?? []) as InviteRow[];
  const discovery = grants.find((grant) => grant.scope === 'coach_discovery') ?? null;
  const hasActiveGuardian = links.some(
    (link) => link.status === 'active' && (link.relationship === 'parent' || link.relationship === 'legal_guardian'),
  );
  const savedRow = ((numbersResult.data ?? []) as SavedNumbersRow[])[0] ?? null;
  const savedNumbers = savedRow ? fromAccountRow(savedRow) : null;
  const numbersAccess = (numbersAccessResult.data ?? []) as NumbersAccessRow[];
  const loadFailed = Boolean(
    grantsResult.error || linksResult.error || invitesResult.error || numbersResult.error || numbersAccessResult.error,
  );
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
        Nothing you add here is shared until you choose to share it.
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
                When coach search opens, only verified coaches will be able to find players, and only players who
                turned this on. You can turn it off at any time.
                {account.isMinor ? ' Because you’re under 18, a linked parent or legal guardian must approve it too.' : ''}
              </p>
            ) : null}
            {visibility === 'on' ? <p className="max-w-2xl">
                You&apos;ve allowed verified college coaches to find you. Coach search isn&apos;t open yet, so no coach can
                see you today.
              </p> : null}
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
          id="numbers-sharing"
          title="Grades and baseball numbers"
          description="Save them once to use on every device, and choose which parent or guardian can see them. Coaches can’t see them."
          aside={savedNumbers ? <StatusChip tone="positive">Saved to your account</StatusChip> : <StatusChip tone="neutral">Not saved</StatusChip>}
        >
          <div className="space-y-6">
            {savedRow && savedNumbers ? (
              <div className="space-y-2">
                <p>
                  {academicsLine(savedNumbers) || 'No grades or test scores saved.'}{' '}
                  {academicsLine(savedNumbers) ? <StatusChip tone="attention">{TYPED_GRADES_NOTE}</StatusChip> : null}
                </p>
                <p>{baseballLine(savedNumbers) || 'No position or baseball numbers saved.'}</p>
                <p className="text-sm text-slate">Last saved {formatDate(savedRow.updated_at)}. Change or remove them on My schools.</p>
              </div>
            ) : (
              <p className="max-w-2xl">
                Nothing is saved to your account yet. On My schools, enter your numbers and tick &ldquo;Save to my
                account&rdquo;.
              </p>
            )}
            <div className="flex flex-wrap gap-3">
              <ButtonLink href="/my-schools" variant={savedNumbers ? 'secondary' : 'primary'}>
                {savedNumbers ? 'Change on My schools' : 'Go to My schools'}
              </ButtonLink>
            </div>

            <div className="space-y-3">
              <h3 className="text-2xl text-navy">Who can see them</h3>
              {numbersAccess.length > 0 ? (
                <ul className="divide-y-2 divide-rule border-y-2 border-rule">
                  {numbersAccess.map((row) => (
                    <li key={row.link_id} className="flex flex-wrap items-start justify-between gap-4 py-4">
                      <div>
                        <p className="font-semibold">{row.guardian_name ?? 'Family member'}</p>
                        <p className="text-sm text-slate">{RELATIONSHIP_LABELS[row.relationship]}</p>
                        <div className="mt-2">
                          {row.in_effect ? (
                            <StatusChip tone="positive">Can see your grades and numbers</StatusChip>
                          ) : (
                            <StatusChip tone="neutral">Can&apos;t see them</StatusChip>
                          )}
                        </div>
                      </div>
                      {row.in_effect && row.grant_id ? (
                        <ActionButtonForm
                          action={stopSharingNumbersAction}
                          fields={{ grantId: row.grant_id }}
                          label="Stop sharing"
                          pendingLabel="Saving…"
                          variant="secondary"
                          size="sm"
                        />
                      ) : (
                        <ActionButtonForm
                          action={shareNumbersWithFamilyAction}
                          fields={{ linkId: row.link_id }}
                          label={`Share with ${row.guardian_name ?? 'them'}`}
                          pendingLabel="Saving…"
                          size="sm"
                        />
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="max-w-2xl">
                  Only you. To share them with a parent or guardian, link them in{' '}
                  <a href="#family-access" className="font-semibold text-royal-ink underline">
                    Family access
                  </a>{' '}
                  first.
                </p>
              )}
              <p className="max-w-2xl text-sm text-slate">
                A parent or guardian you share with sees what you saved, marked &ldquo;{TYPED_GRADES_NOTE}&rdquo;. They
                can&apos;t change it. Stopping sharing, or removing their family access, takes effect straight away.
              </p>
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

        <DashboardSection id="next-step" title="Your next step">
          <div className="space-y-4">
            <p className="max-w-2xl">
              Enter your grades and baseball numbers once to see which programs fit, then save the ones worth a closer
              look. Recruiting profiles come later.
            </p>
            <div className="flex flex-wrap gap-3">
              <ButtonLink href="/my-schools">My schools</ButtonLink>
              <ButtonLink href="/schools" variant="secondary">
                Explore Baseball Programs
              </ButtonLink>
              <ButtonLink href="/saved" variant="secondary">
                Saved schools
              </ButtonLink>
            </div>
          </div>
        </DashboardSection>
      </div>
    </>
  );
}
