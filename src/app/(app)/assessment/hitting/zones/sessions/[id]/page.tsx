import type { Metadata } from 'next';
import Link from 'next/link';
import type { ReactNode } from 'react';

import { addZoneRoundAction, setZoneAssignmentAction } from '@/app/(app)/assessment/hitting/zones/actions';
import { loadSession, type SessionParams } from '@/app/(app)/assessment/hitting/zones/sessions/[id]/load';
import { Tracker, type TrackerEntry } from '@/app/(app)/assessment/hitting/zones/sessions/[id]/tracker';
import { DashboardSection, PageTitle } from '@/components/app/section';
import { ActionForm } from '@/components/assessment/action-form';
import { formatDateOnly } from '@/components/assessment/result-format';
import { zoneHref } from '@/components/assessment/zones/links';
import { RoundFields, ZoneCheckboxes } from '@/components/assessment/zones/round-fields';
import { ButtonLink } from '@/components/ui/button';
import { Notice } from '@/components/ui/notice';
import type { SearchParams } from '@/lib/assessment/server/page-context';
import { getMediaForAthlete } from '@/lib/assessment/server/queries';
import { zoneStage } from '@/lib/assessment/zones/content';
import { metricText, summarizeZoneEvents } from '@/lib/assessment/zones/metrics';
import {
  ASSIGNMENT_LABELS,
  DELIVERY_LABELS,
  assignmentText,
  constraintLabel,
  drillLabel,
  pairingLabel,
  proposedStage,
  sideLabel,
  toZoneEvent,
  zoneList,
} from '@/lib/assessment/zones/records';
import { ASSIGNMENT_KINDS, isZoneId } from '@/lib/assessment/zones/types';

export const metadata: Metadata = { title: 'Live Tracker' };

export default async function ZoneSessionPage({ params, searchParams }: { readonly params: SessionParams; readonly searchParams: SearchParams }) {
  const { detail, athlete, editable } = await loadSession(params, searchParams);
  const { session, rounds, assignments, events } = detail;
  const round = rounds[rounds.length - 1];
  if (!round) return <Notice tone="error">This session has no rounds.</Notice>;
  const roundAssignments = assignments.filter((item) => item.round_id === round.id).sort((a, b) => a.version - b.version);
  const assignment = roundAssignments[roundAssignments.length - 1];
  if (!assignment) return <Notice tone="error">This round has no assignment.</Notice>;
  const assignmentById = new Map(assignments.map((item) => [item.id, item]));
  const clips = (await getMediaForAthlete(session.athlete_id)).map((media) => ({
    id: media.id,
    label: `${media.label ?? media.original_name ?? 'Clip'} · ${formatDateOnly(media.created_at)}`,
  }));
  const initial: TrackerEntry[] = events
    .filter((event) => event.round_id === round.id)
    .sort((a, b) => a.seq - b.seq)
    .flatMap((row) => {
      const used = assignmentById.get(row.assignment_id);
      return used ? [{ key: row.id, id: row.id, seq: row.seq, status: 'saved' as const, event: toZoneEvent(row, used), input: null }] : [];
    });
  const reviewHref = zoneHref(`/assessment/hitting/zones/sessions/${session.id}/review`, athlete, {}, `round-${round.seq}`);
  const correctHref = zoneHref(`/assessment/hitting/zones/sessions/${session.id}/review`, athlete);
  const athleteQuery = athlete.relation === 'athlete' ? '' : athlete.athlete_id;
  const isCoach = athlete.relation === 'development_coach';
  // The athlete's side cannot change the assignment of a round the coach started.
  const canChangeAssignment = editable && (isCoach || round.source_kind === 'self');
  const stageInfo = zoneStage(round.stage);
  const nextStage = proposedStage(round.stage, round.response);

  return (
    <>
      <PageTitle title="Live Tracker">
        {formatDateOnly(session.session_date)} · {zoneList(session.focus_zones)} · {sideLabel(round.batting_side)}
      </PageTitle>
      <div className="space-y-10">
        <div className="flex flex-wrap gap-3 print:hidden">
          <ButtonLink href={zoneHref(`/assessment/hitting/zones/sessions/${session.id}/review`, athlete)} variant="secondary" data-testid="open-review">
            Review session
          </ButtonLink>
          <ButtonLink href={zoneHref('/assessment/hitting/zones/sessions', athlete)} variant="quiet">
            All sessions
          </ButtonLink>
        </div>

        <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Plan term="Drill">{drillLabel(round.drill_key ?? session.drill_key) ?? 'None chosen'}</Plan>
          <Plan term="Pairing">{pairingLabel(session.pairing_key) ?? 'None'}</Plan>
          <Plan term="One cue">{round.primary_cue ?? session.primary_cue ?? 'None set'}</Plan>
          <Plan term="Target lane">{round.target_lane ?? session.target_lane ?? 'None set'}</Plan>
          <Plan term="Constraint">{constraintLabel(round.constraint_key) ?? 'None'}</Plan>
          <Plan term="Hard targeted contact means">{session.contact_quality_definition ?? 'Not defined for this session'}</Plan>
        </dl>

        <section id="tracker" aria-labelledby="round-title" className="scroll-mt-24 space-y-4">
          <div className="space-y-1 border-l-4 border-navy pl-4">
            <h2 id="round-title" className="text-3xl text-navy">
              Round {round.seq}
            </h2>
            <p>
              Stage {round.stage}
              {stageInfo ? ` · ${stageInfo.name}` : ''} · {DELIVERY_LABELS[round.delivery_source]}
              {round.planned_reps ? ` · ${round.planned_reps} planned` : ''}
              {round.intended_zones.length > 0 ? ` · planned to ${zoneList(round.intended_zones)}` : ''}
            </p>
            <p className="font-semibold" data-testid="current-assignment">
              Assignment v{assignment.version}: {assignmentText(assignment)}
            </p>
          </div>
          <Tracker
            key={`${round.id}:${assignment.id}`}
            roundId={round.id}
            roundSeq={round.seq}
            side={round.batting_side}
            delivery={round.delivery_source}
            assignment={{ kind: assignment.kind, swingZones: assignment.swing_zones.filter(isZoneId), recognitionRequired: assignment.recognition_required }}
            intendedZones={round.intended_zones}
            initial={initial}
            clips={clips}
            editable={editable}
            reviewHref={reviewHref}
            correctHref={correctHref}
          />
        </section>

        {canChangeAssignment ? (
          <details className="rounded-md border-2 border-rule p-4">
            <summary className="cursor-pointer font-semibold text-royal-ink">Change this round’s assignment</summary>
            <ActionForm action={setZoneAssignmentAction} fields={{ roundId: round.id }} submitLabel="Change assignment" className="mt-4" testId="change-assignment">
              <fieldset className="space-y-2">
                <legend className="font-semibold">New assignment</legend>
                {ASSIGNMENT_KINDS.map((kind) => (
                  <label key={kind} htmlFor={`change-kind-${kind}`} className="flex min-h-11 items-center gap-3">
                    <input id={`change-kind-${kind}`} type="radio" name="assignment_kind" value={kind} defaultChecked={assignment.kind === kind} className="size-5" required />
                    <span>{ASSIGNMENT_LABELS[kind]}</span>
                  </label>
                ))}
              </fieldset>
              <ZoneCheckboxes name="swing_zones" idPrefix="change" legend="For selective: zones the hitter may swing at" checked={assignment.swing_zones} />
              <label htmlFor="change-recognition" className="flex min-h-11 items-center gap-3">
                <input id="change-recognition" type="checkbox" name="recognition_required" defaultChecked={assignment.recognition_required} className="size-5" />
                <span>The hitter calls ball or strike on every pitch</span>
              </label>
            </ActionForm>
          </details>
        ) : null}

        {editable ? (
          <DashboardSection
            id="next-round"
            title="Start the next round"
            description={`Proposed: stage ${nextStage}${round.response ? ` (round ${round.seq} was marked “${round.response}”)` : ''}. Change one thing at a time so rounds stay comparable.`}
          >
            <ActionForm action={addZoneRoundAction} fields={{ sessionId: session.id, athleteQuery }} submitLabel={`Start round ${round.seq + 1}`} pendingLabel="Starting…" testId="next-round-form">
              <RoundFields
                idPrefix="next"
                defaults={{
                  side: round.batting_side,
                  stage: nextStage,
                  delivery: round.delivery_source,
                  drillKey: round.drill_key,
                  constraintKey: round.constraint_key,
                  cue: round.primary_cue ?? '',
                  lane: round.target_lane ?? '',
                  plannedReps: round.planned_reps,
                  intendedZones: round.intended_zones,
                  assignmentKind: assignment.kind,
                  swingZones: assignment.swing_zones,
                  recognitionRequired: assignment.recognition_required,
                  focusZones: session.focus_zones,
                }}
              />
            </ActionForm>
          </DashboardSection>
        ) : null}

        {rounds.length > 1 ? (
          <DashboardSection id="rounds" title="Earlier rounds">
            <ol className="space-y-3">
              {rounds.slice(0, -1).map((item) => {
                const summary = summarizeZoneEvents(
                  events.filter((event) => event.round_id === item.id).flatMap((row) => {
                    const used = assignmentById.get(row.assignment_id);
                    return used ? [toZoneEvent(row, used)] : [];
                  }),
                );
                return (
                  <li key={item.id} className="border-l-4 border-rule pl-4">
                    <p className="font-semibold text-navy">
                      Round {item.seq} · stage {item.stage} · {DELIVERY_LABELS[item.delivery_source]}
                      {item.response ? ` · ${item.response}` : ''}
                    </p>
                    <p className="text-slate">
                      {summary.counts.pitches} pitches · strike contact {metricText(summary.pitch.strike_contact)} · decisions {metricText(summary.pitch.decision)}
                      {summary.counts.teeSwings > 0 ? ` · ${summary.counts.teeSwings} tee swings` : ''}
                    </p>
                  </li>
                );
              })}
            </ol>
            <p className="mt-3">
              <Link href={zoneHref(`/assessment/hitting/zones/sessions/${session.id}/review`, athlete)} className="font-semibold text-royal-ink underline">
                Full review with every entry
              </Link>
            </p>
          </DashboardSection>
        ) : null}
      </div>
    </>
  );
}

function Plan({ term, children }: { readonly term: string; readonly children: ReactNode }) {
  return (
    <div className="border-l-4 border-rule pl-3">
      <dt className="text-sm font-semibold text-slate">{term}</dt>
      <dd>{children}</dd>
    </div>
  );
}
