import type { Metadata } from 'next';
import Link from 'next/link';

import { AddSchoolForm } from '@/app/(app)/admin/schools/forms';
import { DashboardSection, PageTitle } from '@/components/app/section';
import { Notice } from '@/components/ui/notice';
import { requireAccess } from '@/lib/auth/guard';
import { addableSeasons } from '@/lib/registry/add-school';
import { STATE_OPTIONS } from '@/lib/registry/states';
import { createClient } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Add a school' };

export default async function AddSchoolPage() {
  await requireAccess('/admin');
  const supabase = await createClient();
  const { data, error } = await supabase.from('athletic_divisions').select('code, association_code, name').order('sort_order');
  const divisions = ((data ?? []) as { code: string; association_code: string; name: string }[]).map((d) => ({
    code: d.code,
    association: d.association_code,
    name: d.name,
  }));

  return (
    <>
      <p className="mb-4">
        <Link href="/admin/schools" className="font-semibold text-royal-ink underline">
          Schools and programs
        </Link>
      </p>
      <PageTitle title="Add a school">
        For an active team the federal athletics report leaves out: service academies, men&apos;s colleges, schools that take no
        federal student aid, and new teams.
      </PageTitle>
      <div className="space-y-10">
        <DashboardSection
          id="before"
          title="Before you add one"
          description="Search for the school first. If it is already listed, correct it from its own page instead."
        >
          <ul className="list-disc space-y-2 pl-6">
            <li>Confirm the team on the school&apos;s or conference&apos;s own site: a current schedule, roster or announcement.</li>
            <li>Take the federal school ID from the school&apos;s College Navigator page so a later federal import matches it.</li>
            <li>
              The school is shown as checked by hand, with the page you cite. Admissions figures and costs are not entered here; they
              appear only if the school later shows up in the federal athletics report.
            </li>
          </ul>
        </DashboardSection>
        <DashboardSection id="details" title="School and team">
          {error ? <Notice tone="error">The division list didn&apos;t load. Reload the page.</Notice> : null}
          <AddSchoolForm divisions={divisions} seasons={addableSeasons()} states={STATE_OPTIONS} />
        </DashboardSection>
      </div>
    </>
  );
}
