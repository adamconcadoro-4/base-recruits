/**
 * Coach verification rules. Mirrors public.coach_verification_status,
 * public.coach_status_transitions and private.is_verified_coach().
 *
 * A coach account is not a verified coach. Protected coach tools need an
 * admin-reviewed affiliation, an unexpired verification window, the coach role,
 * and a confirmed account email equal to the email the reviewer approved.
 * The email domain (.edu or not) never grants access on its own, and nothing
 * here depends on payment. Leaving 'verified' for anything but a suspension
 * clears the window; a suspension can only be lifted to the prior status.
 */

export const COACH_VERIFICATION_STATUSES = [
  'unverified',
  'email_verified',
  'affiliation_under_review',
  'more_info_requested',
  'verified',
  'reverification_required',
  'suspended',
  'rejected',
  'revoked',
] as const;
export type CoachVerificationStatus = (typeof COACH_VERIFICATION_STATUSES)[number];

export type TransitionActor = 'system' | 'coach' | 'admin';

export interface CoachStatusTransition {
  readonly from: CoachVerificationStatus;
  readonly to: CoachVerificationStatus;
  readonly actor: TransitionActor;
}

/** Must match public.coach_status_transitions (checked by a contract test). */
export const COACH_STATUS_TRANSITIONS: readonly CoachStatusTransition[] = [
  { from: 'unverified', to: 'email_verified', actor: 'system' },
  { from: 'verified', to: 'reverification_required', actor: 'system' },
  { from: 'affiliation_under_review', to: 'email_verified', actor: 'system' },
  { from: 'more_info_requested', to: 'email_verified', actor: 'system' },
  { from: 'email_verified', to: 'unverified', actor: 'system' },
  { from: 'email_verified', to: 'affiliation_under_review', actor: 'coach' },
  { from: 'more_info_requested', to: 'affiliation_under_review', actor: 'coach' },
  { from: 'reverification_required', to: 'affiliation_under_review', actor: 'coach' },
  { from: 'affiliation_under_review', to: 'verified', actor: 'admin' },
  { from: 'affiliation_under_review', to: 'more_info_requested', actor: 'admin' },
  { from: 'affiliation_under_review', to: 'rejected', actor: 'admin' },
  // suspend, and lift a suspension back to the prior status only
  { from: 'verified', to: 'suspended', actor: 'admin' },
  { from: 'reverification_required', to: 'suspended', actor: 'admin' },
  { from: 'affiliation_under_review', to: 'suspended', actor: 'admin' },
  { from: 'more_info_requested', to: 'suspended', actor: 'admin' },
  { from: 'suspended', to: 'verified', actor: 'admin' },
  { from: 'suspended', to: 'reverification_required', actor: 'admin' },
  { from: 'suspended', to: 'affiliation_under_review', actor: 'admin' },
  { from: 'suspended', to: 'more_info_requested', actor: 'admin' },
  // revoke (also used when the coach role is removed)
  { from: 'unverified', to: 'revoked', actor: 'admin' },
  { from: 'email_verified', to: 'revoked', actor: 'admin' },
  { from: 'affiliation_under_review', to: 'revoked', actor: 'admin' },
  { from: 'more_info_requested', to: 'revoked', actor: 'admin' },
  { from: 'verified', to: 'revoked', actor: 'admin' },
  { from: 'reverification_required', to: 'revoked', actor: 'admin' },
  { from: 'suspended', to: 'revoked', actor: 'admin' },
  // reopen after an appeal; the coach must submit evidence again
  { from: 'rejected', to: 'email_verified', actor: 'admin' },
  { from: 'revoked', to: 'email_verified', actor: 'admin' },
];

export function canTransition(
  from: CoachVerificationStatus,
  to: CoachVerificationStatus,
  actor: TransitionActor,
): boolean {
  return COACH_STATUS_TRANSITIONS.some((t) => t.from === from && t.to === to && t.actor === actor);
}

export const COACH_REVIEW_DECISIONS = [
  'approve',
  'request_info',
  'reject',
  'suspend',
  'reinstate',
  'revoke',
  'reopen',
] as const;
export type CoachReviewDecision = (typeof COACH_REVIEW_DECISIONS)[number];

/** The database refuses these decisions without a note to the coach. */
export const DECISIONS_REQUIRING_NOTE: ReadonlySet<CoachReviewDecision> = new Set([
  'request_info',
  'reject',
  'suspend',
  'revoke',
]);

export const DEFAULT_VERIFICATION_VALID_DAYS = 365;

export interface CoachAccessFacts {
  readonly hasCoachRole: boolean;
  readonly status: CoachVerificationStatus;
  readonly verifiedUntil: Date | null;
  readonly accountEmailConfirmed: boolean;
  /** The account email equals the email captured when the reviewer approved. */
  readonly accountEmailMatchesVerifiedEmail: boolean;
}

/** Same rule as private.is_verified_coach(). */
export function isVerifiedCoach(facts: CoachAccessFacts, now: Date = new Date()): boolean {
  return (
    facts.hasCoachRole &&
    facts.status === 'verified' &&
    facts.verifiedUntil !== null &&
    facts.verifiedUntil.getTime() > now.getTime() &&
    facts.accountEmailConfirmed &&
    facts.accountEmailMatchesVerifiedEmail
  );
}

export type StatusTone = 'neutral' | 'progress' | 'positive' | 'attention' | 'blocked';

export interface CoachStatusDescription {
  readonly label: string;
  readonly summary: string;
  /** What the coach should do next; null when nothing is needed. */
  readonly nextStep: string | null;
  readonly tone: StatusTone;
}

export function describeCoachStatus(status: CoachVerificationStatus): CoachStatusDescription {
  switch (status) {
    case 'unverified':
      return {
        label: 'Confirm your email',
        summary: 'Confirm the email address you signed up with, using the 6-digit code we sent.',
        nextStep: 'Enter the code to continue. Next, you’ll send us your staff page for review.',
        tone: 'neutral',
      };
    case 'email_verified':
      return {
        label: 'Email confirmed',
        summary: 'Your email is confirmed. An email address alone doesn’t verify a coaching role.',
        nextStep: 'Next, send us the staff page that lists you in a baseball role.',
        tone: 'progress',
      };
    case 'affiliation_under_review':
      return {
        label: 'Under review',
        summary: 'A Base Recruits reviewer is checking your staff listing.',
        nextStep: null,
        tone: 'progress',
      };
    case 'more_info_requested':
      return {
        label: 'More information needed',
        summary: 'The reviewer needs more evidence of your coaching role.',
        nextStep: 'Read the reviewer note below, then resubmit.',
        tone: 'attention',
      };
    case 'verified':
      return {
        label: 'Verified coach',
        summary: 'Your coaching role is verified. Athlete search, recruiting boards and messaging will open to you when player profiles open.',
        nextStep: null,
        tone: 'positive',
      };
    case 'reverification_required':
      return {
        label: 'Re-verification needed',
        summary: 'Your verification period ended or your work email changed.',
        nextStep: 'Submit your current official staff listing to restore access.',
        tone: 'attention',
      };
    case 'suspended':
      return {
        label: 'Suspended',
        summary: 'Coach access is paused while a review takes place.',
        nextStep: 'Contact support if you have questions about the review.',
        tone: 'blocked',
      };
    case 'rejected':
      return {
        label: 'Not approved',
        summary: 'We could not confirm a current baseball coaching role.',
        nextStep: 'Contact support to appeal with additional evidence.',
        tone: 'blocked',
      };
    case 'revoked':
      return {
        label: 'Verification withdrawn',
        summary: 'Coach access has been withdrawn.',
        nextStep: 'Contact support to appeal.',
        tone: 'blocked',
      };
  }
}
