import type { Metadata } from 'next';

import { NameForm } from '@/app/(app)/settings/name-form';
import { DashboardSection, PageTitle } from '@/components/app/section';
import { requireAccess } from '@/lib/auth/guard';
import { ROLE_LABELS } from '@/lib/auth/roles';

export const metadata: Metadata = { title: 'Settings' };

export default async function SettingsPage() {
  const account = await requireAccess('/settings');
  return (
    <>
      <PageTitle title="Settings" />
      <div className="space-y-14">
        <DashboardSection id="account" title="Account">
          <dl className="grid max-w-2xl gap-3 sm:grid-cols-[10rem_1fr]">
            <dt className="font-semibold">Email</dt>
            <dd className="break-all">{account.email}</dd>
            <dt className="font-semibold">Account type</dt>
            <dd>{account.roles.length > 0 ? account.roles.map((role) => ROLE_LABELS[role]).join(', ') : 'Not chosen yet'}</dd>
          </dl>
        </DashboardSection>
        <DashboardSection id="name" title="Your name">
          <NameForm defaultName={account.profile?.display_name ?? ''} />
        </DashboardSection>
        <DashboardSection id="data" title="Your data">
          <p className="max-w-2xl">
            Data export and account deletion requests open before launch, along with the support contact. Until then,
            ask the Base Recruits team directly.
          </p>
        </DashboardSection>
      </div>
    </>
  );
}
