import { StatusChip } from '@/components/ui/status-chip';
import type { CoachRow } from '@/lib/auth/account';
import { describeCoachStatus } from '@/lib/auth/coach-verification';
import { formatDate } from '@/lib/family/family';

export function CoachStatusSummary({ coach, verified }: { readonly coach: CoachRow; readonly verified: boolean }) {
  const description = describeCoachStatus(coach.verification_status);
  // A stored "verified" status that no longer grants access (expired, email
  // changed) is shown as needing re-verification, never as verified.
  const showAsVerified = verified && coach.verification_status === 'verified';
  return (
    <div className="space-y-3">
      <StatusChip tone={showAsVerified ? 'positive' : description.tone === 'positive' ? 'attention' : description.tone}>
        {showAsVerified ? 'Verified' : coach.verification_status === 'verified' ? 'Re-verification needed' : description.label}
      </StatusChip>
      <p className="max-w-2xl">{description.summary}</p>
      {showAsVerified && coach.verified_until ? (
        <p className="text-sm text-slate">Verified until {formatDate(coach.verified_until)}.</p>
      ) : null}
      {description.nextStep && !showAsVerified ? <p className="max-w-2xl font-semibold">{description.nextStep}</p> : null}
    </div>
  );
}
