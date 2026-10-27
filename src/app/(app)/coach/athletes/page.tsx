import type { Metadata } from 'next';

import { PageTitle } from '@/components/app/section';
import { Notice } from '@/components/ui/notice';
import { requireAccess } from '@/lib/auth/guard';

export const metadata: Metadata = { title: 'Athlete search' };

export default async function CoachAthleteSearchPage() {
  await requireAccess('/coach/athletes');
  return (
    <>
      <PageTitle title="Athlete search">Athlete search isn&apos;t open yet.</PageTitle>
      <Notice tone="info" title="Opening with athlete profiles">
        Search, recruiting boards and messaging arrive with the athlete profile release. You&apos;ll only ever see
        athletes who chose to be visible to verified coaches.
      </Notice>
    </>
  );
}
