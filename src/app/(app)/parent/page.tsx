import type { Metadata } from 'next';

import { approveConsentAction, leaveLinkAction } from '@/app/(app)/parent/actions';
import { RedeemForm } from '@/app/(app)/parent/redeem-form';
import { ActionButtonForm } from '@/components/app/action-button-form';
import { DashboardSection, PageTitle } from '@/components/app/section';
import { Notice } from '@/components/ui/notice';
import { StatusChip } from '@/components/ui/status-chip';
import { requireAccess } from '@/lib/auth/guard';
import { CONSENT_SCOPES, type ConsentScope } from '@/lib/consent/scopes';
import { RELATIONSHIP_LABELS, type FamilyLinkRow } from '@/lib/family/family';
import { createClient } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Parent and guardian home' };

interface PendingGrant {
  readonly id: string;
  readonly athlete_id: string;
  readonly scope: ConsentScope;
}

export default async function ParentHomePage() {
  const account = await requireAccess('/parent');
  const supabase = await createClient();
  const [linksResult, linkRowsResult, grantsResult] = await Promise.all([
    supabase.rpc('list_family_links'),
    supabase.from('family_links').select('id, athlete_id').eq('guardian_id', account.userId ?? ''),
    supabase.from('consent_grants').select('id, athlete_id, scope').eq('status', 'pending_guardian'),
  ]);

  const links = ((linksResult.data ?? []) as FamilyLinkRow[]).filter(
    (link) => link.my_side === 'guardian' && link.status !== 'ended',
  );
  const athleteByLink = new Map(
    ((linkRowsResult.data ?? []) as Array<{ id: string; athlete_id: string }>).map((row) => [row.id, row.athlete_id]),
  );
  const nameByAthlete = new Map<string, string>();
  for (const link of links) {
    const athleteId = athleteByLink.get(link.link_id);
    if (athleteId && link.other_party_name) nameByAthlete.set(athleteId, link.other_party_name);
  }
  const pending = ((grantsResult.data ?? []) as PendingGrant[]).filter((grant) => nameByAthlete.has(grant.athlete_id));
  const loadFailed = Boolean(linksResult.error || linkRowsResult.error || grantsResult.error);

  return (
    <>
      <PageTitle title="Parent and guardian home">
        Support your athlete&apos;s search. You see only what they choose to share with you.
      </PageTitle>

      {loadFailed ? (
        <Notice tone="error" className="mb-8">
          Some information didn&apos;t load. Refresh the page to try again.
        </Notice>
      ) : null}

      <div className="space-y-14">
        <DashboardSection
          id="approvals"
          title="Waiting for your approval"
          description="Athletes under 18 need a parent or legal guardian to approve anything shared with college coaches."
        >
          {pending.length > 0 ? (
            <ul className="divide-y-2 divide-rule border-y-2 border-rule">
              {pending.map((grant) => (
                <li key={grant.id} className="flex flex-wrap items-start justify-between gap-4 py-4">
                  <div>
                    <p className="font-semibold">
                      {nameByAthlete.get(grant.athlete_id)}: {CONSENT_SCOPES[grant.scope]?.label ?? 'Sharing request'}
                    </p>
                    <p className="text-sm text-slate">{CONSENT_SCOPES[grant.scope]?.description}</p>
                  </div>
                  <ActionButtonForm
                    action={approveConsentAction}
                    fields={{ grantId: grant.id }}
                    label="Approve"
                    pendingLabel="Approving…"
                    size="sm"
                  />
                </li>
              ))}
            </ul>
          ) : (
            <p>Nothing is waiting for you.</p>
          )}
        </DashboardSection>

        <DashboardSection id="linked-athletes" title="Your athletes">
          {links.length > 0 ? (
            <ul className="divide-y-2 divide-rule border-y-2 border-rule">
              {links.map((link) => (
                <li key={link.link_id} className="flex flex-wrap items-start justify-between gap-4 py-4">
                  <div>
                    <p className="font-semibold">{link.other_party_name ?? 'Athlete'}</p>
                    <p className="text-sm text-slate">You&apos;re linked as: {RELATIONSHIP_LABELS[link.relationship]}</p>
                    <div className="mt-2">
                      {link.status === 'active' ? (
                        <StatusChip tone="positive">Linked</StatusChip>
                      ) : (
                        <StatusChip tone="attention">Waiting for the athlete to approve</StatusChip>
                      )}
                    </div>
                  </div>
                  <ActionButtonForm
                    action={leaveLinkAction}
                    fields={{ linkId: link.link_id }}
                    label="Remove link"
                    pendingLabel="Saving…"
                    variant="danger"
                    size="sm"
                  />
                </li>
              ))}
            </ul>
          ) : (
            <p>You aren&apos;t linked to an athlete yet.</p>
          )}
        </DashboardSection>

        <DashboardSection
          id="connect"
          title="Connect to your athlete"
          description="Ask your athlete to create a family code from their account, then enter it here."
        >
          <RedeemForm />
        </DashboardSection>
      </div>
    </>
  );
}
