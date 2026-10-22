import 'server-only';

import { cache } from 'react';

import { isVerifiedCoach, type CoachVerificationStatus } from '@/lib/auth/coach-verification';
import { ANONYMOUS, type Viewer } from '@/lib/auth/route-access';
import { isAppRole, type AppRole } from '@/lib/auth/roles';
import { isMinorOn, parseCalendarDate, todayUtc } from '@/lib/age/age-policy';
import { createClient } from '@/lib/supabase/server';

export interface ProfileRow {
  readonly display_name: string | null;
  readonly primary_role: AppRole | null;
  readonly role_selected_at: string | null;
  readonly date_of_birth: string | null;
  readonly birthdate_recorded_at: string | null;
  readonly age_screen_blocked_at: string | null;
}

export interface CoachRow {
  readonly verification_status: CoachVerificationStatus;
  readonly verified_until: string | null;
  readonly verified_email: string | null;
  readonly work_email: string;
  readonly institution_name_claimed: string | null;
  readonly coaching_title: string | null;
  readonly staff_directory_url: string | null;
  readonly affiliation_submitted_at: string | null;
}

export interface Account {
  readonly viewer: Viewer;
  readonly userId: string | null;
  readonly email: string | null;
  readonly emailConfirmed: boolean;
  readonly roles: readonly AppRole[];
  readonly profile: ProfileRow | null;
  readonly coach: CoachRow | null;
  /** Unknown age counts as a minor, as in the database. */
  readonly isMinor: boolean;
}

const SIGNED_OUT: Account = {
  viewer: ANONYMOUS,
  userId: null,
  email: null,
  emailConfirmed: false,
  roles: [],
  profile: null,
  coach: null,
  isMinor: true,
};

/**
 * The signed-in account, verified with Supabase Auth (getUser) and read under
 * the user's own row-level security. Cached for the duration of one request.
 */
export const getAccount = cache(async (): Promise<Account> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return SIGNED_OUT;

  const [profileResult, rolesResult] = await Promise.all([
    supabase
      .from('profiles')
      .select('display_name, primary_role, role_selected_at, date_of_birth, birthdate_recorded_at, age_screen_blocked_at')
      .eq('id', user.id)
      .maybeSingle(),
    supabase.from('user_roles').select('role').eq('user_id', user.id),
  ]);

  const profile = (profileResult.data ?? null) as ProfileRow | null;
  const roleRows = (rolesResult.data ?? []) as ReadonlyArray<{ role: unknown }>;
  const roles = roleRows.map((row) => row.role).filter(isAppRole);

  let coach: CoachRow | null = null;
  if (roles.includes('coach')) {
    const { data } = await supabase
      .from('coaches')
      .select(
        'verification_status, verified_until, verified_email, work_email, institution_name_claimed, coaching_title, staff_directory_url, affiliation_submitted_at',
      )
      .eq('user_id', user.id)
      .maybeSingle();
    coach = (data ?? null) as CoachRow | null;
  }

  const email = user.email ?? null;
  const emailConfirmed = Boolean(user.email_confirmed_at);
  const verifiedCoach =
    coach !== null &&
    isVerifiedCoach({
      hasCoachRole: true,
      status: coach.verification_status,
      verifiedUntil: coach.verified_until ? new Date(coach.verified_until) : null,
      accountEmailConfirmed: emailConfirmed,
      accountEmailMatchesVerifiedEmail:
        email !== null && coach.verified_email !== null && email.toLowerCase() === coach.verified_email.toLowerCase(),
    });

  const onboardingComplete =
    roles.length > 0 && profile?.birthdate_recorded_at != null && profile.age_screen_blocked_at == null;
  const birthDate = profile?.date_of_birth ? parseCalendarDate(profile.date_of_birth) : null;

  return {
    viewer: { kind: 'signed_in', userId: user.id, roles, onboardingComplete, verifiedCoach },
    userId: user.id,
    email,
    emailConfirmed,
    roles,
    profile,
    coach,
    isMinor: isMinorOn(birthDate, todayUtc()),
  };
});
