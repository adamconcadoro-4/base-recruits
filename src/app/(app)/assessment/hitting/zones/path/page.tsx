import type { Metadata } from 'next';
import Link from 'next/link';

import { DashboardSection, PageTitle } from '@/components/app/section';
import { AthletePicker } from '@/components/assessment/athlete-picker';
import { formatDateOnly } from '@/components/assessment/result-format';
import { ScrollTable } from '@/components/assessment/scroll-table';
import { zoneHref } from '@/components/assessment/zones/links';
import { StageForm } from '@/components/assessment/zones/stage-form';
import { Notice } from '@/components/ui/notice';
import { athleteContext, type SearchParams } from '@/lib/assessment/server/page-context';
import { getSwitches } from '@/lib/assessment/server/queries';
import { zoneStage } from '@/lib/assessment/zones/content';
import { metricText } from '@/lib/assessment/zones/metrics';
import { STAGE_DECISION_LABELS, comparableGroups, currentStages, dailyLog, zoneList } from '@/lib/assessment/zones/records';
import { getAthleteZoneData } from '@/lib/assessment/zones/server/queries';
import { ZONE_IDS } from '@/lib/assessment/zones/types';

export const metadata: Metadata = { title: 'Development Path' };

/**
 * Stage by zone with its history, the daily log generated from saved
 * sessions, and comparisons made only within compatible conditions.
 */
export default async function DevelopmentPathPage({ searchParams }: { readonly searchParams: SearchParams }) {
  const { options, selected, failed } = await athleteContext(searchParams);
  if (!selected) {
    return (
      <>
        <PageTitle title="Development Path" />
        <Notice tone={failed ? 'error' : 'info'}>{failed ? 'Your athletes didn’t load. Refresh to try again.' : 'There is no athlete to show yet.'}</Notice>
      </>
    );
  }
  const [data, switches] = await Promise.all([getAthleteZoneData(selected.athlete_id), getSwitches()]);
  const editable = Boolean(switches?.enabled);
  const stages = currentStages(data.progress);
  const log = dailyLog(data.sessions, data.items);
  const groups = comparableGroups(data.items);

  return (
    <>
      <PageTitle title="Development Path">
        Each zone moves through the nine stages at its own pace. Changes need a reason and evidence; suggested volumes and targets are the coach’s
        planning choices, not pass/fail rules.
      </PageTitle>
      <div className="space-y-12">
        <AthletePicker options={options} selected={selected} action="/assessment/hitting/zones/path" />
        {data.failed ? <Notice tone="error">Some records didn’t load. Refresh to try again.</Notice> : null}

        <DashboardSection id="stages" title="Stage by zone">
          <ScrollTable label="Stage by zone">
            <table className="w-full min-w-[40rem] text-left">
              <thead>
                <tr className="border-b-2 border-rule">
                  <th scope="col" className="py-2 pr-4">Zone</th>
                  <th scope="col" className="py-2 pr-4">Stage</th>
                  <th scope="col" className="py-2 pr-4">Last decision</th>
                  <th scope="col" className="py-2">Reason</th>
                </tr>
              </thead>
              <tbody>
                {ZONE_IDS.map((zone) => {
                  const current = stages.get(zone);
                  return (
                    <tr key={zone} className="border-b border-rule align-top">
                      <th scope="row" className="py-2 pr-4 font-semibold">
                        <a href={`#zone-${zone}`} className="text-royal-ink underline">
                          Zone {zone}
                        </a>
                      </th>
                      <td className="py-2 pr-4" data-testid={`path-stage-${zone}`}>
                        {current ? `${current.stage}. ${zoneStage(current.stage)?.name ?? ''}` : 'Not set'}
                      </td>
                      <td className="py-2 pr-4">{current ? `${STAGE_DECISION_LABELS[current.decision]} · ${formatDateOnly(current.decidedAt)}` : '—'}</td>
                      <td className="py-2">{current?.reason ?? '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </ScrollTable>
          <div className="mt-6 grid gap-6 md:grid-cols-2 xl:grid-cols-3">
            {ZONE_IDS.map((zone) => (
              <div key={zone} id={`zone-${zone}`} className="scroll-mt-24">
                <StageForm zone={zone} current={stages.get(zone)?.stage ?? null} athleteId={selected.athlete_id} editable={editable} />
              </div>
            ))}
          </div>
        </DashboardSection>

        <DashboardSection id="history" title="Stage history">
          {data.progress.length === 0 ? (
            <p className="text-slate">No stage decisions yet.</p>
          ) : (
            <ol className="space-y-2">
              {data.progress.slice(0, 40).map((row) => (
                <li key={row.id} className="border-l-4 border-rule pl-3">
                  <span className="font-semibold">
                    Zone {row.zone}: {STAGE_DECISION_LABELS[row.decision]} → stage {row.stage}
                  </span>{' '}
                  <span className="text-slate">
                    · {formatDateOnly(row.created_at)} · {row.source_kind === 'development_coach' ? 'coach' : 'athlete side'}
                  </span>
                  <p>{row.reason}</p>
                  {row.evidence ? <p className="text-sm text-slate">Evidence: {row.evidence}</p> : null}
                </li>
              ))}
            </ol>
          )}
        </DashboardSection>

        <DashboardSection
          id="daily-log"
          title="Daily log"
          description="Generated from saved sessions — nothing is re-entered by hand. Pitched balls only; tee swings are counted but never mixed into these rates."
        >
          {log.length === 0 ? (
            <p className="text-slate">No sessions yet.</p>
          ) : (
            <ScrollTable label="Daily log">
              <table className="w-full min-w-[64rem] text-left text-sm">
                <thead>
                  <tr className="border-b-2 border-rule">
                    <th scope="col" className="py-2 pr-3">Date</th>
                    <th scope="col" className="py-2 pr-3">Focus zones</th>
                    <th scope="col" className="py-2 pr-3">Stage</th>
                    <th scope="col" className="py-2 pr-3">Pitches</th>
                    <th scope="col" className="py-2 pr-3">Swings</th>
                    <th scope="col" className="py-2 pr-3">Tee swings</th>
                    <th scope="col" className="py-2 pr-3">Hard targeted</th>
                    <th scope="col" className="py-2 pr-3">Correct depth</th>
                    <th scope="col" className="py-2 pr-3">Decisions</th>
                    <th scope="col" className="py-2 pr-3">Chase</th>
                    <th scope="col" className="py-2 pr-3">Posture errors</th>
                    <th scope="col" className="py-2 pr-3">One cue</th>
                    <th scope="col" className="py-2">Next adjustment</th>
                  </tr>
                </thead>
                <tbody>
                  {log.map((row) => (
                    <tr key={row.date} className="border-b border-rule align-top">
                      <th scope="row" className="py-2 pr-3 font-semibold">
                        {formatDateOnly(row.date)}
                      </th>
                      <td className="py-2 pr-3">{zoneList(row.focusZones)}</td>
                      <td className="py-2 pr-3">{row.stages.join(', ')}</td>
                      <td className="py-2 pr-3">{row.pitches}</td>
                      <td className="py-2 pr-3">{row.swings}</td>
                      <td className="py-2 pr-3">{row.teeSwings}</td>
                      <td className="py-2 pr-3">{metricText(row.hardTargeted)}</td>
                      <td className="py-2 pr-3">{metricText(row.depth)}</td>
                      <td className="py-2 pr-3">{metricText(row.decision)}</td>
                      <td className="py-2 pr-3">{metricText(row.chase)}</td>
                      <td className="py-2 pr-3">{metricText(row.posture)}</td>
                      <td className="py-2 pr-3">{row.cues.join('; ') || '—'}</td>
                      <td className="py-2">{row.nextAdjustments.join('; ') || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </ScrollTable>
          )}
        </DashboardSection>

        <DashboardSection
          id="compare"
          title="Compare compatible sessions"
          description="Sessions are grouped only when the kind of repetition, stage, delivery, assignment, batting side and calculation version match. Totals add the counts; percentages are never averaged."
        >
          {groups.length === 0 ? (
            <p className="text-slate">Nothing to compare yet.</p>
          ) : (
            <div className="space-y-8">
              {groups.slice(0, 8).map((group) => {
                const pitch = group.key.kind === 'pitch';
                return (
                  <section key={group.id} aria-label={group.label} className="space-y-2" data-testid="compare-group">
                    <h3 className="text-lg font-semibold text-navy">{group.label}</h3>
                    <ScrollTable label={group.label}>
                      <table className="w-full min-w-[40rem] text-left text-sm">
                        <thead>
                          <tr className="border-b-2 border-rule">
                            <th scope="col" className="py-2 pr-3">Date</th>
                            <th scope="col" className="py-2 pr-3">{pitch ? 'Pitches' : 'Repetitions'}</th>
                            <th scope="col" className="py-2 pr-3">{pitch ? 'Strike contact' : 'Contact'}</th>
                            <th scope="col" className="py-2 pr-3">Correct depth</th>
                            {pitch ? <th scope="col" className="py-2 pr-3">Decisions</th> : null}
                            {pitch ? <th scope="col" className="py-2">Chase</th> : null}
                          </tr>
                        </thead>
                        <tbody>
                          {[...group.sessions.map((item) => ({ label: formatDateOnly(item.date), summary: item.summary })), { label: 'All compatible sessions', summary: group.total }].map(
                            (row) => (
                              <tr key={row.label} className="border-b border-rule">
                                <th scope="row" className="py-2 pr-3 font-semibold">
                                  {row.label}
                                </th>
                                <td className="py-2 pr-3">{pitch ? row.summary.counts.pitches : row.summary.counts.teeSwings + row.summary.counts.dryReps}</td>
                                <td className="py-2 pr-3">{metricText(pitch ? row.summary.pitch.strike_contact : row.summary.reps.contact)}</td>
                                <td className="py-2 pr-3">{metricText(pitch ? row.summary.pitch.depth : row.summary.reps.depth)}</td>
                                {pitch ? <td className="py-2 pr-3">{metricText(row.summary.pitch.decision)}</td> : null}
                                {pitch ? <td className="py-2">{metricText(row.summary.pitch.chase)}</td> : null}
                              </tr>
                            ),
                          )}
                        </tbody>
                      </table>
                    </ScrollTable>
                  </section>
                );
              })}
            </div>
          )}
          <p className="mt-4 text-sm text-slate">
            Training never changes an assessment score. To measure change against the assessment, start a{' '}
            <Link href={zoneHref('/assessment/hitting', selected)} className="font-semibold text-royal-ink underline">
              hitting reassessment
            </Link>
            .
          </p>
        </DashboardSection>
      </div>
    </>
  );
}
