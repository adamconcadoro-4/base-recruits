import type { Metadata } from 'next';

import { createZoneSessionAction } from '@/app/(app)/assessment/hitting/zones/actions';
import { DashboardSection, PageTitle } from '@/components/app/section';
import { ActionForm } from '@/components/assessment/action-form';
import { AthletePicker } from '@/components/assessment/athlete-picker';
import { formatDateOnly } from '@/components/assessment/result-format';
import { ScrollTable } from '@/components/assessment/scroll-table';
import { ZoneCheckboxes, RoundFields, deliveryForStage } from '@/components/assessment/zones/round-fields';
import { SelectField, TextAreaField, TextField } from '@/components/ui/field';
import { Notice } from '@/components/ui/notice';
import { athleteContext, single, type SearchParams } from '@/lib/assessment/server/page-context';
import { getPlans, listAssessments } from '@/lib/assessment/server/queries';
import { ZONE_CONTENT, drillsForZone, zoneDefinition } from '@/lib/assessment/zones/content';
import { laneLabel } from '@/lib/assessment/zones/geometry';
import { currentStages, zoneList } from '@/lib/assessment/zones/records';
import { getZoneProgress, listZoneSessions } from '@/lib/assessment/zones/server/queries';
import { isZoneId, type ZoneId, type ZoneSide } from '@/lib/assessment/zones/types';
import { SITE_TIME_ZONE } from '@/lib/time';

export const metadata: Metadata = { title: 'Start a session' };

function requestedZones(value: string | string[] | undefined): ZoneId[] {
  const values = (Array.isArray(value) ? value : value ? [value] : []).map(Number).filter(isZoneId);
  return [...new Set(values)].slice(0, 2);
}

/**
 * Session builder: one or two focus zones, a stage, a delivery source, one
 * cue, a target lane, an optional constraint and the predeclared swing/take
 * assignment. Choosing zones first fills in the workbook's cue, lane and
 * drills for them.
 */
export default async function NewZoneSessionPage({ searchParams }: { readonly searchParams: SearchParams }) {
  const { options, selected, failed, query } = await athleteContext(searchParams);
  if (!selected) {
    return (
      <>
        <PageTitle title="Start a session" />
        <Notice tone={failed ? 'error' : 'info'}>{failed ? 'Your athletes didn’t load. Refresh to try again.' : 'There is no athlete to show yet.'}</Notice>
      </>
    );
  }
  const [sessions, progress, assessments, plans] = await Promise.all([
    listZoneSessions(selected.athlete_id),
    getZoneProgress(selected.athlete_id),
    listAssessments(selected.athlete_id),
    getPlans(selected.athlete_id),
  ]);
  const focus = requestedZones(query.zone);
  const sideText = single(query.side);
  const side: ZoneSide = sideText === 'left' || sideText === 'right' ? sideText : (sessions.data[0]?.batting_side ?? 'right');
  const stages = currentStages(progress.data);
  const first = focus[0];
  const stage = first ? (stages.get(first)?.stage ?? 1) : 1;
  const definition = first ? zoneDefinition(first) : null;
  const drill = first ? (drillsForZone(first).find((item) => item.level === ZONE_CONTENT.stages[stage - 1]?.name) ?? drillsForZone(first)[0]) : undefined;
  const hittingAssessments = assessments.data.filter((row) => row.discipline === 'hitting');
  const hittingPlans = plans.data.filter((row) => row.discipline === 'hitting' && row.status === 'active');
  const athleteQuery = selected.relation === 'athlete' ? '' : selected.athlete_id;
  // Today in the site's time zone (an evening practice is not dated tomorrow); the database allows ±1 day.
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: SITE_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

  return (
    <>
      <PageTitle title="Start a session">
        Choose one or two zones, then set the stage, delivery, one cue, the target lane and the swing/take assignment for the first round.
      </PageTitle>
      <div className="space-y-12">
        <AthletePicker options={options} selected={selected} action="/assessment/hitting/zones/sessions/new" />

        <form method="get" action="/assessment/hitting/zones/sessions/new" className="space-y-4 border-2 border-rule p-4 print:hidden">
          <h2 className="text-xl font-semibold text-navy">1. Focus zones</h2>
          {athleteQuery ? <input type="hidden" name="athlete" value={athleteQuery} /> : null}
          <ZoneCheckboxes name="zone" idPrefix="pick" legend="Focus zones (one or two)" checked={focus} testId="pick-zones" />
          <SelectField id="pick-side" name="side" label="Hitter" defaultValue={side} className="max-w-xs">
            <option value="right">Right-handed</option>
            <option value="left">Left-handed</option>
          </SelectField>
          <button type="submit" className="min-h-11 rounded-md border-2 border-navy bg-white px-4 font-semibold text-navy hover:bg-ice">
            Use these zones
          </button>
          {focus.length > 0 ? (
            <p className="text-sm text-slate">
              Filled in below for {zoneList(focus)}
              {first && stages.get(first) ? ` — Zone ${first} is at stage ${stage}` : ' — no stage set yet, so stage 1'}.
            </p>
          ) : null}
        </form>

        <section aria-labelledby="session-details" className="space-y-4">
          <h2 id="session-details" className="text-xl font-semibold text-navy">
            2. Session and first round
          </h2>
          <ActionForm action={createZoneSessionAction} fields={{ athleteId: selected.athlete_id, athleteQuery }} submitLabel="Start session" pendingLabel="Starting…" testId="zone-session-form">
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField id="session-date" name="session_date" label="Session date" type="date" defaultValue={today} required />
            </div>
            <ZoneCheckboxes name="focus_zones" idPrefix="session" legend="Focus zones (one or two)" checked={focus} testId="focus-zones" />
            <SelectField id="session-pairing" name="pairing_key" label="Zone pairing (optional)" defaultValue="" className="max-w-xl">
              <option value="">None</option>
              {ZONE_CONTENT.pairings.map((pairing) => (
                <option key={pairing.key} value={pairing.key}>
                  {pairing.name} — {zoneList(pairing.zones)}
                </option>
              ))}
            </SelectField>
            <RoundFields
              idPrefix="session"
              defaults={{
                side,
                stage,
                delivery: deliveryForStage(stage),
                drillKey: drill?.key ?? null,
                constraintKey: null,
                cue: definition?.cue ?? '',
                lane: definition ? laneLabel(definition.targetLane, side) : '',
                plannedReps: 10,
                intendedZones: focus,
                assignmentKind: stage >= 5 ? 'free' : 'mandatory_swing',
                swingZones: [],
                recognitionRequired: false,
                focusZones: focus,
              }}
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField
                id="session-quality"
                name="contact_quality_definition"
                label="What counts as hard targeted contact"
                maxLength={200}
                hint="Agree it before the round, e.g. “hard line drive or hard ground ball into the target lane”."
              />
              <TextField id="session-equipment" name="equipment" label="Equipment" maxLength={200} hint="Bat, balls, screen, machine model." />
              <TextField id="session-capture" name="capture_conditions" label="Capture conditions" maxLength={300} hint="Indoor or outdoor, camera position, who recorded." />
              <SelectField id="session-assessment" name="assessment_id" label="Linked hitting assessment (optional)" defaultValue="">
                <option value="">None</option>
                {hittingAssessments.map((row) => (
                  <option key={row.id} value={row.id}>
                    {formatDateOnly(row.assessment_date)} · {row.status.replace(/_/g, ' ')}
                  </option>
                ))}
              </SelectField>
              <SelectField id="session-plan" name="plan_id" label="Linked training plan (optional)" defaultValue="">
                <option value="">None</option>
                {hittingPlans.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.title}
                  </option>
                ))}
              </SelectField>
            </div>
            <TextAreaField id="session-notes" name="notes" label="Notes (optional)" maxLength={1000} />
          </ActionForm>
        </section>

        <DashboardSection id="template" title="Session template" description="From the workbook: short rounds with a review between them. Add one demand at a time.">
          <ScrollTable label="Session template">
            <table className="w-full min-w-[36rem] text-left text-sm">
              <thead>
                <tr className="border-b-2 border-rule">
                  <th scope="col" className="py-2 pr-3">Segment</th>
                  <th scope="col" className="py-2 pr-3">Time</th>
                  <th scope="col" className="py-2 pr-3">Volume</th>
                  <th scope="col" className="py-2">Task</th>
                </tr>
              </thead>
              <tbody>
                {ZONE_CONTENT.sessionPlan.map((row) => (
                  <tr key={row.segment} className="border-b border-rule align-top">
                    <th scope="row" className="py-2 pr-3 font-semibold">{row.segment}</th>
                    <td className="py-2 pr-3">{row.time}</td>
                    <td className="py-2 pr-3">{row.volume}</td>
                    <td className="py-2">{row.task}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ScrollTable>
        </DashboardSection>

        <DashboardSection
          id="delivery-plan"
          title="Delivery Plan"
          description="For whoever delivers batting practice (coach, machine operator or live pitcher). Not a pitching assessment and not a throwing-workload prescription."
        >
          <ul className="space-y-3">
            {ZONE_CONTENT.deliveryPlan.map((row) => (
              <li key={row.finding} className="border-l-4 border-rule pl-4">
                <p className="font-semibold text-navy">{row.finding}</p>
                <p>{row.plan}</p>
                <p className="text-sm text-slate">Guardrail: {row.guardrail}</p>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-sm text-slate">{ZONE_CONTENT.startHere.find((item) => item.topic === 'Pitch delivery and safety')?.text}</p>
        </DashboardSection>
      </div>
    </>
  );
}
