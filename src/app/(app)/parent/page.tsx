import type { Metadata } from 'next';

import { approveConsentAction, leaveLinkAction } from '@/app/(app)/parent/actions';
import { RedeemForm } from '@/app/(app)/parent/redeem-form';
import { ActionButtonForm } from '@/components/app/action-button-form';
import { DashboardSection, PageTitle } from '@/components/app/section';
import { Notice } from '@/components/ui/notice';
import { StatusChip } from '@/components/ui/status-chip';
import { requireAccess } from '@/lib/auth/guard';
import { CONSENT_SCOPES, type ConsentScope } from '@/lib/consent/scopes';
import { formatDate, RELATIONSHIP_LABELS, type FamilyLinkRow } from '@/lib/family/family';
import { fromAccountRow, type SavedNumbersRow } from '@/lib/matching/account-numbers';
import { academicsLine, baseballLine } from '@/lib/matching/numbers-summary';
import { TYPED_GRADES_NOTE } from '@/lib/matching/suggestions-explain';
import { createClient } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Parent and guardian home' };

interface ApprovalRequest {
  readonly grant_id: string;
  readonly athlete_name: string | null;
  readonly scope: ConsentScope;
  /** Who would receive access (for sharing with a specific person, such as a development coach). */
  readonly grantee_name?: string | null;
  readonly grantee_email?: string | null;
}

interface SharedNumbersRow extends SavedNumbersRow {
  readonly athlete_id: string;
  readonly athlete_name: string | null;
}

export default async function ParentHomePage() {
  await requireAccess('/parent');
  const supabase = await createClient();
  const [linksResult, requestsResult, sharedResult] = await Promise.all([
    supabase.rpc('list_family_links'),
    supabase.rpc('guardian_consent_requests'),
    supabase.rpc('family_shared_numbers'),
  ]);

  const links = ((linksResult.data ?? []) as FamilyLinkRow[]).filter(
    (link) => link.my_side === 'guardian' && link.status !== 'ended',
  );
  const pending = (requestsResult.data ?? []) as ApprovalRequest[];
  const shared = (sharedResult.data ?? []) as SharedNumbersRow[];
  const loadFailed = Boolean(linksResult.error || requestsResult.error || sharedResult.error);

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
                <li key={grant.grant_id} className="flex flex-wrap items-start justify-between gap-4 py-4">
                  <div>
                    <p className="font-semibold">
                      {grant.athlete_name ?? 'Your athlete'}: {CONSENT_SCOPES[grant.scope]?.label ?? 'Sharing request'}
                    </p>
                    {grant.grantee_name || grant.grantee_email ? (
                      <p className="text-sm">
                        With: <span className="font-semibold">{grant.grantee_name ?? 'Unnamed account'}</span>
                        {grant.grantee_email ? ` (${grant.grantee_email})` : ''}
                      </p>
                    ) : null}
                    <p className="text-sm text-slate">{CONSENT_SCOPES[grant.scope]?.description}</p>
                  </div>
                  <ActionButtonForm
                    action={approveConsentAction}
                    fields={{ grantId: grant.grant_id }}
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
          id="shared-numbers"
          title="Grades and baseball numbers"
          description="What your athlete saved and chose to share with you. They can stop sharing at any time."
        >
          {shared.length > 0 ? (
            <ul className="divide-y-2 divide-rule border-y-2 border-rule">
              {shared.map((row) => {
                const numbers = fromAccountRow(row);
                const academics = academicsLine(numbers);
                return (
                  <li key={row.athlete_id} className="space-y-2 py-4">
                    <p className="font-semibold">{row.athlete_name ?? 'Your athlete'}</p>
                    <p>
                      {academics || 'No grades or test scores saved.'}{' '}
                      {academics ? <StatusChip tone="attention">{TYPED_GRADES_NOTE}</StatusChip> : null}
                    </p>
                    <p>{baseballLine(numbers) || 'No position or baseball numbers saved.'}</p>
                    <p className="text-sm text-slate">
                      Typed in by your athlete, last saved {formatDate(row.updated_at)}. Base Recruits hasn&apos;t checked
                      them.
                    </p>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p>
              Nothing is shared with you yet. Your athlete can save their grades and baseball numbers on My schools,
              then share them with you from their athlete home.
            </p>
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
