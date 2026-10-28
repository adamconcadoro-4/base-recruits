import type { Metadata } from 'next';
import Link from 'next/link';

import { DashboardSection, PageTitle } from '@/components/app/section';
import { AthletePicker } from '@/components/assessment/athlete-picker';
import { DrillDetails } from '@/components/assessment/drill-details';
import { ScrollTable } from '@/components/assessment/scroll-table';
import { Notice } from '@/components/ui/notice';
import { drill as findDrill } from '@/lib/assessment/catalog/drills';
import { HOME_MENU, HOME_SAFETY, HOME_SESSIONS, HOME_STEPS, homeDrillKeys, PARENT_LANGUAGE } from '@/lib/assessment/catalog/home-practice';
import { requireMetric } from '@/lib/assessment/catalog/metrics';
import { athleteContext, athleteQuery, type SearchParams } from '@/lib/assessment/server/page-context';
import { getPlanDetails, getPlans, type AthleteOption } from '@/lib/assessment/server/queries';

export const metadata: Metadata = { title: 'Home Practice' };

/** What the chosen athlete's active hitting plan says about home practice. */
async function CurrentPlan({ selected }: { readonly selected: AthleteOption }) {
  const plans = await getPlans(selected.athlete_id);
  if (plans.failed) return <Notice tone="error">The training plan didn&apos;t load. Refresh to try again.</Notice>;
  const plan = plans.data.find((item) => item.status === 'active' && item.discipline === 'hitting');
  const planLink = `/assessment/training${athleteQuery(selected)}`;
  if (!plan) {
    return (
      <p>
        There is no active hitting plan yet. Ask the development coach for one current goal and one cue before adding home practice,
        or{' '}
        <Link href={planLink} className="font-semibold text-royal-ink underline">
          start a plan from a report
        </Link>
        .
      </p>
    );
  }
  const { assignments } = await getPlanDetails(plan.id);
  const home = homeDrillKeys();
  const atHome = assignments
    .filter((item) => item.status === 'active' && home.has(item.drill_key))
    .map((item) => findDrill(item.drill_key, item.drill_version)?.name ?? item.drill_key);

  return (
    <div className="space-y-3">
      <p>
        <Link href={`${planLink}#plan-${plan.id}`} className="font-semibold text-royal-ink underline">
          {plan.title}
        </Link>{' '}
        {plan.approval === 'coach_approved' ? '· approved by the development coach' : '· self-directed'}
      </p>
      {plan.approval !== 'coach_approved' ? (
        <Notice tone="attention">
          A development coach hasn&apos;t approved this plan. Ask the coach for one current goal and one cue before adding home
          practice.
        </Notice>
      ) : null}
      {plan.focus.length > 0 ? (
        <p>
          <span className="font-semibold">Current focus:</span>{' '}
          {plan.focus.map((item) => item.summary || requireMetric(item.metric_key).name).join('; ')}
        </p>
      ) : null}
      <p>
        <span className="font-semibold">Plan drills on the home menu below:</span>{' '}
        {atHome.length > 0 ? atHome.join(', ') : 'none. Ask the coach which drill, if any, suits home practice.'}
      </p>
    </div>
  );
}

export default async function HomePracticePage({ searchParams }: { readonly searchParams: SearchParams }) {
  const { options, selected } = await athleteContext(searchParams);

  return (
    <>
      <PageTitle title="Home Practice">
        A guide for parents and players: short, optional, safe and fun, with one coach-approved goal at a time.
      </PageTitle>
      <div className="space-y-12">
        {selected ? (
          <DashboardSection id="plan" title="The current plan">
            <div className="space-y-4">
              <AthletePicker options={options} selected={selected} action="/assessment/home-practice" />
              <CurrentPlan selected={selected} />
            </div>
          </DashboardSection>
        ) : null}

        <DashboardSection id="start" title="Start here">
          <ol className="list-decimal space-y-2 pl-5">
            {HOME_STEPS.map((item) => (
              <li key={item.step}>{item.action}</li>
            ))}
          </ol>
        </DashboardSection>

        <DashboardSection id="safety" title="Home safety checklist">
          <ul className="space-y-2">
            {HOME_SAFETY.map((item) => (
              <li key={item.check} className="border-l-4 border-royal-ink pl-3">
                <span className="block font-semibold">{item.check}</span>
                <span className="block text-sm text-slate">{item.why}</span>
              </li>
            ))}
          </ul>
        </DashboardSection>

        <DashboardSection id="menu" title="Home practice menu">
          <ul className="space-y-4">
            {HOME_MENU.map((item) => (
              <li key={item.drill.key} className="space-y-2 border-2 border-rule p-4">
                <p className="text-lg font-semibold">{item.drill.name}</p>
                <p className="text-sm">
                  <span className="font-semibold">Setup:</span> {item.setup} · <span className="font-semibold">Swings:</span> {item.swings} ·{' '}
                  <span className="font-semibold">Space:</span> {item.space}
                </p>
                <p className="text-sm">
                  <span className="font-semibold">Cue:</span> {item.cue}
                </p>
                <details>
                  <summary className="cursor-pointer text-sm font-semibold text-royal-ink underline">How to do it</summary>
                  <div className="mt-2">
                    <DrillDetails drill={item.drill} />
                  </div>
                </details>
              </li>
            ))}
          </ul>
        </DashboardSection>

        <DashboardSection id="sessions" title="Sample home sessions">
          <ul className="space-y-3">
            {HOME_SESSIONS.map((item) => (
              <li key={item.session}>
                <span className="block font-semibold">{item.session}</span>
                <span className="block text-sm">{item.sequence}</span>
              </li>
            ))}
          </ul>
        </DashboardSection>

        <DashboardSection id="language" title="What to say">
          <ScrollTable label="What to say during home practice">
            <table className="w-full min-w-[36rem] text-left text-sm">
              <caption className="py-2 text-left font-semibold">Praise decisions and effort, not results</caption>
              <thead>
                <tr className="border-b-2 border-rule text-slate">
                  <th scope="col" className="py-2 pr-3">
                    When
                  </th>
                  <th scope="col" className="py-2 pr-3">
                    Try saying
                  </th>
                  <th scope="col" className="py-2 pr-3">
                    Avoid
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-rule">
                {PARENT_LANGUAGE.map((item) => (
                  <tr key={item.situation}>
                    <th scope="row" className="py-2 pr-3 font-semibold">
                      {item.situation}
                    </th>
                    <td className="py-2 pr-3">{item.say}</td>
                    <td className="py-2 pr-3 text-slate">{item.avoid}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ScrollTable>
        </DashboardSection>

        <p className="text-sm text-slate">
          From the Base Recruits hitting development workbook. Reviewed by Base Recruits hitting coaches. Home practice is optional:
          stop for pain and tell the coach, and count games, lessons and team practice before adding more.
        </p>
      </div>
    </>
  );
}
