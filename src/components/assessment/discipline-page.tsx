import { DashboardSection, PageTitle } from '@/components/app/section';
import { AthletePicker } from '@/components/assessment/athlete-picker';
import { AssessmentList, ReportCard } from '@/components/assessment/summaries';
import { ButtonLink } from '@/components/ui/button';
import { Notice } from '@/components/ui/notice';
import { metricsForPillar } from '@/lib/assessment/catalog/metrics';
import { PILLARS } from '@/lib/assessment/catalog/pillars';
import { athleteContext, athleteQuery, type SearchParams } from '@/lib/assessment/server/page-context';
import { getCurrentReports, listAssessments } from '@/lib/assessment/server/queries';
import { pillarsFor, type Discipline } from '@/lib/assessment/types';

/** The Hitting and Pitching sections: this athlete's assessments and what each pillar looks at. */
export async function DisciplinePage({ discipline, searchParams }: { readonly discipline: Discipline; readonly searchParams: SearchParams }) {
  const { options, selected, failed } = await athleteContext(searchParams);
  const title = discipline === 'hitting' ? 'Hitting' : 'Pitching';
  if (!selected) {
    return (
      <>
        <PageTitle title={title} />
        <Notice tone={failed ? 'error' : 'info'}>{failed ? 'Your athletes didn’t load. Refresh to try again.' : 'There is no athlete to show yet.'}</Notice>
      </>
    );
  }
  const [assessments, reports] = await Promise.all([listAssessments(selected.athlete_id), getCurrentReports(selected.athlete_id)]);
  const rows = assessments.data.filter((row) => row.discipline === discipline);
  const latest = reports.find((revision) => revision.discipline === discipline);

  return (
    <>
      <PageTitle title={title}>
        {discipline === 'hitting'
          ? 'Load and timing, barrel delivery, lower-body contribution, and impact and output — each with the evidence behind it.'
          : 'Lower-body delivery, movement timing, arm delivery and pitch performance — each with the evidence behind it.'}
      </PageTitle>
      <div className="space-y-12">
        <AthletePicker options={options} selected={selected} action={`/assessment/${discipline}`} />
        <div>
          <ButtonLink href={`/assessment/new?discipline=${discipline}${athleteQuery(selected, '&')}`}>New {discipline} assessment</ButtonLink>
        </div>
        {discipline === 'hitting' ? (
          <DashboardSection
            id="zone-hitting"
            title="9-Zone Hitting"
            description="Zone-by-zone practice: a clickable zone map, the workbook’s drill library, session builder, live pitch tracker, session review and development path. It adds evidence to the hitting assessment and never changes a score."
          >
            <ButtonLink href={`/assessment/hitting/zones${athleteQuery(selected)}`} variant="secondary" data-testid="open-zone-hitting">
              Open 9-Zone Hitting
            </ButtonLink>
          </DashboardSection>
        ) : null}
        <DashboardSection id="latest-report" title="Latest report">
          {latest ? <ReportCard revision={latest} /> : <p className="text-slate">No published {discipline} report yet.</p>}
        </DashboardSection>
        <DashboardSection id="all" title={`All ${discipline} assessments`}>
          <AssessmentList rows={rows} empty={`No ${discipline} assessments yet.`} />
        </DashboardSection>
        <DashboardSection id="pillars" title="What the four pillars look at">
          <div className="grid gap-6 md:grid-cols-2">
            {pillarsFor(discipline).map((key) => (
              <div key={key} className="space-y-2 border-l-4 border-royal-ink pl-4">
                <h3 className="text-xl font-semibold text-navy">{PILLARS[key].name}</h3>
                <p>{PILLARS[key].summary}</p>
                <p className="text-sm text-slate">{PILLARS[key].limits}</p>
                <p className="text-sm">
                  <span className="font-semibold">Metrics:</span>{' '}
                  {metricsForPillar(key)
                    .map((metric) => metric.name)
                    .join(', ')}
                </p>
              </div>
            ))}
          </div>
        </DashboardSection>
      </div>
    </>
  );
}
