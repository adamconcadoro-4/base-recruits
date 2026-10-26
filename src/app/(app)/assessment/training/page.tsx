import type { Metadata } from 'next';
import Link from 'next/link';

import { PlanBuilder } from '@/app/(app)/assessment/training/plan-builder';
import { PlanCard } from '@/app/(app)/assessment/training/plan-card';
import { DashboardSection, PageTitle } from '@/components/app/section';
import { AthletePicker } from '@/components/assessment/athlete-picker';
import { formatDateOnly } from '@/components/assessment/result-format';
import { Notice } from '@/components/ui/notice';
import { DRILL_REQUIREMENTS, type DrillRequirement } from '@/lib/assessment/catalog/drills';
import { athleteContext, single, type SearchParams } from '@/lib/assessment/server/page-context';
import { getCurrentReports, getPlans, getRevision, isUuid } from '@/lib/assessment/server/queries';
import { getAccount } from '@/lib/auth/account';

export const metadata: Metadata = { title: 'Training Plan' };

export default async function TrainingPage({ searchParams }: { readonly searchParams: SearchParams }) {
  const [{ options, selected, query, failed }, account] = await Promise.all([athleteContext(searchParams), getAccount()]);
  if (!selected) {
    return (
      <>
        <PageTitle title="Training Plan" />
        <Notice tone={failed ? 'error' : 'info'}>{failed ? 'Your athletes didn’t load. Refresh to try again.' : 'There is no athlete to show yet.'}</Notice>
      </>
    );
  }
  const fromId = single(query.from);
  const without = ([] as string[])
    .concat(query.without ?? [])
    .filter((value): value is DrillRequirement => (DRILL_REQUIREMENTS as readonly string[]).includes(value));
  const [plans, reports, source] = await Promise.all([
    getPlans(selected.athlete_id),
    getCurrentReports(selected.athlete_id),
    isUuid(fromId) ? getRevision(fromId) : Promise.resolve(null),
  ]);
  const isCoach = selected.relation === 'development_coach';
  const active = plans.data.filter((plan) => plan.status === 'active');
  const completed = plans.data.filter((plan) => plan.status === 'completed');
  const builder = source && source.athlete_id === selected.athlete_id && source.status === 'current' ? source : null;

  return (
    <>
      <PageTitle title="Training Plan">
        Up to three focus areas at a time, drills chosen from what the evidence shows, and a date to reassess and see what changed.
      </PageTitle>
      <div className="space-y-12">
        <AthletePicker options={options} selected={selected} action="/assessment/training" />
        {plans.failed ? <Notice tone="error">Plans didn&apos;t load. Refresh to try again.</Notice> : null}
        {fromId && !builder ? <Notice tone="attention">That report isn&apos;t available to build a plan from. Choose a current report below.</Notice> : null}

        {builder ? (
          <DashboardSection id="build" title="Build a plan">
            <PlanBuilder revision={builder} athleteId={selected.athlete_id} unavailable={without} isCoach={isCoach} />
          </DashboardSection>
        ) : null}

        <DashboardSection id="active" title="Active plans">
          {active.length > 0 ? (
            <div className="space-y-6">
              {active.map((plan) => (
                <PlanCard key={plan.id} plan={plan} isCoach={isCoach} viewerId={account.userId ?? ''} />
              ))}
            </div>
          ) : (
            <p className="text-slate">No active plan. Start one from a published report below.</p>
          )}
        </DashboardSection>

        {!builder ? (
          <DashboardSection id="from-report" title="Start a plan from a report">
            {reports.length > 0 ? (
              <ul className="divide-y-2 divide-rule border-y-2 border-rule">
                {reports.map((revision) => (
                  <li key={revision.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                    <span>
                      {revision.discipline === 'hitting' ? 'Hitting' : 'Pitching'} ·{' '}
                      {formatDateOnly(revision.snapshot?.assessment.assessment_date ?? revision.published_at)}
                    </span>
                    <Link
                      href={`/assessment/training?athlete=${selected.athlete_id}&from=${revision.id}`}
                      className="font-semibold text-royal-ink underline"
                    >
                      Build a plan from this report
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-slate">No published reports yet.</p>
            )}
            <p className="mt-3 text-sm text-slate">Starting a new plan for a discipline completes the active plan for that discipline.</p>
          </DashboardSection>
        ) : null}

        {completed.length > 0 ? (
          <DashboardSection id="completed" title="Completed plans">
            <div className="space-y-6">
              {completed.map((plan) => (
                <PlanCard key={plan.id} plan={plan} isCoach={isCoach} viewerId={account.userId ?? ''} />
              ))}
            </div>
          </DashboardSection>
        ) : null}
      </div>
    </>
  );
}
