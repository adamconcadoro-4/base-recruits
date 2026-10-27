import type { Metadata } from 'next';
import Link from 'next/link';
import type { ReactNode } from 'react';

import {
  approveZoneNextPlanAction,
  deleteZoneSessionAction,
  reviewZoneRoundAction,
  reviewZoneSessionAction,
} from '@/app/(app)/assessment/hitting/zones/actions';
import { loadSession, type SessionParams } from '@/app/(app)/assessment/hitting/zones/sessions/[id]/load';
import { ReviewEntries, type ReviewEntry } from '@/app/(app)/assessment/hitting/zones/sessions/[id]/review-entries';
import { DashboardSection, PageTitle } from '@/components/app/section';
import { ActionForm } from '@/components/assessment/action-form';
import { PrintButton } from '@/components/assessment/print-button';
import { formatDateOnly } from '@/components/assessment/result-format';
import { ScrollTable } from '@/components/assessment/scroll-table';
import { clipHref, zoneHref } from '@/components/assessment/zones/links';
import { MetricList } from '@/components/assessment/zones/metric-list';
import { ZoneCheckboxes } from '@/components/assessment/zones/round-fields';
import { StageForm } from '@/components/assessment/zones/stage-form';
import { ButtonLink, buttonStyles } from '@/components/ui/button';
import { SelectField, TextAreaField, TextField } from '@/components/ui/field';
import { Notice } from '@/components/ui/notice';
import { StatusChip } from '@/components/ui/status-chip';
import type { SearchParams } from '@/lib/assessment/server/page-context';
import { getAssessment, getMediaForAthlete } from '@/lib/assessment/server/queries';
import { ZONE_CONSTRAINT_CATEGORIES, ZONE_CONTENT, zoneStage } from '@/lib/assessment/zones/content';
import { countOf, eventToEntry, entrySummary } from '@/lib/assessment/zones/entry';
import { metricText, summarizeZoneEvents } from '@/lib/assessment/zones/metrics';
import {
  CONTACT_LABELS,
  DELIVERY_LABELS,
  ROUND_RESPONSE_LABELS,
  assignmentText,
  constraintLabel,
  currentStages,
  drillLabel,
  pairingLabel,
  sideLabel,
  toZoneEvent,
  zoneList,
  type ZoneEventRow,
} from '@/lib/assessment/zones/records';
import { getZoneProgress } from '@/lib/assessment/zones/server/queries';
import { MIN_ZONE_SAMPLE, REVIEW_BELOW, SIMPLIFY_BELOW, zonePrompts } from '@/lib/assessment/zones/suggestions';
import { ROUND_RESPONSES, ZONE_CALC_VERSION, ZONE_IDS, isZoneId, type ZoneId } from '@/lib/assessment/zones/types';

export const metadata: Metadata = { title: 'Session Review' };

function yesNo(value: boolean | null, yes: string, no: string): string | null {
  if (value === null) return null;
  return value ? yes : no;
}

function entryDetails(row: ZoneEventRow): string {
  const parts = [
    row.intended_zone ? `planned Zone ${row.intended_zone}` : null,
    row.location === 'unknown' && row.pitch_class ? `recorded as a ${row.pitch_class}` : null,
    row.contact ? CONTACT_LABELS[row.contact] : null,
    yesNo(row.hard_targeted, 'hard in lane', 'not hard in lane'),
    yesNo(row.depth_correct, 'depth right', 'depth off'),
    yesNo(row.lane_correct, 'in the lane', 'out of the lane'),
    yesNo(row.posture_error, 'posture error', 'posture fine'),
    row.recognition_call ? `called ${row.recognition_call}` : null,
    row.forced_take ? 'required take' : null,
    row.off_plan ? `off-plan${row.off_plan_reason ? ` (${row.off_plan_reason})` : ''}` : null,
    row.voided ? `left out: ${row.void_reason ?? ''}` : null,
    row.evidence_method === 'video' ? 'scored from video' : null,
    row.note,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(' · ') : 'No further observations';
}

export default async function ZoneSessionReviewPage({ params, searchParams }: { readonly params: SessionParams; readonly searchParams: SearchParams }) {
  const { detail, athlete, editable } = await loadSession(params, searchParams);
  const { session, rounds, assignments, events, items } = detail;
  const isCoach = athlete.relation === 'development_coach';
  const [media, progress, linkedAssessment] = await Promise.all([
    getMediaForAthlete(session.athlete_id),
    getZoneProgress(session.athlete_id),
    session.assessment_id ? getAssessment(session.assessment_id) : Promise.resolve(null),
  ]);
  const clips = media.map((item) => ({ id: item.id, label: `${item.label ?? item.original_name ?? 'Clip'} · ${formatDateOnly(item.created_at)}` }));
  const assignmentById = new Map(assignments.map((item) => [item.id, item]));
  const summary = summarizeZoneEvents(items.map((item) => item.event));
  const stages = currentStages(progress.data);
  const focus = session.focus_zones.filter(isZoneId);
  const prompts = zonePrompts(summary, (zone) => stages.get(zone)?.stage ?? session.stage, focus[0] ?? null);
  const athleteQuery = athlete.relation === 'athlete' ? '' : athlete.athlete_id;
  const zonesWithEntries = summary.byZone.filter((zone) => zone.pitches > 0 || zone.teeSwings > 0);
  const clipEntries = events.filter((row) => row.media_id);

  return (
    <>
      <PageTitle title="Session Review">
        {formatDateOnly(session.session_date)} · {zoneList(session.focus_zones)} · {sideLabel(session.batting_side)}
      </PageTitle>
      <div className="space-y-12">
        <div className="flex flex-wrap gap-3 print:hidden">
          {editable ? (
            <ButtonLink href={zoneHref(`/assessment/hitting/zones/sessions/${session.id}`, athlete, {}, 'tracker')} variant="secondary">
              Back to the tracker
            </ButtonLink>
          ) : null}
          <PrintButton />
          <a href={`/assessment/hitting/zones/sessions/${session.id}/export`} className={buttonStyles({ variant: 'quiet' })} download>
            Download entries (CSV)
          </a>
        </div>

        <DashboardSection id="protocol" title="Athlete and protocol">
          <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Fact term="Athlete">{athlete.relation === 'athlete' ? 'You' : (athlete.athlete_name ?? 'Athlete')}</Fact>
            <Fact term="Recorded by">{session.source_kind === 'development_coach' ? 'Development coach' : 'Athlete or family'}</Fact>
            <Fact term="Starting stage">
              {session.stage}. {zoneStage(session.stage)?.name}
            </Fact>
            <Fact term="Delivery">{DELIVERY_LABELS[session.delivery_source]}</Fact>
            <Fact term="Drill">{drillLabel(session.drill_key) ?? 'None chosen'}</Fact>
            <Fact term="Pairing">{pairingLabel(session.pairing_key) ?? 'None'}</Fact>
            <Fact term="One cue">{session.primary_cue ?? 'None set'}</Fact>
            <Fact term="Target lane">{session.target_lane ?? 'None set'}</Fact>
            <Fact term="Constraint">{constraintLabel(session.constraint_key) ?? 'None'}</Fact>
            <Fact term="Hard targeted contact means">{session.contact_quality_definition ?? 'Not defined'}</Fact>
            <Fact term="Equipment and capture">{[session.equipment, session.capture_conditions].filter(Boolean).join(' · ') || 'Not recorded'}</Fact>
            <Fact term="Linked assessment">
              {linkedAssessment ? (
                <Link href={zoneHref(`/assessment/${linkedAssessment.id}`, null)} className="font-semibold text-royal-ink underline">
                  Hitting assessment of {formatDateOnly(linkedAssessment.assessment_date)}
                </Link>
              ) : (
                'None'
              )}
            </Fact>
          </dl>
          {session.notes ? <p className="mt-3">{session.notes}</p> : null}
          <p className="mt-3 text-sm text-slate">Calculated with {ZONE_CALC_VERSION}. Rates add counts across rounds; nothing is averaged.</p>
        </DashboardSection>

        <DashboardSection id="results" title="Results with counts">
          <p className="mb-4" data-testid="session-counts">
            {countOf(summary.counts.pitches, 'pitch', 'pitches')} · {countOf(summary.counts.swings, 'swing')} · {countOf(summary.counts.strikes, 'strike')} ·{' '}
            {countOf(summary.counts.balls, 'ball')} · {summary.counts.unknownClass} with unknown location · {countOf(summary.counts.teeSwings, 'tee swing')} ·{' '}
            {countOf(summary.counts.dryReps, 'dry rep')}
            {summary.counts.voided > 0 ? ` · ${summary.counts.voided} left out` : ''}
          </p>
          {summary.counts.pitches > 0 ? (
            <div className="space-y-6">
              <div>
                <h3 className="mb-2 text-xl font-semibold text-navy">Hitting results (pitched balls)</h3>
                <MetricList
                  caption="Hitting results"
                  results={[summary.pitch.strike_contact, summary.pitch.hard_targeted, summary.pitch.depth, summary.pitch.lane, summary.pitch.posture_per10]}
                />
              </div>
              <div>
                <h3 className="mb-2 text-xl font-semibold text-navy">Decision & Recognition</h3>
                <MetricList caption="Decision and recognition" results={[summary.pitch.decision, summary.pitch.chase, summary.pitch.recognition]} />
              </div>
            </div>
          ) : null}
          {summary.counts.teeSwings + summary.counts.dryReps > 0 ? (
            <div className="mt-6">
              <h3 className="mb-2 text-xl font-semibold text-navy">Tee swings and dry reps (kept apart from pitches)</h3>
              <MetricList caption="Repetition results" results={[summary.reps.contact, summary.reps.hard_targeted, summary.reps.depth, summary.reps.lane, summary.reps.posture_per10]} />
            </div>
          ) : null}
          {summary.counts.pitches + summary.counts.teeSwings + summary.counts.dryReps === 0 ? <p className="text-slate">No entries yet.</p> : null}
        </DashboardSection>

        <DashboardSection id="delivery" title="Planned versus actual delivery" description="Delivery quality is shown apart from the hitter’s results.">
          <ul className="space-y-1">
            <li>
              {summary.counts.planned > 0
                ? `${summary.counts.onTarget} of ${summary.counts.planned} pitches with a planned zone arrived in it.`
                : 'No planned zones were recorded on pitches.'}
            </li>
            <li data-testid="off-plan">Off-plan deliveries: {metricText(summary.pitch.off_plan)}</li>
            <li>
              Outside the zone: {summary.outside.out_high} high, {summary.outside.out_low} low, {summary.outside.out_in} inside, {summary.outside.out_away} away ·{' '}
              {summary.outside.unknown} location unknown
            </li>
          </ul>
        </DashboardSection>

        <DashboardSection id="by-zone" title="Results by zone">
          {zonesWithEntries.length === 0 ? (
            <p className="text-slate">No entries in the zones yet.</p>
          ) : (
            <ScrollTable label="Results by zone">
              <table className="w-full min-w-[48rem] text-left text-sm">
                <thead>
                  <tr className="border-b-2 border-rule">
                    <th scope="col" className="py-2 pr-3">Zone</th>
                    <th scope="col" className="py-2 pr-3">Pitches</th>
                    <th scope="col" className="py-2 pr-3">Strike contact</th>
                    <th scope="col" className="py-2 pr-3">Correct depth</th>
                    <th scope="col" className="py-2 pr-3">In the lane</th>
                    <th scope="col" className="py-2 pr-3">Hard targeted</th>
                    <th scope="col" className="py-2">Tee contact</th>
                  </tr>
                </thead>
                <tbody>
                  {zonesWithEntries.map((zone) => (
                    <tr key={zone.zone} className="border-b border-rule">
                      <th scope="row" className="py-2 pr-3 font-semibold">
                        Zone {zone.zone}
                      </th>
                      <td className="py-2 pr-3">{zone.pitches}</td>
                      <td className="py-2 pr-3">{metricText(zone.pitch.strike_contact)}</td>
                      <td className="py-2 pr-3">{metricText(zone.pitch.depth)}</td>
                      <td className="py-2 pr-3">{metricText(zone.pitch.lane)}</td>
                      <td className="py-2 pr-3">{metricText(zone.pitch.hard_targeted)}</td>
                      <td className="py-2">{zone.teeSwings > 0 ? metricText(zone.tee.contact) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </ScrollTable>
          )}
        </DashboardSection>

        <DashboardSection id="rounds" title="Rounds and entries">
          <div className="space-y-10">
            {rounds.map((round) => {
              const versions = assignments.filter((item) => item.round_id === round.id).sort((a, b) => a.version - b.version);
              const roundRows = events.filter((row) => row.round_id === round.id).sort((a, b) => a.seq - b.seq);
              const recognition = versions.some((item) => item.recognition_required);
              const roundEvents = roundRows.flatMap((row) => {
                const used = assignmentById.get(row.assignment_id);
                return used ? [{ row, used, event: toZoneEvent(row, used) }] : [];
              });
              const reviewEntries: ReviewEntry[] = roundEvents.map(({ row, used, event }) => ({
                id: row.id,
                seq: row.seq,
                roundSeq: round.seq,
                summary: `${entrySummary({ kind: row.kind, location: row.location, response: row.response, contact: row.contact, voided: row.voided }, row.seq)}${
                  versions.length > 1 ? ` (assignment v${used.version})` : ''
                }`,
                details: entryDetails(row),
                coachLogged: row.source_kind === 'development_coach',
                clipHref: row.media_id ? clipHref(athlete, row.media_id, row.clip_time_ms) : null,
                input: eventToEntry(event, {
                  pitch_type: row.pitch_type,
                  off_plan_reason: row.off_plan_reason,
                  void_reason: row.void_reason,
                  media_id: row.media_id,
                  clip_time_ms: row.clip_time_ms,
                  note: row.note,
                  evidence_method: row.evidence_method,
                }),
                intendedZones: round.intended_zones,
                recognitionRequired: recognition,
              }));
              const roundSummary = summarizeZoneEvents(roundEvents.map((item) => item.event));
              return (
                <section key={round.id} id={`round-${round.seq}`} aria-labelledby={`round-${round.seq}-heading`} className="scroll-mt-24 space-y-4">
                  <h3 id={`round-${round.seq}-heading`} className="text-2xl text-navy">
                    Round {round.seq} · stage {round.stage} · {DELIVERY_LABELS[round.delivery_source]} · {sideLabel(round.batting_side)}
                  </h3>
                  <ul className="text-slate">
                    {versions.map((item) => (
                      <li key={item.id}>
                        Assignment v{item.version}: {assignmentText(item)}
                      </li>
                    ))}
                    <li>
                      {round.intended_zones.length > 0 ? `Planned to ${zoneList(round.intended_zones)}` : 'No planned locations'}
                      {round.primary_cue ? ` · cue: ${round.primary_cue}` : ''}
                      {round.constraint_key ? ` · ${constraintLabel(round.constraint_key)}` : ''}
                    </li>
                    <li>
                      {roundSummary.counts.pitches} pitches · strike contact {metricText(roundSummary.pitch.strike_contact)} · decisions{' '}
                      {metricText(roundSummary.pitch.decision)} · depth {metricText(roundSummary.pitch.depth)}
                    </li>
                  </ul>
                  <ReviewEntries entries={reviewEntries} clips={clips} editable={editable} coachLocked={!isCoach} />
                  <div className="rounded-md border-2 border-rule p-4">
                    <h4 className="mb-2 font-semibold text-navy">Round review</h4>
                    <ul className="mb-3 list-disc pl-5 text-sm text-slate">
                      {ZONE_CONTENT.roundReview.map((step) => (
                        <li key={step.step}>
                          <span className="font-semibold">{step.step}:</span> {step.prompt}
                        </li>
                      ))}
                    </ul>
                    {editable ? (
                      <ActionForm action={reviewZoneRoundAction} fields={{ roundId: round.id }} submitLabel="Save round review" testId={`round-review-${round.seq}`}>
                        <TextAreaField id={`round-${round.seq}-feedback`} name="hitter_feedback" label="What the hitter said" maxLength={500} defaultValue={round.hitter_feedback ?? ''} />
                        <TextAreaField id={`round-${round.seq}-notes`} name="coach_notes" label="Coach notes" maxLength={1000} defaultValue={round.coach_notes ?? ''} />
                        <SelectField id={`round-${round.seq}-response`} name="response" label="Next step" defaultValue={round.response ?? ''} className="max-w-xs">
                          <option value="">Not decided</option>
                          {ROUND_RESPONSES.map((response) => (
                            <option key={response} value={response}>
                              {ROUND_RESPONSE_LABELS[response]}
                            </option>
                          ))}
                        </SelectField>
                      </ActionForm>
                    ) : (
                      <p>
                        {round.hitter_feedback ?? 'No hitter feedback'} · {round.coach_notes ?? 'No coach notes'} ·{' '}
                        {round.response ? ROUND_RESPONSE_LABELS[round.response] : 'No next step'}
                      </p>
                    )}
                  </div>
                </section>
              );
            })}
          </div>
        </DashboardSection>

        <DashboardSection id="video" title="Supporting video">
          {clipEntries.length > 0 ? (
            <ul className="space-y-1">
              {clipEntries.map((row) => (
                <li key={row.id}>
                  <Link href={clipHref(athlete, row.media_id ?? '', row.clip_time_ms)} className="font-semibold text-royal-ink underline">
                    {entrySummary({ kind: row.kind, location: row.location, response: row.response, contact: row.contact, voided: row.voided }, row.seq)}
                    {row.clip_time_ms !== null ? ` at ${(row.clip_time_ms / 1000).toFixed(1)} s` : ''}
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-slate">
              No clips linked yet. Upload clips through a hitting assessment, then link one to an entry with “Correct”.{' '}
              {clips.length === 0 ? 'This athlete has no uploaded clips.' : `${clips.length} clip${clips.length === 1 ? '' : 's'} available.`}
            </p>
          )}
        </DashboardSection>

        <DashboardSection
          id="prompts"
          title="Prompts for the coach’s review"
          description={`From repeated evidence only: a zone is named after at least ${MIN_ZONE_SAMPLE} scored strike swings with a rate under ${REVIEW_BELOW}% (one stage simpler under ${SIMPLIFY_BELOW}%). Planning prompts, not standards; nothing changes until someone decides.`}
        >
          {prompts.length === 0 ? (
            <p className="text-slate">No prompt — not enough repeated evidence for a suggestion, or nothing fell below the review line.</p>
          ) : (
            <ul className="space-y-4">
              {prompts.map((prompt, index) => (
                <li key={`${prompt.zone}-${index}`} className="border-l-4 border-royal-ink pl-4">
                  <p className="font-semibold text-navy">{prompt.finding}</p>
                  <p>
                    Based on {prompt.sample} scored attempts. Suggested stage {prompt.suggestedStage}
                    {prompt.drill ? ` · drill ${prompt.drill.sourceId} ${prompt.drill.name}` : ''} · one cue: {prompt.cue}
                  </p>
                  <p className="text-sm text-slate">Reassess: {prompt.reassessment}</p>
                </li>
              ))}
            </ul>
          )}
        </DashboardSection>

        <DashboardSection id="evaluation" title="Post-session evaluation">
          <div className="mb-4 flex flex-wrap items-center gap-3">
            {session.status === 'reviewed' ? <StatusChip tone="progress">Reviewed</StatusChip> : <StatusChip tone="neutral">Not reviewed yet</StatusChip>}
            {session.next_plan_approved_at ? (
              <StatusChip tone="positive">Next plan approved by the coach</StatusChip>
            ) : session.status === 'reviewed' ? (
              <StatusChip tone="attention">Next plan not coach-approved</StatusChip>
            ) : null}
          </div>
          {editable ? (
            <ActionForm action={reviewZoneSessionAction} fields={{ sessionId: session.id }} submitLabel="Save evaluation" testId="session-evaluation">
              <TextAreaField id="eval-self" name="hitter_self_assessment" label="Hitter’s self-assessment" maxLength={1000} defaultValue={session.hitter_self_assessment ?? ''} />
              {isCoach ? (
                <TextAreaField id="eval-coach" name="coach_assessment" label="Coach’s assessment" maxLength={1000} defaultValue={session.coach_assessment ?? ''} />
              ) : (
                <div>
                  <p className="font-semibold">Coach’s assessment</p>
                  <p className="text-slate">{session.coach_assessment ?? 'Written by the development coach.'}</p>
                </div>
              )}
              <div className="grid gap-4 sm:grid-cols-2">
                <TextField id="eval-win" name="best_process_win" label="Best process win" maxLength={300} defaultValue={session.best_process_win ?? ''} />
                <TextField id="eval-breakdown" name="repeated_breakdown" label="Repeated breakdown" maxLength={500} defaultValue={session.repeated_breakdown ?? ''} />
              </div>
              <SelectField id="eval-decision" name="decision" label="Decision" defaultValue={session.decision ?? ''} className="max-w-xs">
                <option value="">Not decided</option>
                <option value="advance">Advance</option>
                <option value="hold">Hold</option>
                <option value="simplify">Simplify</option>
              </SelectField>
              <ZoneCheckboxes name="next_zones" idPrefix="eval" legend="Next session’s zones (up to two)" checked={session.next_zones} />
              <div className="grid gap-4 sm:grid-cols-2">
                <TextField id="eval-cue" name="next_cue" label="Next cue" maxLength={120} defaultValue={session.next_cue ?? ''} />
                <SelectField id="eval-constraint" name="next_constraint_key" label="Next constraint" defaultValue={session.next_constraint_key ?? ''}>
                  <option value="">None</option>
                  {ZONE_CONSTRAINT_CATEGORIES.map((category) => (
                    <optgroup key={category} label={category}>
                      {ZONE_CONTENT.constraints
                        .filter((item) => item.category === category)
                        .map((item) => (
                          <option key={item.key} value={item.key}>
                            {item.name}
                          </option>
                        ))}
                    </optgroup>
                  ))}
                </SelectField>
                <TextField id="eval-volume" name="next_volume" label="Next volume" maxLength={120} defaultValue={session.next_volume ?? ''} />
                <TextField
                  id="eval-criterion"
                  name="success_criterion"
                  label="Success criterion (the coach’s choice)"
                  maxLength={300}
                  defaultValue={session.success_criterion ?? ''}
                  hint="Chosen by the coach for this hitter, not a universal standard."
                />
              </div>
            </ActionForm>
          ) : (
            <dl className="grid gap-3 sm:grid-cols-2">
              <Fact term="Hitter’s self-assessment">{session.hitter_self_assessment ?? '—'}</Fact>
              <Fact term="Coach’s assessment">{session.coach_assessment ?? '—'}</Fact>
              <Fact term="Decision">{session.decision ? ROUND_RESPONSE_LABELS[session.decision] : '—'}</Fact>
              <Fact term="Next zones">{session.next_zones.length > 0 ? zoneList(session.next_zones) : '—'}</Fact>
            </dl>
          )}
          {isCoach && editable && session.status === 'reviewed' && !session.next_plan_approved_at ? (
            <ActionForm action={approveZoneNextPlanAction} fields={{ sessionId: session.id }} submitLabel="Approve the next-session plan" className="mt-6" testId="approve-next-plan" />
          ) : null}
          {!isCoach && session.status === 'reviewed' ? (
            <p className="mt-4 text-sm text-slate">Only the athlete’s development coach can approve the next-session plan. A change from the athlete’s side withdraws an approval.</p>
          ) : null}
        </DashboardSection>

        <DashboardSection id="stages" title="Stage decisions for the focus zones" description="Advance moves up one stage, hold keeps it, simplify moves back. Give the reason and the evidence.">
          <div className="grid gap-6 md:grid-cols-2">
            {focus.map((zone) => (
              <StageForm key={zone} zone={zone} current={stages.get(zone)?.stage ?? null} athleteId={session.athlete_id} sessionId={session.id} editable={editable} evidence={zoneEvidence(summary, zone)} />
            ))}
          </div>
        </DashboardSection>

        {editable ? (
          <details className="rounded-md border-2 border-danger p-4 print:hidden">
            <summary className="cursor-pointer font-semibold text-danger">Delete this session</summary>
            <p className="mt-2 text-slate">Removes the session, its rounds and every entry. Stage history stays.</p>
            <ActionForm
              action={deleteZoneSessionAction}
              fields={{ sessionId: session.id, athleteQuery }}
              submitLabel="Delete session"
              variant="danger"
              confirm="Delete this session and every entry in it? This cannot be undone."
              className="mt-3"
            />
          </details>
        ) : null}
      </div>
    </>
  );
}

function zoneEvidence(summary: ReturnType<typeof summarizeZoneEvents>, zone: ZoneId): string {
  const breakdown = summary.byZone[zone - 1];
  if (!breakdown) return '';
  const parts: string[] = [];
  if (breakdown.pitch.strike_contact.denominator > 0) parts.push(`strike contact ${metricText(breakdown.pitch.strike_contact)}`);
  if (breakdown.pitch.depth.denominator > 0) parts.push(`depth ${metricText(breakdown.pitch.depth)}`);
  if (breakdown.tee.contact.denominator > 0) parts.push(`tee contact ${metricText(breakdown.tee.contact)}`);
  return parts.length > 0 ? `Zone ${zone} this session: ${parts.join('; ')}` : '';
}

function Fact({ term, children }: { readonly term: string; readonly children: ReactNode }) {
  return (
    <div className="border-l-4 border-rule pl-3">
      <dt className="text-sm font-semibold text-slate">{term}</dt>
      <dd>{children}</dd>
    </div>
  );
}
