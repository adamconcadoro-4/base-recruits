import type { Metadata } from 'next';
import Link from 'next/link';

import { DashboardSection, PageTitle } from '@/components/app/section';
import { AthletePicker } from '@/components/assessment/athlete-picker';
import { formatDateOnly } from '@/components/assessment/result-format';
import { AssessmentList, ReportCard } from '@/components/assessment/summaries';
import { ButtonLink } from '@/components/ui/button';
import { Notice } from '@/components/ui/notice';
import { athleteContext, athleteQuery, type SearchParams } from '@/lib/assessment/server/page-context';
import { getCurrentReports, getPlans, listAssessments } from '@/lib/assessment/server/queries';
import { getAccount } from '@/lib/auth/account';
import { createClient } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Overview' };

interface SharedReport {
  readonly revision_id: string;
  readonly athlete_name: string | null;
  readonly discipline: string;
  readonly assessment_date: string;
  readonly review_kind: string;
  readonly published_at: string;
}

const PROMISE = 'Understand your game, see the evidence, and know what to work on next.';

export default async function AssessmentOverviewPage({ searchParams }: { readonly searchParams: SearchParams }) {
  const [account, context] = await Promise.all([getAccount(), athleteContext(searchParams)]);
  const { options, selected, failed } = context;
  const isCollegeCoach = account.roles.includes('coach');

  let shared: SharedReport[] = [];
  if (isCollegeCoach) {
    const supabase = await createClient();
    const { data } = await supabase.rpc('shared_assessment_reports');
    shared = (data ?? []) as SharedReport[];
  }

  if (!selected) {
    return (
      <>
        <PageTitle title="Assessment">{PROMISE}</PageTitle>
        {failed ? (
          <Notice tone="error">Your athletes didn&apos;t load. Refresh the page to try again.</Notice>
        ) : account.roles.includes('development_coach') ? (
          <Notice title="No athletes yet">
            Ask an athlete to create a coach code from their Assessment connections page, then{' '}
            <Link href="/assessment/coaches" className="font-semibold text-royal-ink underline">
              enter it here
            </Link>
            . Athletes under 18 also need a parent or guardian to approve.
          </Notice>
        ) : account.roles.includes('parent') ? (
          <Notice title="Nothing shared with you yet">
            Your athlete can let you work on their assessments from their Assessment connections page.
          </Notice>
        ) : !isCollegeCoach ? (
          <Notice title="Assessment is for athletes, their families and their development coaches">
            Create an athlete account to assess your own hitting or pitching.
          </Notice>
        ) : null}
        {isCollegeCoach ? <SharedReports reports={shared} /> : null}
      </>
    );
  }

  const [assessments, reports, plans] = await Promise.all([
    listAssessments(selected.athlete_id),
    getCurrentReports(selected.athlete_id),
    getPlans(selected.athlete_id),
  ]);
  const inProgress = assessments.data.filter((row) => row.status !== 'published');
  const latest = (['hitting', 'pitching'] as const)
    .map((discipline) => reports.find((revision) => revision.discipline === discipline))
    .filter((revision) => revision !== undefined);
  const activePlans = plans.data.filter((plan) => plan.status === 'active');
  const today = new Date().toISOString().slice(0, 10);
  const due = assessments.data.filter(
    (row) => row.status === 'published' && row.reassessment_due_on && row.reassessment_due_on <= today,
  );
  const q = athleteQuery(selected);

  return (
    <>
      <PageTitle title="Assessment">{PROMISE}</PageTitle>
      <div className="space-y-12">
        <AthletePicker options={options} selected={selected} action="/assessment" />
        {assessments.failed ? <Notice tone="error">Some assessments didn&apos;t load. Refresh to try again.</Notice> : null}

        <DashboardSection
          id="start"
          title="Start an assessment"
          description="Film a set of swings or pitches, add what you can measure, rate what you see against written anchors, and get a report that shows its evidence."
        >
          <div className="flex flex-wrap gap-3">
            <ButtonLink href={`/assessment/new?discipline=hitting${athleteQuery(selected, '&')}`}>New hitting assessment</ButtonLink>
            <ButtonLink href={`/assessment/new?discipline=pitching${athleteQuery(selected, '&')}`} variant="secondary">
              New pitching assessment
            </ButtonLink>
          </div>
          <p className="mt-3 text-sm text-slate">
            Want to see what a report looks like first?{' '}
            <Link href="/player-assessment/sample" className="font-semibold text-royal-ink underline">
              Open the fictional sample report
            </Link>
            .
          </p>
        </DashboardSection>

        {due.length > 0 ? (
          <DashboardSection id="due" title="Reassessments due">
            <ul className="divide-y-2 divide-rule border-y-2 border-rule">
              {due.map((row) => (
                <li key={row.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <span>
                    {row.discipline === 'hitting' ? 'Hitting' : 'Pitching'} — due {formatDateOnly(row.reassessment_due_on)}
                  </span>
                  <Link href={`/assessment/${row.id}#reassess`} className="font-semibold text-royal-ink underline">
                    Start the reassessment
                  </Link>
                </li>
              ))}
            </ul>
          </DashboardSection>
        ) : null}

        <DashboardSection id="in-progress" title="In progress">
          <AssessmentList rows={inProgress} empty="No assessments in progress." />
        </DashboardSection>

        <DashboardSection
          id="latest"
          title="Latest reports"
          aside={
            <Link href={`/assessment/progress${q}`} className="font-semibold text-royal-ink underline">
              See progress
            </Link>
          }
        >
          {latest.length > 0 ? (
            <div className="grid gap-4 lg:grid-cols-2">
              {latest.map((revision) => (
                <ReportCard key={revision.id} revision={revision} />
              ))}
            </div>
          ) : (
            <p className="text-slate">No published reports yet. A report appears here once an assessment is published.</p>
          )}
        </DashboardSection>

        <DashboardSection
          id="plans"
          title="Training"
          aside={
            <Link href={`/assessment/training${q}`} className="font-semibold text-royal-ink underline">
              Open training plans
            </Link>
          }
        >
          {activePlans.length > 0 ? (
            <ul className="space-y-2">
              {activePlans.map((plan) => (
                <li key={plan.id}>
                  <span className="font-semibold">{plan.title}</span> ({plan.discipline}) — review on {formatDateOnly(plan.review_on)} ·{' '}
                  {plan.approval === 'coach_approved' ? 'approved by your development coach' : 'self-directed'}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-slate">No active training plan. You can build one from a published report.</p>
          )}
        </DashboardSection>

        {isCollegeCoach ? <SharedReports reports={shared} /> : null}
      </div>
    </>
  );
}

function SharedReports({ reports }: { readonly reports: readonly SharedReport[] }) {
  return (
    <DashboardSection
      id="shared"
      title="Reports shared with you"
      description="Athletes can share their published assessment reports with you. Each report shows its evidence and how it was reviewed."
    >
      {reports.length > 0 ? (
        <ul className="divide-y-2 divide-rule border-y-2 border-rule">
          {reports.map((report) => (
            <li key={report.revision_id} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <span>
                <span className="font-semibold">{report.athlete_name ?? 'Athlete'}</span> —{' '}
                {report.discipline === 'hitting' ? 'Hitting' : 'Pitching'}, {formatDateOnly(report.assessment_date)}
              </span>
              <Link href={`/assessment/shared/${report.revision_id}`} className="font-semibold text-royal-ink underline">
                Open report
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-slate">No athlete has shared an assessment report with you.</p>
      )}
    </DashboardSection>
  );
}
