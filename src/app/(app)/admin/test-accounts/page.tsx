import type { Metadata } from 'next';
import Link from 'next/link';

import { createTestFamilyAction, openTestAccountAction } from '@/app/(app)/admin/test-accounts/actions';
import { ActionForm } from '@/components/assessment/action-form';
import { DashboardSection, PageTitle } from '@/components/app/section';
import { Notice } from '@/components/ui/notice';
import { StatusChip } from '@/components/ui/status-chip';
import { requireAccess } from '@/lib/auth/guard';
import { formatDate } from '@/lib/family/family';
import { createClient } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Test accounts' };

interface TestAccountRow {
  readonly user_id: string;
  readonly kind: 'athlete' | 'parent';
  readonly family_number: number;
  readonly created_at: string;
  readonly profiles: { readonly display_name: string | null } | null;
}

export default async function TestAccountsPage() {
  await requireAccess('/admin/test-accounts');
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('test_accounts')
    .select('user_id, kind, family_number, created_at, profiles(display_name)')
    .order('family_number', { ascending: false })
    .order('kind', { ascending: true });
  const rows = (data ?? []) as unknown as TestAccountRow[];
  const families = [...new Set(rows.map((row) => row.family_number))].map((number) => ({
    number,
    members: rows.filter((row) => row.family_number === number),
  }));

  return (
    <>
      <PageTitle title="Test accounts">
        Try the site as a player or a parent, including uploading clips and requesting a SeamState analysis.{' '}
        <Link href="/admin" className="font-semibold text-royal-ink underline">
          Back to Admin
        </Link>
      </PageTitle>
      <div className="space-y-14">
        <DashboardSection
          id="how"
          title="How it works"
          description="Test accounts belong to no real person. You can never open a real player's or parent's account from here."
        >
          <ul className="max-w-2xl list-disc space-y-2 pl-6">
            <li>Opening a test account signs this browser in as that player or parent. A colored bar stays at the top with a button back to your admin account.</li>
            <li>Everything follows the same rules as for real families: video uploads and SeamState only for players 18 or older, and the usual SeamState limits per person.</li>
            <li>SeamState analyses from a test player are real paid requests and count toward the site-wide monthly limit.</li>
            <li>College coaches never find test players in search. Every switch is recorded in the audit log.</li>
          </ul>
        </DashboardSection>

        <DashboardSection id="create" title="Create a test family">
          <ActionForm action={createTestFamilyAction} submitLabel="Create test family" pendingLabel="Creating…">
            <fieldset className="space-y-2">
              <legend className="font-semibold">Test player&apos;s age</legend>
              <label className="flex min-h-11 items-center gap-3">
                <input type="radio" name="age" value="adult" defaultChecked className="size-5" />
                18 or older (can upload clips and use SeamState)
              </label>
              <label className="flex min-h-11 items-center gap-3">
                <input type="radio" name="age" value="under_18" className="size-5" />
                Under 18 (shows what younger players see, including the upload limit)
              </label>
            </fieldset>
            <label className="flex min-h-11 items-center gap-3">
              <input type="checkbox" name="with_parent" defaultChecked className="size-5" />
              Add a linked parent who can see and add to the player&apos;s assessments
            </label>
          </ActionForm>
        </DashboardSection>

        <DashboardSection id="families" title="Your test families">
          {error ? (
            <Notice tone="error">The test accounts didn&apos;t load. Refresh to try again.</Notice>
          ) : families.length === 0 ? (
            <p>No test accounts yet.</p>
          ) : (
            <ul className="space-y-6">
              {families.map((family) => (
                <li key={family.number} className="space-y-4 border-2 border-navy p-5">
                  <h3 className="text-xl font-semibold text-navy">Test family {family.number}</h3>
                  <ul className="space-y-4">
                    {family.members.map((member) => (
                      <li key={member.user_id} className="flex flex-wrap items-center justify-between gap-3">
                        <div className="space-y-1">
                          <p className="font-semibold">{member.profiles?.display_name ?? 'Test account'}</p>
                          <p className="text-sm text-slate">
                            <StatusChip tone="neutral">{member.kind === 'athlete' ? 'Player' : 'Parent'}</StatusChip>{' '}
                            Created {formatDate(member.created_at)}
                          </p>
                        </div>
                        <ActionForm
                          action={openTestAccountAction}
                          fields={{ userId: member.user_id, kind: member.kind }}
                          submitLabel={member.kind === 'athlete' ? 'Open as this player' : 'Open as this parent'}
                          pendingLabel="Opening…"
                          variant="secondary"
                        />
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          )}
        </DashboardSection>
      </div>
    </>
  );
}
