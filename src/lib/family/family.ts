/** Shapes and labels for family links (public.list_family_links). */

import type { ActionState } from '@/lib/forms/action-state';
import { displayTimeZone, parseStoredDate } from '@/lib/time';

export interface InviteState extends ActionState {
  readonly code?: string;
  readonly expiresAt?: string;
}

export type FamilyRelationship = 'parent' | 'legal_guardian' | 'other_family';
export type FamilyLinkStatus = 'pending_athlete_approval' | 'active' | 'reconsent_required' | 'ended';

export interface FamilyLinkRow {
  readonly link_id: string;
  readonly my_side: 'athlete' | 'guardian';
  readonly other_party_name: string | null;
  readonly other_party_email: string | null;
  readonly relationship: FamilyRelationship;
  readonly status: FamilyLinkStatus;
  readonly created_at: string;
  readonly approved_at: string | null;
}

export const RELATIONSHIP_LABELS: Readonly<Record<FamilyRelationship, string>> = {
  parent: 'Parent',
  legal_guardian: 'Legal guardian',
  other_family: 'Other family member',
};

export function isFamilyRelationship(value: string): value is FamilyRelationship {
  return value === 'parent' || value === 'legal_guardian' || value === 'other_family';
}

/** Messages for public.redeem_family_invite outcomes. */
export function redeemOutcomeMessage(outcome: string): { readonly ok: boolean; readonly message: string } {
  switch (outcome) {
    case 'pending_athlete_approval':
      return { ok: true, message: 'Code accepted. The athlete now needs to approve the link from their account.' };
    case 'invalid_or_expired':
      return { ok: false, message: 'That code isn’t valid or has expired. Ask the athlete for a new one.' };
    case 'too_many_attempts':
      return { ok: false, message: 'Too many attempts. Please wait an hour and try again.' };
    case 'athlete_link_limit_reached':
      return { ok: false, message: 'This athlete already has the most family links allowed.' };
    default:
      return { ok: false, message: 'We couldn’t use that code. Ask the athlete for a new one.' };
  }
}

export function formatDate(iso: string): string {
  return new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeZone: displayTimeZone(iso) }).format(parseStoredDate(iso));
}
