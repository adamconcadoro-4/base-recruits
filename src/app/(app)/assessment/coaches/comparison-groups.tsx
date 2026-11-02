import {
  approveComparisonGroupsAction,
  joinComparisonGroupsAction,
  leaveComparisonGroupsAction,
} from '@/app/(app)/assessment/coaches/comparison-actions';
import { DashboardSection } from '@/components/app/section';
import { ActionForm } from '@/components/assessment/action-form';
import { formatDateTime } from '@/components/assessment/result-format';
import { Notice } from '@/components/ui/notice';
import { StatusChip } from '@/components/ui/status-chip';
import { COMPARISON_CONSENT_TEXT, COMPARISON_CONSENT_VERSION } from '@/lib/assessment/catalog/comparison-groups';
import { createClient } from '@/lib/supabase/server';

interface Status {
  readonly is_open: boolean;
  readonly consent_text_version: string;
  readonly status: 'pending_guardian' | 'active' | null;
  readonly joined_at: string | null;
  readonly is_minor: boolean;
  readonly can_join: boolean;
  readonly can_leave: boolean;
  readonly counted: boolean;
}

interface Request {
  readonly athlete_id: string;
  readonly athlete_name: string | null;
  readonly status: 'pending_guardian' | 'active';
  readonly joined_at: string;
}

function Wording() {
  return (
    <div className="max-w-3xl space-y-2 border-l-4 border-royal-ink pl-4">
      {COMPARISON_CONSENT_TEXT.map((paragraph) => (
        <p key={paragraph}>{paragraph}</p>
      ))}
    </div>
  );
}

/** The athlete's own opt-in (F54). Hidden until an administrator opens opting in. */
export async function AthleteComparisonGroups({ athleteId }: { readonly athleteId: string }) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('comparison_group_status', { p_athlete_id: athleteId });
  const status = ((data ?? []) as Status[])[0];
  if (error || !status) return null;
  if (!status.is_open && !status.status) return null;
  // The page's wording must be the version the database asks for, or the opt-in is refused.
  const wordingCurrent = status.consent_text_version === COMPARISON_CONSENT_VERSION;

  return (
    <DashboardSection
      id="comparison-groups"
      title="Comparison groups"
      description="Choose whether your measured results can help other athletes see where they stand, without your name."
    >
      <div className="space-y-4">
        <Wording />
        {status.status ? (
          <div className="space-y-3">
            <StatusChip tone={status.counted ? 'positive' : 'attention'}>
              {status.counted
                ? 'You’re in comparison groups'
                : status.status === 'pending_guardian'
                  ? 'Waiting for a parent or guardian to agree'
                  : 'Opted in, not used yet'}
            </StatusChip>
            {status.joined_at ? <p className="text-sm text-slate">Opted in {formatDateTime(status.joined_at)}.</p> : null}
            {status.can_leave ? (
              <ActionForm
                action={leaveComparisonGroupsAction}
                fields={{ athleteId }}
                submitLabel="Leave comparison groups"
                variant="secondary"
                size="sm"
                confirm="Leave comparison groups? Your results are removed from every group."
              />
            ) : null}
          </div>
        ) : status.can_join && wordingCurrent ? (
          <ActionForm
            action={joinComparisonGroupsAction}
            fields={{ version: COMPARISON_CONSENT_VERSION }}
            submitLabel="I agree, use my results in comparison groups"
          >
            {status.is_minor ? (
              <Notice tone="attention">Because you’re under 18, a parent or legal guardian linked to your account must also agree.</Notice>
            ) : null}
          </ActionForm>
        ) : (
          <p className="text-slate">Opting in isn’t available right now.</p>
        )}
      </div>
    </DashboardSection>
  );
}

/** Requests from athletes under 18 that a linked parent or legal guardian agrees to or withdraws. */
export async function GuardianComparisonRequests() {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('my_comparison_group_requests');
  const requests = (data ?? []) as Request[];
  if (error || requests.length === 0) return null;
  return (
    <DashboardSection
      id="comparison-groups-family"
      title="Comparison groups"
      description="Your athlete asked to have their measured results used, without their name, in comparison groups. Nothing is used until you agree."
    >
      <div className="space-y-4">
        <Wording />
        <ul className="divide-y-2 divide-rule border-y-2 border-rule">
          {requests.map((request) => (
            <li key={request.athlete_id} className="flex flex-wrap items-start justify-between gap-4 py-4">
              <div className="space-y-2">
                <p className="font-semibold">{request.athlete_name ?? 'Your athlete'}</p>
                <StatusChip tone={request.status === 'active' ? 'positive' : 'attention'}>
                  {request.status === 'active' ? 'You agreed' : 'Waiting for you'}
                </StatusChip>
              </div>
              <div className="flex flex-wrap gap-3">
                {request.status === 'pending_guardian' ? (
                  <ActionForm action={approveComparisonGroupsAction} fields={{ athleteId: request.athlete_id }} submitLabel="I agree" size="sm" />
                ) : null}
                <ActionForm
                  action={leaveComparisonGroupsAction}
                  fields={{ athleteId: request.athlete_id }}
                  submitLabel={request.status === 'active' ? 'Take my athlete out' : 'Decline'}
                  variant="secondary"
                  size="sm"
                  confirm="Take your athlete out of comparison groups? Their results are removed from every group."
                />
              </div>
            </li>
          ))}
        </ul>
      </div>
    </DashboardSection>
  );
}
