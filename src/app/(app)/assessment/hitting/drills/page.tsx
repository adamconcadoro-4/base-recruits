import type { Metadata } from 'next';
import Link from 'next/link';

import { DashboardSection, PageTitle } from '@/components/app/section';
import { DrillDetails } from '@/components/assessment/drill-details';
import { drillGroups } from '@/lib/assessment/catalog/drill-groups';
import { drillsFor } from '@/lib/assessment/catalog/drills';

export const metadata: Metadata = { title: 'Hitting Drill Library' };

const slug = (label: string) => label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/**
 * Every hitting drill open to new plans, grouped by workbook section and body
 * area, each with its full written instructions. Read-only: drills go into a
 * plan from the training plan builder.
 */
export default function HittingDrillsPage() {
  const groups = drillGroups(drillsFor('hitting'));
  const total = groups.reduce((sum, group) => sum + group.drills.length, 0);
  return (
    <>
      <PageTitle title="Hitting Drill Library">
        {total} hitting drills with written instructions. Add them to a plan from a published report&apos;s training plan builder.
      </PageTitle>
      <div className="space-y-12">
        <p className="text-sm text-slate print:hidden">
          <Link href="/assessment/hitting" className="font-semibold text-royal-ink underline">
            Hitting
          </Link>{' '}
          ›{' '}
          <Link href="/assessment/hitting/progression" className="font-semibold text-royal-ink underline">
            Six-stage hitting progression
          </Link>
        </p>
        <nav aria-label="Drill groups">
          <ul className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
            {groups.map((group) => (
              <li key={group.label}>
                <a href={`#${slug(group.label)}`} className="font-semibold text-royal-ink underline">
                  {group.label} ({group.drills.length})
                </a>
              </li>
            ))}
          </ul>
        </nav>
        {groups.map((group) => (
          <DashboardSection key={group.label} id={slug(group.label)} title={group.label} description={group.description}>
            <div className="space-y-3">
              {group.drills.map((item) => (
                <details key={item.key} className="border-2 border-rule p-4">
                  <summary className="cursor-pointer font-semibold text-navy">
                    {item.name}
                    {item.workbook ? <span className="font-normal text-slate"> ({item.workbook.sourceId})</span> : null}
                  </summary>
                  <div className="mt-3">
                    <DrillDetails drill={item} />
                  </div>
                </details>
              ))}
            </div>
          </DashboardSection>
        ))}
      </div>
    </>
  );
}
