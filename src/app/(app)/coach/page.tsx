import type { Metadata } from 'next';

import { CoachStatusSummary } from '@/components/app/coach-status';
import { DashboardSection, PageTitle } from '@/components/app/section';
import { ButtonLink } from '@/components/ui/button';
import { Notice } from '@/components/ui/notice';
import { requireAccess } from '@/lib/auth/guard';

export const metadata: Metadata = { title: 'Coach home' };

export default async function CoachHomePage() {
  const account = await requireAccess('/coach');
  const verified = account.viewer.kind === 'signed_in' && account.viewer.verifiedCoach;

  return (
    <>
      <PageTitle title="Coach home">Your verification status, and the coach tools as they open.</PageTitle>
      <div className="space-y-14">
        <DashboardSection id="verification" title="Your verification">
          {account.coach ? (
            <div className="space-y-5">
              <CoachStatusSummary coach={account.coach} verified={verified} />
              {!verified ? <ButtonLink href="/coach/verification">Go to verification</ButtonLink> : null}
            </div>
          ) : (
            <Notice tone="error">We couldn&apos;t find your coach record. Please contact the Base Recruits team.</Notice>
          )}
        </DashboardSection>

        <DashboardSection id="coach-tools" title="Recruiting tools">
          {verified ? (
            <ButtonLink href="/coach/athletes">Open athlete search</ButtonLink>
          ) : (
            <p className="max-w-2xl">
              Athlete search, recruiting boards and messaging unlock once your coaching role is verified. A .edu email
              on its own doesn&apos;t unlock them.
            </p>
          )}
        </DashboardSection>
      </div>
    </>
  );
}
