/**
 * Consent scopes and the wording version shown when each is granted.
 * Mirrors public.consent_scope_rules (a contract test checks the rules match).
 *
 * When consent wording changes, bump the version (…-v2): grants record the
 * version the athlete actually saw.
 */

export const CONSENT_SCOPE_KEYS = [
  'coach_discovery',
  'coach_academic_summary',
  'coach_athletic_metrics',
  'coach_contact_info',
  'coach_messaging',
  'document_access',
  'family_recruiting',
  'family_academic',
  'development_coach_access',
  'family_assessments',
  'coach_assessment_reports',
] as const;
export type ConsentScope = (typeof CONSENT_SCOPE_KEYS)[number];

export type ConsentAudience = 'verified_coaches' | 'specific_user';
export type GranteeKind = 'verified_coach' | 'linked_guardian' | 'verified_coach_or_linked_guardian' | 'development_coach';

export interface ConsentScopeRule {
  readonly audience: ConsentAudience;
  readonly granteeKind: GranteeKind | null;
  /** Founder/legal decision point (see docs/decisions.md). */
  readonly requiresGuardianApprovalForMinor: boolean;
  readonly maxDurationDays: number | null;
  readonly textVersion: string;
  readonly label: string;
  readonly description: string;
}

export const CONSENT_SCOPES: Readonly<Record<ConsentScope, ConsentScopeRule>> = {
  coach_discovery: {
    audience: 'verified_coaches',
    granteeKind: null,
    requiresGuardianApprovalForMinor: true,
    maxDurationDays: null,
    textVersion: 'coach-discovery-v1',
    label: 'Visible to verified coaches',
    description: 'Appear in verified college coach search with a basic recruiting profile.',
  },
  coach_academic_summary: {
    audience: 'verified_coaches',
    granteeKind: null,
    requiresGuardianApprovalForMinor: true,
    maxDurationDays: null,
    textVersion: 'coach-academic-summary-v1',
    label: 'Academic summary',
    description: 'Let verified coaches see your academic summary, labelled self-reported or verified.',
  },
  coach_athletic_metrics: {
    audience: 'verified_coaches',
    granteeKind: null,
    requiresGuardianApprovalForMinor: true,
    maxDurationDays: null,
    textVersion: 'coach-athletic-metrics-v1',
    label: 'Athletic metrics and video',
    description: 'Let verified coaches see your athletic metrics and recruiting video.',
  },
  coach_contact_info: {
    audience: 'verified_coaches',
    granteeKind: null,
    requiresGuardianApprovalForMinor: true,
    maxDurationDays: null,
    textVersion: 'coach-contact-info-v1',
    label: 'Contact details',
    description: 'Let verified coaches see your contact details.',
  },
  coach_messaging: {
    audience: 'verified_coaches',
    granteeKind: null,
    requiresGuardianApprovalForMinor: true,
    maxDurationDays: null,
    textVersion: 'coach-messaging-v1',
    label: 'Coach messages',
    description: 'Let verified coaches start a conversation with you on Base Recruits.',
  },
  document_access: {
    audience: 'specific_user',
    granteeKind: 'verified_coach_or_linked_guardian',
    requiresGuardianApprovalForMinor: true,
    maxDurationDays: 365,
    textVersion: 'document-access-v1',
    label: 'Academic documents',
    description: 'Let one named verified coach or linked parent/guardian view your academic documents.',
  },
  family_recruiting: {
    audience: 'specific_user',
    granteeKind: 'linked_guardian',
    requiresGuardianApprovalForMinor: false,
    maxDurationDays: null,
    textVersion: 'family-recruiting-v1',
    label: 'Saved schools and recruiting activity',
    description: 'Let a linked parent/guardian see your saved schools and recruiting activity.',
  },
  family_academic: {
    audience: 'specific_user',
    granteeKind: 'linked_guardian',
    requiresGuardianApprovalForMinor: false,
    maxDurationDays: null,
    textVersion: 'family-academic-v1',
    label: 'Academic profile',
    description: 'Let a linked parent/guardian see your academic profile.',
  },
  development_coach_access: {
    audience: 'specific_user',
    granteeKind: 'development_coach',
    requiresGuardianApprovalForMinor: true,
    maxDurationDays: null,
    textVersion: 'development-coach-access-v1',
    label: 'Development coach access to assessments',
    description: 'Let one named development coach see, add to and review your assessments, video and training plans.',
  },
  family_assessments: {
    audience: 'specific_user',
    granteeKind: 'linked_guardian',
    requiresGuardianApprovalForMinor: false,
    maxDurationDays: null,
    textVersion: 'family-assessments-v1',
    label: 'Assessments',
    description: 'Let a linked parent/guardian see and add to your assessments, video and training plans.',
  },
  coach_assessment_reports: {
    audience: 'specific_user',
    granteeKind: 'verified_coach',
    requiresGuardianApprovalForMinor: true,
    maxDurationDays: 365,
    textVersion: 'coach-assessment-reports-v1',
    label: 'Published assessment reports',
    description: 'Let one named verified college coach see your published assessment reports. Video is never shared.',
  },
};

/** Same format the database enforces on consent_grants.consent_text_version. */
export const CONSENT_TEXT_VERSION_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*-v[0-9]+$/;
