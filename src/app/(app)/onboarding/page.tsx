import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { BirthdateForm, RoleForm } from '@/app/(app)/onboarding/onboarding-forms';
import { PageTitle } from '@/components/app/section';
import { Notice } from '@/components/ui/notice';
import { requireAccess } from '@/lib/auth/guard';

export const metadata: Metadata = { title: 'Finish setting up' };

export default async function OnboardingPage() {
  const account = await requireAccess('/onboarding');
  if (account.viewer.kind === 'signed_in' && account.viewer.onboardingComplete) redirect('/dashboard');

  if (account.profile?.age_screen_blocked_at) {
    return (
      <>
        <PageTitle title="This account can’t be used" />
        <Notice tone="info">Base Recruits accounts are for people 13 and older.</Notice>
      </>
    );
  }

  if (account.roles.length === 0) {
    return (
      <>
        <PageTitle title="Finish setting up">Tell us who this account is for. You can only choose once.</PageTitle>
        <RoleForm defaultName={account.profile?.display_name ?? ''} />
      </>
    );
  }

  return (
    <>
      <PageTitle title="One more step">We need your date of birth to apply the right privacy protections.</PageTitle>
      <BirthdateForm />
    </>
  );
}
